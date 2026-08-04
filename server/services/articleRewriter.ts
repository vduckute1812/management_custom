/**
 * LLM rewriter for pipeline articles — storytelling style, Markdown output.
 * Providers: Google Gemini (default) or OpenAI, selected via LLM_PROVIDER.
 */

import { DomainError } from "~/server/utils/http";

export interface RewriteInput {
  originalTitle: string;
  rawContent: string;
  categoryName: string;
  sourceName: string;
}

export interface RewriteOutput {
  rewrittenTitle: string;
  rewrittenContent: string;
  excerpt: string;
}

type LlmProvider = "gemini" | "openai";

function envStr(name: string, fallback = ""): string {
  return (process.env[name] || fallback).trim();
}

function resolveProvider(): LlmProvider {
  const raw = envStr("LLM_PROVIDER", "gemini").toLowerCase();
  if (raw === "openai") return "openai";
  return "gemini";
}

function buildPrompt(input: RewriteInput): string {
  return `You are an expert technical writer for DNTechX, a Da Nang tech R&D and networking portal.

Rewrite the source article below into an engaging **storytelling** style that remains technically accurate.
Audience: engineers and makers who want clarity without fluff.

Requirements:
1. Attractive title (max ~120 characters).
2. Short sapo / lede (2–3 sentences) after the title.
3. Body with clear Markdown ## subheadings, short paragraphs, and a closing reflection.
4. Keep the original meaning and category focus: ${input.categoryName}.
5. Do NOT invent facts, citations, or numbers that are not in the source.
6. Do NOT include the original title as a heading unless rewritten.
7. Output language: match the source language when clear; otherwise English.
8. Respond with ONLY valid JSON (no markdown fences) in this exact shape:
{"rewritten_title":"...","rewritten_content":"...markdown...","excerpt":"...max 280 chars..."}

Source name: ${input.sourceName}
Original title: ${input.originalTitle}

Source content:
---
${input.rawContent.slice(0, 24_000)}
---`;
}

function sleep(ms: number): Promise<void> {
  return new Promise((r) => setTimeout(r, ms));
}

function extractJsonObject(text: string): unknown {
  const trimmed = text.trim();
  try {
    return JSON.parse(trimmed);
  } catch {
    const fence = /```(?:json)?\s*([\s\S]*?)```/i.exec(trimmed);
    if (fence?.[1]) {
      return JSON.parse(fence[1].trim());
    }
    const start = trimmed.indexOf("{");
    const end = trimmed.lastIndexOf("}");
    if (start >= 0 && end > start) {
      return JSON.parse(trimmed.slice(start, end + 1));
    }
    throw new Error("LLM response was not valid JSON");
  }
}

function normalizeOutput(raw: unknown): RewriteOutput {
  if (!raw || typeof raw !== "object") {
    throw new Error("LLM JSON root must be an object");
  }
  const obj = raw as Record<string, unknown>;
  const title = String(obj.rewritten_title ?? obj.rewrittenTitle ?? "").trim();
  const content = String(
    obj.rewritten_content ?? obj.rewrittenContent ?? "",
  ).trim();
  let excerpt = String(obj.excerpt ?? "").trim();
  if (!title || !content) {
    throw new Error("LLM JSON missing rewritten_title or rewritten_content");
  }
  if (!excerpt) {
    excerpt = content
      .replace(/[#>*_`\[\]]/g, "")
      .slice(0, 280)
      .trim();
  }
  return {
    rewrittenTitle: title.slice(0, 160),
    rewrittenContent: content.slice(0, 100_000),
    excerpt: excerpt.slice(0, 500),
  };
}

async function callWithRetry<T>(
  label: string,
  fn: () => Promise<T>,
  attempts = 3,
): Promise<T> {
  let lastErr: unknown;
  for (let i = 0; i < attempts; i++) {
    try {
      return await fn();
    } catch (err) {
      lastErr = err;
      const msg = err instanceof Error ? err.message : String(err);
      console.warn(
        `[llm] ${label} attempt ${i + 1}/${attempts} failed: ${msg}`,
      );
      if (i < attempts - 1) await sleep(800 * 2 ** i);
    }
  }
  throw lastErr instanceof Error
    ? lastErr
    : new Error(`${label} failed after retries`);
}

async function rewriteWithGemini(prompt: string): Promise<string> {
  const apiKey = envStr("GEMINI_API_KEY");
  if (!apiKey) {
    throw new DomainError(500, "GEMINI_API_KEY is not configured");
  }
  const model = envStr("GEMINI_MODEL", "gemini-2.0-flash");
  const url = `https://generativelanguage.googleapis.com/v1beta/models/${encodeURIComponent(model)}:generateContent?key=${encodeURIComponent(apiKey)}`;

  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), 60_000);
  try {
    const res = await fetch(url, {
      method: "POST",
      signal: ctrl.signal,
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        contents: [{ role: "user", parts: [{ text: prompt }] }],
        generationConfig: {
          temperature: 0.7,
          maxOutputTokens: 8192,
          responseMimeType: "application/json",
        },
      }),
    });
    if (!res.ok) {
      const body = await res.text().catch(() => "");
      throw new Error(`Gemini HTTP ${res.status}: ${body.slice(0, 400)}`);
    }
    const data = (await res.json()) as {
      candidates?: Array<{
        content?: { parts?: Array<{ text?: string }> };
      }>;
    };
    const text = data.candidates?.[0]?.content?.parts
      ?.map((p) => p.text || "")
      .join("")
      .trim();
    if (!text) throw new Error("Gemini returned empty content");
    return text;
  } finally {
    clearTimeout(timer);
  }
}

async function rewriteWithOpenAI(prompt: string): Promise<string> {
  const apiKey = envStr("OPENAI_API_KEY");
  if (!apiKey) {
    throw new DomainError(500, "OPENAI_API_KEY is not configured");
  }
  const model = envStr("OPENAI_MODEL", "gpt-4o-mini");
  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), 60_000);
  try {
    const res = await fetch("https://api.openai.com/v1/chat/completions", {
      method: "POST",
      signal: ctrl.signal,
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${apiKey}`,
      },
      body: JSON.stringify({
        model,
        temperature: 0.7,
        response_format: { type: "json_object" },
        messages: [
          {
            role: "system",
            content:
              "You rewrite technical articles as storytelling Markdown. Reply with JSON only.",
          },
          { role: "user", content: prompt },
        ],
      }),
    });
    if (!res.ok) {
      const body = await res.text().catch(() => "");
      throw new Error(`OpenAI HTTP ${res.status}: ${body.slice(0, 400)}`);
    }
    const data = (await res.json()) as {
      choices?: Array<{ message?: { content?: string } }>;
    };
    const text = data.choices?.[0]?.message?.content?.trim();
    if (!text) throw new Error("OpenAI returned empty content");
    return text;
  } finally {
    clearTimeout(timer);
  }
}

export async function rewriteArticle(
  input: RewriteInput,
): Promise<RewriteOutput> {
  const provider = resolveProvider();
  const prompt = buildPrompt(input);

  const text = await callWithRetry(`rewrite:${provider}`, async () => {
    if (provider === "openai") return rewriteWithOpenAI(prompt);
    return rewriteWithGemini(prompt);
  });

  return normalizeOutput(extractJsonObject(text));
}

export function llmConfigured(): boolean {
  const provider = resolveProvider();
  if (provider === "openai") return Boolean(envStr("OPENAI_API_KEY"));
  return Boolean(envStr("GEMINI_API_KEY"));
}

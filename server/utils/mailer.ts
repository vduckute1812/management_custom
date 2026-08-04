/**
 * SMTP mailer with a console fallback.
 *
 * Configuration env vars (all optional):
 *   SMTP_HOST   e.g. smtp.gmail.com
 *   SMTP_PORT   defaults to 587
 *   SMTP_SECURE "true" forces TLS-from-start (465); anything else uses STARTTLS
 *   SMTP_USER   account login
 *   SMTP_PASS   account password / app-password / API key
 *   SMTP_FROM   default From: header; falls back to SMTP_USER
 *   APP_BASE_URL   absolute URL used when building verification links
 *
 * When SMTP_HOST/USER/PASS are missing the mailer is in "dry run" mode and
 * prints emails to stdout. This keeps the sign-up flow walkable in dev even
 * before the operator has wired in a real provider.
 */
import nodemailer, { type Transporter } from "nodemailer";
import {
  buildAuthEmailHtml,
  passwordResetEmailCopy,
  verificationEmailCopy,
} from "~/server/utils/emailI18n";

interface MailerState {
  transport: Transporter | null;
  ready: boolean;
}

const state: MailerState = { transport: null, ready: false };

function buildTransport(): Transporter | null {
  const host = process.env.SMTP_HOST?.trim();
  const user = process.env.SMTP_USER?.trim();
  // Gmail app passwords are often pasted with spaces; Google accepts either,
  // but normalize so operators don't trip on copy-paste formatting.
  const pass = process.env.SMTP_PASS?.replace(/\s+/g, "");
  if (!host || !user || !pass) {
    console.warn(
      "[mailer] SMTP_HOST / SMTP_USER / SMTP_PASS not set — emails will be printed to the server console instead of sent.",
    );
    return null;
  }
  const port = Number(process.env.SMTP_PORT ?? 587);
  const secure = process.env.SMTP_SECURE === "true";
  return nodemailer.createTransport({
    host,
    port,
    secure,
    auth: { user, pass },
  });
}

function getTransport(): Transporter | null {
  if (state.ready) return state.transport;
  state.transport = buildTransport();
  state.ready = true;
  return state.transport;
}

export interface SendMailArgs {
  to: string;
  subject: string;
  text: string;
  html?: string;
}

export async function sendMail(args: SendMailArgs): Promise<void> {
  const t = getTransport();
  if (!t) {
    // Visible enough to find in logs, but no ANSI noise so it's grep-able.
    console.log(
      `\n[mailer:dry-run]\n` +
        `To:      ${args.to}\n` +
        `Subject: ${args.subject}\n` +
        `---\n${args.text}\n---\n`,
    );
    return;
  }
  const from = process.env.SMTP_FROM ?? process.env.SMTP_USER!;
  try {
    await t.sendMail({
      from,
      to: args.to,
      subject: args.subject,
      text: args.text,
      html: args.html,
    });
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    console.error(`[mailer] send failed to=${args.to}: ${message}`);
    throw err;
  }
}

/**
 * Build the app's external base URL from its parts:
 *   APP_PROTOCOL  defaults to "http"
 *   APP_HOST      defaults to "localhost"
 *   APP_PORT      defaults to "3000"
 *
 * The port is omitted when it matches the protocol default (80/443) so the
 * generated link is canonical. Trailing slashes are stripped so callers can
 * always concatenate `"/some/path"` without doubling up.
 */
function appBaseUrl(): string {
  const override = process.env.APP_BASE_URL?.trim().replace(/\/$/, "");
  if (override) return override;

  const protocol = (process.env.APP_PROTOCOL ?? "http").replace(/:$/, "");
  const host = (process.env.APP_HOST ?? "localhost").trim();
  const portRaw = (process.env.APP_PORT ?? "3000").trim();
  const port = portRaw ? Number(portRaw) : NaN;
  const isDefaultPort =
    (protocol === "http" && port === 80) ||
    (protocol === "https" && port === 443);
  if (!Number.isFinite(port) || isDefaultPort) {
    return `${protocol}://${host}`;
  }
  return `${protocol}://${host}:${port}`;
}

export function buildVerifyUrl(token: string): string {
  return `${appBaseUrl()}/verify-email?token=${encodeURIComponent(token)}`;
}

export function buildResetUrl(token: string): string {
  return `${appBaseUrl()}/reset-password?token=${encodeURIComponent(token)}`;
}

export async function sendPasswordResetEmail(args: {
  to: string;
  token: string;
  locale?: string;
}): Promise<void> {
  const url = buildResetUrl(args.token);
  const copy = passwordResetEmailCopy(args.locale);
  await sendMail({
    to: args.to,
    subject: copy.subject,
    text: copy.text,
    html: buildAuthEmailHtml({ copy, url }),
  });
}

export async function sendPublicIpChangeEmail(args: {
  to: string;
  oldIp: string;
  newIp: string;
  lanIp: string;
}): Promise<void> {
  const { to, oldIp, newIp, lanIp } = args;
  const subject = `Public IP changed: ${oldIp} → ${newIp}`;
  const text =
    `Your Viettel router assigned a new public IP.\n\n` +
    `Previous: ${oldIp}\n` +
    `Current:  ${newIp}\n\n` +
    `Public site is unchanged: https://dntechx.com (Cloudflare Tunnel).\n` +
    `LAN: http://${lanIp}:8080\n\n` +
    `TLS certificates on the Pi were updated for the new public IP.`;

  await sendMail({
    to,
    subject,
    text,
    html: `<!doctype html>
<html>
  <body style="font-family:ui-sans-serif,system-ui,-apple-system,'Segoe UI',Roboto,Arial;line-height:1.6;color:#0f172a;">
    <h2 style="margin:0 0 12px;">Public IP changed</h2>
    <p>Your Viettel router assigned a new public IP.</p>
    <table style="border-collapse:collapse;margin:12px 0;">
      <tr><td style="padding:4px 12px 4px 0;color:#64748b;">Previous</td><td><strong>${oldIp}</strong></td></tr>
      <tr><td style="padding:4px 12px 4px 0;color:#64748b;">Current</td><td><strong>${newIp}</strong></td></tr>
    </table>
    <p>
      Public site: <a href="https://dntechx.com">https://dntechx.com</a> (Cloudflare Tunnel — unaffected).<br>
      LAN: <a href="http://${lanIp}:8080">http://${lanIp}:8080</a>
    </p>
    <p style="color:#64748b;font-size:14px;">
      TLS certificates on the Pi were updated for the new public IP.
    </p>
  </body>
</html>`,
  });
}

export async function sendVerificationEmail(args: {
  to: string;
  token: string;
  locale?: string;
}): Promise<void> {
  const url = buildVerifyUrl(args.token);
  const copy = verificationEmailCopy(args.locale);
  await sendMail({
    to: args.to,
    subject: copy.subject,
    // Intentionally does NOT print the raw verification URL in the message
    // body (per UX request). The verification link exists only behind the
    // HTML button.
    text: copy.text,
    html: buildAuthEmailHtml({ copy, url }),
  });
}

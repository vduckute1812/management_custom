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

interface MailerState {
  transport: Transporter | null;
  ready: boolean;
}

const state: MailerState = { transport: null, ready: false };

function buildTransport(): Transporter | null {
  const host = process.env.SMTP_HOST;
  const user = process.env.SMTP_USER;
  const pass = process.env.SMTP_PASS;
  if (!host || !user || !pass) {
    console.warn(
      "[mailer] SMTP_HOST / SMTP_USER / SMTP_PASS not set — emails will be printed to the server console instead of sent."
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
        `---\n${args.text}\n---\n`
    );
    return;
  }
  const from = process.env.SMTP_FROM ?? process.env.SMTP_USER!;
  await t.sendMail({
    from,
    to: args.to,
    subject: args.subject,
    text: args.text,
    html: args.html,
  });
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

export async function sendVerificationEmail(args: {
  to: string;
  token: string;
}): Promise<void> {
  const url = buildVerifyUrl(args.token);
  await sendMail({
    to: args.to,
    subject: "Verify your Management account",
    text:
      `Welcome!\n\n` +
      `Click the link below to verify your email address. The link expires in 24 hours.\n\n` +
      `${url}\n\n` +
      `If you didn't sign up, you can safely ignore this message.`,
    html:
      `<p>Welcome!</p>` +
      `<p>Click the button below to verify your email address. The link expires in 24 hours.</p>` +
      `<p><a href="${url}" style="display:inline-block;padding:8px 16px;background:#6366f1;color:#fff;border-radius:6px;text-decoration:none">Verify email</a></p>` +
      `<p>Or paste this URL into your browser:</p>` +
      `<p><a href="${url}">${url}</a></p>` +
      `<p style="color:#64748b;font-size:12px">If you didn't sign up, you can safely ignore this message.</p>`,
  });
}

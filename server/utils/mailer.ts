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
    `Update router port forwarding:\n` +
    `  ${newIp}:8080 -> ${lanIp}:8080\n` +
    `  ${newIp}:8443 -> ${lanIp}:8443\n\n` +
    `Direct access:\n` +
    `  http://${newIp}:8080\n` +
    `  https://${newIp}:8443\n\n` +
    `TLS certificates and APP_HOST were updated automatically on the Pi.\n` +
    `Cloudflare Tunnel URLs are unaffected.`;

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
    <p><strong>Update router port forwarding:</strong></p>
    <ul>
      <li><code>${newIp}:8080</code> → <code>${lanIp}:8080</code></li>
      <li><code>${newIp}:8443</code> → <code>${lanIp}:8443</code></li>
    </ul>
    <p><strong>Direct access:</strong></p>
    <ul>
      <li><a href="http://${newIp}:8080">http://${newIp}:8080</a></li>
      <li><a href="https://${newIp}:8443">https://${newIp}:8443</a></li>
    </ul>
    <p style="color:#64748b;font-size:14px;">
      TLS certificates and <code>APP_HOST</code> were updated automatically on the Pi.
      Cloudflare Tunnel URLs are unaffected.
    </p>
  </body>
</html>`,
  });
}

export async function sendVerificationEmail(args: {
  to: string;
  token: string;
}): Promise<void> {
  const url = buildVerifyUrl(args.token);
  await sendMail({
    to: args.to,
    subject: "Verify your email address",
    // Intentionally does NOT print the raw verification URL in the message
    // body (per UX request). The verification link exists only behind the
    // HTML button.
    text:
      `Welcome!\n\n` +
      `Please verify your email address to finish creating your account.\n\n` +
      `Open this email in an HTML-capable mail app and click “Verify email”.\n\n` +
      `This verification expires in 24 hours.\n\n` +
      `If you didn't create an account, you can ignore this email.`,
    html: `<!doctype html>
<html>
  <head>
    <meta charset="utf-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1" />
    <title>Verify your email</title>
  </head>
  <body style="margin:0;padding:0;background:#f8fafc;">
    <div style="display:none;max-height:0;overflow:hidden;opacity:0;color:transparent;">
      Verify your email address to finish creating your account.
    </div>

    <table role="presentation" width="100%" cellspacing="0" cellpadding="0" style="background:#f8fafc;">
      <tr>
        <td align="center" style="padding:28px 14px;">
          <table role="presentation" width="600" cellspacing="0" cellpadding="0" style="width:100%;max-width:600px;background:#ffffff;border:1px solid #e2e8f0;border-radius:16px;overflow:hidden;">
            <tr>
              <td style="padding:22px 24px 8px 24px;">
                <div style="font-family:ui-sans-serif,system-ui,-apple-system,'Segoe UI',Roboto,Arial; font-size:13px; letter-spacing:0.08em; text-transform:uppercase; color:#64748b;">
                  Management
                </div>
                <div style="font-family:ui-sans-serif,system-ui,-apple-system,'Segoe UI',Roboto,Arial; font-size:22px; font-weight:700; line-height:1.25; color:#0f172a; margin-top:10px;">
                  Verify your email address
                </div>
                <div style="font-family:ui-sans-serif,system-ui,-apple-system,'Segoe UI',Roboto,Arial; font-size:14px; line-height:1.6; color:#334155; margin-top:10px;">
                  Thanks for signing up. Confirm your email to activate your account.
                </div>
              </td>
            </tr>

            <tr>
              <td style="padding:14px 24px 8px 24px;">
                <table role="presentation" cellspacing="0" cellpadding="0">
                  <tr>
                    <td align="center" bgcolor="#4f46e5" style="border-radius:10px;">
                      <a href="${url}"
                         style="display:inline-block;padding:12px 16px;font-family:ui-sans-serif,system-ui,-apple-system,'Segoe UI',Roboto,Arial;font-size:14px;font-weight:700;color:#ffffff;text-decoration:none;">
                        Verify email
                      </a>
                    </td>
                  </tr>
                </table>
              </td>
            </tr>

            <tr>
              <td style="padding:0 24px 20px 24px;">
                <div style="font-family:ui-sans-serif,system-ui,-apple-system,'Segoe UI',Roboto,Arial; font-size:12px; line-height:1.6; color:#64748b;">
                  This link expires in <strong style="color:#475569;">24 hours</strong>.
                  If you didn’t create an account, you can safely ignore this email.
                </div>
              </td>
            </tr>

            <tr>
              <td style="padding:14px 24px 22px 24px;border-top:1px solid #e2e8f0;background:#f8fafc;">
                <div style="font-family:ui-sans-serif,system-ui,-apple-system,'Segoe UI',Roboto,Arial; font-size:12px; line-height:1.6; color:#64748b;">
                  If the button doesn’t work, your email client may be blocking HTML links. Try opening this email in Gmail or Apple Mail.
                </div>
              </td>
            </tr>
          </table>

          <div style="font-family:ui-sans-serif,system-ui,-apple-system,'Segoe UI',Roboto,Arial; font-size:11px; line-height:1.6; color:#94a3b8; margin-top:10px;">
            © ${new Date().getFullYear()} Management
          </div>
        </td>
      </tr>
    </table>
  </body>
</html>`,
  });
}

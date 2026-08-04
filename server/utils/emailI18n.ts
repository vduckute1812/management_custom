/**
 * Server-side email copy catalogs (worker-safe — no Vue / useI18n).
 * Keys mirror the four app locales so outbound mail matches the account.
 */
import { isAppLocale, type AppLocale } from "~/types/locale";

export type EmailLocale = AppLocale;

export function resolveEmailLocale(value: unknown): EmailLocale {
  return isAppLocale(value) ? value : "en";
}

interface AuthEmailCopy {
  subject: string;
  preheader: string;
  brand: string;
  title: string;
  body: string;
  cta: string;
  /** Full expires sentence; `{strong}` wraps the duration. */
  expiresHtml: string;
  ignore: string;
  buttonFallback: string;
  text: string;
}

const BRAND = "Da Nang Tech R&D and Networking Portal";

const VERIFY: Record<EmailLocale, AuthEmailCopy> = {
  en: {
    subject: "Verify your email address",
    preheader: "Verify your email address to finish creating your account.",
    brand: BRAND,
    title: "Verify your email address",
    body: "Thanks for signing up. Confirm your email to activate your account.",
    cta: "Verify email",
    expiresHtml:
      'This link expires in <strong style="color:#475569;">24 hours</strong>.',
    ignore:
      "If you didn't create an account, you can safely ignore this email.",
    buttonFallback:
      "If the button doesn't work, your email client may be blocking HTML links. Try opening this email in Gmail or Apple Mail.",
    text:
      `Welcome!\n\n` +
      `Please verify your email address to finish creating your account.\n\n` +
      `Open this email in an HTML-capable mail app and click “Verify email”.\n\n` +
      `This verification expires in 24 hours.\n\n` +
      `If you didn't create an account, you can ignore this email.`,
  },
  vi: {
    subject: "Xác minh địa chỉ email của bạn",
    preheader: "Xác minh email để hoàn tất tạo tài khoản.",
    brand: BRAND,
    title: "Xác minh địa chỉ email của bạn",
    body: "Cảm ơn bạn đã đăng ký. Xác nhận email để kích hoạt tài khoản.",
    cta: "Xác minh email",
    expiresHtml:
      'Liên kết này hết hạn sau <strong style="color:#475569;">24 giờ</strong>.',
    ignore: "Nếu bạn không tạo tài khoản, bạn có thể bỏ qua email này.",
    buttonFallback:
      "Nếu nút không hoạt động, hãy thử mở email trong Gmail hoặc Apple Mail.",
    text:
      `Xin chào!\n\n` +
      `Vui lòng xác minh địa chỉ email để hoàn tất tạo tài khoản.\n\n` +
      `Mở email này trong ứng dụng hỗ trợ HTML và bấm “Xác minh email”.\n\n` +
      `Liên kết xác minh hết hạn sau 24 giờ.\n\n` +
      `Nếu bạn không tạo tài khoản, hãy bỏ qua email này.`,
  },
  "zh-CN": {
    subject: "验证您的电子邮箱",
    preheader: "验证邮箱以完成账号创建。",
    brand: BRAND,
    title: "验证您的电子邮箱",
    body: "感谢注册。请确认邮箱以激活账号。",
    cta: "验证邮箱",
    expiresHtml:
      '此链接将在 <strong style="color:#475569;">24 小时</strong>后失效。',
    ignore: "如果您没有创建账号，可以忽略此邮件。",
    buttonFallback:
      "如果按钮无法使用，请尝试在 Gmail 或 Apple Mail 中打开此邮件。",
    text:
      `欢迎！\n\n` +
      `请验证您的电子邮箱以完成账号创建。\n\n` +
      `请在支持 HTML 的邮件应用中打开此邮件并点击“验证邮箱”。\n\n` +
      `验证链接将在 24 小时后失效。\n\n` +
      `如果您没有创建账号，可以忽略此邮件。`,
  },
  "zh-TW": {
    subject: "驗證您的電子信箱",
    preheader: "驗證信箱以完成帳號建立。",
    brand: BRAND,
    title: "驗證您的電子信箱",
    body: "感謝註冊。請確認信箱以啟用帳號。",
    cta: "驗證信箱",
    expiresHtml:
      '此連結將在 <strong style="color:#475569;">24 小時</strong>後失效。',
    ignore: "如果您沒有建立帳號，可以忽略此郵件。",
    buttonFallback:
      "如果按鈕無法使用，請嘗試在 Gmail 或 Apple Mail 中開啟此郵件。",
    text:
      `歡迎！\n\n` +
      `請驗證您的電子信箱以完成帳號建立。\n\n` +
      `請在支援 HTML 的郵件應用程式中開啟此郵件並點選「驗證信箱」。\n\n` +
      `驗證連結將在 24 小時後失效。\n\n` +
      `如果您沒有建立帳號，可以忽略此郵件。`,
  },
};

const RESET: Record<EmailLocale, AuthEmailCopy> = {
  en: {
    subject: "Reset your password",
    preheader: "Reset your password using the link in this email.",
    brand: BRAND,
    title: "Reset your password",
    body: "Click the button below to choose a new password. This link works once and expires in one hour.",
    cta: "Reset password",
    expiresHtml:
      'This link expires in <strong style="color:#475569;">1 hour</strong>.',
    ignore:
      "If you didn't request a password reset, you can safely ignore this email.",
    buttonFallback:
      "If the button doesn't work, try opening this email in Gmail or Apple Mail.",
    text:
      `We received a request to reset your password.\n\n` +
      `Open this email in an HTML-capable mail app and click “Reset password”.\n\n` +
      `This link expires in 1 hour.\n\n` +
      `If you didn't request a reset, you can ignore this email.`,
  },
  vi: {
    subject: "Đặt lại mật khẩu",
    preheader: "Đặt lại mật khẩu bằng liên kết trong email này.",
    brand: BRAND,
    title: "Đặt lại mật khẩu",
    body: "Bấm nút bên dưới để chọn mật khẩu mới. Liên kết chỉ dùng một lần và hết hạn sau một giờ.",
    cta: "Đặt lại mật khẩu",
    expiresHtml:
      'Liên kết này hết hạn sau <strong style="color:#475569;">1 giờ</strong>.',
    ignore: "Nếu bạn không yêu cầu đặt lại mật khẩu, hãy bỏ qua email này.",
    buttonFallback:
      "Nếu nút không hoạt động, hãy thử mở email trong Gmail hoặc Apple Mail.",
    text:
      `Chúng tôi nhận được yêu cầu đặt lại mật khẩu của bạn.\n\n` +
      `Mở email này trong ứng dụng hỗ trợ HTML và bấm “Đặt lại mật khẩu”.\n\n` +
      `Liên kết hết hạn sau 1 giờ.\n\n` +
      `Nếu bạn không yêu cầu, hãy bỏ qua email này.`,
  },
  "zh-CN": {
    subject: "重置您的密码",
    preheader: "使用此邮件中的链接重置密码。",
    brand: BRAND,
    title: "重置您的密码",
    body: "点击下方按钮设置新密码。此链接只能使用一次，并在一小时后失效。",
    cta: "重置密码",
    expiresHtml:
      '此链接将在 <strong style="color:#475569;">1 小时</strong>后失效。',
    ignore: "如果您没有请求重置密码，可以忽略此邮件。",
    buttonFallback:
      "如果按钮无法使用，请尝试在 Gmail 或 Apple Mail 中打开此邮件。",
    text:
      `我们收到了重置您密码的请求。\n\n` +
      `请在支持 HTML 的邮件应用中打开此邮件并点击“重置密码”。\n\n` +
      `此链接将在 1 小时后失效。\n\n` +
      `如果您没有请求重置，可以忽略此邮件。`,
  },
  "zh-TW": {
    subject: "重設您的密碼",
    preheader: "使用此郵件中的連結重設密碼。",
    brand: BRAND,
    title: "重設您的密碼",
    body: "點選下方按鈕設定新密碼。此連結只能使用一次，並在一小時後失效。",
    cta: "重設密碼",
    expiresHtml:
      '此連結將在 <strong style="color:#475569;">1 小時</strong>後失效。',
    ignore: "如果您沒有要求重設密碼，可以忽略此郵件。",
    buttonFallback:
      "如果按鈕無法使用，請嘗試在 Gmail 或 Apple Mail 中開啟此郵件。",
    text:
      `我們收到了重設您密碼的請求。\n\n` +
      `請在支援 HTML 的郵件應用程式中開啟此郵件並點選「重設密碼」。\n\n` +
      `此連結將在 1 小時後失效。\n\n` +
      `如果您沒有要求重設，可以忽略此郵件。`,
  },
};

export function verificationEmailCopy(locale: unknown): AuthEmailCopy {
  return VERIFY[resolveEmailLocale(locale)];
}

export function passwordResetEmailCopy(locale: unknown): AuthEmailCopy {
  return RESET[resolveEmailLocale(locale)];
}

export function buildAuthEmailHtml(args: {
  copy: AuthEmailCopy;
  url: string;
}): string {
  const { copy, url } = args;
  const year = new Date().getFullYear();
  return `<!doctype html>
<html>
  <head>
    <meta charset="utf-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1" />
    <title>${escapeHtml(copy.title)}</title>
  </head>
  <body style="margin:0;padding:0;background:#f8fafc;">
    <div style="display:none;max-height:0;overflow:hidden;opacity:0;color:transparent;">
      ${escapeHtml(copy.preheader)}
    </div>

    <table role="presentation" width="100%" cellspacing="0" cellpadding="0" style="background:#f8fafc;">
      <tr>
        <td align="center" style="padding:28px 14px;">
          <table role="presentation" width="600" cellspacing="0" cellpadding="0" style="width:100%;max-width:600px;background:#ffffff;border:1px solid #e2e8f0;border-radius:16px;overflow:hidden;">
            <tr>
              <td style="padding:22px 24px 8px 24px;">
                <div style="font-family:ui-sans-serif,system-ui,-apple-system,'Segoe UI',Roboto,Arial; font-size:13px; letter-spacing:0.08em; text-transform:uppercase; color:#64748b;">
                  ${escapeHtml(copy.brand)}
                </div>
                <div style="font-family:ui-sans-serif,system-ui,-apple-system,'Segoe UI',Roboto,Arial; font-size:22px; font-weight:700; line-height:1.25; color:#0f172a; margin-top:10px;">
                  ${escapeHtml(copy.title)}
                </div>
                <div style="font-family:ui-sans-serif,system-ui,-apple-system,'Segoe UI',Roboto,Arial; font-size:14px; line-height:1.6; color:#334155; margin-top:10px;">
                  ${escapeHtml(copy.body)}
                </div>
              </td>
            </tr>

            <tr>
              <td style="padding:14px 24px 8px 24px;">
                <table role="presentation" cellspacing="0" cellpadding="0">
                  <tr>
                    <td align="center" bgcolor="#4f46e5" style="border-radius:10px;">
                      <a href="${escapeAttr(url)}"
                         style="display:inline-block;padding:12px 16px;font-family:ui-sans-serif,system-ui,-apple-system,'Segoe UI',Roboto,Arial;font-size:14px;font-weight:700;color:#ffffff;text-decoration:none;">
                        ${escapeHtml(copy.cta)}
                      </a>
                    </td>
                  </tr>
                </table>
              </td>
            </tr>

            <tr>
              <td style="padding:0 24px 20px 24px;">
                <div style="font-family:ui-sans-serif,system-ui,-apple-system,'Segoe UI',Roboto,Arial; font-size:12px; line-height:1.6; color:#64748b;">
                  ${copy.expiresHtml}
                  ${escapeHtml(copy.ignore)}
                </div>
              </td>
            </tr>

            <tr>
              <td style="padding:14px 24px 22px 24px;border-top:1px solid #e2e8f0;background:#f8fafc;">
                <div style="font-family:ui-sans-serif,system-ui,-apple-system,'Segoe UI',Roboto,Arial; font-size:12px; line-height:1.6; color:#64748b;">
                  ${escapeHtml(copy.buttonFallback)}
                </div>
              </td>
            </tr>
          </table>

          <div style="font-family:ui-sans-serif,system-ui,-apple-system,'Segoe UI',Roboto,Arial; font-size:11px; line-height:1.6; color:#94a3b8; margin-top:10px;">
            © ${year} ${escapeHtml(copy.brand)}
          </div>
        </td>
      </tr>
    </table>
  </body>
</html>`;
}

function escapeHtml(s: string): string {
  return s
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

function escapeAttr(s: string): string {
  return escapeHtml(s).replace(/'/g, "&#39;");
}

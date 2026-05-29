import crypto from "crypto";
import nodemailer from "nodemailer";
import { logger } from "./logger";

export function generateOTP(): string {
  return String(crypto.randomInt(100_000, 1_000_000));
}

export function hashOTP(otp: string): string {
  return crypto.createHash("sha256").update(otp).digest("hex");
}

export function generateResetToken(): string {
  return crypto.randomBytes(32).toString("hex");
}

/** Normalize SA phone numbers to E.164 (+27XXXXXXXXX). */
export function normalizePhone(raw: string): string | null {
  const digits = raw.replace(/\D/g, "");
  if (digits.startsWith("27") && digits.length === 11) return `+${digits}`;
  if (digits.startsWith("0") && digits.length === 10) return `+27${digits.slice(1)}`;
  if (digits.length === 9) return `+27${digits}`;
  return null;
}

// ─── Email config (primary) ────────────────────────────────────────────────
const SMTP_HOST = () => process.env["SMTP_HOST"] ?? "";
const SMTP_PORT = () => parseInt(process.env["SMTP_PORT"] ?? "587", 10);
const SMTP_USER = () => process.env["SMTP_USER"] ?? "";
const SMTP_PASS = () => process.env["SMTP_PASS"] ?? "";
const SMTP_FROM = () => process.env["SMTP_FROM"] ?? "TapIn Golf <noreply@tapingolf.co.za>";
const EMAIL_DEV_MODE = () => !SMTP_HOST() || !SMTP_USER() || !SMTP_PASS();

// ─── Africa's Talking config (WhatsApp / SMS — kept for future use) ────────
const AT_API_KEY   = () => process.env["AT_API_KEY"]   ?? "";
const AT_USERNAME  = () => process.env["AT_USERNAME"]  ?? "";
const AT_SENDER_ID = () => process.env["AT_SENDER_ID"] ?? "TAPIN";
const AT_CHANNEL   = () => (process.env["AT_CHANNEL"] ?? "sms").toLowerCase();
const AT_DEV_MODE  = () => !AT_API_KEY() || !AT_USERNAME();

// ─── PRIMARY: Email OTP ────────────────────────────────────────────────────
/** Send a password-reset OTP to the user's email address. */
export async function sendOTPEmail(email: string, otp: string): Promise<{ dev?: boolean }> {
  if (EMAIL_DEV_MODE()) {
    logger.info({ email, otp }, "[DEV] Email OTP — no SMTP credentials configured");
    return { dev: true };
  }

  const transporter = nodemailer.createTransport({
    host:   SMTP_HOST(),
    port:   SMTP_PORT(),
    secure: SMTP_PORT() === 465,
    auth: { user: SMTP_USER(), pass: SMTP_PASS() },
  });

  await transporter.sendMail({
    from:    SMTP_FROM(),
    to:      email,
    subject: "Your TapIn Golf password reset code",
    text: `Your TapIn Golf password reset code is: ${otp}\n\nThis code expires in 10 minutes. Do not share it with anyone.\n\nIf you did not request a password reset, please ignore this email.`,
    html: `
      <div style="font-family:Arial,sans-serif;max-width:480px;margin:0 auto;padding:32px 24px;background:#f9fafb;border-radius:12px">
        <div style="text-align:center;margin-bottom:24px">
          <span style="font-size:28px;font-weight:800;color:#1a5c38">TapIn Golf</span>
        </div>
        <div style="background:#fff;border-radius:10px;padding:28px;border:1px solid #e5e7eb">
          <h2 style="margin:0 0 8px;font-size:20px;color:#111827">Password Reset</h2>
          <p style="margin:0 0 24px;color:#6b7280;font-size:14px">Use the code below to reset your password. It expires in <strong>10 minutes</strong>.</p>
          <div style="text-align:center;background:#f3f4f6;border-radius:10px;padding:24px 0;letter-spacing:12px;font-size:36px;font-weight:800;color:#1a5c38">
            ${otp}
          </div>
          <p style="margin:24px 0 0;color:#9ca3af;font-size:12px;text-align:center">
            If you didn't request this, you can safely ignore this email.
          </p>
        </div>
      </div>`,
  });

  return {};
}

// ─── Invitation email ──────────────────────────────────────────────────────
/** Send a "you've been invited" email to a non-registered address. */
export async function sendInvitationEmail(
  toEmail: string,
  inviterName: string
): Promise<{ dev?: boolean }> {
  if (EMAIL_DEV_MODE()) {
    logger.info({ toEmail, inviterName }, "[DEV] Invitation email — no SMTP credentials configured");
    return { dev: true };
  }

  const transporter = nodemailer.createTransport({
    host:   SMTP_HOST(),
    port:   SMTP_PORT(),
    secure: SMTP_PORT() === 465,
    auth: { user: SMTP_USER(), pass: SMTP_PASS() },
  });

  await transporter.sendMail({
    from:    SMTP_FROM(),
    to:      toEmail,
    subject: `${inviterName} invited you to TapIn Golf`,
    text: `Hi there!\n\n${inviterName} wants to connect with you on TapIn Golf — South Africa's golf booking app.\n\nDownload the app and create a profile to accept their friend request:\nhttps://tapingolf.co.za/download\n\nSee you on the course!\nThe TapIn Golf team`,
    html: `
      <div style="font-family:Arial,sans-serif;max-width:520px;margin:0 auto;padding:32px 24px;background:#f9fafb;border-radius:12px">
        <div style="text-align:center;margin-bottom:24px">
          <span style="font-size:28px;font-weight:800;color:#1a5c38">TapIn Golf</span>
        </div>
        <div style="background:#fff;border-radius:10px;padding:28px;border:1px solid #e5e7eb">
          <h2 style="margin:0 0 8px;font-size:20px;color:#111827">You've been invited! ⛳</h2>
          <p style="margin:0 0 20px;color:#6b7280;font-size:15px">
            <strong style="color:#111827">${inviterName}</strong> wants to connect with you on
            <strong style="color:#1a5c38">TapIn Golf</strong> — South Africa's golf booking app.
          </p>
          <p style="margin:0 0 24px;color:#6b7280;font-size:14px">
            Book tee times, split the bill with your mates, and track your handicap — all in one place.
          </p>
          <div style="text-align:center">
            <a href="https://tapingolf.co.za/download"
               style="display:inline-block;background:#1a5c38;color:#fff;text-decoration:none;padding:14px 32px;border-radius:10px;font-size:15px;font-weight:700">
              Download TapIn Golf
            </a>
          </div>
          <p style="margin:24px 0 0;color:#9ca3af;font-size:12px;text-align:center">
            Once you create a profile with this email address, ${inviterName}'s friend request will be waiting for you.
          </p>
        </div>
        <p style="margin:20px 0 0;color:#9ca3af;font-size:11px;text-align:center">
          © ${new Date().getFullYear()} TapIn Golf · tapingolf.co.za
        </p>
      </div>`,
  });

  return {};
}

// ─── SECONDARY: WhatsApp / SMS OTP (Africa's Talking) ─────────────────────
/** Send an OTP to the user's phone via WhatsApp (primary) or SMS (fallback). */
export async function sendOTPPhone(phone: string, otp: string): Promise<{ dev?: boolean }> {
  const message = `Your TapIn Golf password reset code is: *${otp}*\n\nThis code expires in 10 minutes. Do not share it with anyone.`;

  if (AT_DEV_MODE()) {
    logger.info({ phone, otp }, "[DEV] Phone OTP — no AT credentials configured");
    return { dev: true };
  }

  const channel = AT_CHANNEL();

  if (channel === "whatsapp") {
    const sent = await sendWhatsApp(phone, message);
    if (sent) return {};
    logger.warn({ phone }, "WhatsApp OTP failed, falling back to SMS");
  }

  await sendSMS(phone, message);
  return {};
}

async function sendSMS(phone: string, message: string): Promise<void> {
  const params = new URLSearchParams({
    username: AT_USERNAME(),
    to:       phone,
    message,
    from:     AT_SENDER_ID(),
  });

  const res = await fetch("https://api.africastalking.com/version1/messaging", {
    method: "POST",
    headers: {
      Accept:         "application/json",
      "Content-Type": "application/x-www-form-urlencoded",
      apiKey:         AT_API_KEY(),
    },
    body: params.toString(),
  });

  if (!res.ok) {
    const body = await res.text().catch(() => "");
    throw new Error(`AT SMS failed (${res.status}): ${body}`);
  }
}

async function sendWhatsApp(phone: string, message: string): Promise<boolean> {
  try {
    const res = await fetch("https://api.africastalking.com/version1/messaging/whatsapp/message", {
      method: "POST",
      headers: {
        Accept:         "application/json",
        "Content-Type": "application/json",
        apiKey:         AT_API_KEY(),
      },
      body: JSON.stringify({
        username: AT_USERNAME(),
        from:     AT_SENDER_ID(),
        to:       phone,
        type:     "text",
        body:     message,
      }),
    });
    return res.ok;
  } catch {
    return false;
  }
}

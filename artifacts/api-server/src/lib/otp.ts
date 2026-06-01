import crypto from "crypto";
import nodemailer from "nodemailer";
import { logger } from "./logger";
import { row, exec } from "./pg";

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

// ─── Invoice email ──────────────────────────────────────────────────────────

function fmtMethod(m: string): string {
  const map: Record<string, string> = { stitch: "Stitch (Instant EFT / Card)", wallet: "TapIn Wallet", prepaid: "Prepaid Rounds", card: "Card" };
  return map[m] ?? m;
}

function fmtTier(t: string | null | undefined): string {
  const map: Record<string, string> = { visitor: "Visitor", hna: "HNA Affiliated", member: "Member" };
  return t ? (map[t] ?? t) : "Standard";
}

export interface CancelPolicy {
  windowMinutes: number | null;
  feePct: number;
  refundTiers: Array<{ label: string; refund_pct: number }>;
  contactEmail: string | null;
  contactPhone: string | null;
  otherPolicies: string | null;
}

function fmtWindow(minutes: number | null): string {
  if (!minutes) return "See club policy";
  if (minutes < 60) return `${minutes} minutes`;
  const h = Math.round(minutes / 60);
  return `${h} hour${h !== 1 ? "s" : ""}`;
}

function cancelPolicyHtml(policy: CancelPolicy, clubName: string): string {
  const tiers = Array.isArray(policy.refundTiers) && policy.refundTiers.length > 0
    ? `<table style="width:100%;border-collapse:collapse;margin-top:8px">
        <thead>
          <tr style="background:#f3f4f6">
            <th style="padding:6px 8px;text-align:left;font-size:11px;font-weight:700;text-transform:uppercase;letter-spacing:0.5px;color:#6b7280">Notice Period</th>
            <th style="padding:6px 8px;text-align:right;font-size:11px;font-weight:700;text-transform:uppercase;letter-spacing:0.5px;color:#6b7280">Refund</th>
          </tr>
        </thead>
        <tbody>
          ${policy.refundTiers.map((t, i) =>
            `<tr style="${i % 2 === 0 ? "background:#fff" : "background:#f9fafb"}">
              <td style="padding:6px 8px;font-size:13px;border-bottom:1px solid #f3f4f6">${t.label}</td>
              <td style="padding:6px 8px;font-size:13px;font-weight:600;text-align:right;border-bottom:1px solid #f3f4f6;color:${t.refund_pct === 100 ? "#166534" : t.refund_pct === 0 ? "#991b1b" : "#92400e"}">${t.refund_pct}%</td>
            </tr>`
          ).join("")}
        </tbody>
      </table>`
    : "";

  const contactLine = [
    policy.contactEmail ? `<a href="mailto:${policy.contactEmail}" style="color:#1a5c38">${policy.contactEmail}</a>` : null,
    policy.contactPhone ? policy.contactPhone : null,
  ].filter(Boolean).join(" · ");

  return `
  <div style="background:#f0fdf4;border:1px solid #bbf7d0;border-radius:8px;padding:20px 24px;margin-top:20px">
    <div style="font-size:11px;font-weight:700;text-transform:uppercase;letter-spacing:1px;color:#166534;margin-bottom:12px">Cancellation Policy — ${clubName}</div>
    <div style="display:grid;grid-template-columns:160px 1fr;gap:6px 12px;font-size:13px;margin-bottom:${tiers ? "12px" : "0"}">
      <span style="color:#6b7280">Cancellation Window</span>
      <span style="font-weight:600">${fmtWindow(policy.windowMinutes)}</span>
      <span style="color:#6b7280">Cancellation Fee</span>
      <span style="font-weight:600">${policy.feePct}% of booking total</span>
      ${contactLine ? `<span style="color:#6b7280">Refund Contact</span><span>${contactLine}</span>` : ""}
    </div>
    ${tiers}
    ${policy.otherPolicies ? `<div style="margin-top:12px;padding-top:10px;border-top:1px solid #bbf7d0;font-size:12px;color:#374151;white-space:pre-line">${policy.otherPolicies}</div>` : ""}
  </div>`;
}

function invoiceHtml(booking: any, clubName: string, vatPct: number, cancelPolicy?: CancelPolicy | null): string {
  const holes = booking.holes ?? 18;
  const hasCart = Number(booking.cart_fee) > 0;
  // Use my_amount (what this user was charged) as the invoice total.
  const myAmount = Number(booking.my_amount ?? booking.total_amount);
  const greenFee = myAmount - Number(booking.cart_fee ?? 0) + Number(booking.discount_amount ?? 0);
  const vatAmount = Math.round(myAmount * vatPct / (100 + vatPct) * 100) / 100;
  const exclVat   = Math.round((myAmount - vatAmount) * 100) / 100;

  return `<!DOCTYPE html>
<html lang="en">
<head><meta charset="UTF-8"><title>Invoice ${booking.booking_ref}</title></head>
<body style="margin:0;padding:40px 24px;font-family:Arial,sans-serif;color:#111827;background:#f9fafb">
  <div style="max-width:640px;margin:0 auto;background:#fff;border-radius:12px;overflow:hidden;border:1px solid #e5e7eb">
    <div style="background:#1a5c38;color:#fff;padding:32px 40px;display:flex;justify-content:space-between;align-items:center">
      <div>
        <div style="font-size:22px;font-weight:800;letter-spacing:-0.5px">TapIn Golf</div>
        <div style="font-size:13px;opacity:0.75;margin-top:2px">${clubName}</div>
      </div>
      <div style="text-align:right">
        <div style="font-size:13px;opacity:0.7;text-transform:uppercase;letter-spacing:1px">Invoice</div>
        <div style="font-size:22px;font-weight:700;letter-spacing:1px">${booking.booking_ref}</div>
      </div>
    </div>
    <div style="padding:36px 40px">
      <div style="display:flex;justify-content:space-between;margin-bottom:32px;gap:24px">
        <div>
          <div style="font-size:11px;font-weight:700;text-transform:uppercase;letter-spacing:1px;color:#6b7280;margin-bottom:6px">Bill To</div>
          <div style="font-size:15px;font-weight:600">${booking.user_name}</div>
          <div style="color:#6b7280;font-size:13px">${booking.user_email}</div>
          ${booking.user_phone ? `<div style="color:#6b7280;font-size:13px">${booking.user_phone}</div>` : ""}
        </div>
        <div style="text-align:right">
          <div style="font-size:11px;font-weight:700;text-transform:uppercase;letter-spacing:1px;color:#6b7280;margin-bottom:6px">Issue Date</div>
          <div style="font-size:14px">${new Date(booking.created_at).toLocaleDateString("en-ZA", { day: "2-digit", month: "long", year: "numeric" })}</div>
          <div style="font-size:11px;font-weight:700;text-transform:uppercase;letter-spacing:1px;color:#6b7280;margin-top:12px;margin-bottom:6px">Status</div>
          <div style="display:inline-block;padding:2px 10px;border-radius:20px;font-size:12px;font-weight:600;background:${booking.status === "confirmed" || booking.status === "completed" ? "#dcfce7;color:#166534" : booking.status === "pending" ? "#fef9c3;color:#854d0e" : "#fee2e2;color:#991b1b"}">${String(booking.status).toUpperCase()}</div>
        </div>
      </div>

      <div style="background:#f9fafb;border-radius:8px;padding:16px 20px;margin-bottom:28px;border:1px solid #e5e7eb">
        <div style="font-size:11px;font-weight:700;text-transform:uppercase;letter-spacing:1px;color:#6b7280;margin-bottom:10px">Booking Details</div>
        <div style="display:grid;grid-template-columns:1fr 1fr;gap:8px">
          <div><span style="color:#6b7280;font-size:13px">Date</span><div style="font-weight:600;font-size:14px">${booking.tee_date}</div></div>
          <div><span style="color:#6b7280;font-size:13px">Tee Time</span><div style="font-weight:600;font-size:14px">${booking.tee_time}</div></div>
          <div><span style="color:#6b7280;font-size:13px">Players</span><div style="font-weight:600;font-size:14px">${booking.players}</div></div>
          <div><span style="color:#6b7280;font-size:13px">Service</span><div style="font-weight:600;font-size:14px">${holes} Holes${hasCart ? " + Golf Cart" : ""}</div></div>
          <div><span style="color:#6b7280;font-size:13px">Pricing Tier</span><div style="font-weight:600;font-size:14px">${fmtTier(booking.price_tier)}</div></div>
          <div><span style="color:#6b7280;font-size:13px">Paid On</span><div style="font-weight:600;font-size:14px">${new Date(booking.created_at).toLocaleString("en-ZA", { day: "2-digit", month: "short", year: "numeric", hour: "2-digit", minute: "2-digit" })}</div></div>
        </div>
      </div>

      <table style="width:100%;border-collapse:collapse;margin-bottom:28px">
        <thead>
          <tr style="background:#f3f4f6">
            <th style="padding:10px 8px;text-align:left;font-size:12px;font-weight:700;text-transform:uppercase;letter-spacing:0.5px;color:#6b7280">Description</th>
            <th style="padding:10px 8px;text-align:right;font-size:12px;font-weight:700;text-transform:uppercase;letter-spacing:0.5px;color:#6b7280">Amount</th>
          </tr>
        </thead>
        <tbody>
          <tr><td style="padding:10px 8px;border-bottom:1px solid #f3f4f6">${holes} Holes Green Fee (${fmtTier(booking.price_tier)})</td><td style="padding:10px 8px;border-bottom:1px solid #f3f4f6;text-align:right">R ${greenFee.toFixed(2)}</td></tr>
          ${hasCart ? `<tr><td style="padding:10px 8px;border-bottom:1px solid #f3f4f6">Golf Cart Hire</td><td style="padding:10px 8px;border-bottom:1px solid #f3f4f6;text-align:right">R ${Number(booking.cart_fee).toFixed(2)}</td></tr>` : ""}
          ${Number(booking.discount_amount) > 0 ? `<tr><td style="padding:10px 8px;border-bottom:1px solid #f3f4f6;color:#16a34a">Discount${booking.voucher_code ? ` (${booking.voucher_code})` : ""}</td><td style="padding:10px 8px;border-bottom:1px solid #f3f4f6;text-align:right;color:#16a34a">−R ${Number(booking.discount_amount).toFixed(2)}</td></tr>` : ""}
        </tbody>
        <tfoot>
          <tr>
            <td style="padding:8px 8px 2px;color:#6b7280;font-size:13px">Subtotal (excl. VAT)</td>
            <td style="padding:8px 8px 2px;text-align:right;color:#6b7280;font-size:13px">R ${exclVat.toFixed(2)}</td>
          </tr>
          <tr>
            <td style="padding:2px 8px 10px;color:#6b7280;font-size:13px">VAT (15%)</td>
            <td style="padding:2px 8px 10px;text-align:right;color:#6b7280;font-size:13px">R ${vatAmount.toFixed(2)}</td>
          </tr>
          <tr style="background:#f9fafb">
            <td style="padding:14px 8px;font-weight:700;font-size:16px">Total (incl. VAT)</td>
            <td style="padding:14px 8px;font-weight:700;font-size:18px;text-align:right;color:#1a5c38">R ${myAmount.toFixed(2)}</td>
          </tr>
        </tfoot>
      </table>

      <div style="background:#f9fafb;border-radius:8px;padding:16px 20px;border:1px solid #e5e7eb">
        <div style="font-size:11px;font-weight:700;text-transform:uppercase;letter-spacing:1px;color:#6b7280;margin-bottom:10px">Payment Information</div>
        <div style="display:flex;justify-content:space-between;font-size:14px"><span style="color:#6b7280">Payment Method</span><span style="font-weight:600">${fmtMethod(booking.payment_method)}</span></div>
        <div style="display:flex;justify-content:space-between;font-size:14px;margin-top:6px"><span style="color:#6b7280">Reference</span><span style="font-family:monospace;font-weight:600">${booking.booking_ref}</span></div>
      </div>
      ${cancelPolicy ? cancelPolicyHtml(cancelPolicy, clubName) : ""}
    </div>
    <div style="padding:20px 40px;border-top:1px solid #e5e7eb;text-align:center;color:#9ca3af;font-size:12px">
      TapIn Golf · tapingolf.co.za · This is your official booking receipt. Please retain for your records.
    </div>
  </div>
</body>
</html>`;
}

// ─── Club cancellation notification ────────────────────────────────────────
export async function sendCancellationNotificationEmail(
  clubEmail: string,
  booking: {
    booking_ref: string;
    golfer_name: string;
    golfer_email: string;
    golfer_phone?: string | null;
    club_name: string;
    tee_date: string;
    tee_time: string;
    players: number;
    total_amount: number;
    cancel_fee_pct: number;
    cancelled_at: string;
  }
): Promise<{ dev?: boolean }> {
  const feePct     = booking.cancel_fee_pct ?? 5;
  const feeAmount  = Math.round(booking.total_amount * feePct / 100 * 100) / 100;
  const netRefund  = Math.round((booking.total_amount - feeAmount) * 100) / 100;

  const subject = `Booking Cancelled — ${booking.booking_ref} | ${booking.club_name}`;

  const text = [
    `A booking at ${booking.club_name} has been cancelled.`,
    ``,
    `Booking Reference : ${booking.booking_ref}`,
    `Golfer            : ${booking.golfer_name} <${booking.golfer_email}>`,
    booking.golfer_phone ? `Phone             : ${booking.golfer_phone}` : null,
    `Tee Date          : ${booking.tee_date}`,
    `Tee Time          : ${booking.tee_time}`,
    `Players           : ${booking.players}`,
    `Booking Total     : R ${booking.total_amount.toFixed(2)}`,
    `Cancellation Fee  : ${feePct}% (R ${feeAmount.toFixed(2)})`,
    `Golfer Refund     : R ${netRefund.toFixed(2)}`,
    ``,
    `Cancelled at      : ${new Date(booking.cancelled_at).toLocaleString("en-ZA", { timeZone: "Africa/Johannesburg", day: "2-digit", month: "long", year: "numeric", hour: "2-digit", minute: "2-digit" })}`,
    ``,
    `Please process the golfer's refund according to your cancellation policy.`,
    `TapIn Golf — tapingolf.co.za`,
  ].filter(l => l !== null).join("\n");

  const html = `<!DOCTYPE html>
<html lang="en">
<head><meta charset="UTF-8"><title>Booking Cancelled — ${booking.booking_ref}</title></head>
<body style="margin:0;padding:40px 24px;font-family:Arial,sans-serif;color:#111827;background:#f9fafb">
  <div style="max-width:600px;margin:0 auto;background:#fff;border-radius:12px;overflow:hidden;border:1px solid #e5e7eb">
    <div style="background:#991b1b;color:#fff;padding:28px 36px;display:flex;justify-content:space-between;align-items:center">
      <div>
        <div style="font-size:11px;font-weight:700;text-transform:uppercase;letter-spacing:1.5px;opacity:0.8;margin-bottom:4px">TapIn Golf</div>
        <div style="font-size:22px;font-weight:800">Booking Cancelled</div>
      </div>
      <div style="background:#fff;color:#991b1b;padding:6px 16px;border-radius:20px;font-weight:700;font-size:14px;font-family:monospace">
        ${booking.booking_ref}
      </div>
    </div>

    <div style="padding:32px 36px">
      <p style="margin:0 0 24px;color:#6b7280;font-size:14px;line-height:1.6">
        A booking at <strong style="color:#111827">${booking.club_name}</strong> has been cancelled by the golfer.
        Please process the applicable refund according to your cancellation policy.
      </p>

      <div style="background:#fef2f2;border:1px solid #fecaca;border-radius:10px;padding:20px 24px;margin-bottom:24px">
        <div style="font-size:11px;font-weight:700;text-transform:uppercase;letter-spacing:1px;color:#991b1b;margin-bottom:14px">Golfer Details</div>
        <div style="display:grid;grid-template-columns:140px 1fr;gap:6px 12px;font-size:14px">
          <span style="color:#6b7280">Name</span>
          <span style="font-weight:600">${booking.golfer_name}</span>
          <span style="color:#6b7280">Email</span>
          <span><a href="mailto:${booking.golfer_email}" style="color:#1a5c38">${booking.golfer_email}</a></span>
          ${booking.golfer_phone ? `<span style="color:#6b7280">Phone</span><span>${booking.golfer_phone}</span>` : ""}
        </div>
      </div>

      <div style="background:#f9fafb;border:1px solid #e5e7eb;border-radius:10px;padding:20px 24px;margin-bottom:24px">
        <div style="font-size:11px;font-weight:700;text-transform:uppercase;letter-spacing:1px;color:#6b7280;margin-bottom:14px">Booking Details</div>
        <div style="display:grid;grid-template-columns:140px 1fr;gap:6px 12px;font-size:14px">
          <span style="color:#6b7280">Date</span>        <span style="font-weight:600">${booking.tee_date}</span>
          <span style="color:#6b7280">Tee Time</span>    <span style="font-weight:600">${booking.tee_time}</span>
          <span style="color:#6b7280">Players</span>     <span style="font-weight:600">${booking.players}</span>
          <span style="color:#6b7280">Cancelled At</span><span>${new Date(booking.cancelled_at).toLocaleString("en-ZA", { timeZone: "Africa/Johannesburg", day: "2-digit", month: "long", year: "numeric", hour: "2-digit", minute: "2-digit" })}</span>
        </div>
      </div>

      <div style="border:2px solid #e5e7eb;border-radius:10px;overflow:hidden">
        <div style="font-size:11px;font-weight:700;text-transform:uppercase;letter-spacing:1px;color:#6b7280;padding:12px 20px;background:#f9fafb;border-bottom:1px solid #e5e7eb">
          Cancellation Financials
        </div>
        <div style="padding:16px 20px;display:grid;grid-template-columns:1fr auto;gap:6px 16px;font-size:14px">
          <span style="color:#6b7280">Booking Total</span>
          <span style="text-align:right;font-weight:600">R ${booking.total_amount.toFixed(2)}</span>
          <span style="color:#6b7280">Cancellation Fee (${feePct}%)</span>
          <span style="text-align:right;color:#991b1b;font-weight:600">− R ${feeAmount.toFixed(2)}</span>
        </div>
        <div style="padding:12px 20px;background:#f0fdf4;border-top:2px solid #bbf7d0;display:grid;grid-template-columns:1fr auto">
          <span style="font-weight:700;font-size:15px;color:#166534">Refund to Golfer</span>
          <span style="font-weight:800;font-size:16px;color:#166534;text-align:right">R ${netRefund.toFixed(2)}</span>
        </div>
      </div>
    </div>

    <div style="padding:20px 36px;border-top:1px solid #e5e7eb;text-align:center;color:#9ca3af;font-size:12px">
      TapIn Golf · tapingolf.co.za · This notification was sent automatically when the golfer cancelled their booking.
    </div>
  </div>
</body>
</html>`;

  if (EMAIL_DEV_MODE()) {
    logger.info(
      { clubEmail, booking_ref: booking.booking_ref, golfer: booking.golfer_email },
      "[DEV] Cancellation notification — no SMTP credentials configured"
    );
    return { dev: true };
  }

  const transporter = nodemailer.createTransport({
    host:   SMTP_HOST(),
    port:   SMTP_PORT(),
    secure: SMTP_PORT() === 465,
    auth: { user: SMTP_USER(), pass: SMTP_PASS() },
  });

  await transporter.sendMail({ from: SMTP_FROM(), to: clubEmail, subject, text, html });
  return {};
}

// ─── HTML invoice generator ─────────────────────────────────────────────────

function generateInvoiceHtml(
  booking: any,
  clubName: string,
  vatPct: number,
  isCopy: boolean,
  cancelPolicy?: CancelPolicy | null,
): string {
  const hasCart   = Number(booking.cart_fee ?? 0) > 0;
  const myAmount  = Number(booking.my_amount ?? booking.total_amount);
  const cartFee   = Number(booking.cart_fee ?? 0);
  const discount  = Number(booking.discount_amount ?? 0);
  const greenFee  = myAmount - cartFee + discount;
  const vatAmount = Math.round(myAmount * vatPct / (100 + vatPct) * 100) / 100;
  const exclVat   = Math.round((myAmount - vatAmount) * 100) / 100;

  const status    = String(booking.status ?? "confirmed");
  const statusBg  = (status === "confirmed" || status === "completed")
    ? "background:#dcfce7;color:#166534"
    : status === "pending"
    ? "background:#fef9c3;color:#854d0e"
    : "background:#fee2e2;color:#991b1b";

  const paidDate  = new Date(booking.created_at).toLocaleString("en-ZA", {
    timeZone: "Africa/Johannesburg", day: "2-digit", month: "short",
    year: "numeric", hour: "2-digit", minute: "2-digit",
  });
  const teeDate   = String(booking.tee_date ?? "").slice(0, 10);
  const invoiceLabel = isCopy ? "Copy Tax Invoice" : "Tax Invoice";

  // ── Cancellation policy section ────────────────────────────────────────────
  const policyRows: string[] = [
    `<div style="display:grid;grid-template-columns:200px 1fr;padding:10px 20px;background:#f0fdf4;font-size:13px;border-bottom:1px solid #e5e7eb"><span style="color:#6b7280">Cancellation Window</span><span style="font-weight:600;color:#111827">${fmtWindow(cancelPolicy?.windowMinutes ?? null)}</span></div>`,
    `<div style="display:grid;grid-template-columns:200px 1fr;padding:10px 20px;background:#fff;font-size:13px;border-bottom:1px solid #e5e7eb"><span style="color:#6b7280">Cancellation Fee</span><span style="font-weight:600;color:#111827">${cancelPolicy?.feePct ?? 0}% of booking total</span></div>`,
  ];
  if (cancelPolicy?.contactEmail) policyRows.push(`<div style="display:grid;grid-template-columns:200px 1fr;padding:10px 20px;background:#f0fdf4;font-size:13px;border-bottom:1px solid #e5e7eb"><span style="color:#6b7280">Refund Contact (Email)</span><span style="font-weight:600;color:#111827">${cancelPolicy.contactEmail}</span></div>`);
  if (cancelPolicy?.contactPhone) policyRows.push(`<div style="display:grid;grid-template-columns:200px 1fr;padding:10px 20px;background:#fff;font-size:13px;border-bottom:1px solid #e5e7eb"><span style="color:#6b7280">Refund Contact (Phone)</span><span style="font-weight:600;color:#111827">${cancelPolicy.contactPhone}</span></div>`);

  const tierRows = (cancelPolicy?.refundTiers ?? []).map((t: any, i: number) => `
    <div style="display:grid;grid-template-columns:1fr auto;padding:9px 20px;background:${i % 2 === 0 ? "#fff" : "#f9fafb"};font-size:13px;border-top:1px solid #f3f4f6">
      <span style="color:#111827">${t.label}</span>
      <span style="font-weight:700;color:${t.refund_pct === 100 ? "#166534" : t.refund_pct === 0 ? "#991b1b" : "#92400e"}">${t.refund_pct}%</span>
    </div>`).join("");

  const cancelPolicySection = cancelPolicy ? `
      <div style="margin-top:28px;border-radius:10px;overflow:hidden;border:1px solid #e5e7eb">
        <div style="background:#1a5c38;color:#fff;padding:12px 20px;font-size:11px;font-weight:700;text-transform:uppercase;letter-spacing:1px">
          Cancellation Policy — ${clubName}
        </div>
        <div>${policyRows.join("")}
          ${(cancelPolicy.refundTiers ?? []).length > 0 ? `<div style="display:grid;grid-template-columns:1fr auto;background:#f3f4f6;padding:8px 20px;border-top:1px solid #e5e7eb"><span style="font-size:11px;font-weight:700;text-transform:uppercase;letter-spacing:0.5px;color:#6b7280">Notice Period</span><span style="font-size:11px;font-weight:700;text-transform:uppercase;letter-spacing:0.5px;color:#6b7280">Refund</span></div>${tierRows}` : ""}
          ${cancelPolicy.otherPolicies ? `<div style="padding:12px 20px;background:#fff;font-size:12px;color:#6b7280;border-top:1px solid #e5e7eb">${cancelPolicy.otherPolicies}</div>` : ""}
        </div>
      </div>` : "";

  return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <title>${invoiceLabel} ${booking.booking_ref}</title>
  <style>
    @media print {
      body { margin: 0; padding: 0; background: #fff; }
      .no-print { display: none !important; }
    }
  </style>
</head>
<body style="margin:0;padding:40px 24px;font-family:Arial,Helvetica,sans-serif;color:#111827;background:#f9fafb">
  <div class="no-print" style="text-align:center;margin-bottom:24px">
    <button onclick="window.print()" style="background:#1a5c38;color:#fff;border:none;padding:10px 28px;border-radius:8px;font-size:14px;font-weight:600;cursor:pointer">Print / Save as PDF</button>
  </div>
  <div style="max-width:660px;margin:0 auto;background:#fff;border-radius:12px;overflow:hidden;border:1px solid #e5e7eb;box-shadow:0 4px 24px rgba(0,0,0,0.06)">
    <!-- Header -->
    <div style="background:#1a5c38;color:#fff;padding:32px 40px">
      <div style="display:flex;justify-content:space-between;align-items:flex-start">
        <div>
          <div style="font-size:24px;font-weight:800;letter-spacing:-0.5px">TapIn Golf</div>
          <div style="font-size:13px;opacity:0.75;margin-top:3px">${clubName}</div>
        </div>
        <div style="text-align:right">
          <div style="font-size:11px;opacity:0.6;text-transform:uppercase;letter-spacing:1.5px">${invoiceLabel}</div>
          <div style="font-size:22px;font-weight:700;letter-spacing:2px;margin-top:2px">${booking.booking_ref}</div>
          <div style="font-size:12px;opacity:0.7;margin-top:4px">${paidDate}</div>
        </div>
      </div>
    </div>

    <div style="padding:36px 40px">
      <!-- Bill To / Status -->
      <div style="display:flex;justify-content:space-between;margin-bottom:32px;gap:24px">
        <div>
          <div style="font-size:11px;font-weight:700;text-transform:uppercase;letter-spacing:1px;color:#6b7280;margin-bottom:8px">Bill To</div>
          <div style="font-size:16px;font-weight:600">${booking.user_name ?? ""}</div>
          <div style="color:#6b7280;font-size:13px;margin-top:2px">${booking.user_email ?? ""}</div>
          ${booking.user_phone ? `<div style="color:#6b7280;font-size:13px;margin-top:2px">${booking.user_phone}</div>` : ""}
        </div>
        <div style="text-align:right">
          <div style="font-size:11px;font-weight:700;text-transform:uppercase;letter-spacing:1px;color:#6b7280;margin-bottom:8px">Payment Status</div>
          <div style="display:inline-block;padding:4px 14px;border-radius:20px;font-size:12px;font-weight:700;letter-spacing:0.5px;${statusBg}">${status.toUpperCase()}</div>
          <div style="font-size:11px;font-weight:700;text-transform:uppercase;letter-spacing:1px;color:#6b7280;margin-top:14px;margin-bottom:8px">Payment Method</div>
          <div style="font-size:13px;font-weight:600">${fmtMethod(booking.payment_method)}</div>
        </div>
      </div>

      <!-- Booking Details -->
      <div style="background:#f9fafb;border-radius:10px;padding:20px 24px;margin-bottom:28px;border:1px solid #e5e7eb">
        <div style="font-size:11px;font-weight:700;text-transform:uppercase;letter-spacing:1px;color:#6b7280;margin-bottom:14px">Booking Details</div>
        <div style="display:grid;grid-template-columns:1fr 1fr 1fr;gap:14px">
          <div><div style="color:#6b7280;font-size:12px">Tee Date</div><div style="font-weight:600;font-size:14px;margin-top:3px">${teeDate}</div></div>
          <div><div style="color:#6b7280;font-size:12px">Tee Time</div><div style="font-weight:600;font-size:14px;margin-top:3px">${booking.tee_time}</div></div>
          <div><div style="color:#6b7280;font-size:12px">Players</div><div style="font-weight:600;font-size:14px;margin-top:3px">${booking.players} player${booking.players !== 1 ? "s" : ""}</div></div>
          <div><div style="color:#6b7280;font-size:12px">Service</div><div style="font-weight:600;font-size:14px;margin-top:3px">${booking.holes ?? 18} Holes${hasCart ? " + Golf Cart" : ""}</div></div>
          <div><div style="color:#6b7280;font-size:12px">Pricing Tier</div><div style="font-weight:600;font-size:14px;margin-top:3px">${fmtTier(booking.price_tier)}</div></div>
          <div><div style="color:#6b7280;font-size:12px">Paid On</div><div style="font-weight:600;font-size:14px;margin-top:3px">${paidDate}</div></div>
        </div>
      </div>

      <!-- Line Items -->
      <table style="width:100%;border-collapse:collapse;margin-bottom:28px">
        <thead>
          <tr style="background:#f3f4f6">
            <th style="padding:10px;text-align:left;font-size:11px;font-weight:700;text-transform:uppercase;letter-spacing:0.5px;color:#6b7280;border-radius:4px 0 0 4px">Description</th>
            <th style="padding:10px;text-align:right;font-size:11px;font-weight:700;text-transform:uppercase;letter-spacing:0.5px;color:#6b7280;border-radius:0 4px 4px 0">Amount</th>
          </tr>
        </thead>
        <tbody>
          <tr>
            <td style="padding:12px 10px;border-bottom:1px solid #f3f4f6">${booking.holes ?? 18} Holes — Green Fee <span style="color:#6b7280;font-size:12px">(${fmtTier(booking.price_tier)})</span></td>
            <td style="padding:12px 10px;border-bottom:1px solid #f3f4f6;text-align:right">R ${greenFee.toFixed(2)}</td>
          </tr>
          ${hasCart ? `<tr><td style="padding:12px 10px;border-bottom:1px solid #f3f4f6">Golf Cart Hire</td><td style="padding:12px 10px;border-bottom:1px solid #f3f4f6;text-align:right">R ${cartFee.toFixed(2)}</td></tr>` : ""}
          ${discount > 0 ? `<tr><td style="padding:12px 10px;border-bottom:1px solid #f3f4f6;color:#16a34a">Discount${booking.voucher_code ? ` — Voucher <strong>${booking.voucher_code}</strong>` : ""}</td><td style="padding:12px 10px;border-bottom:1px solid #f3f4f6;text-align:right;color:#16a34a">−R ${discount.toFixed(2)}</td></tr>` : ""}
        </tbody>
        <tfoot>
          <tr>
            <td style="padding:8px 10px 2px;color:#6b7280;font-size:13px">Subtotal (excl. VAT)</td>
            <td style="padding:8px 10px 2px;text-align:right;color:#6b7280;font-size:13px">R ${exclVat.toFixed(2)}</td>
          </tr>
          <tr>
            <td style="padding:2px 10px 10px;color:#6b7280;font-size:13px">VAT (${vatPct}%)</td>
            <td style="padding:2px 10px 10px;text-align:right;color:#6b7280;font-size:13px">R ${vatAmount.toFixed(2)}</td>
          </tr>
          <tr style="background:#f0fdf4">
            <td style="padding:14px 10px;font-weight:700;font-size:16px;border-top:2px solid #bbf7d0">Total (incl. VAT)</td>
            <td style="padding:14px 10px;font-weight:800;font-size:20px;text-align:right;color:#1a5c38;border-top:2px solid #bbf7d0">R ${myAmount.toFixed(2)}</td>
          </tr>
        </tfoot>
      </table>

      <!-- Payment Reference -->
      <div style="background:#f9fafb;border-radius:10px;padding:16px 24px;border:1px solid #e5e7eb">
        <div style="font-size:11px;font-weight:700;text-transform:uppercase;letter-spacing:1px;color:#6b7280;margin-bottom:10px">Payment Reference</div>
        <div style="font-family:monospace;font-size:18px;font-weight:700;color:#1a5c38;letter-spacing:2px">${booking.booking_ref}</div>
        <div style="font-size:12px;color:#9ca3af;margin-top:4px">Use this reference for any payment queries</div>
      </div>

      ${cancelPolicySection}
    </div>

    <!-- Footer -->
    <div style="padding:20px 40px;border-top:1px solid #e5e7eb;text-align:center;color:#9ca3af;font-size:12px">
      TapIn Golf &nbsp;·&nbsp; tapingolf.co.za &nbsp;·&nbsp; This is your official booking receipt. Please retain for your records.
    </div>
  </div>
</body>
</html>`;
}

// ─── Confirmation email body ─────────────────────────────────────────────────

function confirmationEmailHtml(booking: any, clubName: string, vatPct: number): string {
  const myAmount  = Number(booking.my_amount ?? booking.total_amount);
  const firstName = (booking.user_name ?? "").split(" ")[0] || "Golfer";
  const dateStr   = new Date(`${booking.tee_date}T12:00:00`).toLocaleDateString("en-ZA", { day: "2-digit", month: "long", year: "numeric" });

  const row2 = (label: string, val: string) =>
    `<tr><td style="padding:8px 16px;color:#6b7280;font-size:13px;width:160px">${label}</td><td style="padding:8px 16px;font-weight:600;font-size:13px;color:#111827">${val}</td></tr>`;

  return `<!DOCTYPE html>
<html lang="en">
<head><meta charset="UTF-8"><title>Booking Confirmed — ${booking.booking_ref}</title></head>
<body style="margin:0;padding:40px 24px;font-family:Arial,sans-serif;color:#111827;background:#f9fafb">
  <div style="max-width:600px;margin:0 auto;background:#fff;border-radius:12px;overflow:hidden;border:1px solid #e5e7eb">

    <div style="background:#1a5c38;color:#fff;padding:32px 40px">
      <div style="font-size:22px;font-weight:800;letter-spacing:-0.5px">TapIn Golf</div>
      <div style="font-size:13px;opacity:0.7;margin-top:2px">${clubName}</div>
      <div style="margin-top:20px;font-size:20px;font-weight:700">Booking Confirmed ⛳</div>
    </div>

    <div style="padding:36px 40px">
      <p style="font-size:15px;margin:0 0 24px;line-height:1.6">
        Hi <strong>${firstName}</strong>,<br><br>
        Your tee time is confirmed! Your tax invoice is attached to this email — open it in your browser to print or save as PDF.
      </p>

      <div style="background:#f9fafb;border-radius:8px;border:1px solid #e5e7eb;overflow:hidden;margin-bottom:28px">
        <div style="padding:10px 16px;background:#f3f4f6;font-size:11px;font-weight:700;text-transform:uppercase;letter-spacing:1px;color:#6b7280">Booking Summary</div>
        <table style="width:100%;border-collapse:collapse">
          ${row2("Club", clubName)}
          ${row2("Date", dateStr)}
          ${row2("Tee Time", booking.tee_time)}
          ${row2("Players", String(booking.players))}
          ${row2("Payment Method", fmtMethod(booking.payment_method))}
          ${row2("Reference", booking.booking_ref)}
          <tr style="background:#f0fdf4"><td style="padding:10px 16px;color:#166534;font-weight:700;font-size:13px">Total Paid</td><td style="padding:10px 16px;font-weight:800;font-size:15px;color:#1a5c38">R ${myAmount.toFixed(2)}</td></tr>
        </table>
      </div>

      <div style="background:#f0fdf4;border:1px solid #bbf7d0;border-radius:8px;padding:16px 20px;margin-bottom:24px">
        <div style="font-size:12px;font-weight:700;text-transform:uppercase;letter-spacing:1px;color:#166534;margin-bottom:6px">Cancellation Policy</div>
        <p style="margin:0;font-size:13px;color:#374151;line-height:1.6">
          ${clubName}'s cancellation terms are detailed in your attached invoice. To cancel or request a change, contact the club using the details provided on your invoice.
        </p>
      </div>

      <p style="font-size:13px;color:#6b7280;margin:0;line-height:1.6">
        See you on the fairway!<br>
        <strong style="color:#1a5c38">— The TapIn Golf Team</strong>
      </p>
    </div>

    <div style="padding:16px 40px;border-top:1px solid #e5e7eb;text-align:center;color:#9ca3af;font-size:11px">
      TapIn Golf · <a href="https://tapingolf.co.za" style="color:#1a5c38">tapingolf.co.za</a> · This is an automated confirmation. Please do not reply to this email.
    </div>
  </div>
</body>
</html>`;
}

function confirmationEmailText(booking: any, clubName: string): string {
  const myAmount  = Number(booking.my_amount ?? booking.total_amount);
  const firstName = (booking.user_name ?? "").split(" ")[0] || "Golfer";
  return [
    `Hi ${firstName},`,
    ``,
    `Your tee time at ${clubName} is confirmed!`,
    `Your tax invoice is attached to this email (HTML file — open in browser to print/save). Please retain for your records.`,
    ``,
    `BOOKING SUMMARY`,
    `─────────────────────────────────`,
    `Club           : ${clubName}`,
    `Date           : ${booking.tee_date}`,
    `Tee Time       : ${booking.tee_time}`,
    `Players        : ${booking.players}`,
    `Payment Method : ${fmtMethod(booking.payment_method)}`,
    `Reference      : ${booking.booking_ref}`,
    `Total Paid     : R ${myAmount.toFixed(2)}`,
    `─────────────────────────────────`,
    ``,
    `CANCELLATION POLICY`,
    `${clubName}'s cancellation terms are detailed in your attached invoice.`,
    `To cancel or request a change, contact the club using the details on your invoice.`,
    ``,
    `See you on the fairway!`,
    `— The TapIn Golf Team`,
    ``,
    `tapingolf.co.za`,
  ].join("\n");
}

// ─── Resend invoice email body (copy) ────────────────────────────────────────

function resendEmailHtml(booking: any, clubName: string): string {
  const firstName = (booking.user_name ?? "").split(" ")[0] || "Golfer";
  const myAmount  = Number(booking.my_amount ?? booking.total_amount);
  return `<!DOCTYPE html>
<html lang="en">
<head><meta charset="UTF-8"><title>Invoice Copy — ${booking.booking_ref}</title></head>
<body style="margin:0;padding:40px 24px;font-family:Arial,sans-serif;color:#111827;background:#f9fafb">
  <div style="max-width:600px;margin:0 auto;background:#fff;border-radius:12px;overflow:hidden;border:1px solid #e5e7eb">
    <div style="background:#1a5c38;color:#fff;padding:32px 40px">
      <div style="font-size:22px;font-weight:800;letter-spacing:-0.5px">TapIn Golf</div>
      <div style="font-size:13px;opacity:0.7;margin-top:2px">${clubName}</div>
      <div style="margin-top:20px;font-size:20px;font-weight:700">Invoice Copy</div>
    </div>
    <div style="padding:36px 40px">
      <p style="font-size:15px;margin:0 0 24px;line-height:1.6">
        Hi <strong>${firstName}</strong>,<br><br>
        As requested, your <strong>Copy Tax Invoice</strong> for your booking at <strong>${clubName}</strong> is attached. Open the HTML file in your browser to print or save as PDF.
      </p>
      <div style="background:#f9fafb;border-radius:8px;border:1px solid #e5e7eb;overflow:hidden;margin-bottom:24px">
        <div style="padding:10px 16px;background:#f3f4f6;font-size:11px;font-weight:700;text-transform:uppercase;letter-spacing:1px;color:#6b7280">Booking Summary</div>
        <table style="width:100%;border-collapse:collapse">
          <tr><td style="padding:8px 16px;color:#6b7280;font-size:13px;width:160px">Club</td><td style="padding:8px 16px;font-weight:600;font-size:13px;color:#111827">${clubName}</td></tr>
          <tr><td style="padding:8px 16px;color:#6b7280;font-size:13px">Date</td><td style="padding:8px 16px;font-weight:600;font-size:13px;color:#111827">${booking.tee_date}</td></tr>
          <tr><td style="padding:8px 16px;color:#6b7280;font-size:13px">Tee Time</td><td style="padding:8px 16px;font-weight:600;font-size:13px;color:#111827">${booking.tee_time}</td></tr>
          <tr><td style="padding:8px 16px;color:#6b7280;font-size:13px">Reference</td><td style="padding:8px 16px;font-weight:600;font-size:13px;color:#111827;font-family:monospace">${booking.booking_ref}</td></tr>
          <tr style="background:#f0fdf4"><td style="padding:10px 16px;color:#166534;font-weight:700;font-size:13px">Total Paid</td><td style="padding:10px 16px;font-weight:800;font-size:15px;color:#1a5c38">R ${myAmount.toFixed(2)}</td></tr>
        </table>
      </div>
      <p style="font-size:13px;color:#6b7280;margin:0;line-height:1.6">
        See you on the fairway!<br><strong style="color:#1a5c38">— The TapIn Golf Team</strong>
      </p>
    </div>
    <div style="padding:16px 40px;border-top:1px solid #e5e7eb;text-align:center;color:#9ca3af;font-size:11px">
      TapIn Golf · <a href="https://tapingolf.co.za" style="color:#1a5c38">tapingolf.co.za</a> · This is an automated message. Please do not reply.
    </div>
  </div>
</body>
</html>`;
}

function resendEmailText(booking: any, clubName: string): string {
  const firstName = (booking.user_name ?? "").split(" ")[0] || "Golfer";
  const myAmount  = Number(booking.my_amount ?? booking.total_amount);
  return [
    `Hi ${firstName},`,
    ``,
    `As requested, your Copy Tax Invoice for your booking at ${clubName} is attached.`,
    `Open the HTML file in your browser to print or save as PDF.`,
    ``,
    `Club      : ${clubName}`,
    `Date      : ${booking.tee_date}`,
    `Tee Time  : ${booking.tee_time}`,
    `Reference : ${booking.booking_ref}`,
    `Total     : R ${myAmount.toFixed(2)}`,
    ``,
    `See you on the fairway!`,
    `— The TapIn Golf Team`,
    ``,
    `tapingolf.co.za`,
  ].join("\n");
}

export async function sendInvoiceEmail(
  booking: any,
  clubName: string,
  cancelPolicy?: CancelPolicy | null,
): Promise<{ dev?: boolean }> {
  const vatSetting = await row<any>("SELECT setting_value FROM platform_settings WHERE setting_key = 'vat_pct'");
  const vatPct = vatSetting ? parseFloat(vatSetting.setting_value) : 15;

  // Determine first send vs copy — one invoice per transaction rule
  const isCopy  = Boolean(booking.invoice_sent_at);
  const subject = isCopy
    ? `Invoice Copy — ${booking.booking_ref} | ${clubName}`
    : `Booking Confirmed — ${booking.booking_ref} | ${clubName}`;

  const bodyHtml = isCopy ? resendEmailHtml(booking, clubName) : confirmationEmailHtml(booking, clubName, vatPct);
  const bodyText = isCopy ? resendEmailText(booking, clubName) : confirmationEmailText(booking, clubName);

  if (EMAIL_DEV_MODE()) {
    logger.info({ email: booking.user_email, booking_ref: booking.booking_ref, isCopy }, "[DEV] Invoice email — no SMTP credentials configured");
    return { dev: true };
  }

  const invoiceHtml = generateInvoiceHtml(booking, clubName, vatPct, isCopy, cancelPolicy);

  const transporter = nodemailer.createTransport({
    host:   SMTP_HOST(),
    port:   SMTP_PORT(),
    secure: SMTP_PORT() === 465,
    auth: { user: SMTP_USER(), pass: SMTP_PASS() },
  });

  await transporter.sendMail({
    from:    SMTP_FROM(),
    to:      booking.user_email,
    subject,
    text:    bodyText,
    html:    bodyHtml,
    attachments: [{
      filename:    `TapIn-Invoice-${booking.booking_ref}.html`,
      content:     Buffer.from(invoiceHtml, "utf8"),
      contentType: "text/html",
    }],
  });

  // Track invoice — enforce one-invoice-per-transaction rule
  if (booking.id) {
    if (isCopy) {
      await exec("UPDATE bookings SET invoice_resend_count = COALESCE(invoice_resend_count, 0) + 1 WHERE id = $1", [booking.id]);
    } else {
      await exec("UPDATE bookings SET invoice_sent_at = NOW(), invoice_resend_count = 0 WHERE id = $1", [booking.id]);
    }
  }

  return {};
}

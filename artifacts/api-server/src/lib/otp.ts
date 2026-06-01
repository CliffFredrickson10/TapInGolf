import crypto from "crypto";
import nodemailer from "nodemailer";
import { logger } from "./logger";
import { row } from "./pg";

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

function invoiceHtml(booking: any, clubName: string, vatPct: number): string {
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
    </div>
    <div style="padding:20px 40px;border-top:1px solid #e5e7eb;text-align:center;color:#9ca3af;font-size:12px">
      TapIn Golf · tapingolf.co.za · This is your official booking receipt. Please retain for your records.
    </div>
  </div>
</body>
</html>`;
}

export async function sendInvoiceEmail(booking: any, clubName: string): Promise<{ dev?: boolean }> {
  const vatSetting = await row<any>("SELECT setting_value FROM platform_settings WHERE setting_key = 'vat_pct'");
  const vatPct  = vatSetting ? parseFloat(vatSetting.setting_value) : 15;
  const html    = invoiceHtml(booking, clubName, vatPct);
  const subject = `Your TapIn Golf Invoice — ${booking.booking_ref}`;
  const _myAmt  = Number(booking.my_amount ?? booking.total_amount);
  const _vat    = Math.round(_myAmt * vatPct / (100 + vatPct) * 100) / 100;
  const _excl   = Math.round((_myAmt - _vat) * 100) / 100;
  const text = `Thank you for your booking at ${clubName}.\n\nBooking Reference: ${booking.booking_ref}\nTee Date: ${booking.tee_date} at ${booking.tee_time}\nSubtotal (excl. VAT): R ${_excl.toFixed(2)}\nVAT (${vatPct}%): R ${_vat.toFixed(2)}\nTotal (incl. VAT): R ${_myAmt.toFixed(2)}\nPayment Method: ${fmtMethod(booking.payment_method)}\n\nPlease find your invoice details in the HTML version of this email.\n\nTapIn Golf — tapingolf.co.za`;

  if (EMAIL_DEV_MODE()) {
    logger.info({ email: booking.user_email, booking_ref: booking.booking_ref }, "[DEV] Invoice email — no SMTP credentials configured");
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
    to:      booking.user_email,
    subject,
    text,
    html,
  });

  return {};
}

import { randomUUID } from "crypto";
import { query, row, exec } from "../lib/pg";
import { createStitchPayment } from "../lib/stitch";
import { logger } from "../lib/logger";

// Run once an hour; on the 1st of each month generate counter booking invoices
// for every club that has unbilled counter bookings from the previous month.
const POLL_INTERVAL_MS = 60 * 60 * 1000; // 1 hour

// In-memory guard so we only invoice once per calendar month even if the
// server restarts multiple times on the 1st.
let lastInvoicedMonth = ""; // "YYYY-MM"

function nowSAST(): Date {
  // SAST = UTC+2, no DST
  return new Date(Date.now() + 2 * 60 * 60 * 1000);
}

async function runMonthlyInvoiceCycle(): Promise<void> {
  const now  = nowSAST();
  const day  = now.getUTCDate();
  const year = now.getUTCFullYear();
  const month = now.getUTCMonth() + 1; // 1-12
  const monthKey = `${year}-${String(month).padStart(2, "0")}`;

  if (day !== 1) return;          // only run on the 1st
  if (lastInvoicedMonth === monthKey) return; // already ran this month

  // Determine the previous calendar month for the invoice description
  const prevMonth = month === 1 ? 12 : month - 1;
  const prevYear  = month === 1 ? year - 1 : year;
  const prevLabel = new Date(Date.UTC(prevYear, prevMonth - 1, 1))
    .toLocaleString("en-ZA", { month: "long", year: "numeric" });

  logger.info({ monthKey, prevLabel }, "Monthly counter invoice worker: running");

  // Find all clubs that have unbilled counter bookings
  const clubs = await query<any>(
    `SELECT pts.club_id
     FROM bookings b
     JOIN portal_tee_slots pts ON b.portal_slot_id = pts.id
     WHERE b.booking_source = 'club_counter'
       AND b.status != 'cancelled'
       AND b.counter_invoice_id IS NULL
     GROUP BY pts.club_id
     HAVING COUNT(*) > 0`
  );

  if (clubs.length === 0) {
    logger.info("Monthly counter invoice worker: no clubs with unbilled bookings");
    lastInvoicedMonth = monthKey;
    return;
  }

  logger.info({ count: clubs.length }, "Monthly counter invoice worker: clubs to invoice");

  const feeSetting = await row<any>(
    "SELECT setting_value FROM platform_settings WHERE setting_key = 'platform_fee_flat'"
  );
  const feePerSlot = feeSetting ? parseFloat(feeSetting.setting_value) : 10;

  const host = process.env["REPLIT_DEV_DOMAIN"]
    ? `https://${process.env["REPLIT_DEV_DOMAIN"]}`
    : "https://tapingolf.co.za";
  const redirectUrl = `${host}/api/portal/invoice-success`;

  for (const { club_id } of clubs) {
    try {
      // Get the club details for payment link + notification
      const club = await row<any>("SELECT id, name, email FROM clubs WHERE id = ?", [club_id]);
      if (!club) continue;

      // Fetch all unbilled bookings for this club
      const unbilledBookings = await query<any>(
        `SELECT b.id, b.booking_ref, b.guest_name, b.players,
                pts.date, pts.tee_time AS time
         FROM bookings b
         JOIN portal_tee_slots pts ON b.portal_slot_id = pts.id
         WHERE pts.club_id = ?
           AND b.booking_source = 'club_counter'
           AND b.status != 'cancelled'
           AND b.counter_invoice_id IS NULL`,
        [club_id]
      );
      if (unbilledBookings.length === 0) continue;

      const totalSlots  = unbilledBookings.reduce((s: number, b: any) => s + Number(b.players ?? 1), 0);
      const totalAmount = Math.round(feePerSlot * totalSlots * 100) / 100;
      const vatAmount   = Math.round(totalAmount * 15 / 115 * 100) / 100;

      const dateStr    = new Date().toISOString().slice(0, 10).replace(/-/g, "");
      const invoiceRef = `CINV-${club_id}-${dateStr}-${randomUUID().slice(0, 6).toUpperCase()}`;
      const description = `${totalSlots} player slot${totalSlots !== 1 ? "s" : ""} (${unbilledBookings.length} booking${unbilledBookings.length !== 1 ? "s" : ""}) — ${prevLabel} @ R${feePerSlot.toFixed(2)}/slot — TapIn platform fee (incl. 15% VAT)`;

      const lineItems = unbilledBookings.map((b: any) => ({
        booking_ref: b.booking_ref,
        guest_name:  b.guest_name,
        date:        String(b.date).slice(0, 10),
        time:        String(b.time).slice(0, 5),
        players:     Number(b.players ?? 1),
        amount:      Math.round(feePerSlot * Number(b.players ?? 1) * 100) / 100,
      }));

      const invResult = await query<any>(
        `INSERT INTO club_invoices
           (club_id, invoice_ref, description, total_rounds, platform_fee_rate,
            vat_rate, vat_amount, total_amount, invoice_type, line_items)
         VALUES (?, ?, ?, ?, ?, 0.15, ?, ?, 'counter_bookings', ?::jsonb) RETURNING id`,
        [club_id, invoiceRef, description, totalSlots, feePerSlot,
         vatAmount, totalAmount, JSON.stringify(lineItems)]
      );
      const invoiceId: number = invResult[0]?.id;

      // Mark all unbilled bookings as invoiced
      const ids: number[] = unbilledBookings.map((b: any) => b.id);
      const placeholders  = ids.map(() => "?").join(",");
      await exec(
        `UPDATE bookings SET counter_invoice_id = ? WHERE id IN (${placeholders})`,
        [invoiceId, ...ids]
      );

      // Try to create Stitch payment link — non-fatal
      let paymentUrl: string | null = null;
      try {
        const payment = await createStitchPayment({
          amount:            totalAmount,
          payerName:         club.name,
          merchantReference: `invoice-${invoiceId}`,
          redirectUrl,
          payerEmail:        club.email ?? undefined,
        });
        await exec(
          "UPDATE club_invoices SET stitch_payment_id = ?, stitch_payment_url = ? WHERE id = ?",
          [payment.id, payment.url, invoiceId]
        );
        paymentUrl = payment.url;
      } catch (payErr: any) {
        logger.warn({ err: payErr, invoiceId }, "Monthly counter invoice: Stitch link failed");
      }

      // Send portal inbox notification
      const notifBody = `Your ${prevLabel} counter booking invoice ${invoiceRef} for ${fmtRand(totalAmount)} (incl. VAT) is now available. Please pay via the Invoices page to avoid service interruption.`;
      await exec(
        `INSERT INTO club_inbox_notifications (club_id, type, title, body, meta)
         VALUES (?, 'invoice', ?, ?, ?)`,
        [
          club_id,
          `Invoice ${invoiceRef} — R${totalAmount.toFixed(2)} outstanding`,
          notifBody,
          JSON.stringify({ invoice_id: invoiceId, invoice_ref: invoiceRef, payment_url: paymentUrl }),
        ]
      );

      logger.info({ club_id, club_name: club.name, invoiceRef, totalAmount },
        "Monthly counter invoice worker: invoice created");

    } catch (err: any) {
      logger.error({ err, club_id }, "Monthly counter invoice worker: failed for club");
    }
  }

  lastInvoicedMonth = monthKey;
  logger.info({ monthKey }, "Monthly counter invoice worker: cycle complete");
}

function fmtRand(n: number): string {
  return `R ${Number(n).toLocaleString("en-ZA", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
}

export function startMonthlyCounterInvoiceWorker(): void {
  logger.info("Monthly counter invoice worker started");

  // Run immediately on startup in case the server was down on the 1st
  runMonthlyInvoiceCycle().catch(err =>
    logger.error({ err }, "Monthly counter invoice worker: startup cycle failed")
  );

  setInterval(() => {
    runMonthlyInvoiceCycle().catch(err =>
      logger.error({ err }, "Monthly counter invoice worker: cycle failed")
    );
  }, POLL_INTERVAL_MS);
}

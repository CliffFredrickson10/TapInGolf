import { query, row, exec } from "../lib/pg";
import { buildPayFastPaymentUrl } from "../lib/payfast";
import { logger } from "../lib/logger";

// Runs hourly; on the 1st of each month bills all live monthly-billed ad campaigns
// for the current month (month 2 onwards — month 1 is covered by the initial payment).
const POLL_INTERVAL_MS = 60 * 60 * 1000; // 1 hour

let lastBilledMonth = ""; // "YYYY-MM"

function nowSAST(): Date {
  return new Date(Date.now() + 2 * 60 * 60 * 1000);
}

function fmtRand(n: number): string {
  return `R ${Number(n).toLocaleString("en-ZA", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
}

async function runMonthlyAdBillingCycle(): Promise<void> {
  const now      = nowSAST();
  const day      = now.getUTCDate();
  const year     = now.getUTCFullYear();
  const month    = now.getUTCMonth() + 1; // 1-12
  const monthKey = `${year}-${String(month).padStart(2, "0")}`;

  if (day !== 1) return;
  if (lastBilledMonth === monthKey) return;

  const billingMonthDate = new Date(Date.UTC(year, month - 1, 1)); // first day of current month
  const billingMonthStr  = billingMonthDate.toISOString().slice(0, 10); // "YYYY-MM-01"
  const monthLabel = billingMonthDate.toLocaleString("en-ZA", { month: "long", year: "numeric" });

  logger.info({ monthKey, billingMonthStr }, "Monthly ad billing worker: running");

  // Find all live ads that are billed monthly and still active this month.
  // Skip if confirmed_start's month === billing month (initial payment already covers that month).
  const liveAds = await query<any>(
    `SELECT ar.id, ar.club_id, ar.headline, ar.confirmed_price, ar.confirmed_start, ar.confirmed_end,
            ar.ad_type,
            c.name AS club_name, c.email AS club_email
     FROM ad_requests ar
     JOIN clubs c ON c.id = ar.club_id
     WHERE ar.status = 'live'
       AND ar.billing_frequency = 'monthly'
       AND ar.confirmed_price IS NOT NULL
       AND ar.confirmed_end >= ?
       AND DATE_TRUNC('month', ar.confirmed_start::DATE) < ?::DATE`,
    [billingMonthStr, billingMonthStr]
  );

  if (liveAds.length === 0) {
    logger.info("Monthly ad billing worker: no ads to bill this month");
    lastBilledMonth = monthKey;
    return;
  }

  logger.info({ count: liveAds.length }, "Monthly ad billing worker: ads to bill");

  const host = process.env["REPLIT_DEV_DOMAIN"]
    ? `https://${process.env["REPLIT_DEV_DOMAIN"]}`
    : "https://tapingolf.co.za";

  for (const ad of liveAds) {
    try {
      const amount = Number(ad.confirmed_price);

      // Insert the billing cycle — UNIQUE (ad_request_id, billing_month) prevents duplicates
      const cycleRows = await query<any>(
        `INSERT INTO ad_billing_cycles
           (ad_request_id, billing_month, amount, status, invoice_sent_at)
         VALUES (?, ?, ?, 'pending', NOW())
         ON CONFLICT (ad_request_id, billing_month) DO NOTHING
         RETURNING id`,
        [ad.id, billingMonthStr, amount]
      );

      if (!cycleRows || cycleRows.length === 0) {
        // Already billed this month for this ad — skip
        logger.info({ ad_request_id: ad.id, billingMonthStr }, "Monthly ad billing: already billed, skipping");
        continue;
      }

      const cycleId: number = cycleRows[0].id;

      // Create a club_invoices record so the invoice appears on the club portal Invoices page
      const dateStr    = new Date().toISOString().slice(0, 10).replace(/-/g, "");
      const invoiceRef = `ADV-${ad.id}-${dateStr}-M`;
      const vatAmt     = Math.round(amount * 15 / 115 * 100) / 100;
      const lineItems  = [{
        headline:      ad.headline,
        ad_type:       ad.ad_type ?? "ad",
        billing_month: billingMonthStr,
        amount,
      }];
      const description = `Monthly Ad Fee: ${ad.headline} — ${monthLabel}`;

      const invRows = await query<any>(
        `INSERT INTO club_invoices
           (club_id, invoice_ref, description, total_rounds, platform_fee_rate, vat_rate,
            vat_amount, total_amount, invoice_type, line_items, ad_billing_cycle_id)
         VALUES (?, ?, ?, 1, ?, 0.15, ?, ?, 'ad_campaign', ?::jsonb, ?)
         RETURNING id`,
        [ad.club_id, invoiceRef, description, amount, vatAmt, amount,
         JSON.stringify(lineItems), cycleId]
      );
      const invoiceId: number | null = invRows?.[0]?.id ?? null;

      // Try to generate a PayFast payment link on the invoice (merchantReference = invoice-<id>)
      let paymentUrl: string | null = null;
      if (invoiceId) {
        try {
          const payer = ad.club_name?.trim() ? ad.club_name.trim().split(/\s+/) : [];
          const payment = buildPayFastPaymentUrl({
            amount,
            merchantReference: `invoice-${invoiceId}`,
            itemName: `TapIn Golf - Invoice ${invoiceRef}`,
            returnUrl: `${host}/club-portal/invoices`,
            cancelUrl: `${host}/club-portal/invoices`,
            notifyUrl: `${host}/api/payfast/notify`,
            payerFirstName: payer[0],
            payerLastName: payer.slice(1).join(" ") || undefined,
            payerEmail: ad.club_email ?? undefined,
          });
          await exec(
            "UPDATE club_invoices SET payfast_payment_id = ?, payfast_payment_url = ? WHERE id = ?",
            [payment.paymentId, payment.url, invoiceId]
          );
          paymentUrl = payment.url;
        } catch (payErr: any) {
          logger.warn({ err: payErr, cycleId, invoiceId }, "Monthly ad billing: PayFast link failed");
        }
      }

      // Send club inbox notification
      const endDate = ad.confirmed_end
        ? new Date(ad.confirmed_end).toLocaleDateString("en-ZA", { day: "numeric", month: "long", year: "numeric" })
        : null;
      const endLine  = endDate ? ` Your campaign runs until ${endDate}.` : "";
      const invoiceStr = invoiceId
        ? ` An invoice has been added to your Invoices page — use the Pay Now button there to complete payment.`
        : (paymentUrl ? ` Pay now: ${paymentUrl}` : " TapIn staff will be in touch with a payment link.");
      await exec(
        `INSERT INTO club_inbox_notifications (club_id, type, title, body, meta)
         VALUES (?, 'ad_update', ?, ?, ?)`,
        [
          ad.club_id,
          `📅 Monthly Ad Invoice — ${monthLabel}`,
          `Your monthly ad fee of ${fmtRand(amount)} for "${ad.headline}" is due for ${monthLabel}.${invoiceStr}${endLine}`,
          JSON.stringify({ ad_request_id: ad.id, billing_cycle_id: cycleId, invoice_id: invoiceId, payment_url: paymentUrl }),
        ]
      );

      logger.info({ ad_request_id: ad.id, club_id: ad.club_id, cycleId, invoiceId, amount, billingMonthStr },
        "Monthly ad billing worker: invoice created");

    } catch (err: any) {
      logger.error({ err, ad_request_id: ad.id }, "Monthly ad billing worker: failed for ad");
    }
  }

  lastBilledMonth = monthKey;
  logger.info({ monthKey }, "Monthly ad billing worker: cycle complete");

  // ── Quarterly billing ─────────────────────────────────────────────────────
  // Only runs on the 1st of Jan (1), Apr (4), Jul (7), Oct (10).
  const QUARTER_START_MONTHS = [1, 4, 7, 10];
  if (!QUARTER_START_MONTHS.includes(month)) return;

  const quarterBillingStr = billingMonthStr; // first day of this quarter
  const quarterLabel = `Q${Math.ceil(month / 3)} ${year}`;
  logger.info({ monthKey, quarterLabel }, "Quarterly ad billing worker: running");

  const quarterlyAds = await query<any>(
    `SELECT ar.id, ar.club_id, ar.headline, ar.confirmed_price, ar.confirmed_start, ar.confirmed_end,
            ar.ad_type,
            c.name AS club_name, c.email AS club_email
     FROM ad_requests ar
     JOIN clubs c ON c.id = ar.club_id
     WHERE ar.status = 'live'
       AND ar.billing_frequency = 'quarterly'
       AND ar.confirmed_price IS NOT NULL
       AND ar.confirmed_end >= ?
       AND DATE_TRUNC('month', ar.confirmed_start::DATE) < ?::DATE`,
    [quarterBillingStr, quarterBillingStr]
  );

  if (quarterlyAds.length === 0) {
    logger.info("Quarterly ad billing worker: no ads to bill this quarter");
    return;
  }

  logger.info({ count: quarterlyAds.length }, "Quarterly ad billing worker: ads to bill");

  for (const ad of quarterlyAds) {
    try {
      const amount = Number(ad.confirmed_price);

      const cycleRows = await query<any>(
        `INSERT INTO ad_billing_cycles
           (ad_request_id, billing_month, amount, status, invoice_sent_at)
         VALUES (?, ?, ?, 'pending', NOW())
         ON CONFLICT (ad_request_id, billing_month) DO NOTHING
         RETURNING id`,
        [ad.id, quarterBillingStr, amount]
      );

      if (!cycleRows || cycleRows.length === 0) {
        logger.info({ ad_request_id: ad.id, quarterBillingStr }, "Quarterly ad billing: already billed, skipping");
        continue;
      }

      const cycleId: number = cycleRows[0].id;
      const dateStr    = new Date().toISOString().slice(0, 10).replace(/-/g, "");
      const invoiceRef = `ADV-${ad.id}-${dateStr}-Q`;
      const vatAmt     = Math.round(amount * 15 / 115 * 100) / 100;
      const lineItems  = [{
        headline:        ad.headline,
        ad_type:         ad.ad_type ?? "ad",
        billing_quarter: quarterLabel,
        amount,
      }];
      const description = `Quarterly Ad Fee: ${ad.headline} — ${quarterLabel}`;

      const invRows = await query<any>(
        `INSERT INTO club_invoices
           (club_id, invoice_ref, description, total_rounds, platform_fee_rate, vat_rate,
            vat_amount, total_amount, invoice_type, line_items, ad_billing_cycle_id)
         VALUES (?, ?, ?, 1, ?, 0.15, ?, ?, 'ad_campaign', ?::jsonb, ?)
         RETURNING id`,
        [ad.club_id, invoiceRef, description, amount, vatAmt, amount,
         JSON.stringify(lineItems), cycleId]
      );
      const invoiceId: number | null = invRows?.[0]?.id ?? null;

      let paymentUrl: string | null = null;
      if (invoiceId) {
        try {
          const payer = ad.club_name?.trim() ? ad.club_name.trim().split(/\s+/) : [];
          const payment = buildPayFastPaymentUrl({
            amount,
            merchantReference: `invoice-${invoiceId}`,
            itemName: `TapIn Golf - Invoice ${invoiceRef}`,
            returnUrl: `${host}/club-portal/invoices`,
            cancelUrl: `${host}/club-portal/invoices`,
            notifyUrl: `${host}/api/payfast/notify`,
            payerFirstName: payer[0],
            payerLastName: payer.slice(1).join(" ") || undefined,
            payerEmail: ad.club_email ?? undefined,
          });
          await exec(
            "UPDATE club_invoices SET payfast_payment_id = ?, payfast_payment_url = ? WHERE id = ?",
            [payment.paymentId, payment.url, invoiceId]
          );
          paymentUrl = payment.url;
        } catch (payErr: any) {
          logger.warn({ err: payErr, cycleId, invoiceId }, "Quarterly ad billing: PayFast link failed");
        }
      }

      const invoiceStr = invoiceId
        ? ` An invoice has been added to your Invoices page — use the Pay Now button there to complete payment.`
        : (paymentUrl ? ` Pay now: ${paymentUrl}` : " TapIn staff will be in touch with a payment link.");

      await exec(
        `INSERT INTO club_inbox_notifications (club_id, type, title, body, meta)
         VALUES (?, 'ad_update', ?, ?, ?)`,
        [
          ad.club_id,
          `📅 Quarterly Ad Invoice — ${quarterLabel}`,
          `Your quarterly ad fee of ${fmtRand(amount)} for "${ad.headline}" is due for ${quarterLabel}.${invoiceStr}`,
          JSON.stringify({ ad_request_id: ad.id, billing_cycle_id: cycleId, invoice_id: invoiceId, payment_url: paymentUrl }),
        ]
      );

      logger.info({ ad_request_id: ad.id, club_id: ad.club_id, cycleId, invoiceId, amount, quarterBillingStr },
        "Quarterly ad billing worker: invoice created");

    } catch (err: any) {
      logger.error({ err, ad_request_id: ad.id }, "Quarterly ad billing worker: failed for ad");
    }
  }
}

export function startMonthlyAdBillingWorker(): void {
  logger.info("Monthly ad billing worker started");

  runMonthlyAdBillingCycle().catch(err =>
    logger.error({ err }, "Monthly ad billing worker: startup cycle failed")
  );

  setInterval(() => {
    runMonthlyAdBillingCycle().catch(err =>
      logger.error({ err }, "Monthly ad billing worker: cycle failed")
    );
  }, POLL_INTERVAL_MS);
}

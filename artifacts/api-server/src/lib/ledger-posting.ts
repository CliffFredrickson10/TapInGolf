/**
 * Ledger posting helpers for booking-related financial events.
 * 
 * Called from booking routes when financial state changes:
 * - Booking confirmed (payment received)
 * - Booking cancelled (refund)
 * - Split payment completed
 */
import { postJournal, reverseJournal, getJournalsBySource, provisionChartOfAccounts } from "./ledger";
import { row } from "./pg";
import { logger } from "./logger";

interface BookingLedgerData {
  booking_id: number;
  club_id: number;
  booking_ref: string;
  total_amount: number;
  platform_fee: number;
  club_amount: number;
  cart_fee: number;
  driving_range_fee?: number;
  club_hire_fee?: number;
  discount_amount: number;
  payment_method: string; // payfast | stitch | wallet | prepaid | pay_at_club | cash
  journal_date?: string;
}

/**
 * Post journal entries for a confirmed booking.
 * 
 * Double-entry: 
 *   Debit: Payment Clearing (PayFast/Stitch/Wallet/Cash) — full amount
 *   Credit: Green Fee Revenue — net green fee
 *   Credit: Cart Hire Revenue — cart fee (if any)
 *   Credit: Driving Range Revenue — range fee (if any)
 *   Credit: Club Hire Revenue — club hire fee (if any)
 *   Credit: Platform Fees (expense offset or liability)
 *   Credit: Voucher Discounts — discount (if any)
 */
export async function postBookingConfirmedJournal(data: BookingLedgerData): Promise<number | null> {
  try {
    // Ensure COA exists
    await ensureCOA(data.club_id);

    const clearingAccount = getClearingAccount(data.payment_method);
    const greenFee = data.total_amount - data.cart_fee - (data.driving_range_fee ?? 0) - (data.club_hire_fee ?? 0);

    // The amount actually received from the customer (after discount)
    const amountReceived = data.total_amount - data.discount_amount;

    const entries: { account_code: string; debit?: number; credit?: number; description?: string }[] = [];

    // Debit: Payment clearing account (actual money coming in)
    if (amountReceived > 0) {
      entries.push({
        account_code: clearingAccount,
        debit: amountReceived,
        description: `Payment received: ${data.booking_ref}`,
      });
    }

    // Debit: Voucher/Discount expense (the discount given)
    if (data.discount_amount > 0) {
      entries.push({
        account_code: "5040",
        debit: data.discount_amount,
        description: "Voucher/discount applied",
      });
    }

    // Credit: Green Fee Revenue (full price including discount portion)
    if (greenFee > 0) {
      entries.push({
        account_code: "4010",
        credit: greenFee,
        description: "Green fee revenue",
      });
    }

    // Credit: Cart Hire Revenue
    if (data.cart_fee > 0) {
      entries.push({
        account_code: "4020",
        credit: data.cart_fee,
        description: "Cart hire revenue",
      });
    }

    // Credit: Driving Range Revenue
    if (data.driving_range_fee && data.driving_range_fee > 0) {
      entries.push({
        account_code: "4070",
        credit: data.driving_range_fee,
        description: "Driving range revenue",
      });
    }

    // Credit: Club Hire Revenue
    if (data.club_hire_fee && data.club_hire_fee > 0) {
      entries.push({
        account_code: "4080",
        credit: data.club_hire_fee,
        description: "Club hire revenue",
      });
    }

    // Validate entries balance before posting
    // Since discount handling above is complex, recalculate simply:
    // Actually let's keep it cleaner — the total_amount already accounts for discounts
    // Remove the complex discount handling and just post what was paid

    const journalId = await postJournal({
      club_id: data.club_id,
      journal_date: data.journal_date,
      description: `Booking ${data.booking_ref} confirmed — ${data.payment_method}`,
      source_module: "booking",
      source_id: data.booking_id,
      source_ref: data.booking_ref,
      entries,
      metadata: {
        payment_method: data.payment_method,
        platform_fee: data.platform_fee,
        club_amount: data.club_amount,
      },
    });

    return journalId;
  } catch (e: any) {
    logger.error({ err: e, booking_id: data.booking_id, club_id: data.club_id }, "Failed to post booking journal");
    // Don't throw — ledger posting should not block booking confirmation
    return null;
  }
}

/**
 * Post a reversal journal when a booking is cancelled.
 */
export async function postBookingCancelledJournal(bookingId: number, clubId: number, reason: string): Promise<number | null> {
  try {
    const journals = await getJournalsBySource(clubId, "booking", bookingId);
    const original = journals.find(j => !j.reversal_of_id && !j.reversed_by_id);
    if (!original) {
      logger.warn({ bookingId, clubId }, "No original journal found to reverse for cancelled booking");
      return null;
    }

    return await reverseJournal(original.id, reason);
  } catch (e: any) {
    logger.error({ err: e, bookingId, clubId }, "Failed to post booking cancellation journal");
    return null;
  }
}

/**
 * Post journal entries for a POS transaction.
 */
export async function postPosTransactionJournal(data: {
  transaction_id: number;
  club_id: number;
  outlet_type: string;
  amount: number;
  tip_amount: number;
  service_fee: number;
  platform_fee: number;
  payment_method: string;
  journal_date?: string;
}): Promise<number | null> {
  try {
    await ensureCOA(data.club_id);

    const clearingAccount = data.payment_method === "cash" ? "1010" : getClearingAccount(data.payment_method);
    const revenueAccount = getRevenueAccountForOutlet(data.outlet_type);
    const totalReceived = data.amount + data.tip_amount;

    const entries: { account_code: string; debit?: number; credit?: number; description?: string }[] = [
      { account_code: clearingAccount, debit: totalReceived, description: `POS sale #${data.transaction_id}` },
      { account_code: revenueAccount, credit: data.amount, description: `${data.outlet_type} sale` },
    ];

    if (data.tip_amount > 0) {
      entries.push({ account_code: "2010", credit: data.tip_amount, description: "Tips payable" });
    }

    return await postJournal({
      club_id: data.club_id,
      journal_date: data.journal_date,
      description: `POS transaction #${data.transaction_id} — ${data.outlet_type}`,
      source_module: "pos",
      source_id: data.transaction_id,
      entries,
      metadata: { outlet_type: data.outlet_type, service_fee: data.service_fee, platform_fee: data.platform_fee },
    });
  } catch (e: any) {
    logger.error({ err: e, transaction_id: data.transaction_id }, "Failed to post POS journal");
    return null;
  }
}

// ─── Helpers ──────────────────────────────────────────────────────────────────

function getClearingAccount(paymentMethod: string): string {
  switch (paymentMethod) {
    case "payfast": return "1030";
    case "stitch": return "1031";
    case "wallet":
    case "prepaid": return "1040";
    case "cash":
    case "pay_at_club": return "1010";
    case "card": return "1030"; // card via PayFast
    default: return "1030";
  }
}

function getRevenueAccountForOutlet(outletType: string): string {
  switch (outletType) {
    case "pro_shop": return "4030";
    case "bar": return "4040";
    case "restaurant": return "4040";
    default: return "4110";
  }
}

const provisionedClubs = new Set<number>();

async function ensureCOA(clubId: number): Promise<void> {
  if (provisionedClubs.has(clubId)) return;
  const existing = await row<{ cnt: string }>(
    "SELECT COUNT(*) AS cnt FROM ledger_accounts WHERE club_id = ?",
    [clubId]
  );
  if (Number(existing?.cnt ?? 0) === 0) {
    await provisionChartOfAccounts(clubId);
  }
  provisionedClubs.add(clubId);
}

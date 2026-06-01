import { Router, type IRouter } from "express";
import { row } from "../lib/pg";
import { getUser } from "../lib/auth";

const router: IRouter = Router();

router.post("/vouchers/validate", async (req, res): Promise<void> => {
  const user = await getUser(req);
  if (!user) { res.status(401).json({ message: "Unauthorized" }); return; }

  const { code, amount, club_id } = req.body ?? {};
  if (!code || amount === undefined) {
    res.status(400).json({ valid: false, message: "Code and amount are required" });
    return;
  }

  const codeUpper    = String(code).toUpperCase().trim();
  const orderAmount  = parseFloat(amount);

  // ── Cancellation vouchers (CV- prefix) ───────────────────────────────────
  if (codeUpper.startsWith("CV-")) {
    const cv = await row<any>(
      `SELECT cv.*, c.name AS club_name
       FROM cancellation_vouchers cv
       JOIN clubs c ON c.id = cv.club_id
       WHERE cv.code = ? AND cv.user_id = ?`,
      [codeUpper, user.id]
    );
    if (!cv) {
      res.status(404).json({ valid: false, message: "Cancellation voucher not found or not assigned to your account" });
      return;
    }
    // Fully redeemed when value_remaining = 0 (or redeemed_at set as fallback)
    const remaining = cv.value_remaining != null ? parseFloat(cv.value_remaining) : (cv.value_rands ? parseFloat(cv.value_rands) : 0);
    if (cv.redeemed_at || remaining <= 0) {
      res.status(400).json({ valid: false, message: "This voucher has already been fully redeemed" });
      return;
    }
    if (cv.expires_at && new Date(cv.expires_at) < new Date()) {
      res.status(400).json({ valid: false, message: "This voucher has expired" });
      return;
    }
    if (club_id !== undefined && cv.club_id !== parseInt(club_id)) {
      res.status(400).json({ valid: false, message: `This voucher is only valid at ${cv.club_name}` });
      return;
    }
    const discountAmount = Math.min(remaining, orderAmount);
    const finalAmount    = Math.max(0, orderAmount - discountAmount);
    res.json({
      valid:                   true,
      code:                    cv.code,
      discount_type:           "fixed",
      discount_value:          remaining,
      discount_amount:         discountAmount,
      final_amount:            finalAmount,
      value_remaining:         remaining,
      is_cancellation_voucher: true,
      club_id:                 cv.club_id,
      club_name:               cv.club_name,
    });
    return;
  }

  // ── Standard discount vouchers ────────────────────────────────────────────
  const voucher = await row<any>(
    "SELECT * FROM vouchers WHERE code = ? AND active = 1",
    [codeUpper]
  );

  if (!voucher) {
    res.status(404).json({ valid: false, message: "Voucher code not found or inactive" });
    return;
  }

  if (voucher.expires_at && new Date(voucher.expires_at) < new Date()) {
    res.status(400).json({ valid: false, message: "This voucher has expired" });
    return;
  }

  if (voucher.max_uses !== null && voucher.uses_count >= voucher.max_uses) {
    res.status(400).json({ valid: false, message: "This voucher has reached its usage limit" });
    return;
  }

  const minAmount   = parseFloat(voucher.min_amount ?? "0");
  if (minAmount > 0 && orderAmount < minAmount) {
    res.status(400).json({
      valid: false,
      message: `Minimum order of R${minAmount.toFixed(2)} required for this voucher`,
    });
    return;
  }

  if (voucher.club_id !== null && club_id !== undefined && parseInt(voucher.club_id) !== parseInt(club_id)) {
    res.status(400).json({ valid: false, message: "This voucher is not valid for this club" });
    return;
  }

  const discountValue = parseFloat(voucher.discount_value);
  let discountAmount: number;
  if (voucher.discount_type === "percentage") {
    discountAmount = Math.round(orderAmount * discountValue / 100 * 100) / 100;
  } else {
    discountAmount = Math.min(discountValue, orderAmount);
  }
  const finalAmount = Math.max(0, orderAmount - discountAmount);

  res.json({
    valid:          true,
    code:           voucher.code,
    discount_type:  voucher.discount_type,
    discount_value: discountValue,
    discount_amount: discountAmount,
    final_amount:   finalAmount,
  });
});

export default router;

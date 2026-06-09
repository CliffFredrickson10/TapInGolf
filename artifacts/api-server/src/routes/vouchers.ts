import { Router, type IRouter } from "express";
import { query, row } from "../lib/pg";
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

  // User-assigned vouchers can only be used by the assigned user
  if (voucher.user_id != null && voucher.user_id !== user.id) {
    res.status(403).json({ valid: false, message: "This voucher is assigned to a different account" });
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

// ── List available vouchers for a user + club ─────────────────────────────────
router.get("/vouchers/available", async (req, res): Promise<void> => {
  const user = await getUser(req);
  if (!user) { res.status(401).json({ message: "Unauthorized" }); return; }

  const club_id = req.query.club_id ? parseInt(req.query.club_id as string) : null;
  const amount  = req.query.amount  ? parseFloat(req.query.amount  as string) : 0;

  const results: any[] = [];

  // ── Cancellation vouchers assigned to this user ───────────────────────────
  const cvRows = await query<any>(
    `SELECT cv.*, c.name AS club_name
     FROM cancellation_vouchers cv
     LEFT JOIN clubs c ON c.id = cv.club_id
     WHERE cv.user_id = ?
       AND (cv.redeemed_at IS NULL)
       AND (cv.value_remaining IS NULL OR cv.value_remaining > 0)
       AND (cv.expires_at IS NULL OR cv.expires_at > NOW())
       ${club_id != null ? "AND (cv.club_id = ? OR cv.club_id IS NULL)" : ""}`,
    club_id != null ? [user.id, club_id] : [user.id]
  );
  for (const cv of cvRows) {
    const remaining = cv.value_remaining != null
      ? parseFloat(cv.value_remaining)
      : (cv.value_rands ? parseFloat(cv.value_rands) : 0);
    if (remaining <= 0) continue;
    const discountAmount = Math.min(remaining, amount);
    results.push({
      code:                    cv.code,
      label:                   "Cancellation Voucher",
      sub:                     `R${remaining.toFixed(2)} credit${cv.club_name ? ` · ${cv.club_name}` : ""}`,
      discount_type:           "fixed" as const,
      discount_value:          remaining,
      discount_amount:         discountAmount,
      final_amount:            Math.max(0, amount - discountAmount),
      is_cancellation_voucher: true,
      club_name:               cv.club_name ?? null,
      expires_at:              cv.expires_at ?? null,
    });
  }

  // ── Discount vouchers personally assigned to this user ───────────────────
  const stdRows = await query<any>(
    `SELECT * FROM vouchers
     WHERE active = 1
       AND user_id = ?
       AND (expires_at IS NULL OR expires_at > NOW())
       AND (max_uses IS NULL OR uses_count < max_uses)
       AND (min_amount IS NULL OR CAST(min_amount AS DECIMAL(10,2)) = 0 OR ? >= CAST(min_amount AS DECIMAL(10,2)))
       ${club_id != null ? "AND (club_id = ? OR club_id IS NULL)" : ""}`,
    club_id != null ? [user.id, amount, club_id] : [user.id, amount]
  );
  for (const v of stdRows) {
    const discountValue = parseFloat(v.discount_value);
    let discountAmount: number;
    if (v.discount_type === "percentage") {
      discountAmount = Math.round(amount * discountValue / 100 * 100) / 100;
    } else {
      discountAmount = Math.min(discountValue, amount);
    }
    const usesRemaining = v.max_uses != null ? (Number(v.max_uses) - Number(v.uses_count)) : null;
    const remainingTag  = usesRemaining != null
      ? ` · ${usesRemaining} use${usesRemaining === 1 ? "" : "s"} remaining`
      : "";
    results.push({
      code:                    v.code,
      label:                   v.discount_type === "percentage"
                                 ? `${discountValue}% off`
                                 : `R${discountValue.toFixed(2)} off`,
      sub:                     `Save R${discountAmount.toFixed(2)} on this booking${remainingTag}`,
      discount_type:           v.discount_type as "fixed" | "percentage",
      discount_value:          discountValue,
      discount_amount:         discountAmount,
      final_amount:            Math.max(0, amount - discountAmount),
      is_cancellation_voucher: false,
      expires_at:              v.expires_at ?? null,
      uses_remaining:          usesRemaining,
    });
  }

  res.json({ vouchers: results });
});

// ── Discount vouchers assigned to the current user ───────────────────────────
router.get("/vouchers/my-discount", async (req, res): Promise<void> => {
  const user = await getUser(req);
  if (!user) { res.status(401).json({ message: "Unauthorized" }); return; }

  const vouchers = await query<any>(
    `SELECT v.id, v.code, v.discount_type, v.discount_value,
            v.min_amount, v.max_uses, v.uses_count,
            v.active, v.expires_at, v.created_at,
            c.name AS club_name
     FROM vouchers v
     LEFT JOIN clubs c ON c.id = v.club_id
     WHERE v.user_id = ?
     ORDER BY v.created_at DESC`,
    [user.id]
  );
  res.json(vouchers);
});

export default router;

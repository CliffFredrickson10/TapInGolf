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

  const voucher = await row<any>(
    "SELECT * FROM vouchers WHERE code = ? AND active = 1",
    [String(code).toUpperCase().trim()]
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

  const orderAmount = parseFloat(amount);
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

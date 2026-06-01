---
name: VAT-inclusive pricing display
description: 15% VAT is shown as a component of the existing price — totals do not change
---

# VAT-inclusive pricing

All prices on TapIn Golf are VAT-inclusive (15% VAT). The total charged to the player
does not change — VAT is extracted from the existing price for display purposes only.

**Why:** SARS requires VAT-registered entities to show the VAT component on receipts/invoices.
User requirement: "total invoice amount must not increase by 15%."

**Formula:**
- `vatAmount = Math.round(total * 15 / 115 * 100) / 100`
- `exclVat   = total - vatAmount`

**How to apply:** Any new payment surface (new booking flow, wallet top-up receipts, etc.)
that shows a rand amount should also show the VAT breakdown using the formula above.
Avoid adding VAT on top of prices — it is always extracted from the existing total.

## Configurable rate (added later)

`vat_pct` is stored in `platform_settings` (seeded at 15, ON CONFLICT DO NOTHING).

- **Public read:** `GET /api/settings` → `{ vat_pct }` (no auth required)
- **Write:** `PUT /admin/revenue/vat` → `{ vat_pct }` (platform admin only, 0–100 range)
- **Summary:** `GET /admin/revenue/summary` also returns `vat_pct`
- **Invoice email:** `sendInvoiceEmail` in otp.ts fetches `vat_pct` from DB at send time
- **Formula:** `vatAmount = total × vatPct / (100 + vatPct)` — always extract from inclusive price
- **Mobile:** each screen that shows VAT fetches `/api/settings` on mount; defaults to 15

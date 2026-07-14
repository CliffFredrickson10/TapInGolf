import { afterEach, describe, expect, it } from "vitest";
import {
  PLATFORM_FEE_PER_PLAYER,
  buildPayFastPaymentUrl,
  payfastConfigured,
  validatePayFastIPN,
} from "./payfast.js";

const originalEnv = {
  PAYFAST_MERCHANT_ID: process.env["PAYFAST_MERCHANT_ID"],
  PAYFAST_MERCHANT_KEY: process.env["PAYFAST_MERCHANT_KEY"],
  PAYFAST_PASSPHRASE: process.env["PAYFAST_PASSPHRASE"],
  PAYFAST_URL: process.env["PAYFAST_URL"],
};

afterEach(() => {
  for (const [key, value] of Object.entries(originalEnv)) {
    if (value === undefined) delete process.env[key];
    else process.env[key] = value;
  }
});

describe("buildPayFastPaymentUrl", () => {
  it("builds a signed checkout URL with the default credentials", () => {
    const result = buildPayFastPaymentUrl({
      amount: 250,
      merchantReference: "booking-123",
      itemName: "Booking",
      returnUrl: "https://tapin.test/pay/success",
      cancelUrl: "https://tapin.test/pay/cancel",
      notifyUrl: "https://api.tapin.test/payfast/ipn",
      payerFirstName: "Cliff",
      payerLastName: "Fredrickson",
      payerEmail: "cliff@example.com",
    });

    const url = new URL(result.url);
    expect(result.paymentId).toBe("booking-123");
    expect(url.origin + url.pathname).toBe("https://www.payfast.co.za/eng/process");
    expect(url.searchParams.get("merchant_id")).toBe("36155079");
    expect(url.searchParams.get("merchant_key")).toBe("tbuwwtf6pisnl");
    expect(url.searchParams.get("amount")).toBe("250.00");
    expect(url.searchParams.get("signature")).toMatch(/^[a-f0-9]{32}$/);
  });

  it("adds an amount-based split that leaves TapIn with R11.50 per player", () => {
    const result = buildPayFastPaymentUrl({
      amount: 250,
      merchantReference: "booking-456",
      itemName: "Fourball",
      players: 4,
      clubMerchantId: "club-merchant-42",
      returnUrl: "https://tapin.test/pay/success",
      cancelUrl: "https://tapin.test/pay/cancel",
      notifyUrl: "https://api.tapin.test/payfast/ipn",
    });

    const url = new URL(result.url);
    const totalCents = 25_000;
    const tapInFeeCents = Math.round(PLATFORM_FEE_PER_PLAYER * 4 * 100);
    expect(url.searchParams.get("setup")).toBe("1");
    expect(url.searchParams.get("split_payment[merchant_id]")).toBe("club-merchant-42");
    expect(url.searchParams.get("split_payment[amount]")).toBe(String(totalCents - tapInFeeCents));
  });
});

describe("validatePayFastIPN", () => {
  it("accepts a correctly signed payload", async () => {
    const payment = buildPayFastPaymentUrl({
      amount: 99.5,
      merchantReference: "wallet-123",
      itemName: "Wallet top-up",
      returnUrl: "https://tapin.test/pay/success",
      cancelUrl: "https://tapin.test/pay/cancel",
      notifyUrl: "https://api.tapin.test/payfast/ipn",
    });
    const payload = Object.fromEntries(new URL(payment.url).searchParams.entries());
    expect(await validatePayFastIPN(payload, "127.0.0.1")).toBe(true);
  });

  it("rejects a tampered payload", async () => {
    const payment = buildPayFastPaymentUrl({
      amount: 99.5,
      merchantReference: "wallet-456",
      itemName: "Wallet top-up",
      returnUrl: "https://tapin.test/pay/success",
      cancelUrl: "https://tapin.test/pay/cancel",
      notifyUrl: "https://api.tapin.test/payfast/ipn",
    });
    const payload = Object.fromEntries(new URL(payment.url).searchParams.entries());
    payload.amount = "100.00";
    expect(await validatePayFastIPN(payload, "127.0.0.1")).toBe(false);
  });
});

describe("payfastConfigured", () => {
  it("is truthy with the built-in defaults and respects overrides", () => {
    expect(payfastConfigured()).toBe(true);
    process.env["PAYFAST_URL"] = "https://sandbox.payfast.test/process";
    expect(payfastConfigured()).toBe(true);
  });
});

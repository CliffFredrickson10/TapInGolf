import { createHash, timingSafeEqual } from "node:crypto";

const isSandbox = process.env.PAYFAST_SANDBOX === "1";

const DEFAULT_PAYFAST_MERCHANT_ID = isSandbox ? "10000100" : "36155079";
const DEFAULT_PAYFAST_MERCHANT_KEY = isSandbox ? "46f0cd694581a" : "tbuwwtf6pisnl";
const DEFAULT_PAYFAST_PASSPHRASE = isSandbox ? "jt7NOE43FZPn" : "Pretoria2026";
const DEFAULT_PAYFAST_URL = isSandbox
  ? "https://sandbox.payfast.co.za/eng/process"
  : "https://www.payfast.co.za/eng/process";

export const PLATFORM_FEE_PER_PLAYER = 11.5;

export interface PayFastPaymentParams {
  /** Total amount in Rands (e.g. 250.00) */
  amount: number;
  /** Payment reference (e.g. booking ID, "wallet-123", "resale-456") */
  merchantReference: string;
  /** Item name for PayFast checkout */
  itemName: string;
  /** Number of players (for split calculation: R11.50 × players to TapIn) */
  players?: number;
  /** Club's PayFast merchant ID for split payment (omit for wallet top-ups etc with no split) */
  clubMerchantId?: string;
  /** Return URL after successful payment */
  returnUrl: string;
  /** Cancel URL if user cancels */
  cancelUrl: string;
  /** IPN notify URL for server-to-server confirmation */
  notifyUrl: string;
  /** Optional payer info */
  payerFirstName?: string;
  payerLastName?: string;
  payerEmail?: string;
}

export interface PayFastPaymentResult {
  /** The full URL to redirect the user to (PayFast checkout page) */
  url: string;
  /** The m_payment_id used to identify this payment */
  paymentId: string;
  /** The payload fields sent to PayFast (for logging) */
  payload: Record<string, string>;
}

interface PayFastConfig {
  merchantId: string;
  merchantKey: string;
  passphrase: string;
  url: string;
}

type PayFastField = readonly [key: string, value: string];

function getPayFastConfig(): PayFastConfig {
  return {
    merchantId: process.env["PAYFAST_MERCHANT_ID"]?.trim() || DEFAULT_PAYFAST_MERCHANT_ID,
    merchantKey: process.env["PAYFAST_MERCHANT_KEY"]?.trim() || DEFAULT_PAYFAST_MERCHANT_KEY,
    passphrase: process.env["PAYFAST_PASSPHRASE"]?.trim() || DEFAULT_PAYFAST_PASSPHRASE,
    url: process.env["PAYFAST_URL"]?.trim() || DEFAULT_PAYFAST_URL,
  };
}

function encodePayFastValue(value: string): string {
  return encodeURIComponent(value).replace(/%20/g, "+");
}

function createSignature(fields: readonly PayFastField[], passphrase: string): string {
  const payload = fields
    .filter(([, value]) => value !== "")
    .map(([key, value]) => `${key}=${encodePayFastValue(value)}`)
    .join("&");
  const seed = passphrase
    ? `${payload}&passphrase=${encodePayFastValue(passphrase)}`
    : payload;
  return createHash("md5").update(seed).digest("hex");
}

function centsToRands(cents: number): string {
  return (cents / 100).toFixed(2);
}

function randToCents(amount: number): number {
  if (!Number.isFinite(amount)) throw new Error("PayFast amount must be a finite number");
  return Math.round(amount * 100);
}

function normalizeText(value: string, fieldName: string): string {
  const normalized = value.trim();
  if (!normalized) throw new Error(`PayFast ${fieldName} is required`);
  return normalized;
}

function computeSplitFields(params: PayFastPaymentParams, totalAmountCents: number): PayFastField[] {
  if (!params.clubMerchantId) return [];

  const clubMerchantId = params.clubMerchantId.trim();
  if (!clubMerchantId) return [];
  const players = params.players;
  if (!Number.isInteger(players) || (players ?? 0) <= 0) {
    throw new Error("PayFast split payments require a positive integer players value");
  }

  const playerCount = players as number;
  const tapInFeeCents = randToCents(PLATFORM_FEE_PER_PLAYER * playerCount);
  const clubAmountCents = totalAmountCents - tapInFeeCents;
  if (clubAmountCents <= 0) {
    throw new Error("PayFast split amount must leave a positive amount for the club");
  }

  return [
    ["setup", "1"],
    ["split_payment[merchant_id]", clubMerchantId],
    ["split_payment[amount]", centsToRands(clubAmountCents)],
  ];
}

function buildPaymentFields(params: PayFastPaymentParams, config: PayFastConfig): PayFastField[] {
  const amountCents = randToCents(params.amount);
  if (amountCents <= 0) throw new Error("PayFast amount must be greater than zero");

  const paymentId = normalizeText(params.merchantReference, "merchantReference");
  const fields: PayFastField[] = [
    ["merchant_id", config.merchantId],
    ["merchant_key", config.merchantKey],
    ["return_url", normalizeText(params.returnUrl, "returnUrl")],
    ["cancel_url", normalizeText(params.cancelUrl, "cancelUrl")],
    ["notify_url", normalizeText(params.notifyUrl, "notifyUrl")],
    ["m_payment_id", paymentId],
    ["amount", centsToRands(amountCents)],
    ["item_name", normalizeText(params.itemName, "itemName")],
  ];

  if (params.payerFirstName?.trim()) fields.push(["name_first", params.payerFirstName.trim()]);
  if (params.payerLastName?.trim()) fields.push(["name_last", params.payerLastName.trim()]);
  if (params.payerEmail?.trim()) fields.push(["email_address", params.payerEmail.trim()]);

  fields.push(...computeSplitFields(params, amountCents));
  return fields;
}

function buildSignedUrl(fields: readonly PayFastField[], config: PayFastConfig): string {
  const signature = createSignature(fields, config.passphrase);
  const query = [...fields, ["signature", signature] satisfies PayFastField]
    .map(([key, value]) => `${key}=${encodePayFastValue(value)}`)
    .join("&");
  return `${config.url}?${query}`;
}

/** Build a PayFast redirect URL with optional split payment */
export function buildPayFastPaymentUrl(params: PayFastPaymentParams): PayFastPaymentResult {
  const config = getPayFastConfig();
  const fields = buildPaymentFields(params, config);
  const payload: Record<string, string> = {};
  for (const [key, value] of fields) {
    if (key !== "merchant_key") payload[key] = value;
  }
  return {
    url: buildSignedUrl(fields, config),
    paymentId: normalizeText(params.merchantReference, "merchantReference"),
    payload,
  };
}

function fieldsFromIpnBody(body: Record<string, string>): PayFastField[] {
  return Object.entries(body)
    .filter(([key, value]) => key !== "signature" && value !== undefined && value !== null)
    .map(([key, value]) => [key, String(value)] as const);
}

function safeEqualHex(left: string, right: string): boolean {
  const leftBuffer = Buffer.from(left, "hex");
  const rightBuffer = Buffer.from(right, "hex");
  if (leftBuffer.length === 0 || rightBuffer.length === 0 || leftBuffer.length !== rightBuffer.length) {
    return false;
  }
  return timingSafeEqual(leftBuffer, rightBuffer);
}

/**
 * Validate a PayFast IPN request by checking its signature.
 *
 * Callers should still verify the payment amount and merchant reference against
 * their stored payment record after this returns true.
 */
export async function validatePayFastIPN(body: Record<string, string>, sourceIp: string): Promise<boolean> {
  void sourceIp;

  const signature = body["signature"]?.trim().toLowerCase();
  if (!signature) return false;

  const config = getPayFastConfig();
  const expectedSignature = createSignature(fieldsFromIpnBody(body), config.passphrase).toLowerCase();
  return safeEqualHex(signature, expectedSignature);
}

/** Check if PayFast is configured */
export function payfastConfigured(): boolean {
  const config = getPayFastConfig();
  return !!(config.merchantId && config.merchantKey && config.passphrase && config.url);
}

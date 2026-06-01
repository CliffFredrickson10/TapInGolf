/**
 * Stitch Express API client
 * Docs: https://express.stitch.money/api-docs
 *
 * Required env vars:
 *   STITCH_CLIENT_ID       — Express client ID (test creds are prefixed "test-")
 *   STITCH_CLIENT_SECRET   — Express client secret
 *
 * Optional:
 *   STITCH_WEBHOOK_SECRET  — Svix signing secret returned when registering the
 *                            webhook endpoint; when present, inbound webhooks are
 *                            signature-verified.
 *
 * NOTE: The beneficiary bank account is configured in the Stitch Express
 * dashboard, NOT per request — so STITCH_BENEFICIARY_* are no longer used.
 * Amounts in the Express API are in South African cents (5000 = R50.00).
 */

const EXPRESS_BASE = "https://express.stitch.money";

// ── Token cache ────────────────────────────────────────────────────────────
// Express tokens are valid for 15 minutes; refresh a minute early.
let _cachedToken: string | null = null;
let _tokenExpiry = 0;

async function getAccessToken(): Promise<string> {
  if (_cachedToken && Date.now() < _tokenExpiry - 60_000) return _cachedToken;

  const clientId     = process.env["STITCH_CLIENT_ID"] ?? "";
  const clientSecret = process.env["STITCH_CLIENT_SECRET"] ?? "";

  if (!clientId || !clientSecret) {
    throw new Error("Stitch credentials not configured (STITCH_CLIENT_ID / STITCH_CLIENT_SECRET)");
  }

  const res = await fetch(`${EXPRESS_BASE}/api/v1/token`, {
    method:  "POST",
    headers: { "Content-Type": "application/json" },
    body:    JSON.stringify({ clientId, clientSecret, scope: "client_paymentrequest" }),
  });

  if (!res.ok) {
    const text = await res.text();
    throw new Error(`Stitch token error ${res.status}: ${text}`);
  }

  const json = (await res.json()) as { success: boolean; data?: { accessToken: string } };
  if (!json.success || !json.data?.accessToken) {
    throw new Error(`Stitch token error: ${JSON.stringify(json)}`);
  }

  _cachedToken = json.data.accessToken;
  _tokenExpiry = Date.now() + 15 * 60 * 1000;
  return _cachedToken;
}

async function authedFetch(path: string, init: RequestInit = {}): Promise<Response> {
  const token = await getAccessToken();
  return fetch(`${EXPRESS_BASE}${path}`, {
    ...init,
    headers: { ...(init.headers ?? {}), Authorization: `Bearer ${token}` },
  });
}

// ── Redirect URL registration ──────────────────────────────────────────────
// Express requires a redirect URL to be registered before it can be appended to
// a payment link. Registration persists on the Stitch account; cache locally to
// avoid re-registering on every payment.
const _registeredRedirects = new Set<string>();

async function ensureRedirectUrl(url: string): Promise<void> {
  if (!url || _registeredRedirects.has(url)) return;
  try {
    const r = await authedFetch("/api/v1/redirect-urls", {
      method:  "POST",
      headers: { "Content-Type": "application/json" },
      body:    JSON.stringify({ redirectUrl: url }),
    });
    // Cache on success (200/201) or a permanent client response like "already
    // registered" (4xx). Do NOT cache transient 5xx so a later call can retry.
    if (r.ok || (r.status >= 400 && r.status < 500)) {
      _registeredRedirects.add(url);
    }
  } catch {
    /* best-effort (e.g. network error) — leave uncached so it retries next time */
  }
}

// ── Public API ─────────────────────────────────────────────────────────────

export interface CreatePaymentParams {
  /** Rand amount (e.g. 250.00) — converted to cents for the Express API */
  amount: number;
  /** Name of the person paying (shown on the checkout page) */
  payerName: string;
  /** Your internal identifier (booking ID, "wallet-<id>", "<id>-player-<userId>") */
  merchantReference: string;
  /** URL Stitch redirects the payer to after payment completes */
  redirectUrl: string;
  /** Optional payer email for the receipt */
  payerEmail?: string;
}

export interface StitchPaymentRequest {
  /** Payment link ID */
  id:  string;
  /** Hosted checkout URL to open in the WebView */
  url: string;
}

export async function createStitchPayment(params: CreatePaymentParams): Promise<StitchPaymentRequest> {
  const amountCents = Math.round(params.amount * 100);
  if (amountCents < 100) {
    throw new Error("Stitch minimum payment is R1.00 (100 cents)");
  }

  await ensureRedirectUrl(params.redirectUrl);

  const payload: Record<string, unknown> = {
    amount:            amountCents,
    payerName:         params.payerName?.trim() || "TapIn Golfer",
    merchantReference: params.merchantReference,
  };
  if (params.payerEmail) payload["payerEmailAddress"] = params.payerEmail;

  const res = await authedFetch("/api/v1/payment-links", {
    method:  "POST",
    headers: { "Content-Type": "application/json" },
    body:    JSON.stringify(payload),
  });

  if (!res.ok) {
    const text = await res.text();
    throw new Error(`Stitch payment-link error ${res.status}: ${text}`);
  }

  const json = (await res.json()) as { success: boolean; data?: { payment?: { id: string; link: string } } };
  const payment = json.data?.payment;
  if (!json.success || !payment?.link) {
    throw new Error(`Stitch payment-link error: ${JSON.stringify(json)}`);
  }

  const url = params.redirectUrl
    ? `${payment.link}?redirect_url=${encodeURIComponent(params.redirectUrl)}`
    : payment.link;

  return { id: payment.id, url };
}

export interface StitchPaymentDetail {
  id:                string;
  status:            string;
  merchantReference: string | null;
  amount:            number | null;
}

/**
 * Fetch a payment by its PAYMENT id (the `id` field in the webhook payload — not
 * the payment-link id). Used by the webhook to resolve the merchantReference,
 * which the `payment.paid` event itself does not include. Returns null on 404.
 */
export async function getStitchPayment(paymentId: string): Promise<StitchPaymentDetail | null> {
  const res = await authedFetch(`/api/v1/payment/${encodeURIComponent(paymentId)}`, { method: "GET" });
  if (res.status === 404) return null;
  if (!res.ok) {
    const text = await res.text();
    throw new Error(`Stitch get-payment error ${res.status}: ${text}`);
  }
  const json = (await res.json()) as any;
  const p = json?.data?.payment ?? json?.data ?? json ?? {};
  return {
    id:                p.id,
    status:            p.status,
    merchantReference: p.merchantReference ?? null,
    amount:            typeof p.amount === "number" ? p.amount : null,
  };
}

/**
 * Register a webhook endpoint and return its Svix signing secret. The secret is
 * only returned once at registration time — store it as STITCH_WEBHOOK_SECRET.
 */
export async function registerStitchWebhook(url: string): Promise<string> {
  const res = await authedFetch("/api/v1/webhook", {
    method:  "POST",
    headers: { "Content-Type": "application/json" },
    body:    JSON.stringify({ url }),
  });
  const json = (await res.json()) as any;
  if (!res.ok || !json?.data?.secret) {
    throw new Error(`Stitch webhook register error ${res.status}: ${JSON.stringify(json)}`);
  }
  return json.data.secret as string;
}

/** Check whether Stitch is configured (credentials present in env) */
export function stitchConfigured(): boolean {
  return !!(process.env["STITCH_CLIENT_ID"] && process.env["STITCH_CLIENT_SECRET"]);
}

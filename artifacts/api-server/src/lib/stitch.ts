/**
 * Stitch Money API client
 * Docs: https://stitch.money/docs
 *
 * Required env vars:
 *   STITCH_CLIENT_ID
 *   STITCH_CLIENT_SECRET
 *   STITCH_BENEFICIARY_ACCOUNT       — bank account number
 *   STITCH_BENEFICIARY_BANK_ID       — e.g. "fnb", "standard_bank", "absa", "nedbank", "capitec"
 *   STITCH_BENEFICIARY_NAME          — name on the bank account
 *   STITCH_BENEFICIARY_ACCOUNT_TYPE  — "current" | "savings" (default: "current")
 */

const TOKEN_URL  = "https://secure.stitch.money/connect/token";
const GRAPH_URL  = "https://api.stitch.money/graphql";

// ── Token cache ────────────────────────────────────────────────────────────
let _cachedToken: string | null = null;
let _tokenExpiry = 0;

async function getAccessToken(): Promise<string> {
  if (_cachedToken && Date.now() < _tokenExpiry - 60_000) return _cachedToken;

  const clientId     = process.env["STITCH_CLIENT_ID"] ?? "";
  const clientSecret = process.env["STITCH_CLIENT_SECRET"] ?? "";

  if (!clientId || !clientSecret) {
    throw new Error("Stitch credentials not configured (STITCH_CLIENT_ID / STITCH_CLIENT_SECRET)");
  }

  const body = new URLSearchParams({
    grant_type:    "client_credentials",
    client_id:     clientId,
    client_secret: clientSecret,
    scope:         "client_paymentrequest",
    audience:      "https://secure.stitch.money/connect/token",
  });

  const res = await fetch(TOKEN_URL, {
    method:  "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body:    body.toString(),
  });

  if (!res.ok) {
    const text = await res.text();
    throw new Error(`Stitch token error ${res.status}: ${text}`);
  }

  const json = (await res.json()) as { access_token: string; expires_in: number };
  _cachedToken = json.access_token;
  _tokenExpiry = Date.now() + json.expires_in * 1000;
  return _cachedToken;
}

// ── GraphQL helper ─────────────────────────────────────────────────────────
async function gql<T = unknown>(query: string, variables: Record<string, unknown>): Promise<T> {
  const token = await getAccessToken();

  const res = await fetch(GRAPH_URL, {
    method:  "POST",
    headers: {
      "Content-Type":  "application/json",
      "Authorization": `Bearer ${token}`,
    },
    body: JSON.stringify({ query, variables }),
  });

  if (!res.ok) {
    const text = await res.text();
    throw new Error(`Stitch GraphQL HTTP error ${res.status}: ${text}`);
  }

  const json = (await res.json()) as { data?: T; errors?: Array<{ message: string }> };

  if (json.errors?.length) {
    throw new Error(`Stitch GraphQL error: ${json.errors[0]?.message ?? JSON.stringify(json.errors)}`);
  }

  return json.data as T;
}

// ── Public API ─────────────────────────────────────────────────────────────

export interface CreatePaymentParams {
  /** Rand amount (e.g. 250.00) */
  amount: number;
  /** Short reference shown on payer's bank statement (max 20 chars) */
  payerReference: string;
  /** Short reference shown on beneficiary's bank statement (max 20 chars) */
  beneficiaryReference: string;
  /** Your internal ID (booking ID, topup ID, etc.) */
  externalReference: string;
  /** URL Stitch redirects the user to after payment (success or cancel) */
  redirectUrl: string;
}

export interface StitchPaymentRequest {
  id:  string;
  url: string;
}

const CREATE_PAYMENT = `
  mutation CreatePaymentRequest($input: ClientPaymentInitiationRequestInput!) {
    clientPaymentInitiationRequestCreate(input: $input) {
      paymentInitiationRequest {
        id
        url
      }
    }
  }
`;

export async function createStitchPayment(params: CreatePaymentParams): Promise<StitchPaymentRequest> {
  const accountNumber = process.env["STITCH_BENEFICIARY_ACCOUNT"] ?? "";
  const bankId        = process.env["STITCH_BENEFICIARY_BANK_ID"] ?? "";
  const name          = process.env["STITCH_BENEFICIARY_NAME"] ?? "TapIn Golf";
  const accountType   = process.env["STITCH_BENEFICIARY_ACCOUNT_TYPE"] ?? "current";

  if (!accountNumber || !bankId) {
    throw new Error("Stitch beneficiary details not configured (STITCH_BENEFICIARY_ACCOUNT / STITCH_BENEFICIARY_BANK_ID)");
  }

  type Resp = { clientPaymentInitiationRequestCreate: { paymentInitiationRequest: { id: string; url: string } } };

  const data = await gql<Resp>(CREATE_PAYMENT, {
    input: {
      amount: {
        quantity: params.amount.toFixed(2),
        currency: "ZAR",
      },
      payerReference:       params.payerReference.slice(0, 20),
      beneficiaryReference: params.beneficiaryReference.slice(0, 20),
      externalReference:    params.externalReference,
      beneficiary: {
        bankAccount: {
          name,
          bankId,
          accountNumber,
          accountType,
          beneficiaryType: "private",
        },
      },
      redirectUrl: params.redirectUrl,
    },
  });

  const pr = data.clientPaymentInitiationRequestCreate.paymentInitiationRequest;
  return { id: pr.id, url: pr.url };
}

/** Check whether Stitch is configured (credentials present in env) */
export function stitchConfigured(): boolean {
  return !!(process.env["STITCH_CLIENT_ID"] && process.env["STITCH_CLIENT_SECRET"]);
}

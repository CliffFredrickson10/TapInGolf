/**
 * Zoho Books Accounting Adapter
 */
import {
  AccountingAdapter,
  AccountingConnection,
  ExternalJournalData,
  ExternalInvoiceData,
  ExternalAccount,
  registerAdapter,
} from "./accounting";
import { logger } from "./logger";

class ZohoBooksAdapter implements AccountingAdapter {
  readonly provider = "zoho";

  private apiBase(orgId: string, region: string = "com") {
    return `https://www.zohoapis.${region}/books/v3/organizations/${orgId}`;
  }

  async testConnection(credentials: any): Promise<boolean> {
    try {
      const res = await fetch(
        `https://www.zohoapis.${credentials.region ?? "com"}/books/v3/organizations`,
        { headers: { Authorization: `Zoho-oauthtoken ${credentials.access_token}` } }
      );
      return res.ok;
    } catch {
      return false;
    }
  }

  async pushJournal(connection: AccountingConnection, data: ExternalJournalData): Promise<string> {
    const creds = connection.credentials;
    const region = creds.region ?? "com";
    const orgId = creds.organization_id;

    const payload = {
      journal_date: data.date,
      reference_number: data.reference,
      notes: data.description,
      line_items: data.lines.map(line => ({
        account_id: line.account_code,
        debit_or_credit: line.debit > 0 ? "debit" : "credit",
        amount: line.debit > 0 ? line.debit : line.credit,
        description: line.description,
      })),
    };

    const res = await fetch(
      `https://www.zohoapis.${region}/books/v3/journals?organization_id=${orgId}`,
      {
        method: "POST",
        headers: {
          Authorization: `Zoho-oauthtoken ${creds.access_token}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({ JSONString: JSON.stringify(payload) }),
      }
    );

    if (!res.ok) {
      const body = await res.text();
      logger.error({ status: res.status, body }, "Zoho pushJournal failed");
      throw new Error(`Zoho API error: ${res.status} — ${body.slice(0, 200)}`);
    }

    const result = await res.json() as any;
    return result?.journal?.journal_id ?? "";
  }

  async pushInvoice(connection: AccountingConnection, data: ExternalInvoiceData): Promise<string> {
    const creds = connection.credentials;
    const region = creds.region ?? "com";
    const orgId = creds.organization_id;

    const payload = {
      date: data.date,
      due_date: data.due_date,
      reference_number: data.reference,
      customer_name: data.contact_name,
      line_items: data.lines.map(l => ({
        description: l.description,
        quantity: l.quantity,
        rate: l.unit_amount,
        account_id: l.account_code,
      })),
    };

    const res = await fetch(
      `https://www.zohoapis.${region}/books/v3/invoices?organization_id=${orgId}`,
      {
        method: "POST",
        headers: {
          Authorization: `Zoho-oauthtoken ${creds.access_token}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({ JSONString: JSON.stringify(payload) }),
      }
    );

    if (!res.ok) {
      const body = await res.text();
      throw new Error(`Zoho API error: ${res.status} — ${body.slice(0, 200)}`);
    }

    const result = await res.json() as any;
    return result?.invoice?.invoice_id ?? "";
  }

  async getExternalAccounts(connection: AccountingConnection): Promise<ExternalAccount[]> {
    const creds = connection.credentials;
    const region = creds.region ?? "com";
    const orgId = creds.organization_id;

    const res = await fetch(
      `https://www.zohoapis.${region}/books/v3/chartofaccounts?organization_id=${orgId}`,
      { headers: { Authorization: `Zoho-oauthtoken ${creds.access_token}` } }
    );
    if (!res.ok) return [];

    const result = await res.json() as any;
    return (result?.chartofaccounts ?? []).map((a: any) => ({
      code: a.account_id,
      name: a.account_name,
      type: a.account_type,
    }));
  }

  async refreshToken(connection: AccountingConnection): Promise<any> {
    const creds = connection.credentials;
    const region = creds.region ?? "com";

    const res = await fetch(`https://accounts.zoho.${region}/oauth/v2/token`, {
      method: "POST",
      headers: { "Content-Type": "application/x-www-form-urlencoded" },
      body: new URLSearchParams({
        grant_type: "refresh_token",
        refresh_token: creds.refresh_token,
        client_id: creds.client_id,
        client_secret: creds.client_secret,
      }),
    });

    if (!res.ok) throw new Error(`Zoho token refresh failed: ${res.status}`);
    const tokens = await res.json() as any;
    return {
      ...creds,
      access_token: tokens.access_token,
      expires_at: Date.now() + (tokens.expires_in ?? 3600) * 1000,
    };
  }
}

registerAdapter(new ZohoBooksAdapter());
export { ZohoBooksAdapter };

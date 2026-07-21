/**
 * Sage Accounting Adapter
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

const SAGE_API_BASE = "https://api.accounting.sage.com/v3.1";

class SageAdapter implements AccountingAdapter {
  readonly provider = "sage";

  async testConnection(credentials: any): Promise<boolean> {
    try {
      const res = await fetch(`${SAGE_API_BASE}/me`, {
        headers: { Authorization: `Bearer ${credentials.access_token}` },
      });
      return res.ok;
    } catch {
      return false;
    }
  }

  async pushJournal(connection: AccountingConnection, data: ExternalJournalData): Promise<string> {
    const creds = connection.credentials;

    const payload = {
      journal: {
        date: data.date,
        reference: data.reference,
        description: data.description,
        journal_lines: data.lines.map(line => ({
          ledger_account_id: line.account_code,
          debit: line.debit > 0 ? line.debit : undefined,
          credit: line.credit > 0 ? line.credit : undefined,
          details: line.description,
        })),
      },
    };

    const res = await fetch(`${SAGE_API_BASE}/journals`, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${creds.access_token}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify(payload),
    });

    if (!res.ok) {
      const body = await res.text();
      logger.error({ status: res.status, body }, "Sage pushJournal failed");
      throw new Error(`Sage API error: ${res.status} — ${body.slice(0, 200)}`);
    }

    const result = await res.json() as any;
    return result?.id ?? "";
  }

  async pushInvoice(connection: AccountingConnection, data: ExternalInvoiceData): Promise<string> {
    const creds = connection.credentials;

    const payload = {
      sales_invoice: {
        date: data.date,
        due_date: data.due_date,
        reference: data.reference,
        contact_name: data.contact_name,
        main_address: { email: data.contact_email },
        invoice_lines: data.lines.map(l => ({
          description: l.description,
          quantity: l.quantity,
          unit_price: l.unit_amount,
          ledger_account_id: l.account_code,
          tax_rate_id: l.tax_type,
        })),
      },
    };

    const res = await fetch(`${SAGE_API_BASE}/sales_invoices`, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${creds.access_token}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify(payload),
    });

    if (!res.ok) {
      const body = await res.text();
      throw new Error(`Sage API error: ${res.status} — ${body.slice(0, 200)}`);
    }

    const result = await res.json() as any;
    return result?.id ?? "";
  }

  async getExternalAccounts(connection: AccountingConnection): Promise<ExternalAccount[]> {
    const creds = connection.credentials;
    const res = await fetch(`${SAGE_API_BASE}/ledger_accounts?items_per_page=200`, {
      headers: { Authorization: `Bearer ${creds.access_token}` },
    });
    if (!res.ok) return [];

    const result = await res.json() as any;
    return (result?.$items ?? []).map((a: any) => ({
      code: a.id,
      name: a.displayed_as ?? a.name,
      type: a.ledger_account_type?.name ?? "",
    }));
  }

  async refreshToken(connection: AccountingConnection): Promise<any> {
    const creds = connection.credentials;
    const res = await fetch("https://oauth.accounting.sage.com/token", {
      method: "POST",
      headers: { "Content-Type": "application/x-www-form-urlencoded" },
      body: new URLSearchParams({
        grant_type: "refresh_token",
        refresh_token: creds.refresh_token,
        client_id: creds.client_id,
        client_secret: creds.client_secret,
      }),
    });

    if (!res.ok) throw new Error(`Sage token refresh failed: ${res.status}`);
    const tokens = await res.json() as any;
    return {
      ...creds,
      access_token: tokens.access_token,
      refresh_token: tokens.refresh_token,
      expires_at: Date.now() + (tokens.expires_in ?? 3600) * 1000,
    };
  }
}

registerAdapter(new SageAdapter());
export { SageAdapter };

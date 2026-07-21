/**
 * Xero Accounting Adapter
 *
 * Implements the AccountingAdapter interface for Xero.
 * Uses Xero's REST API to push journals and invoices.
 *
 * Note: Full OAuth2 flow requires a registered Xero app.
 * This adapter handles token refresh and API calls.
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

const XERO_API_BASE = "https://api.xero.com/api.xro/2.0";

class XeroAdapter implements AccountingAdapter {
  readonly provider = "xero";

  async testConnection(credentials: any): Promise<boolean> {
    try {
      const res = await fetch(`${XERO_API_BASE}/Organisation`, {
        headers: {
          Authorization: `Bearer ${credentials.access_token}`,
          "xero-tenant-id": credentials.tenant_id,
          Accept: "application/json",
        },
      });
      return res.ok;
    } catch {
      return false;
    }
  }

  async pushJournal(connection: AccountingConnection, data: ExternalJournalData): Promise<string> {
    const creds = connection.credentials;

    const journalLines = data.lines.map(line => ({
      LineAmount: line.debit > 0 ? line.debit : -line.credit,
      AccountCode: line.account_code,
      Description: line.description,
    }));

    const payload = {
      ManualJournals: [{
        Date: data.date,
        Narration: data.description,
        Reference: data.reference,
        JournalLines: journalLines,
      }],
    };

    const res = await fetch(`${XERO_API_BASE}/ManualJournals`, {
      method: "PUT",
      headers: {
        Authorization: `Bearer ${creds.access_token}`,
        "xero-tenant-id": creds.tenant_id,
        "Content-Type": "application/json",
        Accept: "application/json",
      },
      body: JSON.stringify(payload),
    });

    if (!res.ok) {
      const body = await res.text();
      logger.error({ status: res.status, body }, "Xero pushJournal failed");
      throw new Error(`Xero API error: ${res.status} — ${body.slice(0, 200)}`);
    }

    const result = await res.json() as any;
    const journalId = result?.ManualJournals?.[0]?.ManualJournalID;
    if (!journalId) throw new Error("Xero did not return a ManualJournalID");
    return journalId;
  }

  async pushInvoice(connection: AccountingConnection, data: ExternalInvoiceData): Promise<string> {
    const creds = connection.credentials;

    const payload = {
      Invoices: [{
        Type: "ACCREC",
        Contact: { Name: data.contact_name, EmailAddress: data.contact_email },
        Date: data.date,
        DueDate: data.due_date,
        Reference: data.reference,
        LineAmountTypes: "Exclusive",
        LineItems: data.lines.map(l => ({
          Description: l.description,
          Quantity: l.quantity,
          UnitAmount: l.unit_amount,
          AccountCode: l.account_code,
          TaxType: l.tax_type ?? "OUTPUT",
        })),
        Status: "AUTHORISED",
      }],
    };

    const res = await fetch(`${XERO_API_BASE}/Invoices`, {
      method: "PUT",
      headers: {
        Authorization: `Bearer ${creds.access_token}`,
        "xero-tenant-id": creds.tenant_id,
        "Content-Type": "application/json",
        Accept: "application/json",
      },
      body: JSON.stringify(payload),
    });

    if (!res.ok) {
      const body = await res.text();
      logger.error({ status: res.status, body }, "Xero pushInvoice failed");
      throw new Error(`Xero API error: ${res.status} — ${body.slice(0, 200)}`);
    }

    const result = await res.json() as any;
    return result?.Invoices?.[0]?.InvoiceID ?? "";
  }

  async getExternalAccounts(connection: AccountingConnection): Promise<ExternalAccount[]> {
    const creds = connection.credentials;

    const res = await fetch(`${XERO_API_BASE}/Accounts`, {
      headers: {
        Authorization: `Bearer ${creds.access_token}`,
        "xero-tenant-id": creds.tenant_id,
        Accept: "application/json",
      },
    });

    if (!res.ok) return [];

    const result = await res.json() as any;
    return (result?.Accounts ?? []).map((a: any) => ({
      code: a.Code,
      name: a.Name,
      type: a.Type,
    }));
  }

  async refreshToken(connection: AccountingConnection): Promise<any> {
    const creds = connection.credentials;
    if (!creds.refresh_token || !creds.client_id || !creds.client_secret) {
      throw new Error("Missing OAuth credentials for token refresh");
    }

    const res = await fetch("https://identity.xero.com/connect/token", {
      method: "POST",
      headers: { "Content-Type": "application/x-www-form-urlencoded" },
      body: new URLSearchParams({
        grant_type: "refresh_token",
        refresh_token: creds.refresh_token,
        client_id: creds.client_id,
        client_secret: creds.client_secret,
      }),
    });

    if (!res.ok) {
      throw new Error(`Xero token refresh failed: ${res.status}`);
    }

    const tokens = await res.json() as any;
    return {
      ...creds,
      access_token: tokens.access_token,
      refresh_token: tokens.refresh_token,
      expires_at: Date.now() + (tokens.expires_in ?? 1800) * 1000,
    };
  }
}

// Register on module load
registerAdapter(new XeroAdapter());

export { XeroAdapter };

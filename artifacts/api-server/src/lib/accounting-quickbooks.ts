/**
 * QuickBooks Online Accounting Adapter
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

class QuickBooksAdapter implements AccountingAdapter {
  readonly provider = "quickbooks";

  private apiBase(realmId: string) {
    return `https://quickbooks.api.intuit.com/v3/company/${realmId}`;
  }

  async testConnection(credentials: any): Promise<boolean> {
    try {
      const res = await fetch(`${this.apiBase(credentials.realm_id)}/companyinfo/${credentials.realm_id}`, {
        headers: {
          Authorization: `Bearer ${credentials.access_token}`,
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

    const lines = data.lines.map((line, idx) => ({
      JournalEntryLineDetail: {
        PostingType: line.debit > 0 ? "Debit" : "Credit",
        AccountRef: { value: line.account_code },
      },
      Amount: line.debit > 0 ? line.debit : line.credit,
      Description: line.description,
      DetailType: "JournalEntryLineDetail",
      LineNum: idx + 1,
    }));

    const payload = {
      TxnDate: data.date,
      DocNumber: data.reference.slice(0, 21), // QB max 21 chars
      PrivateNote: data.description,
      Line: lines,
    };

    const res = await fetch(`${this.apiBase(creds.realm_id)}/journalentry`, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${creds.access_token}`,
        "Content-Type": "application/json",
        Accept: "application/json",
      },
      body: JSON.stringify(payload),
    });

    if (!res.ok) {
      const body = await res.text();
      logger.error({ status: res.status, body }, "QuickBooks pushJournal failed");
      throw new Error(`QuickBooks API error: ${res.status} — ${body.slice(0, 200)}`);
    }

    const result = await res.json() as any;
    return result?.JournalEntry?.Id ?? "";
  }

  async pushInvoice(connection: AccountingConnection, data: ExternalInvoiceData): Promise<string> {
    const creds = connection.credentials;

    const payload = {
      TxnDate: data.date,
      DueDate: data.due_date,
      DocNumber: data.reference.slice(0, 21),
      CustomerRef: { name: data.contact_name },
      Line: data.lines.map((l, idx) => ({
        Amount: l.quantity * l.unit_amount,
        DetailType: "SalesItemLineDetail",
        SalesItemLineDetail: {
          UnitPrice: l.unit_amount,
          Qty: l.quantity,
          ItemAccountRef: { value: l.account_code },
        },
        Description: l.description,
        LineNum: idx + 1,
      })),
    };

    const res = await fetch(`${this.apiBase(creds.realm_id)}/invoice`, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${creds.access_token}`,
        "Content-Type": "application/json",
        Accept: "application/json",
      },
      body: JSON.stringify(payload),
    });

    if (!res.ok) {
      const body = await res.text();
      throw new Error(`QuickBooks API error: ${res.status} — ${body.slice(0, 200)}`);
    }

    const result = await res.json() as any;
    return result?.Invoice?.Id ?? "";
  }

  async getExternalAccounts(connection: AccountingConnection): Promise<ExternalAccount[]> {
    const creds = connection.credentials;
    const res = await fetch(
      `${this.apiBase(creds.realm_id)}/query?query=${encodeURIComponent("SELECT * FROM Account MAXRESULTS 500")}`,
      {
        headers: {
          Authorization: `Bearer ${creds.access_token}`,
          Accept: "application/json",
        },
      }
    );
    if (!res.ok) return [];

    const result = await res.json() as any;
    return (result?.QueryResponse?.Account ?? []).map((a: any) => ({
      code: a.Id,
      name: `${a.Name} (${a.AcctNum ?? a.Id})`,
      type: a.AccountType,
    }));
  }

  async refreshToken(connection: AccountingConnection): Promise<any> {
    const creds = connection.credentials;
    const basicAuth = Buffer.from(`${creds.client_id}:${creds.client_secret}`).toString("base64");

    const res = await fetch("https://oauth.platform.intuit.com/oauth2/v1/tokens/bearer", {
      method: "POST",
      headers: {
        "Content-Type": "application/x-www-form-urlencoded",
        Authorization: `Basic ${basicAuth}`,
      },
      body: new URLSearchParams({
        grant_type: "refresh_token",
        refresh_token: creds.refresh_token,
      }),
    });

    if (!res.ok) throw new Error(`QuickBooks token refresh failed: ${res.status}`);
    const tokens = await res.json() as any;
    return {
      ...creds,
      access_token: tokens.access_token,
      refresh_token: tokens.refresh_token,
      expires_at: Date.now() + (tokens.expires_in ?? 3600) * 1000,
    };
  }
}

registerAdapter(new QuickBooksAdapter());
export { QuickBooksAdapter };

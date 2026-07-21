import { useState, useEffect } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import {
  Table, TableBody, TableCell, TableHead, TableHeader, TableRow,
} from "@/components/ui/table";
import { Landmark, TrendingUp, TrendingDown, Scale, RefreshCw, ChevronLeft, ChevronRight, Link2, Unlink, ArrowUpRight, Check, AlertCircle, CreditCard } from "lucide-react";
import { api } from "@/lib/api";
import { PaymentsContent } from "./payments";

type Tab = "payments" | "ledger" | "pnl" | "balance-sheet" | "settlements" | "integrations";

export default function Finance() {
  // Check URL for ?connected= param (Xero OAuth callback redirect)
  const params = new URLSearchParams(window.location.search);
  const justConnected = params.get("connected");

  const [tab, setTab] = useState<Tab>(justConnected ? "integrations" : "payments");

  return (
    <div className="space-y-4 p-6">
      <div className="flex items-center gap-3">
        <Landmark className="h-6 w-6 text-emerald-600" />
        <h1 className="text-2xl font-bold">Finances</h1>
      </div>

      <div className="flex gap-2 border-b pb-2 flex-wrap">
        {([
          ["payments", "Payments"],
          ["ledger", "Ledger"],
          ["pnl", "Profit & Loss"],
          ["balance-sheet", "Balance Sheet"],
          ["settlements", "Settlements"],
          ["integrations", "Integrations"],
        ] as [Tab, string][]).map(([key, label]) => (
          <Button
            key={key}
            variant={tab === key ? "default" : "ghost"}
            size="sm"
            onClick={() => setTab(key)}
          >
            {key === "payments" && <CreditCard className="h-4 w-4 mr-1" />}
            {label}
          </Button>
        ))}
      </div>

      {tab === "payments" && <PaymentsContent />}
      {tab === "ledger" && <LedgerView />}
      {tab === "pnl" && <ProfitLoss />}
      {tab === "balance-sheet" && <BalanceSheet />}
      {tab === "settlements" && <Settlements />}
      {tab === "integrations" && <Integrations justConnected={justConnected} />}
    </div>
  );
}

// ─── Ledger View ─────────────────────────────────────────────────────────────

function LedgerView() {
  const [journals, setJournals] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [seeding, setSeeding] = useState(false);
  const [page, setPage] = useState(1);
  const limit = 25;

  function load() {
    setLoading(true);
    api<any>(`/api/portal/ledger/journals?limit=${limit}&offset=${(page - 1) * limit}`)
      .then(data => { setJournals(data.journals ?? data ?? []); setLoading(false); })
      .catch(() => setLoading(false));
  }

  useEffect(() => { load(); }, [page]);

  async function seedTestData() {
    setSeeding(true);
    try {
      const result = await api<{ message: string }>("/api/portal/ledger/seed-test-data", { method: "POST" });
      alert(result.message);
      load();
    } catch (e: any) {
      alert("Failed: " + e.message);
    } finally {
      setSeeding(false);
    }
  }

  return (
    <Card>
      <CardHeader className="flex flex-row items-center justify-between">
        <CardTitle className="text-lg">Journal Entries</CardTitle>
        <div className="flex gap-2">
          <Button size="sm" variant="outline" onClick={seedTestData} disabled={seeding}>
            {seeding ? "Seeding..." : "Seed Test Data"}
          </Button>
          <Button size="sm" variant="outline" disabled={page === 1} onClick={() => setPage(p => p - 1)}>
            <ChevronLeft className="h-4 w-4" />
          </Button>
          <span className="text-sm self-center">Page {page}</span>
          <Button size="sm" variant="outline" disabled={journals.length < limit} onClick={() => setPage(p => p + 1)}>
            <ChevronRight className="h-4 w-4" />
          </Button>
        </div>
      </CardHeader>
      <CardContent>
        {loading ? (
          <p className="text-muted-foreground">Loading...</p>
        ) : journals.length === 0 ? (
          <p className="text-muted-foreground">No journal entries yet. Financial events will appear here once bookings and transactions are processed.</p>
        ) : (
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Date</TableHead>
                <TableHead>Ref</TableHead>
                <TableHead>Description</TableHead>
                <TableHead>Source</TableHead>
                <TableHead className="text-right">Amount</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {journals.map((j: any) => (
                <TableRow key={j.id}>
                  <TableCell className="whitespace-nowrap">{j.journal_date?.slice(0, 10)}</TableCell>
                  <TableCell className="font-mono text-xs">{j.journal_ref?.slice(0, 16)}</TableCell>
                  <TableCell>{j.description}</TableCell>
                  <TableCell>
                    <Badge variant="outline" className="text-xs">{j.source_module}</Badge>
                  </TableCell>
                  <TableCell className="text-right font-mono">
                    {j.total_debit ? `R ${Number(j.total_debit).toFixed(2)}` : "—"}
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        )}
      </CardContent>
    </Card>
  );
}

// ─── Profit & Loss ───────────────────────────────────────────────────────────

function ProfitLoss() {
  const [data, setData] = useState<any>(null);
  const [loading, setLoading] = useState(true);
  const [from, setFrom] = useState(() => {
    const d = new Date(); d.setMonth(d.getMonth() - 1);
    return d.toISOString().slice(0, 10);
  });
  const [to, setTo] = useState(() => new Date().toISOString().slice(0, 10));

  function load() {
    setLoading(true);
    api<any>(`/api/portal/ledger/reports/profit-loss?from=${from}&to=${to}`)
      .then(d => { setData(d); setLoading(false); })
      .catch(() => setLoading(false));
  }

  useEffect(() => { load(); }, []);

  return (
    <div className="space-y-4">
      <Card>
        <CardHeader>
          <div className="flex items-center gap-4">
            <CardTitle className="text-lg">Profit & Loss</CardTitle>
            <Input type="date" value={from} onChange={e => setFrom(e.target.value)} className="w-40" />
            <span>to</span>
            <Input type="date" value={to} onChange={e => setTo(e.target.value)} className="w-40" />
            <Button size="sm" onClick={load}><RefreshCw className="h-4 w-4 mr-1" /> Generate</Button>
          </div>
        </CardHeader>
        <CardContent>
          {loading ? <p className="text-muted-foreground">Loading...</p> : !data ? <p>No data</p> : (
            <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
              <div>
                <h3 className="font-semibold flex items-center gap-2 mb-2">
                  <TrendingUp className="h-4 w-4 text-green-600" /> Revenue
                </h3>
                <Table>
                  <TableBody>
                    {(data.revenue ?? []).map((r: any) => (
                      <TableRow key={r.code}>
                        <TableCell>{r.code}</TableCell>
                        <TableCell>{r.name}</TableCell>
                        <TableCell className="text-right font-mono text-green-700">R {Number(r.total).toFixed(2)}</TableCell>
                      </TableRow>
                    ))}
                    <TableRow className="font-bold border-t-2">
                      <TableCell colSpan={2}>Total Revenue</TableCell>
                      <TableCell className="text-right font-mono text-green-700">R {Number(data.total_revenue).toFixed(2)}</TableCell>
                    </TableRow>
                  </TableBody>
                </Table>
              </div>
              <div>
                <h3 className="font-semibold flex items-center gap-2 mb-2">
                  <TrendingDown className="h-4 w-4 text-red-600" /> Expenses
                </h3>
                <Table>
                  <TableBody>
                    {(data.expenses ?? []).map((r: any) => (
                      <TableRow key={r.code}>
                        <TableCell>{r.code}</TableCell>
                        <TableCell>{r.name}</TableCell>
                        <TableCell className="text-right font-mono text-red-700">R {Number(r.total).toFixed(2)}</TableCell>
                      </TableRow>
                    ))}
                    <TableRow className="font-bold border-t-2">
                      <TableCell colSpan={2}>Total Expenses</TableCell>
                      <TableCell className="text-right font-mono text-red-700">R {Number(data.total_expenses).toFixed(2)}</TableCell>
                    </TableRow>
                  </TableBody>
                </Table>
              </div>
              <Card className="col-span-full bg-slate-50">
                <CardContent className="pt-4">
                  <div className="flex justify-between items-center text-lg font-bold">
                    <span>Net Profit</span>
                    <span className={data.net_profit >= 0 ? "text-green-700" : "text-red-700"}>
                      R {Number(data.net_profit).toFixed(2)}
                    </span>
                  </div>
                </CardContent>
              </Card>
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}

// ─── Balance Sheet ───────────────────────────────────────────────────────────

function BalanceSheet() {
  const [data, setData] = useState<any>(null);
  const [loading, setLoading] = useState(true);
  const [asOf, setAsOf] = useState(() => new Date().toISOString().slice(0, 10));

  function load() {
    setLoading(true);
    api<any>(`/api/portal/ledger/reports/balance-sheet?as_of=${asOf}`)
      .then(d => { setData(d); setLoading(false); })
      .catch(() => setLoading(false));
  }

  useEffect(() => { load(); }, []);

  const renderSection = (title: string, items: any[], color: string) => (
    <div>
      <h3 className="font-semibold mb-2">{title}</h3>
      <Table>
        <TableBody>
          {(items ?? []).map((r: any) => (
            <TableRow key={r.code}>
              <TableCell>{r.code}</TableCell>
              <TableCell>{r.name}</TableCell>
              <TableCell className={`text-right font-mono ${color}`}>R {Number(r.balance).toFixed(2)}</TableCell>
            </TableRow>
          ))}
        </TableBody>
      </Table>
    </div>
  );

  return (
    <Card>
      <CardHeader>
        <div className="flex items-center gap-4">
          <Scale className="h-5 w-5" />
          <CardTitle className="text-lg">Balance Sheet</CardTitle>
          <Input type="date" value={asOf} onChange={e => setAsOf(e.target.value)} className="w-40" />
          <Button size="sm" onClick={load}><RefreshCw className="h-4 w-4 mr-1" /> Generate</Button>
        </div>
      </CardHeader>
      <CardContent>
        {loading ? <p className="text-muted-foreground">Loading...</p> : !data ? <p>No data</p> : (
          <div className="space-y-6">
            {renderSection("Assets", data.assets, "text-blue-700")}
            {renderSection("Liabilities", data.liabilities, "text-orange-700")}
            {renderSection("Equity", data.equity, "text-purple-700")}

            <div className="grid grid-cols-3 gap-4 pt-4 border-t-2">
              <div className="text-center">
                <p className="text-sm text-muted-foreground">Total Assets</p>
                <p className="text-lg font-bold text-blue-700">R {Number(data.total_assets).toFixed(2)}</p>
              </div>
              <div className="text-center">
                <p className="text-sm text-muted-foreground">Total Liabilities</p>
                <p className="text-lg font-bold text-orange-700">R {Number(data.total_liabilities).toFixed(2)}</p>
              </div>
              <div className="text-center">
                <p className="text-sm text-muted-foreground">Total Equity</p>
                <p className="text-lg font-bold text-purple-700">R {Number(data.total_equity).toFixed(2)}</p>
                {data.net_income != null && Math.abs(data.net_income) >= 0.01 && (
                  <p className="text-xs text-muted-foreground mt-1">
                    (incl. net income R {Number(data.net_income).toFixed(2)})
                  </p>
                )}
              </div>
            </div>

            <div className="flex justify-center">
              <Badge variant={data.balanced ? "default" : "destructive"}>
                {data.balanced ? "✓ Balanced" : "⚠ Unbalanced"}
              </Badge>
            </div>
          </div>
        )}
      </CardContent>
    </Card>
  );
}

// ─── Settlements ─────────────────────────────────────────────────────────────

function Settlements() {
  const [batches, setBatches] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    api<any>("/api/portal/ledger/settlements")
      .then(data => { setBatches(Array.isArray(data) ? data : []); setLoading(false); })
      .catch(() => setLoading(false));
  }, []);

  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-lg">Settlement Batches</CardTitle>
      </CardHeader>
      <CardContent>
        {loading ? (
          <p className="text-muted-foreground">Loading...</p>
        ) : batches.length === 0 ? (
          <p className="text-muted-foreground">No settlement batches yet. Settlements are generated when payment providers pay out collected funds.</p>
        ) : (
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Batch Ref</TableHead>
                <TableHead>Provider</TableHead>
                <TableHead>Period</TableHead>
                <TableHead className="text-right">Gross</TableHead>
                <TableHead className="text-right">Fees</TableHead>
                <TableHead className="text-right">Net</TableHead>
                <TableHead>Status</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {batches.map((b: any) => (
                <TableRow key={b.id}>
                  <TableCell className="font-mono text-xs">{b.batch_ref}</TableCell>
                  <TableCell className="capitalize">{b.provider}</TableCell>
                  <TableCell className="text-xs">
                    {b.period_from?.slice(0, 10)} → {b.period_to?.slice(0, 10)}
                  </TableCell>
                  <TableCell className="text-right font-mono">R {Number(b.total_amount).toFixed(2)}</TableCell>
                  <TableCell className="text-right font-mono text-red-600">R {Number(b.fee_amount).toFixed(2)}</TableCell>
                  <TableCell className="text-right font-mono text-green-700">R {Number(b.net_amount).toFixed(2)}</TableCell>
                  <TableCell>
                    <Badge variant={b.status === "settled" ? "default" : b.status === "cancelled" ? "destructive" : "secondary"}>
                      {b.status}
                    </Badge>
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        )}
      </CardContent>
    </Card>
  );
}

// ─── Integrations ────────────────────────────────────────────────────────────

interface IntegrationsProps {
  justConnected?: string | null;
}

function Integrations({ justConnected }: IntegrationsProps) {
  const [connections, setConnections] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [syncing, setSyncing] = useState<number | null>(null);
  const [mappingConn, setMappingConn] = useState<any>(null);
  const [externalAccounts, setExternalAccounts] = useState<any[]>([]);
  const [internalAccounts, setInternalAccounts] = useState<any[]>([]);
  const [mappings, setMappings] = useState<Record<string, string>>({});
  const [syncResult, setSyncResult] = useState<any>(null);
  const [configError, setConfigError] = useState<string | null>(null);

  function loadConnections() {
    setLoading(true);
    api<any[]>("/api/portal/ledger/accounting/connections")
      .then(data => { setConnections(data); setLoading(false); })
      .catch(() => setLoading(false));
  }

  useEffect(() => { loadConnections(); }, []);

  async function disconnect(id: number) {
    if (!confirm("Disconnect this accounting integration?")) return;
    await api(`/api/portal/ledger/accounting/connections/${id}/disconnect`, { method: "POST" });
    loadConnections();
  }

  async function triggerSync(id: number) {
    setSyncing(id);
    setSyncResult(null);
    try {
      const result = await api<any>(`/api/portal/ledger/accounting/connections/${id}/sync`, {
        method: "POST",
        body: JSON.stringify({ limit: 100 }),
      });
      setSyncResult(result);
    } catch (err: any) {
      setSyncResult({ error: err.message });
    }
    setSyncing(null);
  }

  async function openMapping(conn: any) {
    setMappingConn(conn);
    setMappings(conn.config?.account_mappings ?? {});
    try {
      const [ext, internal] = await Promise.all([
        api<any[]>(`/api/portal/ledger/accounting/connections/${conn.id}/accounts`),
        api<any>("/api/portal/ledger/accounts"),
      ]);
      setExternalAccounts(ext);
      setInternalAccounts(internal.accounts ?? internal ?? []);
    } catch {
      setExternalAccounts([]);
      setInternalAccounts([]);
    }
  }

  async function saveMappings() {
    if (!mappingConn) return;
    await api(`/api/portal/ledger/accounting/connections/${mappingConn.id}/config`, {
      method: "PUT",
      body: JSON.stringify({ config: { ...mappingConn.config, account_mappings: mappings } }),
    });
    setMappingConn(null);
    loadConnections();
  }

  const availableProviders = [
    { id: "xero", name: "Xero", description: "Cloud accounting for small businesses", logo: "🔵" },
    { id: "sage", name: "Sage Accounting", description: "Business accounting & payroll", logo: "🟢" },
    { id: "quickbooks", name: "QuickBooks Online", description: "Intuit's cloud accounting", logo: "🟡" },
    { id: "zoho", name: "Zoho Books", description: "Online accounting software", logo: "🔴" },
  ];

  async function connectProvider(provider: string) {
    try {
      const data = await api<{ auth_url: string }>(`/api/portal/ledger/accounting/${provider}/connect`);
      window.location.href = data.auth_url;
    } catch (err: any) {
      const msg = err.message || "";
      if (msg.includes("not configured") || msg.includes("not found") || msg.includes("Not Found") || err.status === 404 || err.status === 500) {
        setConfigError(provider);
      } else {
        alert(msg || `Failed to initiate ${provider} connection`);
      }
    }
  }

  return (
    <div className="space-y-4">
      {justConnected && (
        <div className="flex items-center gap-2 p-3 bg-green-50 border border-green-200 rounded-lg">
          <Check className="h-5 w-5 text-green-600" />
          <span className="text-green-800 font-medium">
            Successfully connected to {justConnected.charAt(0).toUpperCase() + justConnected.slice(1)}!
          </span>
        </div>
      )}

      {/* Active Connections */}
      <Card>
        <CardHeader>
          <CardTitle className="text-lg flex items-center gap-2">
            <Link2 className="h-5 w-5" /> Active Connections
          </CardTitle>
        </CardHeader>
        <CardContent>
          {loading ? (
            <p className="text-muted-foreground">Loading...</p>
          ) : connections.length === 0 ? (
            <p className="text-muted-foreground">No accounting integrations connected yet. Connect a provider below to start syncing financial data.</p>
          ) : (
            <div className="space-y-3">
              {connections.map((conn: any) => (
                <div key={conn.id} className="flex items-center justify-between p-4 border rounded-lg">
                  <div className="flex items-center gap-3">
                    <div className="text-2xl">
                      {conn.provider === "xero" ? "🔵" : conn.provider === "sage" ? "🟢" : "📊"}
                    </div>
                    <div>
                      <p className="font-medium capitalize">{conn.provider}</p>
                      <p className="text-sm text-muted-foreground">
                        {conn.config?.tenant_name ?? "Connected"}
                        {conn.last_sync_at && ` • Last synced: ${new Date(conn.last_sync_at).toLocaleDateString()}`}
                      </p>
                    </div>
                  </div>
                  <div className="flex items-center gap-2">
                    <Badge variant={conn.status === "connected" ? "default" : "destructive"}>
                      {conn.status}
                    </Badge>
                    <Button size="sm" variant="outline" onClick={() => openMapping(conn)}>
                      Account Mapping
                    </Button>
                    <Button
                      size="sm"
                      variant="outline"
                      onClick={() => triggerSync(conn.id)}
                      disabled={syncing === conn.id}
                    >
                      {syncing === conn.id ? <RefreshCw className="h-4 w-4 animate-spin" /> : <RefreshCw className="h-4 w-4" />}
                      <span className="ml-1">Sync</span>
                    </Button>
                    <Button size="sm" variant="ghost" className="text-red-600" onClick={() => disconnect(conn.id)}>
                      <Unlink className="h-4 w-4" />
                    </Button>
                  </div>
                </div>
              ))}
            </div>
          )}

          {syncResult && (
            <div className="mt-3 p-3 bg-slate-50 rounded border text-sm">
              {syncResult.error ? (
                <span className="text-red-600"><AlertCircle className="inline h-4 w-4 mr-1" />{syncResult.error}</span>
              ) : (
                <span>
                  <Check className="inline h-4 w-4 mr-1 text-green-600" />
                  Synced: {syncResult.synced} • Failed: {syncResult.failed} • Skipped: {syncResult.skipped}
                </span>
              )}
            </div>
          )}
        </CardContent>
      </Card>

      {/* Available Providers */}
      <Card>
        <CardHeader>
          <CardTitle className="text-lg">Connect Accounting Provider</CardTitle>
        </CardHeader>
        <CardContent>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
            {availableProviders.map(p => {
              const isConnected = connections.some(c => c.provider === p.id && c.status === "connected");
              return (
                <div key={p.id} className="flex items-center justify-between p-4 border rounded-lg">
                  <div className="flex items-center gap-3">
                    <span className="text-2xl">{p.logo}</span>
                    <div>
                      <p className="font-medium">{p.name}</p>
                      <p className="text-xs text-muted-foreground">{p.description}</p>
                    </div>
                  </div>
                  {isConnected ? (
                    <Badge variant="default"><Check className="h-3 w-3 mr-1" /> Connected</Badge>
                  ) : (
                    <Button size="sm" onClick={() => connectProvider(p.id)}>
                      <ArrowUpRight className="h-4 w-4 mr-1" /> Connect
                    </Button>
                  )}
                </div>
              );
            })}
          </div>
        </CardContent>
      </Card>

      {/* Account Mapping Panel */}
      {mappingConn && (
        <Card className="border-2 border-blue-200">
          <CardHeader>
            <div className="flex items-center justify-between">
              <CardTitle className="text-lg">
                Account Mapping — {mappingConn.provider.charAt(0).toUpperCase() + mappingConn.provider.slice(1)}
              </CardTitle>
              <div className="flex gap-2">
                <Button size="sm" variant="outline" onClick={() => setMappingConn(null)}>Cancel</Button>
                <Button size="sm" onClick={saveMappings}>Save Mappings</Button>
              </div>
            </div>
            <p className="text-sm text-muted-foreground">
              Map your internal ledger accounts to the corresponding accounts in {mappingConn.provider}.
              Unmapped accounts will use the same code.
            </p>
          </CardHeader>
          <CardContent>
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Internal Account</TableHead>
                  <TableHead>Code</TableHead>
                  <TableHead>→</TableHead>
                  <TableHead>External Account ({mappingConn.provider})</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {internalAccounts.map((acc: any) => (
                  <TableRow key={acc.code}>
                    <TableCell>{acc.name}</TableCell>
                    <TableCell className="font-mono text-xs">{acc.code}</TableCell>
                    <TableCell>→</TableCell>
                    <TableCell>
                      {externalAccounts.length > 0 ? (
                        <select
                          className="w-full p-1 border rounded text-sm"
                          value={mappings[acc.code] ?? ""}
                          onChange={e => setMappings(prev => ({ ...prev, [acc.code]: e.target.value }))}
                        >
                          <option value="">— Use same code —</option>
                          {externalAccounts.map((ext: any) => (
                            <option key={ext.code} value={ext.code}>
                              {ext.code} — {ext.name}
                            </option>
                          ))}
                        </select>
                      ) : (
                        <Input
                          placeholder="External account code"
                          value={mappings[acc.code] ?? ""}
                          onChange={e => setMappings(prev => ({ ...prev, [acc.code]: e.target.value }))}
                          className="h-8 text-sm"
                        />
                      )}
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </CardContent>
        </Card>
      )}

      {/* Configuration Required Dialog */}
      <Dialog open={!!configError} onOpenChange={() => setConfigError(null)}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <AlertCircle className="h-5 w-5 text-amber-600" />
              Configuration Required
            </DialogTitle>
          </DialogHeader>
          <div className="space-y-3 text-sm">
            <p>
              <strong>{configError ? configError.charAt(0).toUpperCase() + configError.slice(1) : ""}</strong> integration
              is not yet configured.
            </p>
            <p className="text-muted-foreground">
              To connect to {configError ? configError.charAt(0).toUpperCase() + configError.slice(1) : ""}, you first need to add your OAuth credentials
              (Client ID & Client Secret) in the Settings page.
            </p>
            <ol className="list-decimal list-inside text-muted-foreground space-y-1">
              <li>Go to <strong>Settings → Accounting Credentials</strong></li>
              <li>Click <strong>Configure</strong> next to {configError ? configError.charAt(0).toUpperCase() + configError.slice(1) : ""}</li>
              <li>Enter your Client ID and Client Secret from the provider's developer portal</li>
              <li>Come back here and click Connect</li>
            </ol>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setConfigError(null)}>Close</Button>
            <Button onClick={() => { setConfigError(null); window.location.href = "/settings"; }}>
              Go to Settings
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}

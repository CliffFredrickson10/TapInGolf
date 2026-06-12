import { useEffect, useRef, useState } from "react";
import { useSearch } from "wouter";
import * as XLSX from "xlsx";
import { api } from "@/lib/api";
import { useToast } from "@/hooks/use-toast";
import { useReadOnly } from "@/context/ReadOnlyContext";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Card, CardContent } from "@/components/ui/card";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Skeleton } from "@/components/ui/skeleton";
import {
  Plus, Trash2, UserCircle2, Upload, Download, FileSpreadsheet,
  CheckCircle2, XCircle, AlertCircle, ArrowLeft, Pencil, CalendarDays, RefreshCw,
} from "lucide-react";
import { format, parseISO } from "date-fns";

interface Member {
  id: number;
  membership_type: string;
  status: string;
  created_at: string;
  start_date: string | null;
  renewal_date: string | null;
  benefits: string | null;
  prepaid_rounds: number;
  prepaid_rounds_used: number;
  user_id: number;
  name: string;
  email: string;
  phone: string | null;
  handicap: number | null;
  date_of_birth: string | null;
  hna_number: string | null;
  student_number: string | null;
}

interface ImportRow {
  email: string;
  membership_type: string;
  start_date: string;
  renewal_date: string;
  benefits: string;
  prepaid_rounds: number;
  hna_number: string;
  student_number: string;
  _row: number;
  _error?: string;
}

interface ImportResult {
  added: number;
  renewed: number;
  pending: number;
  errors: string[];
}

interface PendingMember {
  id: number;
  email: string;
  hna_number: string | null;
  membership_type: string;
  status: string;
  start_date: string | null;
  renewal_date: string | null;
  benefits: string | null;
  prepaid_rounds: number;
  student_number: string | null;
  created_at: string;
}

// A member's HNA is "verified" while their membership is active and not past renewal.
function isVerified(status: string, renewal_date: string | null): boolean {
  if (status !== "active") return false;
  if (!renewal_date) return true;
  const r = new Date(String(renewal_date).slice(0, 10));
  const today = new Date(); today.setHours(0, 0, 0, 0);
  return r >= today;
}

const MEMBERSHIP_TYPES = [
  "full_member",
  "six_day_member",
  "week_day_member",
  "pensioner_full",
  "pensioner_six_day",
  "pensioner_week_day",
  "student_member",
  "junior_member",
  "honorary",
];

function membershipLabel(t: string) {
  return t.replace(/_/g, " ").replace(/\b\w/g, c => c.toUpperCase());
}

const STATUS_BADGE: Record<string, string> = {
  active: "bg-green-100 text-green-700",
  suspended: "bg-yellow-100 text-yellow-700",
  expired: "bg-red-100 text-red-700",
};

function fmtDate(d: string | null) {
  if (!d) return null;
  try { return format(parseISO(String(d).slice(0, 10)), "dd MMM yyyy"); } catch { return d; }
}

function downloadTemplate() {
  const ws = XLSX.utils.aoa_to_sheet([
    ["email", "membership_type", "start_date", "renewal_date", "benefits", "prepaid_rounds", "hna_number", "student_number"],
    ["john.smith@example.com", "standard", "2026-01-01", "2027-01-01", "Free range balls; Guest day", "12", "1234567890", ""],
    ["jane.doe@example.com", "premium", "2026-03-15", "2027-03-15", "Unlimited buggy use; Locker", "24", "9876543210", "STU2024001"],
  ]);
  ws["!cols"] = [{ wch: 32 }, { wch: 18 }, { wch: 14 }, { wch: 14 }, { wch: 36 }, { wch: 16 }, { wch: 16 }, { wch: 18 }];
  const wb = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(wb, ws, "Members");
  XLSX.writeFile(wb, "TapIn_Members_Import_Template.xlsx");
}

function parseSheet(file: File): Promise<ImportRow[]> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = e => {
      try {
        const data = new Uint8Array(e.target!.result as ArrayBuffer);
        const wb = XLSX.read(data, { type: "array" });
        const ws = wb.Sheets[wb.SheetNames[0]];
        const raw: any[] = XLSX.utils.sheet_to_json(ws, { defval: "" });
        const rows: ImportRow[] = raw.map((r, i) => {
          const email = String(r["email"] ?? "").trim().toLowerCase();
          const membership_type = String(r["membership_type"] ?? "standard").trim().toLowerCase();
          const start_date = String(r["start_date"] ?? "").trim();
          const renewal_date = String(r["renewal_date"] ?? "").trim();
          const benefits = String(r["benefits"] ?? "").trim();
          const prepaid_rounds = Number(r["prepaid_rounds"]) || 0;
          const hna_number = String(r["hna_number"] ?? "").trim().replace(/\D/g, "");
          const student_number = String(r["student_number"] ?? "").trim();
          const row: ImportRow = {
            email,
            membership_type: MEMBERSHIP_TYPES.includes(membership_type) ? membership_type : "standard",
            start_date,
            renewal_date,
            benefits,
            prepaid_rounds,
            hna_number,
            student_number,
            _row: i + 2,
          };
          if (!email || !email.includes("@")) row._error = "Invalid email";
          else if (!hna_number) row._error = "HNA number is required";
          else if (!membership_type) row._error = "Membership type is required";
          else if (!start_date) row._error = "Start date is required";
          else if (!renewal_date) row._error = "Renewal date is required";
          return row;
        }).filter(r => r.email !== "");
        resolve(rows);
      } catch {
        reject(new Error("Could not read file. Make sure it is a valid Excel (.xlsx) file."));
      }
    };
    reader.onerror = () => reject(new Error("File read error"));
    reader.readAsArrayBuffer(file);
  });
}

function ImportDialog({ onImported }: { onImported: () => void }) {
  const { toast } = useToast();
  const readOnly = useReadOnly();
  const fileRef = useRef<HTMLInputElement>(null);
  const [open, setOpen] = useState(false);
  const [step, setStep] = useState<"upload" | "preview" | "result">("upload");
  const [rows, setRows] = useState<ImportRow[]>([]);
  const [result, setResult] = useState<ImportResult | null>(null);
  const [importing, setImporting] = useState(false);
  const [fileName, setFileName] = useState("");

  const reset = () => { setStep("upload"); setRows([]); setResult(null); setFileName(""); if (fileRef.current) fileRef.current.value = ""; };

  const handleFileChange = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    setFileName(file.name);
    try {
      const parsed = await parseSheet(file);
      if (parsed.length === 0) { toast({ title: "No rows found", description: "The spreadsheet appears to be empty.", variant: "destructive" }); return; }
      setRows(parsed);
      setStep("preview");
    } catch (err: any) {
      toast({ title: "Parse error", description: err.message, variant: "destructive" });
    }
  };

  const validRows = rows.filter(r => !r._error);
  const errorRows = rows.filter(r => r._error);

  const handleImport = async () => {
    setImporting(true);
    try {
      const res = await api<ImportResult>("/api/portal/members/import", {
        method: "POST",
        body: JSON.stringify({
          rows: validRows.map(r => ({
            email: r.email,
            hna_number: r.hna_number || null,
            membership_type: r.membership_type,
            start_date: r.start_date || null,
            renewal_date: r.renewal_date || null,
            benefits: r.benefits || null,
            prepaid_rounds: r.prepaid_rounds,
            student_number: r.student_number || null,
          })),
        }),
      });
      setResult(res);
      setStep("result");
      onImported();
    } catch (err: any) {
      toast({ title: "Import failed", description: err.message, variant: "destructive" });
    } finally {
      setImporting(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={v => { setOpen(v); if (!v) reset(); }}>
      <DialogTrigger asChild>
        <Button variant="outline" className="gap-2 border-[#1a5c38] text-[#1a5c38] hover:bg-[#1a5c38]/5">
          <FileSpreadsheet className="h-4 w-4" />Import from Excel
        </Button>
      </DialogTrigger>
      <DialogContent className="max-w-3xl max-h-[85vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <FileSpreadsheet className="h-5 w-5 text-[#1a5c38]" />Import Members from Excel
          </DialogTitle>
        </DialogHeader>

        {step === "upload" && (
          <div className="space-y-5 py-2">
            <div className="rounded-lg border border-amber-200 bg-amber-50 p-4 space-y-3">
              <p className="text-sm font-semibold text-amber-800">Step 1 — Download the template</p>
              <p className="text-xs text-amber-700">
                Download the required Excel template, fill in your members' details, then upload the completed file below.
                Each row needs an <strong>email</strong> and an <strong>HNA number</strong>. If the golfer already has a
                TapIn Golf account it links immediately; if not, the row is held and links automatically when they sign up.
              </p>
              <div className="rounded border border-amber-200 bg-white text-xs px-3 py-2 font-mono text-amber-900">
                email · membership_type · start_date · renewal_date · benefits · prepaid_rounds · hna_number · student_number
              </div>
              <Button variant="outline" className="gap-2 border-amber-400 text-amber-800 hover:bg-amber-100" onClick={downloadTemplate}>
                <Download className="h-4 w-4" />Download Template (.xlsx)
              </Button>
            </div>

            <div className="space-y-2">
              <p className="text-sm font-semibold text-gray-700">Step 2 — Upload completed file</p>
              <p className="text-xs text-muted-foreground">Only <strong>.xlsx</strong> files are accepted.</p>
              <label
                className="flex flex-col items-center justify-center gap-3 border-2 border-dashed border-[#1a5c38]/30 rounded-xl p-8 cursor-pointer hover:border-[#1a5c38]/60 hover:bg-[#1a5c38]/5 transition-colors"
                onClick={() => fileRef.current?.click()}
              >
                <Upload className="h-8 w-8 text-[#1a5c38]/50" />
                <div className="text-center">
                  <p className="text-sm font-medium text-[#1a5c38]">Click to choose file</p>
                  <p className="text-xs text-muted-foreground mt-0.5">Excel spreadsheet (.xlsx)</p>
                </div>
              </label>
              <input ref={fileRef} type="file" accept=".xlsx,.xls" className="hidden" onChange={handleFileChange} />
            </div>
          </div>
        )}

        {step === "preview" && (
          <div className="space-y-4 py-2">
            <div className="flex items-center gap-2 text-xs text-muted-foreground">
              <button onClick={reset} className="flex items-center gap-1 hover:text-foreground"><ArrowLeft className="h-3.5 w-3.5" />Back</button>
              <span>·</span>
              <span className="truncate">{fileName}</span>
            </div>

            <div className="flex items-center gap-4 flex-wrap">
              <div className="flex items-center gap-1.5 text-sm">
                <CheckCircle2 className="h-4 w-4 text-green-600" />
                <span className="font-medium text-green-700">{validRows.length}</span>
                <span className="text-muted-foreground">ready to import</span>
              </div>
              {errorRows.length > 0 && (
                <div className="flex items-center gap-1.5 text-sm">
                  <XCircle className="h-4 w-4 text-red-500" />
                  <span className="font-medium text-red-600">{errorRows.length}</span>
                  <span className="text-muted-foreground">will be skipped (invalid)</span>
                </div>
              )}
            </div>

            <div className="border rounded-lg overflow-auto">
              <table className="w-full text-xs">
                <thead>
                  <tr className="bg-muted/60 text-left">
                    <th className="px-2 py-2 font-semibold">Row</th>
                    <th className="px-2 py-2 font-semibold">Email</th>
                    <th className="px-2 py-2 font-semibold">HNA</th>
                    <th className="px-2 py-2 font-semibold">Type</th>
                    <th className="px-2 py-2 font-semibold">Start</th>
                    <th className="px-2 py-2 font-semibold">Renewal</th>
                    <th className="px-2 py-2 font-semibold">Rounds</th>
                    <th className="px-2 py-2 font-semibold">Status</th>
                  </tr>
                </thead>
                <tbody className="divide-y">
                  {rows.map(r => (
                    <tr key={r._row} className={r._error ? "bg-red-50" : ""}>
                      <td className="px-2 py-1.5 text-muted-foreground">{r._row}</td>
                      <td className="px-2 py-1.5 font-mono">{r.email}</td>
                      <td className="px-2 py-1.5 font-mono">{r.hna_number || "—"}</td>
                      <td className="px-2 py-1.5">{membershipLabel(r.membership_type)}</td>
                      <td className="px-2 py-1.5">{r.start_date || "—"}</td>
                      <td className="px-2 py-1.5">{r.renewal_date || "—"}</td>
                      <td className="px-2 py-1.5">{r.prepaid_rounds || "—"}</td>
                      <td className="px-2 py-1.5">
                        {r._error
                          ? <span className="text-red-600 flex items-center gap-1"><XCircle className="h-3 w-3" />{r._error}</span>
                          : <span className="text-green-600 flex items-center gap-1"><CheckCircle2 className="h-3 w-3" />Valid</span>
                        }
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>

            {validRows.length === 0 ? (
              <p className="text-sm text-red-600 text-center py-2">No valid rows to import. Please fix the errors in your file and try again.</p>
            ) : (
              <Button className="w-full bg-[#1a5c38] hover:bg-[#164d30] gap-2" onClick={handleImport} disabled={importing || readOnly}>
                <Upload className="h-4 w-4" />
                {importing ? "Importing…" : `Import ${validRows.length} Member${validRows.length !== 1 ? "s" : ""}`}
              </Button>
            )}
          </div>
        )}

        {step === "result" && result && (
          <div className="space-y-4 py-2">
            <div className="grid grid-cols-3 gap-3">
              <div className="rounded-lg border border-green-200 bg-green-50 p-4 text-center">
                <p className="text-3xl font-bold text-green-700">{result.added}</p>
                <p className="text-xs text-green-600 mt-1">Added & verified</p>
              </div>
              <div className="rounded-lg border border-blue-200 bg-blue-50 p-4 text-center">
                <p className="text-3xl font-bold text-blue-700">{result.renewed}</p>
                <p className="text-xs text-blue-600 mt-1">Renewed</p>
              </div>
              <div className="rounded-lg border border-amber-200 bg-amber-50 p-4 text-center">
                <p className="text-3xl font-bold text-amber-700">{result.pending}</p>
                <p className="text-xs text-amber-600 mt-1">Held (no account)</p>
              </div>
            </div>

            {result.pending > 0 && (
              <div className="rounded-lg border border-amber-200 bg-amber-50 p-3 space-y-2">
                <div className="flex items-center gap-2 text-sm font-semibold text-amber-800">
                  <AlertCircle className="h-4 w-4" />
                  {result.pending} member{result.pending !== 1 ? "s" : ""} held — no TapIn Golf account yet
                </div>
                <p className="text-xs text-amber-700">
                  These golfers haven't registered yet. They're saved in your pending list and will be verified automatically the moment they sign up with that email.
                </p>
              </div>
            )}

            {result.errors.length > 0 && (
              <div className="rounded-lg border border-red-200 bg-red-50 p-3 space-y-1">
                <p className="text-sm font-semibold text-red-700">Errors</p>
                <ul className="text-xs text-red-600 space-y-0.5 max-h-24 overflow-y-auto">
                  {result.errors.map((e, i) => <li key={i}>· {e}</li>)}
                </ul>
              </div>
            )}

            <Button className="w-full bg-[#1a5c38] hover:bg-[#164d30]" onClick={() => { setOpen(false); reset(); }}>Done</Button>
          </div>
        )}
      </DialogContent>
    </Dialog>
  );
}

function EditMemberDialog({ member, onUpdated }: { member: Member; onUpdated: () => void }) {
  const { toast } = useToast();
  const readOnly = useReadOnly();
  const [open, setOpen] = useState(false);
  const [saving, setSaving] = useState(false);
  const [form, setForm] = useState({
    membership_type: member.membership_type,
    status: member.status,
    start_date: member.start_date ? String(member.start_date).slice(0, 10) : "",
    renewal_date: member.renewal_date ? String(member.renewal_date).slice(0, 10) : "",
    benefits: member.benefits ?? "",
    prepaid_rounds: String(member.prepaid_rounds),
    hna_number: member.hna_number ?? "",
  });

  const handleSave = async () => {
    const hnaClean = form.hna_number.trim().replace(/\D/g, "");
    if (!hnaClean) { toast({ title: "HNA number required", variant: "destructive" }); return; }
    setSaving(true);
    try {
      await api(`/api/portal/members/${member.id}`, {
        method: "PUT",
        body: JSON.stringify({
          membership_type: form.membership_type,
          status: form.status,
          start_date: form.start_date || null,
          renewal_date: form.renewal_date || null,
          benefits: form.benefits || null,
          prepaid_rounds: Number(form.prepaid_rounds) || 0,
          hna_number: hnaClean,
        }),
      });
      toast({ title: "Member updated" });
      setOpen(false);
      onUpdated();
    } catch (e: any) {
      toast({ title: "Error", description: e.message, variant: "destructive" });
    } finally {
      setSaving(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button variant="ghost" size="icon" className="h-7 w-7 text-[#1a5c38]"><Pencil className="h-3.5 w-3.5" /></Button>
      </DialogTrigger>
      <DialogContent className="max-w-md">
        <DialogHeader><DialogTitle>Edit Member — {member.name}</DialogTitle></DialogHeader>
        <div className="space-y-3 py-2">
          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-1.5">
              <Label>Membership Type</Label>
              <Select value={form.membership_type} onValueChange={v => setForm(f => ({ ...f, membership_type: v }))}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  {MEMBERSHIP_TYPES.map(t => <SelectItem key={t} value={t}>{membershipLabel(t)}</SelectItem>)}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-1.5">
              <Label>Status</Label>
              <Select value={form.status} onValueChange={v => setForm(f => ({ ...f, status: v }))}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="active">Active</SelectItem>
                  <SelectItem value="suspended">Suspended</SelectItem>
                  <SelectItem value="expired">Expired</SelectItem>
                </SelectContent>
              </Select>
            </div>
          </div>

          <div className="space-y-1.5">
            <Label>HNA Number</Label>
            <Input
              type="text"
              inputMode="numeric"
              value={form.hna_number}
              onChange={e => setForm(f => ({ ...f, hna_number: e.target.value.replace(/\D/g, "") }))}
              placeholder="e.g. 1234567890"
              maxLength={20}
              className="h-8 text-sm font-mono"
            />
            <p className="text-xs text-muted-foreground">The club is the authority on this number — it overwrites and locks the golfer's HNA.</p>
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-1.5">
              <Label>Start Date</Label>
              <Input type="date" value={form.start_date} onChange={e => setForm(f => ({ ...f, start_date: e.target.value }))} className="h-8 text-sm" />
            </div>
            <div className="space-y-1.5">
              <Label>Renewal Date</Label>
              <Input type="date" value={form.renewal_date} onChange={e => setForm(f => ({ ...f, renewal_date: e.target.value }))} className="h-8 text-sm" />
            </div>
          </div>

          <div className="space-y-1.5">
            <Label>Prepaid Rounds</Label>
            <div className="flex items-center gap-2">
              <Input
                type="number" min={0}
                value={form.prepaid_rounds}
                onChange={e => setForm(f => ({ ...f, prepaid_rounds: e.target.value }))}
                className="h-8 text-sm w-28"
              />
              <span className="text-xs text-muted-foreground">
                {member.prepaid_rounds_used} used · {Math.max(0, member.prepaid_rounds - member.prepaid_rounds_used)} remaining (current)
              </span>
            </div>
          </div>

          <div className="space-y-1.5">
            <Label>Benefits</Label>
            <Textarea
              placeholder="e.g. Free range balls; Guest day; Locker access"
              value={form.benefits}
              onChange={e => setForm(f => ({ ...f, benefits: e.target.value }))}
              className="text-sm min-h-[72px]"
            />
            <p className="text-xs text-muted-foreground">Separate multiple benefits with a semicolon (;)</p>
          </div>

          <Button className="w-full bg-[#1a5c38] hover:bg-[#164d30]" onClick={handleSave} disabled={saving || readOnly}>
            {saving ? "Saving…" : "Save Changes"}
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}

function PrepaidBadge({ total, used }: { total: number; used: number }) {
  if (total === 0) return null;
  const remaining = Math.max(0, total - used);
  const pct = Math.round((remaining / total) * 100);
  const colour = remaining === 0 ? "bg-red-100 text-red-700" : remaining <= 3 ? "bg-amber-100 text-amber-700" : "bg-green-100 text-green-700";
  return (
    <span className={`text-xs px-2 py-0.5 rounded-full font-medium ${colour}`}>
      {remaining}/{total} rounds
      {pct <= 25 && remaining > 0 && <span className="ml-1">⚠</span>}
    </span>
  );
}

export default function Members() {
  const { toast } = useToast();
  const readOnly = useReadOnly();
  const urlSearch = useSearch();
  const [members, setMembers] = useState<Member[]>([]);
  const [loading, setLoading] = useState(true);
  const [email, setEmail] = useState("");
  const [hnaNumber, setHnaNumber] = useState("");
  const [membershipType, setMembershipType] = useState("standard");
  const [startDate, setStartDate] = useState("");
  const [renewalDate, setRenewalDate] = useState("");
  const [benefits, setBenefits] = useState("");
  const [prepaidRounds, setPrepaidRounds] = useState("0");
  const [open, setOpen] = useState(false);
  const [adding, setAdding] = useState(false);
  const [search, setSearch] = useState("");
  const [pending, setPending] = useState<PendingMember[]>([]);
  const [selected, setSelected] = useState<number[]>([]);
  const [renewOpen, setRenewOpen] = useState(false);
  const [renewDate, setRenewDate] = useState("");
  const [renewing, setRenewing] = useState(false);

  const load = () => {
    setLoading(true);
    api<Member[]>("/api/portal/members")
      .then(m => { setMembers(m); setSelected(s => s.filter(id => m.some(x => x.id === id))); })
      .catch(e => toast({ title: "Error", description: e.message, variant: "destructive" }))
      .finally(() => setLoading(false));
  };
  const loadPending = () => {
    api<PendingMember[]>("/api/portal/pending-members")
      .then(setPending)
      .catch(() => { /* pending list is best-effort */ });
  };
  useEffect(() => { load(); loadPending(); }, []);

  useEffect(() => {
    const params = new URLSearchParams(urlSearch);
    if (params.get("action") === "new") setOpen(true);
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  const reloadAll = () => { load(); loadPending(); };

  const toggleSelect = (id: number) => setSelected(s => s.includes(id) ? s.filter(x => x !== id) : [...s, id]);

  const handleBulkRenew = async () => {
    if (selected.length === 0) { toast({ title: "Select members to renew", variant: "destructive" }); return; }
    if (!renewDate) { toast({ title: "Pick a new renewal date", variant: "destructive" }); return; }
    setRenewing(true);
    try {
      await api("/api/portal/members/bulk-renew", {
        method: "POST",
        body: JSON.stringify({ ids: selected, renewal_date: renewDate }),
      });
      toast({ title: `Renewed ${selected.length} member${selected.length !== 1 ? "s" : ""}` });
      setRenewOpen(false); setRenewDate(""); setSelected([]);
      load();
    } catch (e: any) {
      toast({ title: "Error", description: e.message, variant: "destructive" });
    } finally {
      setRenewing(false);
    }
  };

  const handleRemovePending = async (id: number) => {
    if (!confirm("Remove this pending member?")) return;
    try {
      await api(`/api/portal/pending-members/${id}`, { method: "DELETE" });
      setPending(p => p.filter(x => x.id !== id));
      toast({ title: "Pending member removed" });
    } catch (e: any) {
      toast({ title: "Error", description: e.message, variant: "destructive" });
    }
  };

  const resetAddForm = () => { setEmail(""); setHnaNumber(""); setMembershipType("standard"); setStartDate(""); setRenewalDate(""); setBenefits(""); setPrepaidRounds("0"); };

  const handleAdd = async () => {
    if (!email) { toast({ title: "Email required", variant: "destructive" }); return; }
    const hnaClean = hnaNumber.trim().replace(/\D/g, "");
    if (!hnaClean) { toast({ title: "HNA number required", description: "Every member must have an HNA number.", variant: "destructive" }); return; }
    if (!membershipType) { toast({ title: "Membership type required", variant: "destructive" }); return; }
    if (!startDate) { toast({ title: "Start date required", variant: "destructive" }); return; }
    if (!renewalDate) { toast({ title: "Renewal date required", variant: "destructive" }); return; }
    setAdding(true);
    try {
      await api("/api/portal/members", {
        method: "POST",
        body: JSON.stringify({
          email,
          hna_number: hnaClean,
          membership_type: membershipType,
          start_date: startDate || null,
          renewal_date: renewalDate || null,
          benefits: benefits || null,
          prepaid_rounds: Number(prepaidRounds) || 0,
        }),
      });
      toast({ title: "Member added" });
      setOpen(false);
      resetAddForm();
      reloadAll();
    } catch (e: any) {
      toast({ title: "Error", description: e.message, variant: "destructive" });
    } finally {
      setAdding(false);
    }
  };

  const handleRemove = async (id: number) => {
    if (!confirm("Remove this member?")) return;
    try {
      await api(`/api/portal/members/${id}`, { method: "DELETE" });
      setMembers(m => m.filter(x => x.id !== id));
      toast({ title: "Member removed" });
    } catch (e: any) {
      toast({ title: "Error", description: e.message, variant: "destructive" });
    }
  };

  const filtered = members.filter(m =>
    m.name.toLowerCase().includes(search.toLowerCase()) ||
    m.email.toLowerCase().includes(search.toLowerCase())
  );

  return (
    <div className="p-8 space-y-6">
      <div className="flex items-center justify-between gap-3 flex-wrap">
        <div>
          <h1 className="text-3xl font-bold tracking-tight">Members</h1>
          <p className="text-muted-foreground mt-1">{members.length} registered member{members.length !== 1 ? "s" : ""}.</p>
        </div>
        <div className="flex items-center gap-2 flex-wrap">
          <Dialog open={renewOpen} onOpenChange={v => { setRenewOpen(v); if (!v) setRenewDate(""); }}>
            <DialogTrigger asChild>
              <Button
                variant="outline"
                disabled={selected.length === 0}
                className="gap-2 border-blue-400 text-blue-700 hover:bg-blue-50 disabled:opacity-40"
              >
                <RefreshCw className="h-4 w-4" />
                Renew{selected.length > 0 ? ` (${selected.length})` : ""}
              </Button>
            </DialogTrigger>
            <DialogContent className="max-w-sm">
              <DialogHeader><DialogTitle>Renew {selected.length} member{selected.length !== 1 ? "s" : ""}</DialogTitle></DialogHeader>
              <div className="space-y-3 py-2">
                <p className="text-sm text-muted-foreground">Set a new renewal date and reactivate the selected memberships. Their HNAs stay verified until this date.</p>
                <div className="space-y-1.5">
                  <Label>New Renewal Date *</Label>
                  <Input type="date" value={renewDate} onChange={e => setRenewDate(e.target.value)} className="h-9 text-sm" />
                </div>
                <Button className="w-full bg-[#1a5c38] hover:bg-[#164d30]" onClick={handleBulkRenew} disabled={renewing || readOnly}>
                  {renewing ? "Renewing…" : "Confirm Renewal"}
                </Button>
              </div>
            </DialogContent>
          </Dialog>
          <ImportDialog onImported={reloadAll} />
          <Dialog open={open} onOpenChange={v => { setOpen(v); if (!v) resetAddForm(); }}>
            <DialogTrigger asChild>
              <Button className="bg-[#1a5c38] hover:bg-[#164d30] gap-2" disabled={readOnly}><Plus className="h-4 w-4" />Add Member</Button>
            </DialogTrigger>
            <DialogContent className="max-w-md">
              <DialogHeader><DialogTitle>Add Member</DialogTitle></DialogHeader>
              <div className="space-y-3 py-2">
                <p className="text-sm text-muted-foreground">Enter the golfer's email. If they already have a TapIn Golf account they're verified immediately; if not, they're held in your pending list and verified automatically when they sign up.</p>

                <div className="space-y-1.5">
                  <Label>Golfer Email *</Label>
                  <Input type="email" value={email} onChange={e => setEmail(e.target.value)} placeholder="golfer@example.com" />
                </div>

                <div className="space-y-1.5">
                  <Label>HNA Number *</Label>
                  <Input
                    type="text"
                    inputMode="numeric"
                    value={hnaNumber}
                    onChange={e => setHnaNumber(e.target.value.replace(/\D/g, ""))}
                    placeholder="e.g. 1234567890"
                    maxLength={20}
                  />
                  <p className="text-xs text-muted-foreground">Digits only — the club is the authority, so this overwrites and locks the golfer's HNA.</p>
                </div>

                <div className="space-y-1.5">
                  <Label>Membership Type *</Label>
                  <Select value={membershipType} onValueChange={setMembershipType}>
                    <SelectTrigger><SelectValue /></SelectTrigger>
                    <SelectContent>
                      {MEMBERSHIP_TYPES.map(t => <SelectItem key={t} value={t}>{membershipLabel(t)}</SelectItem>)}
                    </SelectContent>
                  </Select>
                </div>

                <div className="grid grid-cols-2 gap-3">
                  <div className="space-y-1.5">
                    <Label>Start Date *</Label>
                    <Input type="date" value={startDate} onChange={e => setStartDate(e.target.value)} className="h-8 text-sm" />
                  </div>
                  <div className="space-y-1.5">
                    <Label>Renewal Date *</Label>
                    <Input type="date" value={renewalDate} onChange={e => setRenewalDate(e.target.value)} className="h-8 text-sm" />
                  </div>
                </div>

                <div className="space-y-1.5">
                  <Label>Prepaid Rounds</Label>
                  <Input type="number" min={0} value={prepaidRounds} onChange={e => setPrepaidRounds(e.target.value)} className="h-8 text-sm w-28" placeholder="0" />
                </div>

                <div className="space-y-1.5">
                  <Label>Benefits</Label>
                  <Textarea
                    placeholder="e.g. Free range balls; Guest day; Locker access"
                    value={benefits}
                    onChange={e => setBenefits(e.target.value)}
                    className="text-sm min-h-[60px]"
                  />
                  <p className="text-xs text-muted-foreground">Separate multiple benefits with a semicolon (;)</p>
                </div>

                <Button className="w-full bg-[#1a5c38] hover:bg-[#164d30]" onClick={handleAdd} disabled={adding || readOnly}>
                  {adding ? "Adding…" : "Add Member"}
                </Button>
              </div>
            </DialogContent>
          </Dialog>
        </div>
      </div>

      <Input placeholder="Search by name or email…" value={search} onChange={e => setSearch(e.target.value)} className="max-w-sm" />

      {loading ? <Skeleton className="h-48 w-full" /> : (
        filtered.length === 0 ? (
          <Card>
            <CardContent className="py-12 text-center text-muted-foreground">
              {search ? "No members match your search." : "No members yet. Add your first member above."}
            </CardContent>
          </Card>
        ) : (
          <div className="space-y-2">
            {filtered.map(m => {
              const benefitList = m.benefits ? m.benefits.split(";").map(b => b.trim()).filter(Boolean) : [];
              const renewalDate = m.renewal_date ? String(m.renewal_date).slice(0, 10) : null;
              const isExpiringSoon = renewalDate && new Date(renewalDate) <= new Date(Date.now() + 30 * 86400000);

              return (
                <Card key={m.id}>
                  <CardContent className="p-4">
                    <div className="flex items-start gap-4">
                      <input
                        type="checkbox"
                        checked={selected.includes(m.id)}
                        onChange={() => toggleSelect(m.id)}
                        className="mt-2 h-4 w-4 accent-[#1a5c38] cursor-pointer flex-shrink-0"
                        aria-label={`Select ${m.name}`}
                      />
                      <div className="w-10 h-10 rounded-full bg-[#1a5c38]/10 flex items-center justify-center flex-shrink-0 mt-0.5">
                        <UserCircle2 className="h-6 w-6 text-[#1a5c38]" />
                      </div>
                      <div className="flex-1 min-w-0 space-y-1.5">
                        <div className="flex items-center gap-2 flex-wrap">
                          <span className="font-medium text-sm">{m.name}</span>
                          {isVerified(m.status, m.renewal_date) ? (
                            <span className="text-xs px-2 py-0.5 rounded-full font-medium bg-green-100 text-green-700 flex items-center gap-1">
                              <CheckCircle2 className="h-3 w-3" />HNA Verified
                            </span>
                          ) : (
                            <span className="text-xs px-2 py-0.5 rounded-full font-medium bg-red-100 text-red-700 flex items-center gap-1">
                              <XCircle className="h-3 w-3" />Not verified
                            </span>
                          )}
                          <span className={`text-xs px-2 py-0.5 rounded-full font-medium ${STATUS_BADGE[m.status] ?? "bg-gray-100 text-gray-700"}`}>{m.status}</span>
                          <span className="text-xs bg-muted px-2 py-0.5 rounded-full">{membershipLabel(m.membership_type)}</span>
                          <PrepaidBadge total={Number(m.prepaid_rounds)} used={Number(m.prepaid_rounds_used)} />
                        </div>
                        <p className="text-xs text-muted-foreground">
                          {m.email}{m.phone ? ` · ${m.phone}` : ""}{m.date_of_birth ? ` · DOB: ${fmtDate(m.date_of_birth)}` : ""}{m.handicap != null ? ` · HCP ${m.handicap}` : ""}{m.hna_number ? ` · HNA: ${m.hna_number}` : ""}{(() => { if (!m.date_of_birth || !m.student_number) return ""; const b = new Date(m.date_of_birth); const t = new Date(); let a = t.getFullYear() - b.getFullYear(); const mo = t.getMonth() - b.getMonth(); if (mo < 0 || (mo === 0 && t.getDate() < b.getDate())) a--; return a >= 18 && a <= 24 ? ` · Student: ${m.student_number}` : ""; })()}
                        </p>
                        <div className="flex items-center gap-3 flex-wrap text-xs text-muted-foreground">
                          <span className="flex items-center gap-1">
                            <CalendarDays className="h-3 w-3" />
                            Member since {format(new Date(m.created_at), "dd MMM yyyy")}
                          </span>
                          {m.start_date && <span>Start: {fmtDate(m.start_date)}</span>}
                          {m.renewal_date && (
                            <span className={isExpiringSoon ? "text-amber-600 font-medium" : ""}>
                              Renewal: {fmtDate(m.renewal_date)}{isExpiringSoon ? " ⚠" : ""}
                            </span>
                          )}
                        </div>
                        {benefitList.length > 0 && (
                          <div className="flex flex-wrap gap-1 pt-0.5">
                            {benefitList.map((b, i) => (
                              <span key={i} className="text-xs bg-[#1a5c38]/8 text-[#1a5c38] border border-[#1a5c38]/20 px-2 py-0.5 rounded-full">{b}</span>
                            ))}
                          </div>
                        )}
                      </div>
                      <div className="flex items-center gap-1 flex-shrink-0">
                        <EditMemberDialog member={m} onUpdated={load} />
                        <Button variant="ghost" size="icon" className="h-7 w-7 text-destructive" onClick={() => handleRemove(m.id)}>
                          <Trash2 className="h-3.5 w-3.5" />
                        </Button>
                      </div>
                    </div>
                  </CardContent>
                </Card>
              );
            })}
          </div>
        )
      )}

      {pending.length > 0 && (
        <div className="space-y-2 pt-4">
          <div className="flex items-center gap-2">
            <AlertCircle className="h-4 w-4 text-amber-600" />
            <h2 className="text-lg font-semibold">Pending members ({pending.length})</h2>
          </div>
          <p className="text-sm text-muted-foreground">
            These golfers don't have a TapIn Golf account yet. Their membership links and verifies automatically the moment they register with the matching email.
          </p>
          <div className="space-y-2">
            {pending.map(p => (
              <Card key={p.id} className="border-amber-200 bg-amber-50/40">
                <CardContent className="p-4">
                  <div className="flex items-start gap-4">
                    <div className="w-10 h-10 rounded-full bg-amber-100 flex items-center justify-center flex-shrink-0 mt-0.5">
                      <AlertCircle className="h-5 w-5 text-amber-600" />
                    </div>
                    <div className="flex-1 min-w-0 space-y-1.5">
                      <div className="flex items-center gap-2 flex-wrap">
                        <span className="font-medium text-sm">{p.email}</span>
                        <span className="text-xs px-2 py-0.5 rounded-full font-medium bg-amber-100 text-amber-700">Awaiting signup</span>
                        <span className="text-xs bg-muted px-2 py-0.5 rounded-full">{membershipLabel(p.membership_type)}</span>
                      </div>
                      <p className="text-xs text-muted-foreground">
                        {p.hna_number ? `HNA: ${p.hna_number}` : "No HNA"}
                        {p.start_date ? ` · Start: ${fmtDate(p.start_date)}` : ""}
                        {p.renewal_date ? ` · Renewal: ${fmtDate(p.renewal_date)}` : ""}
                        {p.prepaid_rounds ? ` · ${p.prepaid_rounds} prepaid rounds` : ""}
                        {p.student_number ? ` · Student: ${p.student_number}` : ""}
                      </p>
                    </div>
                    <Button variant="ghost" size="icon" className="h-7 w-7 text-destructive flex-shrink-0" onClick={() => handleRemovePending(p.id)}>
                      <Trash2 className="h-3.5 w-3.5" />
                    </Button>
                  </div>
                </CardContent>
              </Card>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}

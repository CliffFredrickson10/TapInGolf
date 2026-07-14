import { useEffect, useState } from "react";
import { api } from "@/lib/api";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { format } from "date-fns";
import { Banknote, ChevronLeft, ChevronRight, ChevronDown, ChevronUp } from "lucide-react";

interface SplitPayment {
  id: number;
  booking_id: number;
  club_id: number;
  total_amount: string;
  tapin_fee: string;
  club_amount: string;
  players: number;
  club_merchant_id: string | null;
  status: "pending" | "completed" | "failed";
  payfast_payload: Record<string, string> | null;
  payfast_response: Record<string, string> | null;
  created_at: string;
  updated_at: string;
  club_name: string;
  booking_ref: string;
  player_name: string;
  player_email: string;
}

const STATUS_COLORS: Record<string, string> = {
  pending: "bg-yellow-100 text-yellow-800",
  completed: "bg-emerald-100 text-emerald-800",
  failed: "bg-red-100 text-red-800",
};

function JsonPanel({ label, data }: { label: string; data: Record<string, string> | null }) {
  if (!data) return <span className="text-gray-400 text-xs italic">—</span>;
  return (
    <div className="mt-1">
      <p className="text-xs font-semibold text-gray-500 mb-1">{label}</p>
      <pre className="bg-gray-50 border rounded p-2 text-xs overflow-x-auto max-h-48 whitespace-pre-wrap break-all">
        {JSON.stringify(data, null, 2)}
      </pre>
    </div>
  );
}

function ExpandableRow({ sp }: { sp: SplitPayment }) {
  const [expanded, setExpanded] = useState(false);
  return (
    <>
      <tr className="border-b hover:bg-gray-50 cursor-pointer" onClick={() => setExpanded(!expanded)}>
        <td className="px-3 py-2 whitespace-nowrap">
          {format(new Date(sp.created_at), "dd MMM yyyy HH:mm")}
        </td>
        <td className="px-3 py-2 font-mono text-xs">{sp.booking_ref}</td>
        <td className="px-3 py-2">
          <div>{sp.player_name}</div>
          <div className="text-xs text-gray-400">{sp.player_email}</div>
        </td>
        <td className="px-3 py-2">{sp.club_name}</td>
        <td className="px-3 py-2 text-right">R{Number(sp.total_amount).toFixed(2)}</td>
        <td className="px-3 py-2 text-right font-semibold text-emerald-700">
          R{Number(sp.tapin_fee).toFixed(2)}
        </td>
        <td className="px-3 py-2 text-right">R{Number(sp.club_amount).toFixed(2)}</td>
        <td className="px-3 py-2 text-center">{sp.players}</td>
        <td className="px-3 py-2 text-center font-mono text-xs">
          {sp.club_merchant_id || "—"}
        </td>
        <td className="px-3 py-2 text-center">
          <span className={`inline-block rounded-full px-2 py-0.5 text-xs font-medium ${STATUS_COLORS[sp.status] ?? ""}`}>
            {sp.status}
          </span>
        </td>
        <td className="px-3 py-2 text-center">
          {expanded ? <ChevronUp className="h-4 w-4 inline" /> : <ChevronDown className="h-4 w-4 inline" />}
        </td>
      </tr>
      {expanded && (
        <tr className="border-b bg-gray-50/50">
          <td colSpan={11} className="px-4 py-3">
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <JsonPanel label="PayFast Payload (Sent)" data={sp.payfast_payload} />
              <JsonPanel label="PayFast Response (IPN)" data={sp.payfast_response} />
            </div>
          </td>
        </tr>
      )}
    </>
  );
}

export default function StaffSplitPayments() {
  const [payments, setPayments] = useState<SplitPayment[]>([]);
  const [total, setTotal] = useState(0);
  const [page, setPage] = useState(1);
  const [filter, setFilter] = useState<string>("");
  const [loading, setLoading] = useState(true);
  const limit = 25;

  useEffect(() => {
    setLoading(true);
    const params = new URLSearchParams({ page: String(page), limit: String(limit) });
    if (filter) params.set("status", filter);
    api<{ payments: SplitPayment[]; total: number }>(`/api/admin/split-payments?${params}`)
      .then((data) => {
        setPayments(data.payments);
        setTotal(data.total);
      })
      .finally(() => setLoading(false));
  }, [page, filter]);

  const totalPages = Math.ceil(total / limit);

  return (
    <div className="space-y-6 p-4">
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-bold flex items-center gap-2">
          <Banknote className="h-6 w-6" /> Split Payments
        </h1>
        <div className="flex gap-2">
          {["", "pending", "completed", "failed"].map((s) => (
            <Button
              key={s}
              size="sm"
              variant={filter === s ? "default" : "outline"}
              onClick={() => { setFilter(s); setPage(1); }}
            >
              {s || "All"}
            </Button>
          ))}
        </div>
      </div>

      <Card>
        <CardHeader>
          <CardTitle className="text-lg">
            {total} payment{total !== 1 ? "s" : ""}
          </CardTitle>
        </CardHeader>
        <CardContent>
          {loading ? (
            <div className="space-y-2">
              {Array.from({ length: 5 }).map((_, i) => (
                <Skeleton key={i} className="h-12 w-full" />
              ))}
            </div>
          ) : payments.length === 0 ? (
            <p className="text-gray-500 text-center py-8">No split payments found.</p>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b text-left text-gray-500">
                    <th className="px-3 py-2">Date</th>
                    <th className="px-3 py-2">Booking</th>
                    <th className="px-3 py-2">Player</th>
                    <th className="px-3 py-2">Club</th>
                    <th className="px-3 py-2 text-right">Total</th>
                    <th className="px-3 py-2 text-right">TapIn Fee</th>
                    <th className="px-3 py-2 text-right">Club Amount</th>
                    <th className="px-3 py-2 text-center">Players</th>
                    <th className="px-3 py-2 text-center">Merchant ID</th>
                    <th className="px-3 py-2 text-center">Status</th>
                    <th className="px-3 py-2 text-center">Details</th>
                  </tr>
                </thead>
                <tbody>
                  {payments.map((sp) => (
                    <ExpandableRow key={sp.id} sp={sp} />
                  ))}
                </tbody>
              </table>
            </div>
          )}

          {totalPages > 1 && (
            <div className="flex items-center justify-between mt-4 pt-4 border-t">
              <Button size="sm" variant="outline" disabled={page <= 1} onClick={() => setPage(page - 1)}>
                <ChevronLeft className="h-4 w-4" /> Previous
              </Button>
              <span className="text-sm text-gray-500">
                Page {page} of {totalPages}
              </span>
              <Button size="sm" variant="outline" disabled={page >= totalPages} onClick={() => setPage(page + 1)}>
                Next <ChevronRight className="h-4 w-4" />
              </Button>
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}

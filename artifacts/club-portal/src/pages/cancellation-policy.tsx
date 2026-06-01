import React, { useEffect, useState } from "react";
import { api } from "@/lib/api";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Switch } from "@/components/ui/switch";
import { useToast } from "@/hooks/use-toast";
import { CheckCircle2, Clock, CloudRain, Mail, Phone, Save, ShieldAlert } from "lucide-react";

interface CancelPolicy {
  preset: string;
  full_refund_hours: number | null;
  has_partial: boolean;
  partial_pct: number;
  partial_hours: number;
  payment_hours: number;
  weather: string;
  contact_email: string;
  contact_phone: string;
}

type PresetKey = "flexible" | "standard" | "strict" | "non_refundable";

const PRESET_DEFAULTS: Record<PresetKey, Omit<CancelPolicy, "contact_email" | "contact_phone" | "preset">> = {
  flexible: {
    full_refund_hours: 24, has_partial: false, partial_pct: 50, partial_hours: 12,
    payment_hours: 24, weather: "full_refund",
  },
  standard: {
    full_refund_hours: 48, has_partial: true, partial_pct: 50, partial_hours: 24,
    payment_hours: 24, weather: "full_refund",
  },
  strict: {
    full_refund_hours: 72, has_partial: true, partial_pct: 50, partial_hours: 24,
    payment_hours: 24, weather: "full_refund",
  },
  non_refundable: {
    full_refund_hours: null, has_partial: false, partial_pct: 0, partial_hours: 0,
    payment_hours: 24, weather: "no_refund",
  },
};

const PRESET_META: Record<PresetKey, { label: string; tagline: string; color: string }> = {
  flexible:      { label: "Flexible",        tagline: "Full refund up to 24h before tee time",           color: "bg-green-50 border-green-400" },
  standard:      { label: "Standard",        tagline: "Full refund >48h · 50% refund 24–48h",            color: "bg-blue-50 border-blue-400"  },
  strict:        { label: "Strict",          tagline: "Full refund >72h · 50% refund 24–72h",            color: "bg-orange-50 border-orange-400" },
  non_refundable:{ label: "Non-refundable",  tagline: "No refund on any cancellation",                    color: "bg-red-50 border-red-400"    },
};

function fmtHours(h: number | null): string {
  if (h == null) return "—";
  if (h >= 168) return `${h / 168} week${h / 168 !== 1 ? "s" : ""}`;
  if (h >= 24) return `${h / 24} day${h / 24 !== 1 ? "s" : ""}`;
  return `${h}h`;
}

export default function CancellationPolicy() {
  const { toast } = useToast();
  const [loading, setLoading] = useState(true);
  const [saving, setSaving]   = useState(false);
  const [policy, setPolicy]   = useState<CancelPolicy>({
    preset: "standard",
    full_refund_hours: 48,
    has_partial: true,
    partial_pct: 50,
    partial_hours: 24,
    payment_hours: 24,
    weather: "full_refund",
    contact_email: "",
    contact_phone: "",
  });

  useEffect(() => {
    api<CancelPolicy>("/api/portal/cancellation-policy")
      .then((d) => setPolicy({
        ...d,
        contact_email: d.contact_email ?? "",
        contact_phone: d.contact_phone ?? "",
      }))
      .catch(() => {})
      .finally(() => setLoading(false));
  }, []);

  function applyPreset(key: PresetKey) {
    const defaults = PRESET_DEFAULTS[key];
    setPolicy((p) => ({ ...p, ...defaults, preset: key }));
  }

  function set<K extends keyof CancelPolicy>(key: K, val: CancelPolicy[K]) {
    setPolicy((p) => ({ ...p, [key]: val, preset: "custom" }));
  }

  async function handleSave() {
    setSaving(true);
    try {
      await api("/api/portal/cancellation-policy", {
        method: "PUT",
        body: JSON.stringify({
          ...policy,
          full_refund_hours: policy.full_refund_hours,
          contact_email: policy.contact_email.trim() || null,
          contact_phone: policy.contact_phone.trim() || null,
        }),
      });
      toast({ title: "Cancellation policy saved" });
    } catch {
      toast({ title: "Failed to save", variant: "destructive" });
    } finally {
      setSaving(false);
    }
  }

  if (loading) {
    return (
      <div className="p-8 flex items-center justify-center text-muted-foreground">Loading…</div>
    );
  }

  const isNonRefundable = policy.preset === "non_refundable" || policy.full_refund_hours == null;

  return (
    <div className="p-8 max-w-3xl mx-auto space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-[#1a5c38]">Cancellation Policy</h1>
          <p className="text-sm text-muted-foreground mt-1">
            Shown to golfers during booking and at the point of cancellation.
          </p>
        </div>
        <Button onClick={handleSave} disabled={saving} className="bg-[#1a5c38] hover:bg-[#154d30] gap-2">
          <Save className="h-4 w-4" />
          {saving ? "Saving…" : "Save"}
        </Button>
      </div>

      {/* Preset selector */}
      <Card>
        <CardHeader>
          <CardTitle className="text-base">Start with a preset</CardTitle>
        </CardHeader>
        <CardContent>
          <div className="grid grid-cols-2 gap-3">
            {(Object.keys(PRESET_META) as PresetKey[]).map((key) => {
              const meta = PRESET_META[key];
              const active = policy.preset === key;
              return (
                <button
                  key={key}
                  onClick={() => applyPreset(key)}
                  className={`text-left rounded-xl border-2 p-4 transition-all ${
                    active ? meta.color + " ring-2 ring-offset-1 ring-[#1a5c38]" : "border-border hover:border-[#1a5c38]/40 bg-card"
                  }`}
                >
                  <div className="font-semibold text-sm">{meta.label}</div>
                  <div className="text-xs text-muted-foreground mt-0.5 leading-snug">{meta.tagline}</div>
                </button>
              );
            })}
          </div>
        </CardContent>
      </Card>

      {/* Editable fields */}
      <Card>
        <CardHeader>
          <CardTitle className="text-base flex items-center gap-2">
            <Clock className="h-4 w-4 text-[#1a5c38]" />
            Refund Windows
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-5">
          {/* Full refund */}
          <div className="space-y-2">
            <div className="flex items-center justify-between">
              <Label className="font-semibold">Full refund (100%)</Label>
              <div className="flex items-center gap-2 text-xs text-muted-foreground">
                <Switch
                  checked={policy.full_refund_hours != null}
                  onCheckedChange={(v) =>
                    setPolicy((p) => ({ ...p, full_refund_hours: v ? 48 : null, preset: "custom" }))
                  }
                />
                {policy.full_refund_hours != null ? "Enabled" : "Disabled (non-refundable)"}
              </div>
            </div>
            {policy.full_refund_hours != null && (
              <div className="flex items-center gap-2">
                <Input
                  type="number"
                  min={1}
                  max={720}
                  value={policy.full_refund_hours ?? ""}
                  onChange={(e) => set("full_refund_hours", Number(e.target.value) || null)}
                  className="w-28"
                />
                <span className="text-sm text-muted-foreground">
                  hours before tee time (currently{" "}
                  <strong>{fmtHours(policy.full_refund_hours)}</strong>)
                </span>
              </div>
            )}
            {policy.full_refund_hours == null && (
              <p className="text-xs text-red-600">
                No refund will be given on any cancellation.
              </p>
            )}
          </div>

          {/* Partial refund */}
          {!isNonRefundable && (
            <div className="space-y-2 border-t pt-4">
              <div className="flex items-center justify-between">
                <Label className="font-semibold">Partial refund tier</Label>
                <div className="flex items-center gap-2 text-xs text-muted-foreground">
                  <Switch
                    checked={policy.has_partial}
                    onCheckedChange={(v) => set("has_partial", v)}
                  />
                  {policy.has_partial ? "Enabled" : "Disabled"}
                </div>
              </div>
              {policy.has_partial && (
                <div className="space-y-3 pl-2">
                  <div className="flex items-center gap-2 flex-wrap">
                    <Input
                      type="number"
                      min={1}
                      max={100}
                      value={policy.partial_pct}
                      onChange={(e) => set("partial_pct", Number(e.target.value) || 50)}
                      className="w-20"
                    />
                    <span className="text-sm text-muted-foreground">% refund when cancelled between</span>
                    <Input
                      type="number"
                      min={1}
                      max={(policy.full_refund_hours ?? 48) - 1}
                      value={policy.partial_hours}
                      onChange={(e) => set("partial_hours", Number(e.target.value) || 24)}
                      className="w-20"
                    />
                    <span className="text-sm text-muted-foreground">
                      h and {fmtHours(policy.full_refund_hours)} before tee time
                    </span>
                  </div>
                  <p className="text-xs text-muted-foreground">
                    Cancellations with less than {fmtHours(policy.partial_hours)} to go receive no refund.
                  </p>
                </div>
              )}
              {!policy.has_partial && (
                <p className="text-xs text-muted-foreground pl-2">
                  Cancellations outside the full-refund window receive no refund.
                </p>
              )}
            </div>
          )}
        </CardContent>
      </Card>

      {/* Payment deadline */}
      <Card>
        <CardHeader>
          <CardTitle className="text-base flex items-center gap-2">
            <ShieldAlert className="h-4 w-4 text-[#1a5c38]" />
            Auto-cancel Unpaid Bookings
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-2">
          <Label>Cancel unpaid bookings after</Label>
          <Select
            value={String(policy.payment_hours)}
            onValueChange={(v) => set("payment_hours", Number(v) as 24 | 48)}
          >
            <SelectTrigger className="w-48">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="24">24 hours</SelectItem>
              <SelectItem value="48">48 hours</SelectItem>
            </SelectContent>
          </Select>
          <p className="text-xs text-muted-foreground">
            Bookings with no payment recorded are automatically cancelled after this window.
          </p>
        </CardContent>
      </Card>

      {/* Weather policy */}
      <Card>
        <CardHeader>
          <CardTitle className="text-base flex items-center gap-2">
            <CloudRain className="h-4 w-4 text-[#1a5c38]" />
            Weather Closure Policy
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-2">
          <Label>When the course is closed due to weather</Label>
          <Select
            value={policy.weather}
            onValueChange={(v) => set("weather", v)}
          >
            <SelectTrigger className="w-64">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="full_refund">Full refund</SelectItem>
              <SelectItem value="rebook_only">Rebook only (credit)</SelectItem>
              <SelectItem value="no_refund">No refund</SelectItem>
            </SelectContent>
          </Select>
        </CardContent>
      </Card>

      {/* Club contact */}
      <Card>
        <CardHeader>
          <CardTitle className="text-base flex items-center gap-2">
            <Mail className="h-4 w-4 text-[#1a5c38]" />
            Refund Contact Details
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <p className="text-sm text-muted-foreground">
            Golfers are directed here after cancelling to request any eligible refund.
            TapIn Golf does not process refunds — these go to your club.
          </p>
          <div className="grid grid-cols-2 gap-4">
            <div className="space-y-1.5">
              <Label className="flex items-center gap-1.5">
                <Mail className="h-3.5 w-3.5" /> Email
              </Label>
              <Input
                type="email"
                placeholder="bookings@yourclub.co.za"
                value={policy.contact_email}
                onChange={(e) => set("contact_email", e.target.value)}
              />
            </div>
            <div className="space-y-1.5">
              <Label className="flex items-center gap-1.5">
                <Phone className="h-3.5 w-3.5" /> Phone
              </Label>
              <Input
                type="tel"
                placeholder="+27 11 000 0000"
                value={policy.contact_phone}
                onChange={(e) => set("contact_phone", e.target.value)}
              />
            </div>
          </div>
        </CardContent>
      </Card>

      {/* Preview */}
      <Card className="border-[#1a5c38]/30 bg-[#f0f7f4]">
        <CardHeader>
          <CardTitle className="text-base flex items-center gap-2">
            <CheckCircle2 className="h-4 w-4 text-[#1a5c38]" />
            What golfers see
          </CardTitle>
        </CardHeader>
        <CardContent>
          <div className="space-y-1.5 text-sm text-[#1a5c38]">
            {policy.full_refund_hours != null ? (
              <div className="flex items-start gap-2">
                <span className="text-green-600 mt-0.5">●</span>
                <span>
                  Cancel <strong>{fmtHours(policy.full_refund_hours)}+</strong> before tee time →{" "}
                  <strong>Full refund (100%)</strong>
                </span>
              </div>
            ) : (
              <div className="flex items-start gap-2">
                <span className="text-red-500 mt-0.5">●</span>
                <span><strong>No refund on any cancellation</strong></span>
              </div>
            )}
            {policy.has_partial && policy.full_refund_hours != null && (
              <div className="flex items-start gap-2">
                <span className="text-yellow-600 mt-0.5">●</span>
                <span>
                  Cancel {fmtHours(policy.partial_hours)}–{fmtHours(policy.full_refund_hours)} before →{" "}
                  <strong>{policy.partial_pct}% refund</strong>
                </span>
              </div>
            )}
            {(policy.full_refund_hours != null) && (
              <div className="flex items-start gap-2">
                <span className="text-red-500 mt-0.5">●</span>
                <span>
                  Cancel less than{" "}
                  <strong>{fmtHours(policy.has_partial ? policy.partial_hours : policy.full_refund_hours)}</strong>{" "}
                  before → <strong>No refund</strong>
                </span>
              </div>
            )}
            <div className="flex items-start gap-2 pt-1 border-t border-[#1a5c38]/20 mt-2">
              <span className="text-blue-600 mt-0.5">●</span>
              <span>
                Weather closure:{" "}
                <strong>
                  {policy.weather === "full_refund"
                    ? "Full refund"
                    : policy.weather === "rebook_only"
                    ? "Rebook credit"
                    : "No refund"}
                </strong>
              </span>
            </div>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}

import { useEffect, useState } from "react";
import { api } from "@/lib/api";
import { useToast } from "@/hooks/use-toast";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Skeleton } from "@/components/ui/skeleton";
import { Save, Tag, Eye, EyeOff } from "lucide-react";

interface TierPrices {
  price_18h: string;
  price_9h: string;
  hidden: boolean;
}

type TierMap = Record<string, TierPrices>;

const MEMBER_TIERS: { key: string; label: string }[] = [
  { key: "full_member",        label: "Full Member" },
  { key: "six_day_member",     label: "Six Day Member" },
  { key: "week_day_member",    label: "Week Day Member" },
  { key: "pensioner_full",     label: "Pensioner Full Member" },
  { key: "pensioner_six_day",  label: "Pensioner Six Day Member" },
  { key: "pensioner_week_day", label: "Pensioner Week Day Member" },
  { key: "student_member",     label: "Student Member" },
  { key: "junior_member",      label: "Junior Member" },
  { key: "honorary",           label: "Honorary Member" },
];

const VISITOR_TIERS: { key: string; label: string }[] = [
  { key: "affiliated_visitor",       label: "Affiliated Visitor" },
  { key: "affiliated_pensioner",     label: "Affiliated Pensioner Visitor" },
  { key: "non_affiliated_visitor",   label: "Non-Affiliated Visitor" },
  { key: "non_affiliated_pensioner", label: "Non-Affiliated Pensioner Visitor" },
  { key: "student_visitor",          label: "Student Visitor" },
  { key: "junior_visitor",           label: "Junior Visitor" },
];

const ALL_TIERS = [...MEMBER_TIERS, ...VISITOR_TIERS];

function emptyTierMap(): TierMap {
  const m: TierMap = {};
  for (const t of ALL_TIERS) m[t.key] = { price_18h: "", price_9h: "", hidden: false };
  return m;
}

function PriceInput({
  value, onChange, placeholder, disabled,
}: { value: string; onChange: (v: string) => void; placeholder?: string; disabled?: boolean }) {
  return (
    <div className="relative">
      <span className="absolute left-2.5 top-1/2 -translate-y-1/2 text-xs text-muted-foreground font-medium">R</span>
      <Input
        type="number"
        min={0}
        step={0.01}
        value={value}
        onChange={e => onChange(e.target.value)}
        placeholder={placeholder ?? "—"}
        className="pl-6 h-8 text-sm w-28"
        disabled={disabled}
      />
    </div>
  );
}

function TierSection({
  title, tiers, values, onChange, onToggleHidden,
}: {
  title: string;
  tiers: typeof MEMBER_TIERS;
  values: TierMap;
  onChange: (key: string, field: "price_18h" | "price_9h", val: string) => void;
  onToggleHidden: (key: string) => void;
}) {
  const hiddenCount = tiers.filter(t => values[t.key]?.hidden).length;

  return (
    <div className="space-y-0">
      <div className="flex items-center justify-between gap-3 bg-[#1a5c38] text-white px-4 py-2.5 rounded-t-lg">
        <div className="flex items-center gap-3">
          <Tag className="h-4 w-4" />
          <span className="font-semibold text-sm">{title}</span>
        </div>
        {hiddenCount > 0 && (
          <span className="text-xs bg-white/20 px-2 py-0.5 rounded-full">
            {hiddenCount} hidden
          </span>
        )}
      </div>
      <div className="border border-t-0 rounded-b-lg overflow-hidden divide-y">
        <div className="grid grid-cols-[1fr_auto_auto_auto] items-center gap-4 px-4 py-2 bg-muted/50">
          <span className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">Member / Visitor Type</span>
          <span className="text-xs font-semibold uppercase tracking-wide text-muted-foreground w-28 text-center">18-Hole</span>
          <span className="text-xs font-semibold uppercase tracking-wide text-muted-foreground w-28 text-center">9-Hole</span>
          <span className="text-xs font-semibold uppercase tracking-wide text-muted-foreground w-8 text-center">Show</span>
        </div>
        {tiers.map(t => {
          const hidden = values[t.key]?.hidden ?? false;
          return (
            <div
              key={t.key}
              className={`grid grid-cols-[1fr_auto_auto_auto] items-center gap-4 px-4 py-2.5 transition-colors ${
                hidden ? "bg-muted/30" : "hover:bg-muted/20"
              }`}
            >
              <span className={`text-sm font-medium ${hidden ? "text-muted-foreground line-through" : ""}`}>
                {t.label}
              </span>
              <PriceInput
                value={values[t.key]?.price_18h ?? ""}
                onChange={v => onChange(t.key, "price_18h", v)}
                disabled={hidden}
              />
              <PriceInput
                value={values[t.key]?.price_9h ?? ""}
                onChange={v => onChange(t.key, "price_9h", v)}
                disabled={hidden}
              />
              <div className="w-8 flex justify-center">
                <button
                  type="button"
                  onClick={() => onToggleHidden(t.key)}
                  title={hidden ? "Show this tier" : "Hide this tier"}
                  className={`p-1 rounded transition-colors ${
                    hidden
                      ? "text-muted-foreground hover:text-foreground"
                      : "text-[#1a5c38] hover:text-[#164d30]"
                  }`}
                >
                  {hidden ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
                </button>
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}

export default function Pricing() {
  const { toast } = useToast();
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [tiers, setTiers] = useState<TierMap>(emptyTierMap());
  const [dirty, setDirty] = useState(false);

  useEffect(() => {
    api<Record<string, { price_18h: number | null; price_9h: number | null; hidden?: boolean }>>("/api/portal/pricing-tiers")
      .then(data => {
        const m = emptyTierMap();
        for (const key of Object.keys(data)) {
          m[key] = {
            price_18h: data[key].price_18h != null ? String(data[key].price_18h) : "",
            price_9h:  data[key].price_9h  != null ? String(data[key].price_9h)  : "",
            hidden:    data[key].hidden ?? false,
          };
        }
        setTiers(m);
      })
      .catch(e => toast({ title: "Error loading pricing", description: e.message, variant: "destructive" }))
      .finally(() => setLoading(false));
  }, []);

  const handleChange = (key: string, field: "price_18h" | "price_9h", val: string) => {
    setTiers(prev => ({ ...prev, [key]: { ...prev[key], [field]: val } }));
    setDirty(true);
  };

  const handleToggleHidden = (key: string) => {
    setTiers(prev => ({ ...prev, [key]: { ...prev[key], hidden: !prev[key].hidden } }));
    setDirty(true);
  };

  const handleSave = async () => {
    setSaving(true);
    try {
      const payload: Record<string, { price_18h: number | null; price_9h: number | null; hidden: boolean }> = {};
      for (const key of Object.keys(tiers)) {
        payload[key] = {
          price_18h: tiers[key].price_18h !== "" ? parseFloat(tiers[key].price_18h) : null,
          price_9h:  tiers[key].price_9h  !== "" ? parseFloat(tiers[key].price_9h)  : null,
          hidden:    tiers[key].hidden,
        };
      }
      await api("/api/portal/pricing-tiers", {
        method: "PUT",
        body: JSON.stringify({ tiers: payload }),
      });
      toast({ title: "Pricing saved" });
      setDirty(false);
    } catch (e: any) {
      toast({ title: "Save failed", description: e.message, variant: "destructive" });
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="p-8 space-y-6 max-w-3xl">
      <div className="flex items-start justify-between gap-4">
        <div>
          <h1 className="text-3xl font-bold tracking-tight">Pricing Tiers</h1>
          <p className="text-muted-foreground mt-1">
            Set the green fee for each member and visitor category. All pricing is managed here.
          </p>
        </div>
        <Button
          className="bg-[#1a5c38] hover:bg-[#164d30] gap-2 flex-shrink-0"
          onClick={handleSave}
          disabled={saving || !dirty}
        >
          <Save className="h-4 w-4" />
          {saving ? "Saving…" : dirty ? "Save Changes" : "Saved"}
        </Button>
      </div>

      <div className="rounded-lg border border-amber-200 bg-amber-50 p-3 text-xs text-amber-800 space-y-1">
        <p className="font-semibold">How pricing tiers work</p>
        <p>Set the green fee for each membership and visitor category. Use the <EyeOff className="inline h-3 w-3 mx-0.5" /> eye icon to hide tiers your club does not offer — hidden tiers will not affect bookings. Leave a price blank if a particular category is not priced.</p>
      </div>

      {loading ? (
        <div className="space-y-4">
          <Skeleton className="h-64 w-full" />
          <Skeleton className="h-48 w-full" />
        </div>
      ) : (
        <div className="space-y-6">
          <TierSection
            title="Club Members"
            tiers={MEMBER_TIERS}
            values={tiers}
            onChange={handleChange}
            onToggleHidden={handleToggleHidden}
          />
          <TierSection
            title="Visitors"
            tiers={VISITOR_TIERS}
            values={tiers}
            onChange={handleChange}
            onToggleHidden={handleToggleHidden}
          />
        </div>
      )}

      {dirty && (
        <div className="sticky bottom-4">
          <div className="flex items-center justify-between gap-4 rounded-xl border border-[#1a5c38]/30 bg-white shadow-lg px-5 py-3">
            <p className="text-sm font-medium text-[#1a5c38]">You have unsaved pricing changes.</p>
            <Button className="bg-[#1a5c38] hover:bg-[#164d30] gap-2 h-8 text-sm" onClick={handleSave} disabled={saving}>
              <Save className="h-3.5 w-3.5" />
              {saving ? "Saving…" : "Save Now"}
            </Button>
          </div>
        </div>
      )}
    </div>
  );
}

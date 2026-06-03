import { useEffect, useState } from "react";
import { api } from "@/lib/api";
import { useToast } from "@/hooks/use-toast";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { AlarmClock, Info } from "lucide-react";

const PRESETS = [
  { label: "30 min", value: 30 },
  { label: "1 hour", value: 60 },
  { label: "90 min", value: 90 },
  { label: "2 hours", value: 120 },
  { label: "3 hours", value: 180 },
  { label: "6 hours", value: 360 },
  { label: "12 hours", value: 720 },
  { label: "24 hours", value: 1440 },
];

function formatMinutes(m: number): string {
  const h = Math.floor(m / 60);
  const min = m % 60;
  if (h === 0) return `${min} min`;
  if (min === 0) return `${h} hour${h > 1 ? "s" : ""}`;
  return `${h}h ${min}m`;
}

export default function StaffReminderSettings() {
  const { toast } = useToast();
  const [current, setCurrent] = useState(120);
  const [customInput, setCustomInput] = useState("");
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    api<{ settings: Record<string, string> }>("/api/super/settings")
      .then(data => {
        const v = parseInt(data.settings?.notify_minutes_before ?? "120", 10);
        setCurrent(isNaN(v) ? 120 : v);
      })
      .catch(e => toast({ title: "Could not load settings", description: e.message, variant: "destructive" }))
      .finally(() => setLoading(false));
  }, [toast]);

  const save = async (minutes: number) => {
    if (minutes < 5 || minutes > 1440) {
      toast({ title: "Must be between 5 and 1440 minutes", variant: "destructive" });
      return;
    }
    setSaving(true);
    try {
      await api("/api/super/settings", {
        method: "PUT",
        body: JSON.stringify({ notify_minutes_before: String(minutes) }),
      });
      setCurrent(minutes);
      setCustomInput("");
      toast({ title: "Reminder updated", description: `${formatMinutes(minutes)} before tee-off` });
    } catch (e: any) {
      toast({ title: "Error", description: e.message, variant: "destructive" });
    } finally { setSaving(false); }
  };

  const handleCustomSave = () => {
    const n = parseInt(customInput.trim(), 10);
    if (isNaN(n)) {
      toast({ title: "Enter a valid number", variant: "destructive" });
      return;
    }
    save(n);
  };

  return (
    <div className="p-8 max-w-xl space-y-8">
      <div className="flex items-center gap-3">
        <div className="h-10 w-10 rounded-lg bg-[#1a5c38]/10 flex items-center justify-center">
          <AlarmClock className="h-5 w-5 text-[#1a5c38]" />
        </div>
        <div>
          <h1 className="text-2xl font-bold">Reminder Settings</h1>
          <p className="text-sm text-muted-foreground">Tee-time push notification timing</p>
        </div>
      </div>

      {/* Current value */}
      <div className="border rounded-xl p-5 bg-[#1a5c38]/5 border-[#1a5c38]/20 flex items-center gap-4">
        <div className="h-12 w-12 rounded-xl bg-[#1a5c38] flex items-center justify-center flex-shrink-0">
          <AlarmClock className="h-6 w-6 text-white" />
        </div>
        <div>
          <p className="text-xs text-muted-foreground font-medium uppercase tracking-wide">Current reminder lead time</p>
          <p className="text-xl font-bold text-[#1a5c38] mt-0.5">
            {loading ? "Loading…" : saving ? "Saving…" : `${formatMinutes(current)} before tee-off`}
          </p>
        </div>
      </div>

      {/* Info */}
      <div className="flex gap-3 border rounded-xl p-4 bg-muted/30">
        <Info className="h-4 w-4 text-muted-foreground flex-shrink-0 mt-0.5" />
        <p className="text-sm text-muted-foreground leading-relaxed">
          The background worker checks every minute and sends a push notification to each golfer
          with an upcoming confirmed booking. Each booking is notified exactly once.
          User notification preferences are respected — golfers who have turned off booking
          notifications will not receive reminders.
        </p>
      </div>

      {/* Presets */}
      <div className="space-y-3">
        <p className="text-xs font-semibold uppercase tracking-widest text-muted-foreground">Quick presets</p>
        <div className="flex flex-wrap gap-2">
          {PRESETS.map(p => {
            const selected = p.value === current;
            return (
              <button
                key={p.value}
                onClick={() => save(p.value)}
                disabled={saving || loading}
                className={`px-4 py-2.5 rounded-xl border-2 text-sm font-semibold transition-all ${
                  selected
                    ? "bg-[#1a5c38] border-[#1a5c38] text-white"
                    : "bg-background border-border text-foreground hover:border-[#1a5c38]/40 hover:bg-[#1a5c38]/5"
                }`}
              >
                {p.label}
              </button>
            );
          })}
        </div>
      </div>

      {/* Custom */}
      <div className="space-y-3">
        <p className="text-xs font-semibold uppercase tracking-widest text-muted-foreground">Custom (minutes)</p>
        <div className="flex gap-2">
          <Input
            type="number"
            min={5}
            max={1440}
            value={customInput}
            onChange={e => setCustomInput(e.target.value)}
            onKeyDown={e => e.key === "Enter" && handleCustomSave()}
            placeholder={`e.g. ${current}`}
            className="w-36 font-semibold text-base"
          />
          <span className="self-center text-sm text-muted-foreground">min</span>
          <Button
            className="bg-[#1a5c38] hover:bg-[#154a2e]"
            onClick={handleCustomSave}
            disabled={!customInput || saving}
          >
            {saving ? "Saving…" : "Set"}
          </Button>
        </div>
        <p className="text-xs text-muted-foreground">Valid range: 5 – 1440 minutes (24 hours)</p>
      </div>
    </div>
  );
}

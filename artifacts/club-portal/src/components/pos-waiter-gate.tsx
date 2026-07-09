import { useState, useEffect, useCallback, useRef, type ReactNode } from "react";
import { startRegistration, startAuthentication } from "@simplewebauthn/browser";
import { api, posApi } from "@/lib/api";
import { useAuth, type ActiveWaiter } from "@/context/AuthContext";
import { useToast } from "@/hooks/use-toast";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Card } from "@/components/ui/card";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Badge } from "@/components/ui/badge";
import { Lock, Fingerprint, UserRound, ArrowLeft } from "lucide-react";

interface WaiterListItem {
  id: number;
  name: string;
  role: string;
  has_fingerprint: boolean;
}

const AUTO_LOCK_MS = 2 * 60 * 1000;

// Gate that wraps the till / tables screens. The terminal itself is signed in
// with the manager's outlet session; before anyone can ring up sales or touch
// tables they must pick their name and unlock with their personal PIN or a
// registered fingerprint.
export function PosWaiterGate({ children }: { children: ReactNode }) {
  const { toast } = useToast();
  const { posStaff, posOutlet, activeWaiter, unlockWaiter, lockWaiter } = useAuth();
  const [waiters, setWaiters] = useState<WaiterListItem[]>([]);
  const [selected, setSelected] = useState<WaiterListItem | null>(null);
  const [pin, setPin] = useState("");
  const [busy, setBusy] = useState(false);
  const [registering, setRegistering] = useState(false);
  const lockTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  const staffLabel = posOutlet?.type === "pro_shop" ? "cashier" : "waiter";

  const loadWaiters = useCallback(() => {
    api<{ staff: WaiterListItem[] }>("/api/pos/waiters")
      .then(r => setWaiters(r.staff))
      .catch(() => {});
  }, []);

  useEffect(() => { loadWaiters(); }, [loadWaiters]);

  // Auto-lock after inactivity so a walked-away terminal never stays unlocked.
  useEffect(() => {
    if (!activeWaiter) return;
    const reset = () => {
      if (lockTimer.current) clearTimeout(lockTimer.current);
      lockTimer.current = setTimeout(() => lockWaiter(), AUTO_LOCK_MS);
    };
    reset();
    const events = ["pointerdown", "keydown"] as const;
    events.forEach(e => window.addEventListener(e, reset));
    return () => {
      if (lockTimer.current) clearTimeout(lockTimer.current);
      events.forEach(e => window.removeEventListener(e, reset));
    };
  }, [activeWaiter, lockWaiter]);

  const unlockWithPin = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!selected || !pin || busy) return;
    setBusy(true);
    try {
      const r = await api<{ token: string; staff: ActiveWaiter }>(`/api/pos/waiters/${selected.id}/unlock`, {
        method: "POST",
        body: JSON.stringify({ password: pin }),
      });
      unlockWaiter(r.token, r.staff);
      setSelected(null);
      setPin("");
    } catch (err: any) {
      toast({ title: "Could not unlock", description: err.message, variant: "destructive" });
      setPin("");
    } finally {
      setBusy(false);
    }
  };

  // WebAuthn prompts are blocked inside cross-origin iframes (e.g. embedded
  // previews) unless the parent page grants the publickey-credentials
  // permissions. Detect that so we can explain instead of failing silently.
  const inCrossOriginFrame = (() => {
    try { return window.self !== window.top; } catch { return true; }
  })();

  const explainWebAuthnError = (err: any, action: "register" | "unlock") => {
    const blocked = err?.name === "NotAllowedError" || err?.name === "SecurityError";
    if (blocked && inCrossOriginFrame) {
      toast({
        title: "Fingerprint blocked in embedded preview",
        description: "Open the portal in its own browser tab to use Touch ID — fingerprint prompts don't work inside this preview frame.",
        variant: "destructive",
      });
      return;
    }
    if (err?.name === "NotAllowedError") return; // user cancelled the prompt
    toast({
      title: action === "register" ? "Could not register fingerprint" : "Fingerprint failed",
      description: err?.message ?? (action === "register" ? "This device may not have a fingerprint scanner." : "Try your PIN instead."),
      variant: "destructive",
    });
  };

  const unlockWithFingerprint = async (target: WaiterListItem) => {
    if (busy) return;
    setBusy(true);
    try {
      const options = await api<any>(`/api/pos/waiters/${target.id}/webauthn/options`, { method: "POST", body: JSON.stringify({}) });
      const assertion = await startAuthentication({ optionsJSON: options });
      const r = await api<{ token: string; staff: ActiveWaiter }>(`/api/pos/waiters/${target.id}/webauthn/verify`, {
        method: "POST",
        body: JSON.stringify(assertion),
      });
      unlockWaiter(r.token, r.staff);
      setSelected(null);
      setPin("");
    } catch (err: any) {
      explainWebAuthnError(err, "unlock");
    } finally {
      setBusy(false);
    }
  };

  const registerFingerprint = async () => {
    if (registering || !activeWaiter) return;
    setRegistering(true);
    try {
      const options = await posApi<any>("/api/pos/waiters/webauthn/register/options", { method: "POST", body: JSON.stringify({}) });
      const attestation = await startRegistration({ optionsJSON: options });
      await posApi("/api/pos/waiters/webauthn/register/verify", { method: "POST", body: JSON.stringify(attestation) });
      toast({ title: "Fingerprint registered", description: `${activeWaiter.name} can now unlock with a fingerprint on this device.` });
      loadWaiters();
    } catch (err: any) {
      explainWebAuthnError(err, "register");
    } finally {
      setRegistering(false);
    }
  };

  const activeEntry = activeWaiter ? waiters.find(w => w.id === activeWaiter.id) : null;
  const platformAuthAvailable = typeof window !== "undefined" && !!window.PublicKeyCredential;

  if (!activeWaiter) {
    return (
      <div className="flex-1 flex items-center justify-center p-6 bg-muted/40 h-full">
        <div className="w-full max-w-2xl">
          <div className="text-center mb-6">
            <Lock className="h-8 w-8 mx-auto mb-3 text-[#1a5c38]" />
            <h1 className="text-2xl font-bold">Who's serving?</h1>
            <p className="text-sm text-muted-foreground mt-1">
              Tap your name, then enter your PIN{platformAuthAvailable ? " or use your fingerprint" : ""} to start.
            </p>
          </div>
          {waiters.length === 0 ? (
            <Card className="p-8 text-center text-muted-foreground text-sm">
              No staff on the list yet{posStaff?.role === "manager" ? ` — add ${staffLabel}s under Staff.` : "."}
            </Card>
          ) : (
            <div className="grid grid-cols-2 sm:grid-cols-3 gap-3">
              {waiters.map(w => (
                <Card
                  key={w.id}
                  className="p-4 cursor-pointer hover:ring-2 hover:ring-[#1a5c38]/40 transition-all text-center"
                  onClick={() => { setSelected(w); setPin(""); }}
                  data-testid={`waiter-tile-${w.id}`}
                >
                  <div className="h-12 w-12 rounded-full bg-[#1a5c38]/10 text-[#1a5c38] flex items-center justify-center mx-auto mb-2 font-bold text-lg">
                    {w.name.split(/\s+/).map(p => p[0]).slice(0, 2).join("").toUpperCase()}
                  </div>
                  <p className="font-semibold text-sm truncate">{w.name}</p>
                  <div className="flex items-center justify-center gap-1 mt-1">
                    <Badge variant="secondary" className="text-[10px] capitalize">{w.role === "manager" ? "manager" : staffLabel}</Badge>
                    {w.has_fingerprint && <Fingerprint className="h-3.5 w-3.5 text-muted-foreground" />}
                  </div>
                </Card>
              ))}
            </div>
          )}
        </div>

        <Dialog open={!!selected} onOpenChange={(o) => { if (!o) { setSelected(null); setPin(""); } }}>
          <DialogContent className="max-w-xs">
            <DialogHeader>
              <DialogTitle className="flex items-center gap-2">
                <Button variant="ghost" size="icon" className="h-7 w-7 -ml-1" onClick={() => { setSelected(null); setPin(""); }}>
                  <ArrowLeft className="h-4 w-4" />
                </Button>
                {selected?.name}
              </DialogTitle>
            </DialogHeader>
            <form onSubmit={unlockWithPin} className="space-y-3">
              <Input
                autoFocus
                type="password"
                inputMode="numeric"
                value={pin}
                onChange={e => setPin(e.target.value)}
                placeholder={selected?.role === "manager" ? "Password" : "PIN"}
                className="h-12 text-center text-xl tracking-widest"
                data-testid="input-waiter-pin"
              />
              <Button type="submit" className="w-full h-11 bg-[#1a5c38] hover:bg-[#164d30]" disabled={!pin || busy} data-testid="button-waiter-unlock">
                {busy ? "Checking…" : "Unlock"}
              </Button>
              {selected?.has_fingerprint && platformAuthAvailable && (
                <Button type="button" variant="outline" className="w-full h-11" disabled={busy} onClick={() => selected && unlockWithFingerprint(selected)} data-testid="button-waiter-fingerprint">
                  <Fingerprint className="h-4 w-4 mr-2" /> Use fingerprint
                </Button>
              )}
            </form>
          </DialogContent>
        </Dialog>
      </div>
    );
  }

  return (
    <div className="flex flex-col h-full">
      <div className="flex items-center gap-3 px-4 py-2 bg-[#1a5c38] text-white flex-shrink-0">
        <UserRound className="h-4 w-4 flex-shrink-0" />
        <p className="text-sm font-medium flex-1 truncate">
          Serving as <span className="font-bold">{activeWaiter.name}</span>
        </p>
        {platformAuthAvailable && activeEntry && !activeEntry.has_fingerprint && (
          <Button
            size="sm" variant="ghost"
            className="text-white/80 hover:text-white hover:bg-white/10 h-8 text-xs"
            onClick={registerFingerprint}
            disabled={registering}
            data-testid="button-register-fingerprint"
          >
            <Fingerprint className="h-3.5 w-3.5 mr-1.5" /> {registering ? "Waiting…" : "Add fingerprint"}
          </Button>
        )}
        <Button
          size="sm" variant="ghost"
          className="text-white/80 hover:text-white hover:bg-white/10 h-8 text-xs"
          onClick={lockWaiter}
          data-testid="button-lock-waiter"
        >
          <Lock className="h-3.5 w-3.5 mr-1.5" /> Lock / switch
        </Button>
      </div>
      <div className="flex-1 min-h-0 overflow-auto">{children}</div>
    </div>
  );
}

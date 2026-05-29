import { useState } from "react";
import { useLocation } from "wouter";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Eye, EyeOff, ArrowLeft, Mail, KeyRound, CheckCircle2 } from "lucide-react";

type Step = "email" | "otp" | "password";

const API = import.meta.env.BASE_URL.replace(/\/$/, "");

async function apiPost(path: string, body: object) {
  const res = await fetch(`${API}${path}`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
  const data = await res.json();
  if (!res.ok) throw new Error(data.message ?? "Request failed");
  return data;
}

export default function ForgotPassword() {
  const [, navigate] = useLocation();
  const [step, setStep] = useState<Step>("email");
  const [email, setEmail] = useState("");
  const [otp, setOtp] = useState("");
  const [resetToken, setResetToken] = useState("");
  const [password, setPassword] = useState("");
  const [confirm, setConfirm] = useState("");
  const [showPw, setShowPw] = useState(false);
  const [showCf, setShowCf] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [success, setSuccess] = useState(false);
  const [devOtp, setDevOtp] = useState<string | null>(null);

  const stepIndex = step === "email" ? 0 : step === "otp" ? 1 : 2;

  const requestOtp = async () => {
    setError("");
    const trimmed = email.trim().toLowerCase();
    if (!trimmed) { setError("Please enter your email address."); return; }
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(trimmed)) { setError("Please enter a valid email address."); return; }
    setLoading(true);
    try {
      const data = await apiPost("/api/portal/auth/forgot-password", { email: trimmed });
      if (data.dev_otp) setDevOtp(data.dev_otp);
      setStep("otp");
    } catch (e: any) {
      setError(e.message);
    } finally { setLoading(false); }
  };

  const verifyOtp = async () => {
    setError("");
    if (otp.length !== 6) { setError("Please enter the 6-digit code."); return; }
    setLoading(true);
    try {
      const data = await apiPost("/api/portal/auth/verify-otp", { email: email.trim().toLowerCase(), otp });
      setResetToken(data.reset_token);
      setStep("password");
    } catch (e: any) {
      setError(e.message);
    } finally { setLoading(false); }
  };

  const resetPassword = async () => {
    setError("");
    if (password.length < 6) { setError("Password must be at least 6 characters."); return; }
    if (password !== confirm) { setError("Passwords do not match."); return; }
    setLoading(true);
    try {
      await apiPost("/api/portal/auth/reset-password", { reset_token: resetToken, new_password: password });
      setSuccess(true);
    } catch (e: any) {
      setError(e.message);
    } finally { setLoading(false); }
  };

  return (
    <div className="min-h-screen flex items-center justify-center bg-muted/40">
      <div className="w-full max-w-md px-4">
        {/* Logo */}
        <div className="text-center mb-8">
          <div className="inline-flex items-center justify-center w-14 h-14 rounded-2xl bg-[#1a5c38] shadow-lg mb-4">
            <svg viewBox="0 0 100 100" width="30" height="30" fill="white">
              <rect x="47" y="8" width="5" height="62" />
              <polygon points="52,8 83,21 52,34" />
              <ellipse cx="49.5" cy="76" rx="16" ry="6" />
            </svg>
          </div>
          <h1 className="text-3xl font-bold tracking-tight text-gray-900">
            <span className="text-[#1a5c38]">TapIn</span> Golf
          </h1>
          <span className="inline-flex items-center mt-2 px-3 py-1 rounded-full bg-[#1a5c38]/10 text-[#1a5c38] text-xs font-semibold tracking-widest uppercase">
            Club Portal
          </span>
        </div>

        <Card>
          <CardHeader>
            {!success && (
              <button
                onClick={() => step === "email" ? navigate("/login") : step === "otp" ? setStep("email") : setStep("otp")}
                className="flex items-center gap-1.5 text-sm text-muted-foreground hover:text-foreground mb-2 -ml-1 w-fit"
              >
                <ArrowLeft className="h-4 w-4" /> Back
              </button>
            )}

            {/* Step dots */}
            {!success && (
              <div className="flex items-center gap-2 mb-2">
                {[0, 1, 2].map(i => (
                  <div key={i} className="flex items-center gap-2">
                    <div className={`h-2 rounded-full transition-all ${i === stepIndex ? "w-6 bg-[#1a5c38]" : i < stepIndex ? "w-2 bg-[#1a5c38]" : "w-2 bg-gray-200"}`} />
                    {i < 2 && <div className={`h-0.5 w-4 ${i < stepIndex ? "bg-[#1a5c38]" : "bg-gray-200"}`} />}
                  </div>
                ))}
              </div>
            )}

            <CardTitle>
              {success ? "Password reset!" : step === "email" ? "Forgot password?" : step === "otp" ? "Check your email" : "New password"}
            </CardTitle>
            <CardDescription>
              {success
                ? "Your password has been updated. You can now sign in."
                : step === "email"
                ? "Enter the email address linked to your club account."
                : step === "otp"
                ? `We sent a 6-digit code to ${email}. It expires in 10 minutes.`
                : "Choose a new password for your club account."}
            </CardDescription>
          </CardHeader>

          <CardContent>
            {success ? (
              <div className="flex flex-col items-center gap-4 py-4">
                <CheckCircle2 className="h-14 w-14 text-[#1a5c38]" />
                <Button className="w-full bg-[#1a5c38] hover:bg-[#164d30]" onClick={() => navigate("/login")}>
                  Back to Sign In
                </Button>
              </div>
            ) : step === "email" ? (
              <div className="space-y-4">
                <div className="space-y-2">
                  <Label htmlFor="fp-email">Email address</Label>
                  <div className="relative">
                    <Mail className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
                    <Input
                      id="fp-email"
                      type="email"
                      className="pl-9"
                      placeholder="club@example.com"
                      value={email}
                      onChange={e => setEmail(e.target.value)}
                      onKeyDown={e => e.key === "Enter" && requestOtp()}
                      autoFocus
                    />
                  </div>
                </div>
                {error && <ErrorBox msg={error} />}
                <Button className="w-full bg-[#1a5c38] hover:bg-[#164d30]" onClick={requestOtp} disabled={loading}>
                  {loading ? "Sending code…" : "Send Code"}
                </Button>
              </div>
            ) : step === "otp" ? (
              <div className="space-y-4">
                {devOtp && (
                  <div className="rounded-md bg-amber-50 border border-amber-200 px-3 py-2 text-xs text-amber-700 flex items-center gap-2">
                    <KeyRound className="h-3.5 w-3.5 flex-shrink-0" />
                    Dev mode — OTP: <span className="font-bold font-mono">{devOtp}</span>
                  </div>
                )}
                <div className="space-y-2">
                  <Label htmlFor="fp-otp">6-digit code</Label>
                  <Input
                    id="fp-otp"
                    type="text"
                    inputMode="numeric"
                    maxLength={6}
                    placeholder="• • • • • •"
                    className="text-center text-2xl font-bold tracking-widest"
                    value={otp}
                    onChange={e => setOtp(e.target.value.replace(/\D/g, "").slice(0, 6))}
                    onKeyDown={e => e.key === "Enter" && verifyOtp()}
                    autoFocus
                  />
                </div>
                {error && <ErrorBox msg={error} />}
                <Button className="w-full bg-[#1a5c38] hover:bg-[#164d30]" onClick={verifyOtp} disabled={loading || otp.length !== 6}>
                  {loading ? "Verifying…" : "Verify Code"}
                </Button>
                <button
                  className="w-full text-sm text-muted-foreground hover:text-foreground text-center"
                  onClick={() => { setStep("email"); setOtp(""); setError(""); setDevOtp(null); }}
                >
                  Didn't get it? Try a different email
                </button>
              </div>
            ) : (
              <div className="space-y-4">
                <div className="space-y-2">
                  <Label htmlFor="fp-pw">New password</Label>
                  <div className="relative">
                    <Input
                      id="fp-pw"
                      type={showPw ? "text" : "password"}
                      placeholder="Min. 6 characters"
                      className="pr-10"
                      value={password}
                      onChange={e => setPassword(e.target.value)}
                      autoFocus
                    />
                    <button type="button" tabIndex={-1} onClick={() => setShowPw(v => !v)}
                      className="absolute inset-y-0 right-0 flex items-center px-3 text-muted-foreground hover:text-foreground">
                      {showPw ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
                    </button>
                  </div>
                </div>
                <div className="space-y-2">
                  <Label htmlFor="fp-cf">Confirm password</Label>
                  <div className="relative">
                    <Input
                      id="fp-cf"
                      type={showCf ? "text" : "password"}
                      placeholder="Repeat password"
                      className="pr-10"
                      value={confirm}
                      onChange={e => setConfirm(e.target.value)}
                      onKeyDown={e => e.key === "Enter" && resetPassword()}
                    />
                    <button type="button" tabIndex={-1} onClick={() => setShowCf(v => !v)}
                      className="absolute inset-y-0 right-0 flex items-center px-3 text-muted-foreground hover:text-foreground">
                      {showCf ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
                    </button>
                  </div>
                </div>
                {error && <ErrorBox msg={error} />}
                <Button className="w-full bg-[#1a5c38] hover:bg-[#164d30]" onClick={resetPassword} disabled={loading}>
                  {loading ? "Resetting…" : "Reset Password"}
                </Button>
              </div>
            )}
          </CardContent>
        </Card>
      </div>
    </div>
  );
}

function ErrorBox({ msg }: { msg: string }) {
  return (
    <div className="rounded-md bg-destructive/10 border border-destructive/30 p-3 text-sm text-destructive">
      {msg}
    </div>
  );
}

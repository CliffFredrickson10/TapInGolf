import { useState } from "react";
import { useLocation } from "wouter";
import { useAuth } from "@/context/AuthContext";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Eye, EyeOff, ChevronLeft } from "lucide-react";

function BrandLogo() {
  return (
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
  );
}

type Tab = "club" | "club_user" | "staff" | "reseller";

export default function Login() {
  const { login, clubUserLogin, staffLogin, resellerLogin } = useAuth();
  const [, navigate] = useLocation();
  const [tab, setTab] = useState<Tab>("club");
  const [username, setUsername] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);
  const [showPassword, setShowPassword] = useState(false);

  const switchTab = (next: Tab) => {
    setTab(next);
    setError("");
    setPassword("");
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError("");
    setLoading(true);
    try {
      if (tab === "staff") {
        await staffLogin(email.trim().toLowerCase(), password);
      } else if (tab === "club_user") {
        await clubUserLogin(email.trim().toLowerCase(), password);
      } else if (tab === "reseller") {
        await resellerLogin(username.trim().toLowerCase(), password);
      } else {
        await login(username.trim(), password);
      }
      navigate("/");
    } catch (err: any) {
      setError(err.message || "Login failed");
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="min-h-screen flex items-center justify-center bg-gradient-to-br from-[#f0f7f3] via-white to-[#f5f5f0]">
      <div className="w-full max-w-md px-4">
        <BrandLogo />
        <Card className="shadow-xl border-0 ring-1 ring-black/5">
          <CardHeader className="pb-4">
            {tab === "staff" ? (
              <button
                type="button"
                onClick={() => switchTab("club")}
                className="flex items-center gap-1 text-xs text-muted-foreground hover:text-foreground mb-3 -mt-1 w-fit"
              >
                <ChevronLeft className="h-3.5 w-3.5" />
                Back
              </button>
            ) : (
              <div className="grid grid-cols-3 gap-1 p-1 rounded-lg bg-muted mb-4">
                <button
                  type="button"
                  onClick={() => switchTab("club")}
                  className={`text-xs font-medium py-2 rounded-md transition-colors ${
                    tab === "club" ? "bg-white shadow-sm text-[#1a5c38]" : "text-muted-foreground hover:text-foreground"
                  }`}
                >
                  Club Admin
                </button>
                <button
                  type="button"
                  onClick={() => switchTab("club_user")}
                  className={`text-xs font-medium py-2 rounded-md transition-colors ${
                    tab === "club_user" ? "bg-white shadow-sm text-[#1a5c38]" : "text-muted-foreground hover:text-foreground"
                  }`}
                >
                  Club Staff
                </button>
                <button
                  type="button"
                  onClick={() => switchTab("reseller")}
                  className={`text-xs font-medium py-2 rounded-md transition-colors ${
                    tab === "reseller" ? "bg-white shadow-sm text-[#1a5c38]" : "text-muted-foreground hover:text-foreground"
                  }`}
                >
                  Reseller
                </button>
              </div>
            )}
            <CardTitle className="text-xl">
              {tab === "staff" ? "TapIn staff sign in" : tab === "club_user" ? "Club staff sign in" : tab === "reseller" ? "Reseller sign in" : "Sign in to your club"}
            </CardTitle>
            <CardDescription>
              {tab === "staff"
                ? "Sign in with your TapIn super-user account to manage all clubs."
                : tab === "club_user"
                ? "Sign in with your club staff email and password."
                : tab === "reseller"
                ? "Sign in with your reseller account to buy listed tee times."
                : "Enter your club credentials to access the management portal."}
            </CardDescription>
          </CardHeader>
          <CardContent>
            <form onSubmit={handleSubmit} className="space-y-4">
              {tab === "club" || tab === "reseller" ? (
                <div className="space-y-2">
                  <Label htmlFor="username">{tab === "reseller" ? "Username" : "Club Username"}</Label>
                  <Input
                    id="username"
                    type="text"
                    placeholder={tab === "reseller" ? "your reseller username" : "e.g. glendower_golf_club"}
                    value={username}
                    onChange={(e) => setUsername(e.target.value)}
                    required
                    autoComplete="username"
                    className="h-11"
                  />
                </div>
              ) : (
                <div className="space-y-2">
                  <Label htmlFor="email">Email</Label>
                  <Input
                    id="email"
                    type="email"
                    placeholder="you@example.com"
                    value={email}
                    onChange={(e) => setEmail(e.target.value)}
                    required
                    autoComplete="username"
                    className="h-11"
                  />
                </div>
              )}
              <div className="space-y-2">
                <Label htmlFor="password">Password</Label>
                <div className="relative">
                  <Input
                    id="password"
                    type={showPassword ? "text" : "password"}
                    value={password}
                    onChange={(e) => setPassword(e.target.value)}
                    required
                    autoComplete="current-password"
                    className="h-11 pr-10"
                  />
                  <button
                    type="button"
                    onClick={() => setShowPassword(v => !v)}
                    className="absolute inset-y-0 right-0 flex items-center px-3 text-muted-foreground hover:text-foreground"
                    tabIndex={-1}
                  >
                    {showPassword ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
                  </button>
                </div>
              </div>
              {error && (
                <div className="rounded-lg bg-destructive/10 border border-destructive/20 p-3 text-sm text-destructive">
                  {error}
                </div>
              )}
              <Button type="submit" className="w-full h-11 bg-[#1a5c38] hover:bg-[#164d30] text-base font-semibold" disabled={loading}>
                {loading ? "Signing in…" : "Sign in"}
              </Button>
            </form>

            <div className="flex items-center justify-end mt-5 pt-4 border-t">
              <a href="/club-portal/forgot-password" className="text-xs text-[#1a5c38] hover:underline font-semibold">
                Forgot password?
              </a>
            </div>

            {tab !== "staff" && (
              <div className="text-center mt-4">
                <button
                  type="button"
                  onClick={() => switchTab("staff")}
                  className="text-[11px] text-muted-foreground/60 hover:text-muted-foreground transition-colors"
                >
                  TapIn staff sign in
                </button>
              </div>
            )}
          </CardContent>
        </Card>
        <p className="text-center text-xs text-muted-foreground mt-6">
          © {new Date().getFullYear()} TapIn Golf · All rights reserved
        </p>
      </div>
    </div>
  );
}

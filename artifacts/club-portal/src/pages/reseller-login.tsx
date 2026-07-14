import { useState } from "react";
import { useLocation } from "wouter";
import { useAuth } from "@/context/AuthContext";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Eye, EyeOff } from "lucide-react";

export default function ResellerLogin() {
  const { resellerLogin } = useAuth();
  const [, navigate] = useLocation();
  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);
  const [showPassword, setShowPassword] = useState(false);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError("");
    setLoading(true);
    try {
      await resellerLogin(username.trim().toLowerCase(), password);
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
            Reseller Portal
          </span>
        </div>
        <Card className="shadow-xl border-0 ring-1 ring-black/5">
          <CardHeader className="pb-4">
            <CardTitle className="text-xl">Reseller sign in</CardTitle>
            <CardDescription>
              Sign in with your reseller account to buy listed tee times.
            </CardDescription>
          </CardHeader>
          <CardContent>
            <form onSubmit={handleSubmit} className="space-y-4">
              <div className="space-y-2">
                <Label htmlFor="username">Username</Label>
                <Input
                  id="username"
                  type="text"
                  placeholder="your reseller username"
                  value={username}
                  onChange={(e) => setUsername(e.target.value)}
                  required
                  autoComplete="username"
                  className="h-11"
                />
              </div>
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

            <div className="text-center mt-5 pt-4 border-t">
              <a href={`${import.meta.env.BASE_URL.replace(/\/$/, "")}/`} className="text-xs text-[#1a5c38] hover:underline font-semibold">
                ← Club Portal login
              </a>
            </div>
          </CardContent>
        </Card>
        <p className="text-center text-xs text-muted-foreground mt-6">
          © {new Date().getFullYear()} TapIn Golf · All rights reserved
        </p>
      </div>
    </div>
  );
}

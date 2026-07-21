import { useState, useEffect } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Settings as SettingsIcon, Key, Save, Trash2, Eye, EyeOff, ExternalLink, AlertCircle } from "lucide-react";
import { api } from "@/lib/api";
import { useToast } from "@/hooks/use-toast";

interface ProviderCredential {
  id?: number;
  provider: string;
  client_id: string;
  redirect_uri: string;
  extra_config: any;
  client_secret_set?: boolean;
}

const PROVIDERS = [
  {
    id: "xero",
    name: "Xero",
    logo: "🔵",
    devPortalUrl: "https://developer.xero.com/app/manage",
    description: "Cloud accounting for small businesses",
    scopes: "accounting.transactions, accounting.settings, accounting.contacts",
  },
  {
    id: "sage",
    name: "Sage Accounting",
    logo: "🟢",
    devPortalUrl: "https://developerselfservice.sageone.com/",
    description: "Business accounting & payroll",
    scopes: "full_access",
  },
  {
    id: "quickbooks",
    name: "QuickBooks Online",
    logo: "🟡",
    devPortalUrl: "https://developer.intuit.com/app/developer/dashboard",
    description: "Intuit's cloud accounting",
    scopes: "com.intuit.quickbooks.accounting",
  },
  {
    id: "zoho",
    name: "Zoho Books",
    logo: "🔴",
    devPortalUrl: "https://api-console.zoho.com/",
    description: "Online accounting software",
    scopes: "ZohoBooks.fullaccess.all",
    hasRegion: true,
  },
];

export default function Settings() {
  const { toast } = useToast();
  const [credentials, setCredentials] = useState<ProviderCredential[]>([]);
  const [loading, setLoading] = useState(true);
  const [editProvider, setEditProvider] = useState<string | null>(null);
  const [deleteProvider, setDeleteProvider] = useState<string | null>(null);

  // Form state
  const [clientId, setClientId] = useState("");
  const [clientSecret, setClientSecret] = useState("");
  const [redirectUri, setRedirectUri] = useState("");
  const [zohoRegion, setZohoRegion] = useState("com");
  const [showSecret, setShowSecret] = useState(false);
  const [saving, setSaving] = useState(false);

  function loadCredentials() {
    setLoading(true);
    api<ProviderCredential[]>("/api/portal/settings/accounting-credentials")
      .then(data => { setCredentials(data); setLoading(false); })
      .catch(() => setLoading(false));
  }

  useEffect(() => { loadCredentials(); }, []);

  function openEdit(providerId: string) {
    const existing = credentials.find(c => c.provider === providerId);
    setClientId(existing?.client_id ?? "");
    setClientSecret("");
    setRedirectUri(existing?.redirect_uri ?? "");
    setZohoRegion(existing?.extra_config?.region ?? "com");
    setShowSecret(false);
    setEditProvider(providerId);
  }

  async function handleSave() {
    if (!editProvider) return;
    if (!clientId.trim()) {
      toast({ title: "Client ID is required", variant: "destructive" }); return;
    }
    // Require secret on first save, optional on update (keeps existing)
    const existing = credentials.find(c => c.provider === editProvider);
    if (!clientSecret.trim() && !existing) {
      toast({ title: "Client Secret is required", variant: "destructive" }); return;
    }

    setSaving(true);
    try {
      const body: any = {
        client_id: clientId.trim(),
        client_secret: clientSecret.trim() || undefined,
        redirect_uri: redirectUri.trim() || undefined,
        extra_config: editProvider === "zoho" ? { region: zohoRegion } : undefined,
      };
      // If updating without a new secret, fetch the old one and pass it back
      // Actually the API requires client_secret — if blank on update, backend keeps old one
      if (!body.client_secret && existing) {
        // Send a placeholder that the API will detect
        body.client_secret = "__keep_existing__";
      }

      await api(`/api/portal/settings/accounting-credentials/${editProvider}`, {
        method: "PUT",
        body: JSON.stringify(body),
      });
      toast({ title: "Credentials saved", description: `${editProvider.charAt(0).toUpperCase() + editProvider.slice(1)} credentials updated successfully.` });
      setEditProvider(null);
      loadCredentials();
    } catch (err: any) {
      toast({ title: "Failed to save", description: err.message, variant: "destructive" });
    } finally {
      setSaving(false);
    }
  }

  async function handleDelete() {
    if (!deleteProvider) return;
    try {
      await api(`/api/portal/settings/accounting-credentials/${deleteProvider}`, { method: "DELETE" });
      toast({ title: "Credentials removed", description: `${deleteProvider.charAt(0).toUpperCase() + deleteProvider.slice(1)} credentials have been removed.` });
      setDeleteProvider(null);
      loadCredentials();
    } catch (err: any) {
      toast({ title: "Failed to remove", description: err.message, variant: "destructive" });
    }
  }

  const providerInfo = PROVIDERS.find(p => p.id === editProvider);

  return (
    <div className="space-y-6 p-6">
      <div className="flex items-center gap-3">
        <SettingsIcon className="h-6 w-6 text-gray-600" />
        <h1 className="text-2xl font-bold">Settings</h1>
      </div>

      {/* Accounting Credentials */}
      <Card>
        <CardHeader>
          <CardTitle className="text-lg flex items-center gap-2">
            <Key className="h-5 w-5 text-emerald-600" />
            Accounting Credentials
          </CardTitle>
          <p className="text-sm text-muted-foreground">
            Add your OAuth credentials for each accounting provider to enable the integration.
            You'll need to register an application on each provider's developer portal to get these credentials.
          </p>
        </CardHeader>
        <CardContent>
          {loading ? (
            <p className="text-muted-foreground">Loading...</p>
          ) : (
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              {PROVIDERS.map(provider => {
                const cred = credentials.find(c => c.provider === provider.id);
                const isConfigured = !!cred;

                return (
                  <div
                    key={provider.id}
                    className={`border rounded-lg p-4 transition-colors ${
                      isConfigured ? "border-emerald-200 bg-emerald-50/30" : "border-gray-200"
                    }`}
                  >
                    <div className="flex items-start justify-between">
                      <div className="flex items-center gap-3">
                        <span className="text-2xl">{provider.logo}</span>
                        <div>
                          <p className="font-medium">{provider.name}</p>
                          <p className="text-xs text-muted-foreground">{provider.description}</p>
                        </div>
                      </div>
                      <div className="flex items-center gap-1">
                        {isConfigured && (
                          <Badge variant="default" className="bg-emerald-600 text-xs">Configured</Badge>
                        )}
                      </div>
                    </div>

                    {isConfigured && (
                      <div className="mt-3 text-xs text-muted-foreground space-y-1">
                        <p><span className="font-medium">Client ID:</span> {cred.client_id.slice(0, 8)}...{cred.client_id.slice(-4)}</p>
                        <p><span className="font-medium">Redirect URI:</span> {cred.redirect_uri}</p>
                      </div>
                    )}

                    <div className="flex gap-2 mt-3">
                      <Button size="sm" variant="outline" onClick={() => openEdit(provider.id)}>
                        {isConfigured ? "Edit" : "Configure"}
                      </Button>
                      {isConfigured && (
                        <Button size="sm" variant="ghost" className="text-red-600" onClick={() => setDeleteProvider(provider.id)}>
                          <Trash2 className="h-3.5 w-3.5" />
                        </Button>
                      )}
                      <a href={provider.devPortalUrl} target="_blank" rel="noopener noreferrer" className="ml-auto">
                        <Button size="sm" variant="ghost" className="text-muted-foreground gap-1">
                          <ExternalLink className="h-3.5 w-3.5" /> Dev Portal
                        </Button>
                      </a>
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </CardContent>
      </Card>

      {/* Info Card */}
      <Card>
        <CardContent className="pt-6">
          <div className="flex gap-3">
            <AlertCircle className="h-5 w-5 text-blue-500 flex-shrink-0 mt-0.5" />
            <div className="text-sm text-muted-foreground space-y-2">
              <p className="font-medium text-foreground">How to get your credentials</p>
              <ol className="list-decimal list-inside space-y-1">
                <li>Go to the provider's developer portal (click "Dev Portal" on the card above).</li>
                <li>Register a new application — you'll receive a Client ID and Client Secret.</li>
                <li>Set the Redirect URI to point to your TapIn API callback URL.</li>
                <li>Enter the credentials here and click Save.</li>
                <li>Go to <strong>Finances → Integrations</strong> and click Connect to complete the OAuth flow.</li>
              </ol>
            </div>
          </div>
        </CardContent>
      </Card>

      {/* Edit Dialog */}
      <Dialog open={!!editProvider} onOpenChange={() => setEditProvider(null)}>
        <DialogContent className="max-w-lg">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <span className="text-xl">{providerInfo?.logo}</span>
              {providerInfo?.name} Credentials
            </DialogTitle>
          </DialogHeader>

          <div className="space-y-4">
            <div className="space-y-2">
              <Label htmlFor="client-id">Client ID <span className="text-red-500">*</span></Label>
              <Input
                id="client-id"
                value={clientId}
                onChange={e => setClientId(e.target.value)}
                placeholder="Enter your OAuth Client ID"
              />
            </div>

            <div className="space-y-2">
              <Label htmlFor="client-secret">
                Client Secret <span className="text-red-500">*</span>
                {credentials.find(c => c.provider === editProvider) && (
                  <span className="text-xs text-muted-foreground ml-2">(leave blank to keep existing)</span>
                )}
              </Label>
              <div className="relative">
                <Input
                  id="client-secret"
                  type={showSecret ? "text" : "password"}
                  value={clientSecret}
                  onChange={e => setClientSecret(e.target.value)}
                  placeholder={credentials.find(c => c.provider === editProvider) ? "••••••••" : "Enter your OAuth Client Secret"}
                />
                <button
                  type="button"
                  className="absolute right-2 top-2.5 text-muted-foreground hover:text-foreground"
                  onClick={() => setShowSecret(!showSecret)}
                >
                  {showSecret ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
                </button>
              </div>
            </div>

            <div className="space-y-2">
              <Label htmlFor="redirect-uri">Redirect URI</Label>
              <Input
                id="redirect-uri"
                value={redirectUri}
                onChange={e => setRedirectUri(e.target.value)}
                placeholder={`Auto-generated if blank`}
              />
              <p className="text-xs text-muted-foreground">
                Default: <code className="bg-muted px-1 rounded">{`{API_URL}/api/portal/ledger/accounting/${editProvider}/callback`}</code>
              </p>
            </div>

            {providerInfo?.hasRegion && (
              <div className="space-y-2">
                <Label>Zoho Region</Label>
                <Select value={zohoRegion} onValueChange={setZohoRegion}>
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="com">Global (zoho.com)</SelectItem>
                    <SelectItem value="eu">Europe (zoho.eu)</SelectItem>
                    <SelectItem value="in">India (zoho.in)</SelectItem>
                    <SelectItem value="com.au">Australia (zoho.com.au)</SelectItem>
                    <SelectItem value="za">South Africa (zoho.za)</SelectItem>
                  </SelectContent>
                </Select>
              </div>
            )}

            <div className="bg-muted/50 rounded-lg p-3 text-xs text-muted-foreground">
              <p className="font-medium text-foreground mb-1">Required Scopes</p>
              <p className="font-mono">{providerInfo?.scopes}</p>
            </div>
          </div>

          <DialogFooter>
            <Button variant="outline" onClick={() => setEditProvider(null)}>Cancel</Button>
            <Button onClick={handleSave} disabled={saving}>
              <Save className="h-4 w-4 mr-1" />
              {saving ? "Saving..." : "Save Credentials"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Delete Confirmation */}
      <Dialog open={!!deleteProvider} onOpenChange={() => setDeleteProvider(null)}>
        <DialogContent className="max-w-sm">
          <DialogHeader>
            <DialogTitle>Remove Credentials?</DialogTitle>
          </DialogHeader>
          <p className="text-sm text-muted-foreground">
            This will remove the <strong>{deleteProvider}</strong> OAuth credentials.
            Any active connection will continue to work until the token expires, but you won't be able to reconnect without adding new credentials.
          </p>
          <DialogFooter>
            <Button variant="outline" onClick={() => setDeleteProvider(null)}>Cancel</Button>
            <Button variant="destructive" onClick={handleDelete}>Remove</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}

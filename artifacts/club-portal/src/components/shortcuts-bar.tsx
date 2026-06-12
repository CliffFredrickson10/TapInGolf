import { useState, useEffect } from "react";
import { Link } from "wouter";
import { Settings2, Plus, X } from "lucide-react";
import { useAuth } from "@/context/AuthContext";
import { ALL_NAV_ITEMS } from "@/lib/nav-items";
import { Button } from "@/components/ui/button";
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription,
} from "@/components/ui/dialog";

const MAX_SHORTCUTS = 10;
const STORAGE_KEY_PREFIX = "portal_shortcuts_v1_";

function storageKey(clubId: number | string) {
  return `${STORAGE_KEY_PREFIX}${clubId}`;
}

export function ShortcutsBar() {
  const { club, clubUser, canView, isClubAdmin } = useAuth();
  const [shortcuts, setShortcuts] = useState<string[]>([]);
  const [open, setOpen] = useState(false);
  const [draft, setDraft] = useState<string[]>([]);

  const key = club ? storageKey(club.id) : null;

  useEffect(() => {
    if (!key) return;
    try {
      const stored = localStorage.getItem(key);
      if (stored) setShortcuts(JSON.parse(stored));
    } catch {
      setShortcuts([]);
    }
  }, [key]);

  const availableItems = ALL_NAV_ITEMS.filter(item => {
    if (item.href === "/") return false;
    if (item.adminOnly) return isClubAdmin;
    return canView(item.section);
  });

  function save(hrefs: string[]) {
    setShortcuts(hrefs);
    if (key) localStorage.setItem(key, JSON.stringify(hrefs));
  }

  function openDialog() {
    setDraft([...shortcuts]);
    setOpen(true);
  }

  function toggleDraft(href: string) {
    setDraft(prev => {
      if (prev.includes(href)) return prev.filter(h => h !== href);
      if (prev.length >= MAX_SHORTCUTS) return prev;
      return [...prev, href];
    });
  }

  function applyDraft() {
    save(draft.filter(h => availableItems.some(i => i.href === h)));
    setOpen(false);
  }

  const shortcutItems = shortcuts
    .map(href => availableItems.find(i => i.href === href))
    .filter(Boolean) as typeof availableItems;

  return (
    <>
      <div className="flex items-center gap-2 flex-wrap">
        {shortcutItems.length === 0 ? (
          <button
            onClick={openDialog}
            className="flex items-center gap-2 px-4 py-2 rounded-lg border-2 border-dashed border-muted-foreground/30 text-muted-foreground text-sm hover:border-[#1a5c38]/50 hover:text-[#1a5c38] transition-colors"
          >
            <Plus className="h-4 w-4" />
            Add shortcuts
          </button>
        ) : (
          shortcutItems.map(item => {
            const Icon = item.icon;
            return (
              <Link key={item.href} href={item.href}>
                <div className="flex items-center gap-2 px-3.5 py-2 rounded-lg bg-white border border-border shadow-sm hover:border-[#1a5c38]/50 hover:shadow-md hover:bg-[#1a5c38]/5 transition-all cursor-pointer group">
                  <Icon className="h-4 w-4 text-[#1a5c38] flex-shrink-0" />
                  <span className="text-sm font-medium text-foreground whitespace-nowrap">{item.label}</span>
                </div>
              </Link>
            );
          })
        )}

        {shortcutItems.length > 0 && (
          <button
            onClick={openDialog}
            title="Customize shortcuts"
            className="flex items-center justify-center w-9 h-9 rounded-lg border border-border bg-white shadow-sm hover:border-[#1a5c38]/50 hover:bg-[#1a5c38]/5 transition-all text-muted-foreground hover:text-[#1a5c38]"
          >
            <Settings2 className="h-4 w-4" />
          </button>
        )}
      </div>

      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle>Customize Shortcuts</DialogTitle>
            <DialogDescription>
              Choose up to {MAX_SHORTCUTS} pages to pin as shortcuts on your dashboard.
              {draft.length >= MAX_SHORTCUTS && (
                <span className="text-amber-600 font-medium"> Maximum reached.</span>
              )}
            </DialogDescription>
          </DialogHeader>

          <div className="space-y-1 max-h-80 overflow-y-auto pr-1">
            {availableItems.map(item => {
              const Icon = item.icon;
              const selected = draft.includes(item.href);
              const disabled = !selected && draft.length >= MAX_SHORTCUTS;
              return (
                <button
                  key={item.href}
                  onClick={() => !disabled && toggleDraft(item.href)}
                  disabled={disabled}
                  className={`w-full flex items-center gap-3 px-3 py-2.5 rounded-lg text-left transition-all ${
                    selected
                      ? "bg-[#1a5c38]/10 border border-[#1a5c38]/30 text-[#1a5c38]"
                      : disabled
                      ? "opacity-40 cursor-not-allowed bg-muted/30"
                      : "hover:bg-muted/60 border border-transparent"
                  }`}
                >
                  <div className={`flex items-center justify-center w-7 h-7 rounded-md flex-shrink-0 ${
                    selected ? "bg-[#1a5c38] text-white" : "bg-muted text-muted-foreground"
                  }`}>
                    <Icon className="h-3.5 w-3.5" />
                  </div>
                  <span className="text-sm font-medium flex-1">{item.label}</span>
                  {selected && (
                    <span className="text-[10px] font-semibold text-[#1a5c38] bg-[#1a5c38]/10 px-1.5 py-0.5 rounded">
                      {draft.indexOf(item.href) + 1}
                    </span>
                  )}
                </button>
              );
            })}
          </div>

          <div className="flex items-center justify-between pt-2 border-t">
            <span className="text-xs text-muted-foreground">{draft.length} / {MAX_SHORTCUTS} selected</span>
            <div className="flex gap-2">
              {draft.length > 0 && (
                <Button variant="ghost" size="sm" onClick={() => setDraft([])}>
                  Clear all
                </Button>
              )}
              <Button variant="outline" size="sm" onClick={() => setOpen(false)}>Cancel</Button>
              <Button size="sm" className="bg-[#1a5c38] hover:bg-[#1a5c38]/90 text-white" onClick={applyDraft}>
                Save
              </Button>
            </div>
          </div>
        </DialogContent>
      </Dialog>
    </>
  );
}

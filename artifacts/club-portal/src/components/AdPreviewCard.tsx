import type { ReactNode } from "react";

interface AdPreviewProps {
  layout?: "classic" | "hero" | "bold";
  title: string;
  subtitle?: string;
  image_url?: string;
  cta_text?: string;
}

export function AdPreviewCard({ layout = "classic", title, subtitle, image_url, cta_text }: AdPreviewProps) {
  const Sponsored = ({ dark = true }: { dark?: boolean }) => (
    <span className={`absolute top-2 right-2 text-[10px] font-bold tracking-widest px-2 py-0.5 rounded-full ${dark ? "bg-black/45 text-[#c8a84b]" : "bg-[#c8a84b]/15 text-[#c8a84b]"}`}>
      ✦ SPONSORED
    </span>
  );

  const CtaBtn = ({ light = false }: { light?: boolean }) =>
    cta_text ? (
      <div className={`inline-flex items-center gap-1.5 px-4 py-2 rounded-full text-xs font-semibold ${light ? "bg-white text-[#1a5c38]" : "bg-[#1a5c38] text-white"}`}>
        {cta_text}
        <svg width="12" height="12" viewBox="0 0 12 12" fill="none">
          <path d="M2 6h8M6 2l4 4-4 4" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />
        </svg>
      </div>
    ) : null;

  if (layout === "hero") {
    return (
      <div className="rounded-2xl overflow-hidden shadow-lg border border-gray-200 bg-white">
        <div className="h-1 bg-[#c8a84b]" />
        <div className="relative h-[180px] bg-gray-200">
          {image_url
            ? <img src={image_url} alt="" className="w-full h-full object-cover" />
            : <div className="w-full h-full flex items-center justify-center text-gray-400 text-sm">📷 No image yet</div>
          }
          <div className="absolute inset-0" style={{ background: "linear-gradient(to bottom, transparent 35%, rgba(0,0,0,0.12) 60%, rgba(0,0,0,0.75) 100%)" }} />
          <Sponsored dark />
          <div className="absolute bottom-0 left-0 right-0 p-3">
            <p className="text-white font-bold text-[15px] leading-snug drop-shadow">{title || <span className="opacity-40">Ad Headline</span>}</p>
            {subtitle && <p className="text-white/88 text-[12px] mt-0.5 drop-shadow">{subtitle}</p>}
          </div>
        </div>
        {cta_text && (
          <div className="flex justify-end px-3 py-2.5 border-t border-gray-100">
            <CtaBtn />
          </div>
        )}
      </div>
    );
  }

  if (layout === "bold") {
    return (
      <div className="rounded-2xl overflow-hidden shadow-lg bg-[#1a5c38]">
        <div className="relative px-6 py-7 flex flex-col items-center gap-2 text-center min-h-[140px] justify-center">
          <Sponsored dark />
          <p className="text-white font-bold text-[18px] leading-tight">{title || <span className="opacity-40">Ad Headline</span>}</p>
          {subtitle && <p className="text-white/85 text-[13px]">{subtitle}</p>}
          {cta_text && <div className="mt-2"><CtaBtn light /></div>}
        </div>
      </div>
    );
  }

  // ── Classic (default) ──────────────────────────────────────────────────────
  return (
    <div className="rounded-2xl overflow-hidden shadow-md border border-gray-200 bg-white">
      <div className="relative">
        {image_url
          ? <img src={image_url} alt="" className="w-full h-[130px] object-cover" />
          : <div className="w-full h-[46px] bg-[#1a5c38]/10 flex items-center justify-center text-gray-400 text-xs">No image</div>
        }
        <Sponsored dark={!!image_url} />
      </div>
      <div className="flex">
        <div className="w-1 bg-[#c8a84b] flex-shrink-0" />
        <div className="flex-1 px-3 py-3">
          <p className="font-bold text-sm text-gray-900 leading-snug">{title || <span className="text-gray-400">Ad Headline</span>}</p>
          {subtitle && <p className="text-xs text-gray-500 mt-0.5 leading-snug">{subtitle}</p>}
          {cta_text && <div className="mt-2.5"><CtaBtn /></div>}
        </div>
      </div>
    </div>
  );
}

export function AdPreviewShell({ children }: { children: ReactNode }) {
  return (
    <div className="flex flex-col items-center">
      <div className="w-[260px] rounded-[36px] border-[7px] border-gray-800 bg-gray-800 shadow-2xl overflow-hidden">
        <div className="bg-gray-800 h-6 flex items-center justify-center">
          <div className="w-16 h-1.5 bg-gray-600 rounded-full" />
        </div>
        <div className="bg-white min-h-[400px] px-3 pt-4 pb-6">
          <div className="h-2 w-24 bg-gray-100 rounded mb-3 mx-auto" />
          <div className="space-y-2 mb-4">
            <div className="h-3 bg-gray-100 rounded w-full" />
            <div className="h-3 bg-gray-100 rounded w-3/4" />
          </div>
          {children}
          <div className="mt-3 space-y-2">
            <div className="h-3 bg-gray-100 rounded w-full" />
            <div className="h-3 bg-gray-100 rounded w-5/6" />
          </div>
        </div>
      </div>
      <p className="text-xs text-gray-400 mt-2">Approximate preview</p>
    </div>
  );
}

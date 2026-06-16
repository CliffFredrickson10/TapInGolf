import React, { useEffect, useState, useCallback } from "react";
import { api } from "@/lib/api";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { useToast } from "@/hooks/use-toast";
import { useReadOnly } from "@/context/ReadOnlyContext";
import {
  Save, Plus, Trash2, GripVertical, ClipboardList, BookOpen,
  ChevronDown, ChevronUp, Settings2, Users,
} from "lucide-react";
import { Switch } from "@/components/ui/switch";

// ─── Types ────────────────────────────────────────────────────────────────────

interface Hole {
  number: number;
  par: number | null;
  stroke_index: number | null;
  yellow: number | null;
  white: number | null;
  blue: number | null;
  red: number | null;
}

interface TeeColor {
  key: string;
  name: string;
  color: string;
  enabled: boolean;
}

interface LocalRule {
  id: string;
  title: string;
  body: string;
}

interface CourseRating {
  id: string;
  tee: string;
  color: string;
  course_rating: string;
  slope_rating: string;
}

// ─── Helpers ─────────────────────────────────────────────────────────────────

function uid(): string {
  return Math.random().toString(36).slice(2);
}

function sumField(holes: Hole[], field: keyof Hole, from: number, to: number): number | null {
  const vals = holes.slice(from, to).map(h => h[field] as number | null);
  if (vals.every(v => v == null)) return null;
  return vals.reduce((acc, v) => (acc ?? 0) + (v ?? 0), 0 as number | null);
}

const DEFAULT_TEE_COLORS: TeeColor[] = [
  { key: "yellow", name: "Yellow", color: "#d4a800", enabled: true },
  { key: "white",  name: "White",  color: "#6b7280", enabled: true },
  { key: "blue",   name: "Blue",   color: "#3b82f6", enabled: true },
  { key: "red",    name: "Red",    color: "#ef4444", enabled: true },
];

const DEFAULT_HOLES: Hole[] = Array.from({ length: 18 }, (_, i) => ({
  number: i + 1,
  par: 4,
  stroke_index: i + 1,
  yellow: null,
  white: null,
  blue: null,
  red: null,
}));

const RATING_COLORS = ["#d4a800", "#6b7280", "#3b82f6", "#ef4444", "#22c55e", "#a855f7"];

// ─── Scorecard table ──────────────────────────────────────────────────────────

interface ScorecardTableProps {
  holes: Hole[];
  teeColors: TeeColor[];
  readOnly: boolean;
  onChange: (holes: Hole[]) => void;
}

function ScorecardTable({ holes, teeColors, readOnly, onChange }: ScorecardTableProps) {
  const front = holes.slice(0, 9);
  const back  = holes.slice(9, 18);
  const activeTees = teeColors.filter(t => t.enabled);

  function setCell(holeIdx: number, field: keyof Hole, raw: string) {
    const updated = holes.map((h, i) => {
      if (i !== holeIdx) return h;
      const val = raw === "" ? null : Number(raw);
      return { ...h, [field]: isNaN(val as number) ? null : val };
    });
    onChange(updated);
  }

  const cellCls =
    "w-full h-7 text-center text-xs border-0 bg-transparent p-0 focus:ring-1 focus:ring-[#1a5c38] focus:outline-none rounded disabled:opacity-100 [appearance:textfield] [&::-webkit-inner-spin-button]:appearance-none [&::-webkit-outer-spin-button]:appearance-none";

  const isLight = (color: string) =>
    ["#ffffff", "#f5c518", "#d4a800", "#fbbf24"].includes(color);

  // Single unified table: LABEL | 1-9 | OUT | 10-18 | IN | TOTAL
  return (
    <div className="overflow-x-auto">
      <table className="border-collapse text-xs w-full table-fixed">
        {/* ── Header ── */}
        <thead>
          <tr className="h-7 bg-[#1a5c38] text-white">
            <th className="border border-[#154d30] px-2 py-1.5 text-left font-semibold w-20 min-w-[72px]">HOLE</th>
            {front.map(h => (
              <th key={h.number} className="border border-[#154d30] px-1 py-1.5 text-center font-semibold w-10">{h.number}</th>
            ))}
            <th className="border border-[#154d30] px-2 py-1.5 text-center font-semibold w-12 bg-[#154d30]">OUT</th>
            {back.map(h => (
              <th key={h.number} className="border border-[#154d30] px-1 py-1.5 text-center font-semibold w-10">{h.number}</th>
            ))}
            <th className="border border-[#154d30] px-2 py-1.5 text-center font-semibold w-12 bg-[#154d30]">IN</th>
            <th className="border border-[#154d30] px-2 py-1.5 text-center font-semibold w-14 bg-[#0d3320]">TOTAL</th>
          </tr>
        </thead>

        <tbody>
          {/* PAR */}
          <tr className="h-7 bg-[#f0f7f4]">
            <td className="border border-gray-200 px-2 py-1.5 font-semibold text-[#1a5c38]">PAR</td>
            {front.map((h, i) => (
              <td key={h.number} className="border border-gray-200 p-0">
                <input type="number" min={3} max={6} value={h.par ?? ""} disabled={readOnly}
                  onChange={e => setCell(i, "par", e.target.value)} className={cellCls} />
              </td>
            ))}
            <td className="border border-gray-200 px-2 py-1.5 text-center font-bold text-[#1a5c38] bg-[#e8f4ed]">
              {sumField(holes, "par", 0, 9) ?? "—"}
            </td>
            {back.map((h, i) => (
              <td key={h.number} className="border border-gray-200 p-0">
                <input type="number" min={3} max={6} value={h.par ?? ""} disabled={readOnly}
                  onChange={e => setCell(9 + i, "par", e.target.value)} className={cellCls} />
              </td>
            ))}
            <td className="border border-gray-200 px-2 py-1.5 text-center font-bold text-[#1a5c38] bg-[#e8f4ed]">
              {sumField(holes, "par", 9, 18) ?? "—"}
            </td>
            <td className="border border-gray-200 px-2 py-1.5 text-center font-bold text-white bg-[#1a5c38]">
              {sumField(holes, "par", 0, 18) ?? "—"}
            </td>
          </tr>

          {/* STROKE INDEX */}
          <tr className="h-7">
            <td className="border border-gray-200 px-2 py-1.5 font-semibold text-gray-600">STROKE</td>
            {front.map((h, i) => (
              <td key={h.number} className="border border-gray-200 p-0">
                <input type="number" min={1} max={18} value={h.stroke_index ?? ""} disabled={readOnly}
                  onChange={e => setCell(i, "stroke_index", e.target.value)} className={cellCls} />
              </td>
            ))}
            <td className="border border-gray-200 px-2 py-1.5 text-center text-gray-400 bg-gray-50">—</td>
            {back.map((h, i) => (
              <td key={h.number} className="border border-gray-200 p-0">
                <input type="number" min={1} max={18} value={h.stroke_index ?? ""} disabled={readOnly}
                  onChange={e => setCell(9 + i, "stroke_index", e.target.value)} className={cellCls} />
              </td>
            ))}
            <td className="border border-gray-200 px-2 py-1.5 text-center text-gray-400 bg-gray-50">—</td>
            <td className="border border-gray-200 px-2 py-1.5 text-center text-gray-400 bg-gray-100">—</td>
          </tr>

          {/* TEE COLOR DISTANCES */}
          {activeTees.map(tee => {
            const light = isLight(tee.color);
            const textColor = light ? "#1f2937" : "#ffffff";
            const f = tee.key as keyof Hole;
            return (
              <tr key={tee.key} className="h-7" style={{ backgroundColor: tee.color + "18" }}>
                <td className="border border-gray-200 px-2 py-1.5 font-semibold uppercase text-xs"
                  style={{ backgroundColor: tee.color, color: textColor }}>
                  {tee.name}
                </td>
                {front.map((h, i) => (
                  <td key={h.number} className="border border-gray-200 p-0" style={{ backgroundColor: tee.color + "14" }}>
                    <input type="number" min={0} max={999} value={(h[f] as number | null) ?? ""} disabled={readOnly}
                      onChange={e => setCell(i, f, e.target.value)} className={cellCls} />
                  </td>
                ))}
                <td className="border border-gray-200 px-2 py-1.5 text-center font-bold"
                  style={{ backgroundColor: tee.color + "40", color: light ? "#1f2937" : tee.color }}>
                  {sumField(holes, f, 0, 9) ?? "—"}
                </td>
                {back.map((h, i) => (
                  <td key={h.number} className="border border-gray-200 p-0" style={{ backgroundColor: tee.color + "14" }}>
                    <input type="number" min={0} max={999} value={(h[f] as number | null) ?? ""} disabled={readOnly}
                      onChange={e => setCell(9 + i, f, e.target.value)} className={cellCls} />
                  </td>
                ))}
                <td className="border border-gray-200 px-2 py-1.5 text-center font-bold"
                  style={{ backgroundColor: tee.color + "40", color: light ? "#1f2937" : tee.color }}>
                  {sumField(holes, f, 9, 18) ?? "—"}
                </td>
                <td className="border border-gray-200 px-2 py-1.5 text-center font-bold"
                  style={{ backgroundColor: tee.color, color: textColor }}>
                  {sumField(holes, f, 0, 18) ?? "—"}
                </td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}

// ─── Main page ────────────────────────────────────────────────────────────────

export default function Scorecard() {
  const { toast } = useToast();
  const readOnly  = useReadOnly();

  // Scorecard state
  const [holes, setHoles]             = useState<Hole[]>(DEFAULT_HOLES);
  const [teeColors, setTeeColors]     = useState<TeeColor[]>(DEFAULT_TEE_COLORS);
  const [scLoading, setScLoading]     = useState(true);
  const [scSaving, setScSaving]       = useState(false);

  // Local rules state
  const [rules, setRules]             = useState<LocalRule[]>([]);
  const [ratings, setRatings]         = useState<CourseRating[]>([]);
  const [footerNotes, setFooterNotes] = useState("");
  const [lrLoading, setLrLoading]     = useState(true);
  const [lrSaving, setLrSaving]       = useState(false);

  // UI state
  const [activeTab, setActiveTab]     = useState<"scorecard" | "local_rules">("scorecard");
  const [showTeeConfig, setShowTeeConfig] = useState(false);

  // ── Loaders ────────────────────────────────────────────────────────────────

  useEffect(() => {
    api<{ holes: Hole[]; tee_colors: TeeColor[] }>("/api/portal/scorecard")
      .then(d => {
        if (d.holes?.length) setHoles(d.holes);
        if (d.tee_colors?.length) setTeeColors(d.tee_colors);
      })
      .catch(() => {})
      .finally(() => setScLoading(false));

    api<{ rules: LocalRule[]; course_ratings: CourseRating[]; footer_notes: string }>("/api/portal/local-rules")
      .then(d => {
        setRules(d.rules ?? []);
        setRatings(d.course_ratings ?? []);
        setFooterNotes(d.footer_notes ?? "");
      })
      .catch(() => {})
      .finally(() => setLrLoading(false));
  }, []);

  // ── Savers ─────────────────────────────────────────────────────────────────

  const saveScorecard = useCallback(async () => {
    setScSaving(true);
    try {
      await api("/api/portal/scorecard", {
        method: "PUT",
        body: JSON.stringify({ holes, tee_colors: teeColors }),
      });
      toast({ title: "Scorecard saved" });
    } catch {
      toast({ title: "Failed to save scorecard", variant: "destructive" });
    } finally {
      setScSaving(false);
    }
  }, [holes, teeColors, toast]);

  const saveLocalRules = useCallback(async () => {
    setLrSaving(true);
    try {
      await api("/api/portal/local-rules", {
        method: "PUT",
        body: JSON.stringify({ rules, course_ratings: ratings, footer_notes: footerNotes }),
      });
      toast({ title: "Local rules saved" });
    } catch {
      toast({ title: "Failed to save local rules", variant: "destructive" });
    } finally {
      setLrSaving(false);
    }
  }, [rules, ratings, footerNotes, toast]);

  // ── Tee color helpers ──────────────────────────────────────────────────────

  function updateTee(idx: number, patch: Partial<TeeColor>) {
    setTeeColors(prev => prev.map((t, i) => i === idx ? { ...t, ...patch } : t));
  }

  function addTeeColor() {
    setTeeColors(prev => [...prev, { key: uid(), name: "New Tee", color: "#22c55e", enabled: true }]);
  }

  function removeTeeColor(idx: number) {
    setTeeColors(prev => prev.filter((_, i) => i !== idx));
  }

  // ── Rules helpers ──────────────────────────────────────────────────────────

  function addRule() {
    setRules(prev => [...prev, { id: uid(), title: `Rule ${prev.length + 1}`, body: "" }]);
  }

  function updateRule(id: string, patch: Partial<LocalRule>) {
    setRules(prev => prev.map(r => r.id === id ? { ...r, ...patch } : r));
  }

  function removeRule(id: string) {
    setRules(prev => prev.filter(r => r.id !== id));
  }

  function moveRule(id: string, dir: -1 | 1) {
    setRules(prev => {
      const idx = prev.findIndex(r => r.id === id);
      if (idx < 0) return prev;
      const next = idx + dir;
      if (next < 0 || next >= prev.length) return prev;
      const arr = [...prev];
      [arr[idx], arr[next]] = [arr[next]!, arr[idx]!];
      return arr;
    });
  }

  // ── Ratings helpers ────────────────────────────────────────────────────────

  function addRating() {
    setRatings(prev => [...prev, { id: uid(), tee: "New Tee", color: RATING_COLORS[prev.length % RATING_COLORS.length]!, course_rating: "", slope_rating: "" }]);
  }

  function updateRating(id: string, patch: Partial<CourseRating>) {
    setRatings(prev => prev.map(r => r.id === id ? { ...r, ...patch } : r));
  }

  function removeRating(id: string) {
    setRatings(prev => prev.filter(r => r.id !== id));
  }

  // ── Print ──────────────────────────────────────────────────────────────────

  function handlePrint() {
    const front      = holes.slice(0, 9);
    const back       = holes.slice(9, 18);
    const activeTees = teeColors.filter(t => t.enabled);

    // ── helpers ────────────────────────────────────────────────────────────
    function rangeSum(from: number, to: number, field: keyof Hole): string {
      const vals = holes.slice(from, to).map(h => h[field] as number | null);
      if (vals.every(v => v == null)) return "—";
      return String(vals.reduce<number>((a, v) => a + (v ?? 0), 0));
    }
    const cv = (v: number | null) => (v == null ? "" : String(v));
    const isLight = (c: string) =>
      ["#ffffff","#f5f5f5","#fffde7","#f5c518","#d4a800","#fbbf24"].includes(c.toLowerCase());

    // ── style constants ────────────────────────────────────────────────────
    const G   = "#1a5c38";
    const GD  = "#154d30";
    const GDK = "#0d3320";
    const GL  = "#e8f4ed";
    const B   = "border:1px solid #aaa;font-size:8px;font-family:Arial,sans-serif;";
    const hdr = `${B}background:${G};color:#fff;font-weight:700;text-align:center;padding:2px 3px;`;
    const hdrD= `${B}background:${GD};color:#fff;font-weight:700;text-align:center;padding:2px 3px;`;
    const hdrK= `${B}background:${GDK};color:#fff;font-weight:700;text-align:center;padding:2px 3px;`;
    const out = `${B}background:${GL};color:${G};font-weight:700;text-align:center;padding:2px 3px;`;
    const tot = `${B}background:${G};color:#fff;font-weight:700;text-align:center;padding:2px 3px;`;
    const ctr = `${B}text-align:center;padding:2px 3px;`;

    // ── Hole Data rows ─────────────────────────────────────────────────────
    const hdHoleRow = `<tr style="height:22px;">
      <th style="${hdr}text-align:left;padding:2px 6px;">HOLE</th>
      ${front.map(h => `<th style="${hdr}">${h.number}</th>`).join("")}
      <th style="${hdrD}">OUT</th>
      ${back.map(h => `<th style="${hdr}">${h.number}</th>`).join("")}
      <th style="${hdrD}">IN</th>
      <th style="${hdrK}">TOTAL</th>
    </tr>`;

    const hdParRow = `<tr style="height:20px;background:#f0f7f4;">
      <td style="${B}font-weight:700;color:${G};padding:2px 6px;">PAR</td>
      ${front.map(h => `<td style="${ctr}">${cv(h.par)}</td>`).join("")}
      <td style="${out}">${rangeSum(0,9,"par")}</td>
      ${back.map(h => `<td style="${ctr}">${cv(h.par)}</td>`).join("")}
      <td style="${out}">${rangeSum(9,18,"par")}</td>
      <td style="${tot}">${rangeSum(0,18,"par")}</td>
    </tr>`;

    const hdStrokeRow = `<tr style="height:20px;">
      <td style="${B}font-weight:600;color:#555;padding:2px 6px;">STROKE</td>
      ${front.map(h => `<td style="${ctr}">${cv(h.stroke_index)}</td>`).join("")}
      <td style="${ctr}background:#f0f0f0;color:#999;">—</td>
      ${back.map(h => `<td style="${ctr}">${cv(h.stroke_index)}</td>`).join("")}
      <td style="${ctr}background:#f0f0f0;color:#999;">—</td>
      <td style="${ctr}background:#e8e8e8;color:#999;">—</td>
    </tr>`;

    const hdTeeRows = activeTees.map(tee => {
      const light = isLight(tee.color);
      const tc    = light ? "#1f2937" : "#ffffff";
      const f     = tee.key as keyof Hole;
      return `<tr style="height:20px;">
        <td style="${B}font-weight:700;text-transform:uppercase;background:${tee.color};color:${tc};padding:2px 6px;">${tee.name}</td>
        ${front.map(h => `<td style="${ctr}background:${tee.color}22;">${cv(h[f] as number|null)}</td>`).join("")}
        <td style="${B}text-align:center;font-weight:700;background:${tee.color}66;color:${light?"#1f2937":tee.color};padding:2px 3px;">${rangeSum(0,9,f)}</td>
        ${back.map(h => `<td style="${ctr}background:${tee.color}22;">${cv(h[f] as number|null)}</td>`).join("")}
        <td style="${B}text-align:center;font-weight:700;background:${tee.color}66;color:${light?"#1f2937":tee.color};padding:2px 3px;">${rangeSum(9,18,f)}</td>
        <td style="${B}text-align:center;font-weight:700;background:${tee.color};color:${tc};padding:2px 3px;">${rangeSum(0,18,f)}</td>
      </tr>`;
    }).join("");

    // ── Player Score rows (23 columns: letter + label + 9F + OUT + 9B + IN + TOTAL) ──
    const psRow = (label: string, style: string, extraCols: string, outStyle: string) =>
      `<tr style="height:20px;${style}">
        ${extraCols}
        ${front.map(() => `<td style="${ctr}"></td>`).join("")}
        <td style="${outStyle}"></td>
        ${back.map(() => `<td style="${ctr}"></td>`).join("")}
        <td style="${outStyle}"></td>
        <td style="${ctr}background:${G}1a;"></td>
      </tr>`;

    const playerRows = (["A","B","C","D"] as const).map(p => {
      const letterCell = `<td rowspan="2" style="${B}text-align:center;font-weight:700;font-size:14px;color:${G};background:${GL};vertical-align:middle;padding:0;width:20px;">${p}</td>`;
      const scoreRow = `<tr style="height:20px;">
        ${letterCell}
        <td style="${B}font-size:7px;color:#555;background:${GL}99;padding:1px 3px;">SCORE</td>
        ${front.map(() => `<td style="${ctr}"></td>`).join("")}
        <td style="${out}background:#d4edda;color:#155724;"></td>
        ${back.map(() => `<td style="${ctr}"></td>`).join("")}
        <td style="${out}background:#d4edda;color:#155724;"></td>
        <td style="${ctr}background:${G}1a;"></td>
      </tr>`;
      const resultRow = `<tr style="height:20px;">
        <td style="${B}font-size:7px;color:#aaa;background:${GL}55;border-top:1px dashed #ccc;padding:1px 3px;">RESULT</td>
        ${front.map(() => `<td style="${ctr}background:#f9f9f9;"></td>`).join("")}
        <td style="${out}background:#d4edda55;color:#155724;"></td>
        ${back.map(() => `<td style="${ctr}background:#f9f9f9;"></td>`).join("")}
        <td style="${out}background:#d4edda55;color:#155724;"></td>
        <td style="${ctr}background:${G}0d;"></td>
      </tr>`;
      const abRow = p === "B" ? `<tr style="height:20px;background:${G}0d;">
        <td colspan="2" style="${B}font-weight:700;color:${G};padding:2px 6px;">A/B RESULT</td>
        ${front.map(() => `<td style="${ctr}"></td>`).join("")}
        <td style="${out}background:#d4edda;color:#155724;"></td>
        ${back.map(() => `<td style="${ctr}"></td>`).join("")}
        <td style="${out}background:#d4edda;color:#155724;"></td>
        <td style="${ctr}background:${G}1a;"></td>
      </tr>` : "";
      const cdRow = p === "D" ? `<tr style="height:20px;background:${G}0d;">
        <td colspan="2" style="${B}font-weight:700;color:${G};padding:2px 6px;">C/D RESULT</td>
        ${front.map(() => `<td style="${ctr}"></td>`).join("")}
        <td style="${out}background:#d4edda;color:#155724;"></td>
        ${back.map(() => `<td style="${ctr}"></td>`).join("")}
        <td style="${out}background:#d4edda;color:#155724;"></td>
        <td style="${ctr}background:${G}1a;"></td>
      </tr>` : "";
      return scoreRow + resultRow + abRow + cdRow;
    }).join("");

    const allianceRow = `<tr style="height:20px;background:${GL};">
      <td colspan="2" style="${B}font-weight:700;color:${G};padding:2px 6px;">ALLIANCE</td>
      ${front.map(() => `<td style="${ctr}"></td>`).join("")}
      <td style="${tot}"></td>
      ${back.map(() => `<td style="${ctr}"></td>`).join("")}
      <td style="${tot}"></td>
      <td style="${tot}font-size:10px;"></td>
    </tr>`;

    // Colgroup shared by both Hole Data and Player Scores tables
    // Hole Data: 1 label + 9F + OUT + 9B + IN + TOTAL = 22 cols
    // Player Scores: 1 letter + 1 label + 9F + OUT + 9B + IN + TOTAL = 23 cols (different colgroup)
    const hdColgroup = `<colgroup>
      <col style="width:56px">
      ${Array.from({length:9}).map(()=>`<col style="width:32px">`).join("")}
      <col style="width:40px">
      ${Array.from({length:9}).map(()=>`<col style="width:32px">`).join("")}
      <col style="width:40px">
      <col style="width:48px">
    </colgroup>`;

    const psColgroup = `<colgroup>
      <col style="width:20px">
      <col style="width:40px">
      ${Array.from({length:9}).map(()=>`<col style="width:32px">`).join("")}
      <col style="width:40px">
      ${Array.from({length:9}).map(()=>`<col style="width:32px">`).join("")}
      <col style="width:40px">
      <col style="width:48px">
    </colgroup>`;

    // ── diagonal CSS gradient helper ───────────────────────────────────────
    const diagGradient = "background:linear-gradient(to top right,transparent calc(50% - 0.5px),#ccc calc(50% - 0.5px),#ccc calc(50% + 0.5px),transparent calc(50% + 0.5px));";

    // ── Competition header – right table
    // Row heights: header 20px, each sig row 80px → total 180px
    // Left table must match: header 20px + 4 rows × 40px = 180px
    const sigH = "80px";
    const sigBase = `${B}height:${sigH};vertical-align:bottom;padding:2px 6px;`;
    const rightTable = `
      <table style="border-collapse:collapse;width:100%;table-layout:fixed;">
        <colgroup>
          <col style="width:27%">
          <col style="width:24%">
          <col style="width:7%">
          <col style="width:7%">
          <col style="width:7%">
          <col style="width:7%">
          <col style="width:7%">
          <col style="width:7%">
          <col style="width:7%">
        </colgroup>
        <thead>
          <tr style="height:20px;">
            <th style="${hdr}text-align:left;padding:2px 6px;">DATE:</th>
            <th style="${hdr}text-align:left;padding:2px 6px;">TIME:</th>
            <th style="${hdr}padding:2px 3px;">TEE:</th>
            <th style="${hdr}padding:2px 3px;">1st</th>
            <th style="${hdr}padding:2px 3px;">10th</th>
            <th style="${hdrD}padding:2px 3px;">A</th>
            <th style="${hdrD}padding:2px 3px;">B</th>
            <th style="${hdrD}padding:2px 3px;">C</th>
            <th style="${hdrD}padding:2px 3px;">D</th>
          </tr>
        </thead>
        <tbody>
          <tr>
            <td style="${sigBase}font-weight:600;color:#444;">MARKER'S<br>SIGNATURE:</td>
            <td style="${sigBase}"></td>
            <td style="${B}padding:0;vertical-align:top;height:${sigH};">
              <div style="display:table;width:100%;height:100%;border-collapse:collapse;">
                <div style="display:table-row;">
                  <div style="display:table-cell;text-align:center;font-weight:700;font-size:7px;vertical-align:middle;height:18px;border-bottom:1px solid #aaa;">TWO CLUB</div>
                </div>
                ${["A","B","C","D"].map(p=>`<div style="display:table-row;"><div style="display:table-cell;text-align:center;font-size:7px;vertical-align:middle;height:15px;border-bottom:1px solid #ddd;">${p}</div></div>`).join("")}
              </div>
            </td>
            <td style="${sigBase}"></td>
            <td style="${sigBase}"></td>
            <td colspan="4" style="${B}height:${sigH};padding:4px 6px;position:relative;vertical-align:top;${diagGradient}">
              <span style="font-weight:700;font-size:7px;color:#666;position:relative;z-index:1;">RESULTS</span>
            </td>
          </tr>
          <tr>
            <td style="${sigBase}font-weight:600;color:#444;">PLAYER'S<br>SIGNATURE:</td>
            <td colspan="4" style="${sigBase}"></td>
            <td colspan="4" style="${B}height:${sigH};${diagGradient}"></td>
          </tr>
        </tbody>
      </table>`;

    const leftTable = `
      <table style="border-collapse:collapse;width:100%;table-layout:fixed;">
        <colgroup>
          <col style="width:22%">
          <col style="width:57%">
          <col style="width:7%">
          <col style="width:7%">
          <col style="width:7%">
        </colgroup>
        <thead>
          <tr style="height:20px;">
            <th style="${hdr}text-align:left;padding:2px 6px;">COMPETITION:</th>
            <th style="${B}background:#fff;padding:2px 6px;"></th>
            <th style="${B}background:#ddd;font-weight:700;text-align:center;padding:2px 3px;">CP</th>
            <th style="${B}background:#ddd;font-weight:700;text-align:center;padding:2px 3px;">CH</th>
            <th style="${B}background:#ddd;font-weight:700;text-align:center;padding:2px 3px;">HA</th>
          </tr>
        </thead>
        <tbody>
          ${["A","B","C","D"].map(p=>`<tr style="height:40px;">
            <td style="${B}font-weight:600;color:#444;padding:2px 6px;vertical-align:middle;">PLAYER ${p}:</td>
            <td style="${B}padding:2px 6px;"></td>
            <td style="${B}padding:2px 3px;"></td>
            <td style="${B}padding:2px 3px;"></td>
            <td style="${B}padding:2px 3px;"></td>
          </tr>`).join("")}
        </tbody>
      </table>`;

    const html = `<!DOCTYPE html>
<html>
<head>
  <meta charset="UTF-8">
  <title>Scorecard</title>
  <style>
    @page { size: A4 landscape; margin: 6mm; }
    * { box-sizing: border-box; }
    body { font-family: Arial,Helvetica,sans-serif; font-size: 8px; color: #1a1a1a; margin: 0; padding: 0; }
    .row { display: flex; gap: 6px; margin-bottom: 6px; align-items: stretch; }
    .row > div { min-width: 0; }
    .left-col { flex: 0 0 38%; }
    .right-col { flex: 1 1 62%; }
    .section { margin-bottom: 6px; }
    table { border-collapse: collapse; width: 100%; table-layout: fixed; }
    td, th { border: 1px solid #aaa; font-size: 8px; font-family: Arial,Helvetica,sans-serif; overflow: hidden; }
    .legend { font-size: 7.5px; color: #555; margin-top: 4px; }
    .legend strong { color: #333; }
  </style>
</head>
<body>

  <!-- COMPETITION HEADER -->
  <div class="row">
    <div class="left-col">${leftTable}</div>
    <div class="right-col">${rightTable}</div>
  </div>

  <!-- HOLE DATA -->
  <div class="section">
    <table>${hdColgroup}
      <thead>${hdHoleRow}${hdParRow}${hdStrokeRow}</thead>
      <tbody>${hdTeeRows}</tbody>
    </table>
  </div>

  <!-- PLAYER SCORES -->
  <div class="section">
    <table>${psColgroup}
      <thead>
        <tr style="height:22px;">
          <th colspan="2" style="${hdr}text-align:left;padding:2px 6px;">HOLE</th>
          ${front.map(h=>`<th style="${hdr}">${h.number}</th>`).join("")}
          <th style="${hdrD}">OUT</th>
          ${back.map(h=>`<th style="${hdr}">${h.number}</th>`).join("")}
          <th style="${hdrD}">IN</th>
          <th style="${hdrK}">TOTAL</th>
        </tr>
        <tr style="height:20px;background:#f0f7f4;">
          <td colspan="2" style="${B}font-weight:700;color:${G};padding:2px 6px;">PAR</td>
          ${front.map(h=>`<td style="${ctr}">${cv(h.par)}</td>`).join("")}
          <td style="${out}">${rangeSum(0,9,"par")}</td>
          ${back.map(h=>`<td style="${ctr}">${cv(h.par)}</td>`).join("")}
          <td style="${out}">${rangeSum(9,18,"par")}</td>
          <td style="${tot}">${rangeSum(0,18,"par")}</td>
        </tr>
      </thead>
      <tbody>
        ${playerRows}
        ${allianceRow}
      </tbody>
    </table>
    <div class="legend">
      <strong>CP:</strong> Course Played (Y/W/B/R)&nbsp;&nbsp;
      <strong>CH:</strong> Course Handicap&nbsp;&nbsp;
      <strong>HA:</strong> Handicap Allowance
    </div>
  </div>

  <script>window.focus(); window.print();</script>
</body>
</html>`;

    const w = window.open("", "_blank", "width=1100,height=750");
    if (!w) { alert("Please allow pop-ups to print the scorecard."); return; }
    w.document.open();
    w.document.write(html);
    w.document.close();
  }

  // ── Render ─────────────────────────────────────────────────────────────────

  const loading = scLoading || lrLoading;
  if (loading) {
    return <div className="p-8 flex items-center justify-center text-muted-foreground">Loading…</div>;
  }

  return (
    <div className="p-6 max-w-6xl mx-auto space-y-6">

      {/* Page header */}
      <div className="flex items-center justify-between flex-wrap gap-3">
        <div>
          <h1 className="text-2xl font-bold text-[#1a5c38]">Scorecard</h1>
          <p className="text-sm text-muted-foreground mt-1">Configure your course scorecard and local rules.</p>
        </div>
        <div className="flex gap-2">
          {activeTab === "scorecard" ? (
            <Button
              onClick={saveScorecard}
              disabled={scSaving || readOnly}
              className="bg-[#1a5c38] hover:bg-[#154d30] gap-2"
            >
              <Save className="h-4 w-4" />
              {scSaving ? "Saving…" : "Save Scorecard"}
            </Button>
          ) : (
            <Button
              onClick={saveLocalRules}
              disabled={lrSaving || readOnly}
              className="bg-[#1a5c38] hover:bg-[#154d30] gap-2"
            >
              <Save className="h-4 w-4" />
              {lrSaving ? "Saving…" : "Save Rules"}
            </Button>
          )}
        </div>
      </div>

      {/* Tab selector */}
      <div className="flex border-b border-border">
        {([
          { key: "scorecard",   label: "Scorecard",   icon: ClipboardList },
          { key: "local_rules", label: "Local Rules",  icon: BookOpen },
        ] as const).map(({ key, label, icon: Icon }) => (
          <button
            key={key}
            onClick={() => setActiveTab(key)}
            className={`flex items-center gap-2 px-5 py-3 text-sm font-medium border-b-2 transition-colors ${
              activeTab === key
                ? "border-[#1a5c38] text-[#1a5c38]"
                : "border-transparent text-muted-foreground hover:text-foreground"
            }`}
          >
            <Icon className="h-4 w-4" />
            {label}
          </button>
        ))}
      </div>

      {/* ── SCORECARD TAB ──────────────────────────────────────────────────── */}
      {activeTab === "scorecard" && (
        <div className="space-y-6">

          {/* Tee colour configuration */}
          <Card>
            <CardHeader className="pb-3">
              <button
                className="flex items-center justify-between w-full text-left"
                onClick={() => setShowTeeConfig(v => !v)}
              >
                <CardTitle className="text-base flex items-center gap-2">
                  <Settings2 className="h-4 w-4 text-[#1a5c38]" />
                  Tee Colour Settings
                </CardTitle>
                {showTeeConfig ? <ChevronUp className="h-4 w-4 text-muted-foreground" /> : <ChevronDown className="h-4 w-4 text-muted-foreground" />}
              </button>
            </CardHeader>
            {showTeeConfig && (
              <CardContent className="space-y-3">
                <p className="text-xs text-muted-foreground">
                  Enable the tee colours your course uses and set their names. Disabled tees are hidden from the scorecard.
                </p>
                <div className="space-y-2">
                  {teeColors.map((tee, idx) => (
                    <div key={idx} className="flex items-center gap-3 p-2 rounded-lg border border-border bg-muted/30">
                      <Switch
                        checked={tee.enabled}
                        onCheckedChange={v => updateTee(idx, { enabled: v })}
                        disabled={readOnly}
                      />
                      {/* colour swatch + colour picker */}
                      <div className="relative">
                        <div
                          className="w-7 h-7 rounded border border-gray-300 cursor-pointer"
                          style={{ backgroundColor: tee.color }}
                          onClick={() => {
                            const el = document.getElementById(`tee-color-${idx}`);
                            if (el) (el as HTMLInputElement).click();
                          }}
                        />
                        <input
                          id={`tee-color-${idx}`}
                          type="color"
                          value={tee.color}
                          onChange={e => updateTee(idx, { color: e.target.value })}
                          disabled={readOnly}
                          className="absolute opacity-0 w-0 h-0"
                        />
                      </div>
                      <Input
                        value={tee.name}
                        onChange={e => updateTee(idx, { name: e.target.value })}
                        disabled={readOnly}
                        placeholder="Tee name"
                        className="flex-1 h-8 text-sm"
                      />
                      {!readOnly && (
                        <Button
                          variant="ghost" size="icon"
                          className="h-7 w-7 text-destructive hover:text-destructive"
                          onClick={() => removeTeeColor(idx)}
                        >
                          <Trash2 className="h-3.5 w-3.5" />
                        </Button>
                      )}
                    </div>
                  ))}
                </div>
                {!readOnly && (
                  <Button variant="outline" size="sm" onClick={addTeeColor} className="gap-1.5">
                    <Plus className="h-3.5 w-3.5" /> Add Tee Colour
                  </Button>
                )}
              </CardContent>
            )}
          </Card>

          {/* Competition & Signatures header */}
          <Card>
            <CardHeader className="pb-3">
              <CardTitle className="text-base flex items-center gap-2">
                <ClipboardList className="h-4 w-4 text-[#1a5c38]" />
                Competition Header
              </CardTitle>
              <p className="text-xs text-muted-foreground">
                Appears at the top of the printed scorecard.
              </p>
            </CardHeader>
            <CardContent>
              {/*
                Two separate tables, aligned by matching total body height:
                Left:  header h-8  +  4 × player rows h-10  =  8 + 40×4 = 168px
                Right: header h-8  +  2 × sig rows   h-20  =  8 + 80×2 = 168px
              */}
              {/* Both tables share a flex row — each gets flex-1 so together
                  they fill the full card width, matching the hole data table below */}
              <div className="flex gap-4">

                {/* LEFT — Competition + Players (flex-1 = half width) */}
                <div className="flex-1 min-w-0 overflow-x-auto">
                  <table className="w-full table-fixed border-collapse text-xs">
                    <colgroup>
                      <col style={{ width: "21%" }} />
                      <col style={{ width: "58%" }} />
                      <col style={{ width: "7%" }} />
                      <col style={{ width: "7%" }} />
                      <col style={{ width: "7%" }} />
                    </colgroup>
                    <thead>
                      <tr className="h-8">
                        <th className="border border-gray-400 px-2 text-left font-bold bg-gray-100 text-gray-800">COMPETITION:</th>
                        <th className="border border-gray-400 px-2 bg-white"></th>
                        <th className="border border-gray-400 px-1 text-center font-bold bg-gray-200 text-gray-800">CP</th>
                        <th className="border border-gray-400 px-1 text-center font-bold bg-gray-200 text-gray-800">CH</th>
                        <th className="border border-gray-400 px-1 text-center font-bold bg-gray-200 text-gray-800">HA</th>
                      </tr>
                    </thead>
                    <tbody>
                      {(["A","B","C","D"] as const).map(p => (
                        <tr key={p} className="h-10">
                          <td className="border border-gray-400 px-2 font-semibold text-gray-700">PLAYER {p}:</td>
                          <td className="border border-gray-400 px-2 bg-white"></td>
                          <td className="border border-gray-400 bg-white"></td>
                          <td className="border border-gray-400 bg-white"></td>
                          <td className="border border-gray-400 bg-white"></td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>

                {/* RIGHT — Date / Signatures / Results (flex-1 = half width)
                    9 columns: DATE | TIME | TEE: | 1st | 10th | A | B | C | D
                    RESULTS header colSpan=4 over A-D cols
                */}
                <div className="flex-1 min-w-0 overflow-x-auto">
                  <table className="w-full table-fixed border-collapse text-xs">
                    <colgroup>
                      <col style={{ width: "29%" }} />
                      <col style={{ width: "25%" }} />
                      <col style={{ width: "8%" }} />
                      <col style={{ width: "7%" }} />
                      <col style={{ width: "7%" }} />
                      <col style={{ width: "6%" }} />
                      <col style={{ width: "6%" }} />
                      <col style={{ width: "6%" }} />
                      <col style={{ width: "6%" }} />
                    </colgroup>
                    <thead>
                      <tr className="h-8">
                        <th className="border border-gray-400 px-2 text-left font-bold bg-gray-100 text-gray-800">DATE:</th>
                        <th className="border border-gray-400 px-2 text-left font-bold bg-gray-100 text-gray-800">TIME:</th>
                        <th className="border border-gray-400 px-1 text-center font-bold bg-gray-100 text-gray-800">TEE:</th>
                        <th className="border border-gray-400 px-1 text-center font-bold bg-gray-100 text-gray-800">1<sup>st</sup></th>
                        <th className="border border-gray-400 px-1 text-center font-bold bg-gray-100 text-gray-800">10<sup>th</sup></th>
                        <th className="border border-gray-400 px-1 text-center font-bold bg-gray-200 text-gray-800" colSpan={4}>RESULTS</th>
                      </tr>
                    </thead>
                    <tbody>
                      <tr style={{ height: "80px" }}>
                        <td className="border border-gray-400 px-2 align-bottom pb-2 font-semibold text-gray-700" colSpan={5}>PLAYER'S SIGNATURE:</td>
                        <td className="border border-gray-400 bg-white relative" colSpan={4}>
                          <svg className="absolute inset-0 w-full h-full" preserveAspectRatio="none">
                            <line x1="0" y1="100%" x2="100%" y2="0" stroke="#bbb" strokeWidth="1" strokeDasharray="5 4"/>
                          </svg>
                        </td>
                      </tr>
                      <tr style={{ height: "80px" }}>
                        <td className="border border-gray-400 px-2 align-bottom pb-2 font-semibold text-gray-700" colSpan={5}>MARKER'S SIGNATURE:</td>
                        <td className="border border-gray-400 p-0" colSpan={4}>
                          <div style={{ height: "40px" }} className="border-b border-gray-400 flex items-center justify-center font-bold text-gray-800 bg-gray-50">TWO CLUB</div>
                          <div style={{ height: "40px" }} className="flex">
                            {(["A","B","C","D"] as const).map((l, i) => (
                              <div key={l} className={`flex-1 flex items-center justify-center font-semibold text-gray-700${i < 3 ? " border-r border-gray-400" : ""}`}>{l}</div>
                            ))}
                          </div>
                        </td>
                      </tr>
                    </tbody>
                  </table>
                </div>

              </div>
            </CardContent>
          </Card>

          {/* Scorecard table */}
          <Card>
            <CardHeader className="pb-3">
              <CardTitle className="text-base flex items-center gap-2">
                <ClipboardList className="h-4 w-4 text-[#1a5c38]" />
                Hole Data
              </CardTitle>
              <p className="text-xs text-muted-foreground">
                Enter par, stroke index (difficulty ranking 1–18), and distances in metres for each tee colour.
              </p>
            </CardHeader>
            <CardContent>
              <ScorecardTable
                holes={holes}
                teeColors={teeColors}
                readOnly={readOnly}
                onChange={setHoles}
              />
            </CardContent>
          </Card>

          {/* Player Scores */}
          <Card>
            <CardHeader className="pb-3">
              <CardTitle className="text-base flex items-center gap-2">
                <Users className="h-4 w-4 text-[#1a5c38]" />
                Player Scores
              </CardTitle>
              <p className="text-xs text-muted-foreground">
                Score entry grid for up to 4 players — printed at the bottom of the scorecard.
              </p>
            </CardHeader>
            <CardContent>
              <div className="overflow-x-auto">
                {/* Column structure mirrors ScorecardTable exactly:
                    w-20 label | w-10×9 front | w-12 OUT | w-10×9 back | w-12 IN | w-14 TOTAL */}
                {/*
                  table-fixed + explicit colgroup keeps this table pixel-aligned with ScorecardTable.
                  Both tables declare 952px total (80+9×40+48+9×40+48+56).
                  Letter col (24px) + Label col (56px) = 80px = ScorecardTable's HOLE col.
                */}
                <table className="border-collapse text-xs w-full table-fixed">
                  <colgroup>
                    <col style={{ width: "24px" }} />
                    <col style={{ width: "56px" }} />
                    {Array.from({length: 9}).map((_,i) => (
                      <col key={`f${i}`} style={{ width: "40px" }} />
                    ))}
                    <col style={{ width: "48px" }} />
                    {Array.from({length: 9}).map((_,i) => (
                      <col key={`b${i}`} style={{ width: "40px" }} />
                    ))}
                    <col style={{ width: "48px" }} />
                    <col style={{ width: "56px" }} />
                  </colgroup>
                  <thead>
                    <tr className="bg-[#1a5c38] text-white">
                      <th className="border border-[#154d30] px-2 py-1.5 text-left font-semibold w-20 min-w-[72px]" colSpan={2}>HOLE</th>
                      {holes.slice(0,9).map(h => (
                        <th key={h.number} className="border border-[#154d30] px-1 py-1.5 text-center font-semibold w-10">{h.number}</th>
                      ))}
                      <th className="border border-[#154d30] px-2 py-1.5 text-center font-semibold w-12 bg-[#154d30]">OUT</th>
                      {holes.slice(9,18).map(h => (
                        <th key={h.number} className="border border-[#154d30] px-1 py-1.5 text-center font-semibold w-10">{h.number}</th>
                      ))}
                      <th className="border border-[#154d30] px-2 py-1.5 text-center font-semibold w-12 bg-[#154d30]">IN</th>
                      <th className="border border-[#154d30] px-2 py-1.5 text-center font-semibold w-14 bg-[#0d3320]">TOTAL</th>
                    </tr>
                    <tr className="bg-[#f0f7f4]">
                      <td className="border border-gray-300 px-2 py-1 font-semibold text-[#1a5c38]" colSpan={2}>PAR</td>
                      {holes.slice(0,9).map(h => (
                        <td key={h.number} className="border border-gray-300 px-1 py-1 text-center text-gray-600">{h.par ?? "—"}</td>
                      ))}
                      <td className="border border-gray-300 px-2 py-1 text-center font-bold text-[#1a5c38] bg-[#e8f4ed]">{sumField(holes,"par",0,9) ?? "—"}</td>
                      {holes.slice(9,18).map(h => (
                        <td key={h.number} className="border border-gray-300 px-1 py-1 text-center text-gray-600">{h.par ?? "—"}</td>
                      ))}
                      <td className="border border-gray-300 px-2 py-1 text-center font-bold text-[#1a5c38] bg-[#e8f4ed]">{sumField(holes,"par",9,18) ?? "—"}</td>
                      <td className="border border-gray-300 px-2 py-1 text-center font-bold text-white bg-[#1a5c38]">{sumField(holes,"par",0,18) ?? "—"}</td>
                    </tr>
                  </thead>
                  <tbody>
                    {(["A","B","C","D"] as const).map((player, pi) => (
                      <React.Fragment key={player}>
                        {/* SCORE row — player letter spans SCORE + RESULT via rowSpan=2 */}
                        <tr className={pi % 2 === 0 ? "bg-white" : "bg-gray-50"}>
                          <td className="border border-gray-300 px-1 text-center font-bold text-lg text-[#1a5c38] bg-[#e8f4ed] align-middle" rowSpan={2}>{player}</td>
                          <td className="border border-gray-300 px-1.5 py-1 text-[10px] font-semibold text-gray-600 tracking-wide">SCORE</td>
                          {Array.from({length: 9}).map((_,i) => (
                            <td key={i} className="border border-gray-300 w-10 h-7"></td>
                          ))}
                          <td className="border border-gray-300 bg-[#e8f4ed] w-12 h-7"></td>
                          {Array.from({length: 9}).map((_,i) => (
                            <td key={i} className="border border-gray-300 w-10 h-7"></td>
                          ))}
                          <td className="border border-gray-300 bg-[#e8f4ed] w-12 h-7"></td>
                          <td className="border border-gray-300 bg-[#1a5c38]/10 w-14 h-7"></td>
                        </tr>
                        {/* RESULT row — no player letter cell (consumed by rowSpan above) */}
                        <tr className={pi % 2 === 0 ? "bg-white" : "bg-gray-50"}>
                          <td className="border border-gray-300 px-1.5 py-1 text-[10px] font-medium text-gray-400 bg-[#e8f4ed]/40" style={{ borderTopStyle: "dashed" }}>RESULT</td>
                          {Array.from({length: 9}).map((_,i) => (
                            <td key={i} className="border border-gray-300 w-10 h-7 bg-gray-50/60"></td>
                          ))}
                          <td className="border border-gray-300 bg-[#e8f4ed]/60 w-12 h-7"></td>
                          {Array.from({length: 9}).map((_,i) => (
                            <td key={i} className="border border-gray-300 w-10 h-7 bg-gray-50/60"></td>
                          ))}
                          <td className="border border-gray-300 bg-[#e8f4ed]/60 w-12 h-7"></td>
                          <td className="border border-gray-300 bg-[#1a5c38]/10 w-14 h-7"></td>
                        </tr>
                        {player === "B" && (
                          <tr className="bg-[#1a5c38]/5">
                            <td className="border border-gray-300 px-2 py-1 font-bold text-[#1a5c38] text-xs" colSpan={2}>A/B RESULT</td>
                            {Array.from({length: 9}).map((_,i) => (
                              <td key={i} className="border border-gray-300 h-7"></td>
                            ))}
                            <td className="border border-gray-300 bg-[#e8f4ed] h-7"></td>
                            {Array.from({length: 9}).map((_,i) => (
                              <td key={i} className="border border-gray-300 h-7"></td>
                            ))}
                            <td className="border border-gray-300 bg-[#e8f4ed] h-7"></td>
                            <td className="border border-gray-300 bg-[#1a5c38]/10 h-7"></td>
                          </tr>
                        )}
                        {player === "D" && (
                          <tr className="bg-[#1a5c38]/5">
                            <td className="border border-gray-300 px-2 py-1 font-bold text-[#1a5c38] text-xs" colSpan={2}>C/D RESULT</td>
                            {Array.from({length: 9}).map((_,i) => (
                              <td key={i} className="border border-gray-300 h-7"></td>
                            ))}
                            <td className="border border-gray-300 bg-[#e8f4ed] h-7"></td>
                            {Array.from({length: 9}).map((_,i) => (
                              <td key={i} className="border border-gray-300 h-7"></td>
                            ))}
                            <td className="border border-gray-300 bg-[#e8f4ed] h-7"></td>
                            <td className="border border-gray-300 bg-[#1a5c38]/10 h-7"></td>
                          </tr>
                        )}
                      </React.Fragment>
                    ))}
                    <tr className="bg-[#1a5c38]/10">
                      <td className="border border-gray-300 px-2 py-1 font-bold text-[#1a5c38] text-xs" colSpan={2}>ALLIANCE</td>
                      {Array.from({length: 9}).map((_,i) => (
                        <td key={i} className="border border-gray-300 h-7"></td>
                      ))}
                      <td className="border border-gray-300 bg-[#e8f4ed] h-7"></td>
                      {Array.from({length: 9}).map((_,i) => (
                        <td key={i} className="border border-gray-300 h-7"></td>
                      ))}
                      <td className="border border-gray-300 bg-[#e8f4ed] h-7"></td>
                      <td className="border border-gray-300 bg-[#1a5c38]/20 h-7 font-bold"></td>
                    </tr>
                  </tbody>
                </table>
                <p className="mt-2 text-[11px] text-gray-600">
                  <strong>CP:</strong> Course Played (Y/W/B/R)&nbsp;&nbsp;
                  <strong>CH:</strong> Course Handicap&nbsp;&nbsp;
                  <strong>HA:</strong> Handicap Allowance
                </p>
              </div>
            </CardContent>
          </Card>
        </div>
      )}

      {/* ── LOCAL RULES TAB ────────────────────────────────────────────────── */}
      {activeTab === "local_rules" && (
        <div className="space-y-6">

          {/* Rules list */}
          <Card>
            <CardHeader className="pb-3">
              <div className="flex items-center justify-between">
                <CardTitle className="text-base flex items-center gap-2">
                  <BookOpen className="h-4 w-4 text-[#1a5c38]" />
                  Local Rules
                </CardTitle>
                {!readOnly && (
                  <Button variant="outline" size="sm" onClick={addRule} className="gap-1.5">
                    <Plus className="h-3.5 w-3.5" /> Add Rule
                  </Button>
                )}
              </div>
              <p className="text-xs text-muted-foreground">
                Each rule appears as a numbered item on the scorecard. Use the arrows to reorder.
              </p>
            </CardHeader>
            <CardContent className="space-y-3">
              {rules.length === 0 && (
                <div className="text-center py-8 text-muted-foreground text-sm">
                  No local rules yet. Click "Add Rule" to get started.
                </div>
              )}
              {rules.map((rule, idx) => (
                <div key={rule.id} className="border border-border rounded-xl p-4 space-y-3 bg-muted/20">
                  <div className="flex items-center gap-2">
                    <span className="text-xs font-bold text-[#1a5c38] bg-[#1a5c38]/10 rounded-full w-6 h-6 flex items-center justify-center flex-shrink-0">
                      {idx + 1}
                    </span>
                    <Input
                      value={rule.title}
                      onChange={e => updateRule(rule.id, { title: e.target.value })}
                      disabled={readOnly}
                      placeholder="Rule title (e.g. Penalty Areas)"
                      className="flex-1 h-8 text-sm font-medium"
                    />
                    {!readOnly && (
                      <div className="flex items-center gap-1">
                        <Button
                          variant="ghost" size="icon" className="h-7 w-7"
                          onClick={() => moveRule(rule.id, -1)}
                          disabled={idx === 0}
                        >
                          <ChevronUp className="h-3.5 w-3.5" />
                        </Button>
                        <Button
                          variant="ghost" size="icon" className="h-7 w-7"
                          onClick={() => moveRule(rule.id, 1)}
                          disabled={idx === rules.length - 1}
                        >
                          <ChevronDown className="h-3.5 w-3.5" />
                        </Button>
                        <Button
                          variant="ghost" size="icon"
                          className="h-7 w-7 text-destructive hover:text-destructive"
                          onClick={() => removeRule(rule.id)}
                        >
                          <Trash2 className="h-3.5 w-3.5" />
                        </Button>
                      </div>
                    )}
                  </div>
                  <Textarea
                    value={rule.body}
                    onChange={e => updateRule(rule.id, { body: e.target.value })}
                    disabled={readOnly}
                    placeholder="Describe the rule…"
                    rows={3}
                    className="resize-y text-sm"
                  />
                </div>
              ))}
            </CardContent>
          </Card>

          {/* Course & slope ratings */}
          <Card>
            <CardHeader className="pb-3">
              <div className="flex items-center justify-between">
                <CardTitle className="text-base">Course &amp; Slope Ratings</CardTitle>
                {!readOnly && (
                  <Button variant="outline" size="sm" onClick={addRating} className="gap-1.5">
                    <Plus className="h-3.5 w-3.5" /> Add Row
                  </Button>
                )}
              </div>
              <p className="text-xs text-muted-foreground">
                Course rating and slope rating per tee and gender combination.
              </p>
            </CardHeader>
            <CardContent>
              {ratings.length === 0 ? (
                <div className="text-center py-6 text-muted-foreground text-sm">
                  No ratings entered yet.
                </div>
              ) : (
                <div className="overflow-x-auto">
                  <table className="w-full border-collapse text-sm">
                    <thead>
                      <tr className="bg-muted/50">
                        <th className="border border-border px-3 py-2 text-left font-semibold w-8"></th>
                        <th className="border border-border px-3 py-2 text-left font-semibold">Tee (e.g. Yellow Mens)</th>
                        <th className="border border-border px-3 py-2 text-center font-semibold w-28">Course Rating</th>
                        <th className="border border-border px-3 py-2 text-center font-semibold w-28">Slope Rating</th>
                        {!readOnly && <th className="border border-border px-2 py-2 w-10"></th>}
                      </tr>
                    </thead>
                    <tbody>
                      {ratings.map(r => (
                        <tr key={r.id} className="hover:bg-muted/20">
                          <td className="border border-border px-2 py-1.5">
                            <div className="relative">
                              <div
                                className="w-6 h-6 rounded border border-gray-300 cursor-pointer mx-auto"
                                style={{ backgroundColor: r.color }}
                                onClick={() => {
                                  const el = document.getElementById(`rating-color-${r.id}`);
                                  if (el) (el as HTMLInputElement).click();
                                }}
                              />
                              <input
                                id={`rating-color-${r.id}`}
                                type="color"
                                value={r.color}
                                onChange={e => updateRating(r.id, { color: e.target.value })}
                                disabled={readOnly}
                                className="absolute opacity-0 w-0 h-0"
                              />
                            </div>
                          </td>
                          <td className="border border-border px-2 py-1.5">
                            <Input
                              value={r.tee}
                              onChange={e => updateRating(r.id, { tee: e.target.value })}
                              disabled={readOnly}
                              placeholder="e.g. Yellow (Mens)"
                              className="h-7 text-sm border-0 bg-transparent p-0 focus-visible:ring-0"
                            />
                          </td>
                          <td className="border border-border px-2 py-1.5">
                            <Input
                              value={r.course_rating}
                              onChange={e => updateRating(r.id, { course_rating: e.target.value })}
                              disabled={readOnly}
                              placeholder="74.7"
                              className="h-7 text-sm text-center border-0 bg-transparent p-0 focus-visible:ring-0"
                            />
                          </td>
                          <td className="border border-border px-2 py-1.5">
                            <Input
                              value={r.slope_rating}
                              onChange={e => updateRating(r.id, { slope_rating: e.target.value })}
                              disabled={readOnly}
                              placeholder="138"
                              className="h-7 text-sm text-center border-0 bg-transparent p-0 focus-visible:ring-0"
                            />
                          </td>
                          {!readOnly && (
                            <td className="border border-border px-2 py-1.5 text-center">
                              <Button
                                variant="ghost" size="icon"
                                className="h-7 w-7 text-destructive hover:text-destructive"
                                onClick={() => removeRating(r.id)}
                              >
                                <Trash2 className="h-3.5 w-3.5" />
                              </Button>
                            </td>
                          )}
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
            </CardContent>
          </Card>

          {/* Footer / additional notes */}
          <Card>
            <CardHeader className="pb-3">
              <CardTitle className="text-base">Footer Notes</CardTitle>
              <p className="text-xs text-muted-foreground">
                Shown at the bottom of the scorecard — pin placements, distance markers, or any other club notes.
              </p>
            </CardHeader>
            <CardContent>
              <Textarea
                value={footerNotes}
                onChange={e => setFooterNotes(e.target.value)}
                disabled={readOnly}
                placeholder="e.g. Distance Markers: Fairways | Pole Markers: Middle of the Green | Stone Markers: Front of the Green&#10;Pin Placements: White - Front | Yellow - Middle | Red - Back"
                rows={4}
                className="resize-y text-sm font-mono"
              />
            </CardContent>
          </Card>
        </div>
      )}
    </div>
  );
}

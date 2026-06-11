import { useState } from "react";

const GREEN = "#1a5c38";
const GOLD = "#c8a84b";

const MOCK_GROUPS = [
  { group: 1, hole: 1, label: "A", players: ["Pieter van Wyk", "Johan Botha", "Andre Smit", "Louis Nel"] },
  { group: 2, hole: 1, label: "B", players: ["Morne Visser", "Thabo Dlamini", "Rikus Pretorius", "Jaco Venter"] },
  { group: 3, hole: 2, label: "A", players: ["Eugene Steyn", "Charl Fourie", "Danie Grobler", "Herman Louw"] },
  { group: 4, hole: 2, label: "B", players: ["Francois Meyer", "Jan Naudé", "Gert Botes", "Rian Joubert"] },
  { group: 5, hole: 3, label: "A", players: ["Petrus Jacobs", "Schalk Burger", "Ernst Bekker", "Cobus Viljoen"] },
  { group: 6, hole: 3, label: "B", players: ["Dewald Vorster", "Hannes Cronjé", "Louw Delport", "Frikkie Bothma"] },
  { group: 7, hole: 4, label: "A", players: ["Christo Stander", "Brent Erasmus", "Wynand Swart", "Carel Terblanche"] },
  { group: 8, hole: 4, label: "B", players: ["Tiaan Joubert", "Elias Molefe", "Gareth Davies", "Riaan Kriel"] },
  { group: 9, hole: 5, label: "A", players: ["Marco Ferreira", "Bradley van Zyl", "Wian Volschenk", "Thys Strydom"] },
];

export function ShotgunDraw() {
  const [published, setPublished] = useState(false);
  const [filter, setFilter] = useState<"all" | number>("all");
  const shotgunTime = "07:30";
  const totalPlayers = MOCK_GROUPS.reduce((s, g) => s + g.players.length, 0);

  const holes = [...new Set(MOCK_GROUPS.map(g => g.hole))].sort((a, b) => a - b);
  const displayGroups = filter === "all" ? MOCK_GROUPS : MOCK_GROUPS.filter(g => g.hole === filter);

  return (
    <div className="min-h-screen bg-gray-50 flex items-start justify-center p-5">
      <div className="w-full max-w-2xl space-y-4">

        {/* Header */}
        <div className="flex items-start justify-between">
          <div>
            <h1 className="text-lg font-bold text-gray-900">Club Championship 2025</h1>
            <p className="text-sm text-gray-500">Draw · Round 1 · Sat 14 Jun 2025</p>
          </div>
          <div className="flex items-center gap-2">
            {published
              ? <span className="text-xs px-2.5 py-1 rounded-full font-medium bg-green-100 text-green-700 border border-green-200">Published</span>
              : <span className="text-xs px-2.5 py-1 rounded-full font-medium bg-amber-100 text-amber-700 border border-amber-200">Draft</span>
            }
          </div>
        </div>

        {/* Shotgun Start summary banner */}
        <div className="flex items-center gap-3 px-4 py-3 rounded-xl border bg-white" style={{ borderColor: "#b7dfc8" }}>
          <div className="w-10 h-10 rounded-full flex items-center justify-center flex-shrink-0" style={{ background: "#f0faf4" }}>
            <svg className="h-5 w-5" style={{ color: GREEN }} fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 10V3L4 14h7v7l9-11h-7z" />
            </svg>
          </div>
          <div className="flex-1">
            <p className="text-sm font-semibold" style={{ color: GREEN }}>Shotgun Start — {shotgunTime}</p>
            <p className="text-xs text-gray-500">All {MOCK_GROUPS.length} groups start simultaneously · {totalPlayers} players · 18-hole course · Double teeing enabled</p>
          </div>
          <div className="text-right">
            <p className="text-xs text-gray-400">Max capacity</p>
            <p className="text-sm font-bold text-gray-700">36 groups</p>
          </div>
        </div>

        {/* Toolbar */}
        <div className="flex items-center gap-2 flex-wrap">
          <div className="flex gap-1 bg-white border border-gray-200 rounded-lg p-0.5">
            <button onClick={() => setFilter("all")}
              className={`px-3 py-1.5 rounded text-xs font-medium transition-colors ${filter === "all" ? "text-white" : "text-gray-600 hover:bg-gray-50"}`}
              style={filter === "all" ? { background: GREEN } : {}}>
              All holes
            </button>
            {holes.map(h => (
              <button key={h} onClick={() => setFilter(h)}
                className={`px-3 py-1.5 rounded text-xs font-medium transition-colors ${filter === h ? "text-white" : "text-gray-600 hover:bg-gray-50"}`}
                style={filter === h ? { background: GREEN } : {}}>
                Hole {h}
              </button>
            ))}
            <span className="text-gray-300 text-xs self-center px-1">…</span>
          </div>

          <div className="ml-auto flex gap-2">
            <button className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg border border-gray-200 bg-white text-xs font-medium text-gray-600 hover:bg-gray-50">
              <svg className="h-3.5 w-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15" />
              </svg>
              Regenerate
            </button>
            <button
              onClick={() => setPublished(v => !v)}
              className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-medium text-white"
              style={{ background: published ? "#6b7280" : GOLD }}>
              {published ? "Unpublish" : "Publish Draw"}
            </button>
          </div>
        </div>

        {/* Draw type label */}
        <p className="text-xs text-gray-400 flex items-center gap-1.5">
          <svg className="h-3 w-3" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8 16H6a2 2 0 01-2-2V6a2 2 0 012-2h8a2 2 0 012 2v2m-6 12h8a2 2 0 002-2v-8a2 2 0 00-2-2h-8a2 2 0 00-2 2v8a2 2 0 002 2z" />
          </svg>
          Random Draw · Shotgun Start · Holes auto-assigned
        </p>

        {/* Group cards — shotgun layout */}
        <div className="space-y-2">
          {displayGroups.map(grp => (
            <div key={grp.group} className="bg-white rounded-xl border border-gray-200 shadow-sm overflow-hidden">
              {/* Group header */}
              <div className="flex items-center gap-3 px-4 py-2.5 border-b border-gray-100" style={{ background: "#f8fdf9" }}>
                {/* Hole badge (PRIMARY info for shotgun) */}
                <div className="flex items-center gap-1.5">
                  <div className="w-8 h-8 rounded-full flex items-center justify-center text-white text-xs font-bold flex-shrink-0" style={{ background: GREEN }}>
                    {grp.hole}
                  </div>
                  <div>
                    <p className="text-xs text-gray-400 leading-none">Hole</p>
                    <p className="text-sm font-bold leading-tight" style={{ color: GREEN }}>Group {grp.label}</p>
                  </div>
                </div>

                <div className="w-px h-8 bg-gray-200 mx-1" />

                {/* Start time — shared across all */}
                <div className="flex items-center gap-1.5 text-gray-500">
                  <svg className="h-3.5 w-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z" />
                  </svg>
                  <span className="text-xs font-mono">{shotgunTime}</span>
                  <span className="text-xs text-gray-400">(all groups)</span>
                </div>

                {/* Draw group number */}
                <span className="ml-auto text-xs text-gray-400">Group {grp.group}</span>
              </div>

              {/* Players */}
              <div className="divide-y divide-gray-50">
                {grp.players.map((name, idx) => (
                  <div key={name} className="flex items-center gap-3 px-4 py-2 text-sm">
                    <span className="w-5 h-5 rounded-full text-[10px] font-bold flex items-center justify-center flex-shrink-0" style={{ background: "#f0faf4", color: GREEN }}>
                      {idx + 1}
                    </span>
                    <span className="font-medium text-gray-800 flex-1">{name}</span>
                    <span className="text-xs text-gray-400">HCP 12</span>
                    <span className="text-xs px-1.5 py-0.5 rounded" style={{ background: "#f0faf4", color: GREEN }}>B Div</span>
                  </div>
                ))}
              </div>
            </div>
          ))}
        </div>

        {filter === "all" && (
          <p className="text-xs text-center text-gray-400 pb-4">Showing {MOCK_GROUPS.length} of 18 groups · 9 holes remaining unassigned</p>
        )}
      </div>
    </div>
  );
}

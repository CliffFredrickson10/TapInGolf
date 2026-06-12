import { useState } from "react";

const GREEN = "#1a5c38";
const GOLD  = "#c8a84b";

const TEAM_COLORS = ["#1a5c38", "#7c3aed", "#b45309", "#be123c", "#0369a1", "#d97706"];

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

const INITIAL_TEAMS = [
  { id: 1, name: "Team A", color: TEAM_COLORS[0], players: ["Pieter van Wyk", "Johan Botha"] },
  { id: 2, name: "Team B", color: TEAM_COLORS[1], players: ["Morne Visser", "Thabo Dlamini", "Rikus Pretorius"] },
  { id: 3, name: "Team C", color: TEAM_COLORS[2], players: ["Eugene Steyn", "Charl Fourie", "Danie Grobler", "Herman Louw"] },
  { id: 4, name: "Team D", color: TEAM_COLORS[3], players: ["Francois Meyer", "Jan Naudé"] },
  { id: 5, name: "Team E", color: TEAM_COLORS[4], players: ["Petrus Jacobs", "Schalk Burger"] },
];

const ALL_PLAYERS = MOCK_GROUPS.flatMap(g => g.players);

export function ShotgunDraw() {
  const [published, setPublished]   = useState(false);
  const [filter, setFilter]         = useState<"all" | number>("all");
  const [view, setView]             = useState<"draw" | "teams">("draw");
  const [teams, setTeams]           = useState(INITIAL_TEAMS);
  const [addingTeam, setAddingTeam] = useState(false);
  const [draftPlayers, setDraftPlayers] = useState<string[]>([]);
  const [draftSize, setDraftSize]   = useState(2);

  const shotgunTime  = "07:30";
  const totalPlayers = MOCK_GROUPS.reduce((s, g) => s + g.players.length, 0);
  const holes        = [...new Set(MOCK_GROUPS.map(g => g.hole))].sort((a, b) => a - b);
  const displayGroups = filter === "all" ? MOCK_GROUPS : MOCK_GROUPS.filter(g => g.hole === filter);

  const pairedSet   = new Set(teams.flatMap(t => t.players));
  const unpaired    = ALL_PLAYERS.filter(p => !pairedSet.has(p));
  const playerTeamMap = new Map(teams.flatMap(t => t.players.map(p => [p, t])));

  const removeTeam = (id: number) => setTeams(prev => prev.filter(t => t.id !== id));

  const toggleDraft = (player: string) => {
    if (pairedSet.has(player)) return;
    setDraftPlayers(prev =>
      prev.includes(player)
        ? prev.filter(p => p !== player)
        : prev.length < draftSize ? [...prev, player] : prev
    );
  };

  const addTeam = () => {
    if (draftPlayers.length < 2) return;
    const letter = String.fromCharCode(65 + teams.length);
    const color  = TEAM_COLORS[teams.length % TEAM_COLORS.length];
    setTeams(prev => [...prev, { id: Date.now(), name: `Team ${letter}`, color, players: draftPlayers }]);
    setDraftPlayers([]);
    setAddingTeam(false);
  };

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

        {/* Shotgun summary banner */}
        <div className="flex items-center gap-3 px-4 py-3 rounded-xl border bg-white" style={{ borderColor: "#b7dfc8" }}>
          <div className="w-10 h-10 rounded-full flex items-center justify-center flex-shrink-0" style={{ background: "#f0faf4" }}>
            <svg className="h-5 w-5" style={{ color: GREEN }} fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 10V3L4 14h7v7l9-11h-7z" />
            </svg>
          </div>
          <div className="flex-1">
            <p className="text-sm font-semibold" style={{ color: GREEN }}>Shotgun Start — {shotgunTime}</p>
            <p className="text-xs text-gray-500">
              All {MOCK_GROUPS.length} groups start simultaneously · {totalPlayers} players · {teams.length} team{teams.length !== 1 ? "s" : ""} paired
            </p>
          </div>
          <div className="text-right">
            <p className="text-xs text-gray-400">Max capacity</p>
            <p className="text-sm font-bold text-gray-700">36 groups</p>
          </div>
        </div>

        {/* View tabs + toolbar */}
        <div className="flex items-center gap-2 flex-wrap">
          {/* View toggle */}
          <div className="flex gap-0.5 bg-white border border-gray-200 rounded-lg p-0.5">
            <button onClick={() => setView("draw")}
              className={`px-3 py-1.5 rounded text-xs font-medium transition-colors ${view === "draw" ? "text-white" : "text-gray-600 hover:bg-gray-50"}`}
              style={view === "draw" ? { background: GREEN } : {}}>
              Draw
            </button>
            <button onClick={() => setView("teams")}
              className={`flex items-center gap-1.5 px-3 py-1.5 rounded text-xs font-medium transition-colors ${view === "teams" ? "text-white" : "text-gray-600 hover:bg-gray-50"}`}
              style={view === "teams" ? { background: GREEN } : {}}>
              Pairings
              <span className={`text-[10px] px-1.5 py-0.5 rounded-full font-bold ${view === "teams" ? "bg-white/25 text-white" : "bg-gray-100 text-gray-600"}`}>
                {teams.length}
              </span>
            </button>
          </div>

          {/* Hole filter — only in draw view */}
          {view === "draw" && (
            <div className="flex gap-1 bg-white border border-gray-200 rounded-lg p-0.5">
              <button onClick={() => setFilter("all")}
                className={`px-3 py-1.5 rounded text-xs font-medium transition-colors ${filter === "all" ? "text-white" : "text-gray-600 hover:bg-gray-50"}`}
                style={filter === "all" ? { background: GREEN } : {}}>
                All
              </button>
              {holes.map(h => (
                <button key={h} onClick={() => setFilter(h)}
                  className={`px-3 py-1.5 rounded text-xs font-medium transition-colors ${filter === h ? "text-white" : "text-gray-600 hover:bg-gray-50"}`}
                  style={filter === h ? { background: GREEN } : {}}>
                  H{h}
                </button>
              ))}
              <span className="text-gray-300 text-xs self-center px-1">…</span>
            </div>
          )}

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

        {/* ── DRAW VIEW ────────────────────────────────────────────────── */}
        {view === "draw" && (
          <>
            <p className="text-xs text-gray-400 flex items-center gap-1.5">
              <svg className="h-3 w-3" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8 16H6a2 2 0 01-2-2V6a2 2 0 012-2h8a2 2 0 012 2v2m-6 12h8a2 2 0 002-2v-8a2 2 0 00-2-2h-8a2 2 0 00-2 2v8a2 2 0 002 2z" />
              </svg>
              Random Draw · Shotgun Start · Holes auto-assigned · Coloured dots indicate team pairings
            </p>

            <div className="space-y-2">
              {displayGroups.map(grp => (
                <div key={grp.group} className="bg-white rounded-xl border border-gray-200 shadow-sm overflow-hidden">
                  <div className="flex items-center gap-3 px-4 py-2.5 border-b border-gray-100" style={{ background: "#f8fdf9" }}>
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
                    <div className="flex items-center gap-1.5 text-gray-500">
                      <svg className="h-3.5 w-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z" />
                      </svg>
                      <span className="text-xs font-mono">{shotgunTime}</span>
                      <span className="text-xs text-gray-400">(all groups)</span>
                    </div>
                    {/* Team indicator in group header */}
                    {(() => {
                      const grpTeams = [...new Set(grp.players.map(p => playerTeamMap.get(p)).filter(Boolean))] as typeof INITIAL_TEAMS;
                      return grpTeams.length > 0 && (
                        <div className="ml-auto flex items-center gap-1">
                          {grpTeams.map(t => (
                            <span key={t.id} className="w-2.5 h-2.5 rounded-full" style={{ background: t.color }} title={t.name} />
                          ))}
                        </div>
                      );
                    })()}
                    <span className={`${playerTeamMap.get(grp.players[0]) ? "" : "ml-auto"} text-xs text-gray-400`}>Group {grp.group}</span>
                  </div>

                  <div className="divide-y divide-gray-50">
                    {grp.players.map((name, idx) => {
                      const team = playerTeamMap.get(name);
                      return (
                        <div key={name} className="flex items-center gap-2.5 px-4 py-2 text-sm">
                          <span className="w-5 h-5 rounded-full text-[10px] font-bold flex items-center justify-center flex-shrink-0" style={{ background: "#f0faf4", color: GREEN }}>
                            {idx + 1}
                          </span>
                          {team
                            ? <span className="w-2.5 h-2.5 rounded-full flex-shrink-0" style={{ background: team.color }} title={team.name} />
                            : <span className="w-2.5 h-2.5 rounded-full flex-shrink-0 bg-gray-200" title="Unpaired" />
                          }
                          <span className="font-medium text-gray-800 flex-1">{name}</span>
                          {team && (
                            <span className="text-[10px] px-1.5 py-0.5 rounded-full font-medium text-white flex-shrink-0" style={{ background: team.color }}>
                              {team.name}
                            </span>
                          )}
                          <span className="text-xs text-gray-400">HCP 12</span>
                          <span className="text-xs px-1.5 py-0.5 rounded" style={{ background: "#f0faf4", color: GREEN }}>B Div</span>
                        </div>
                      );
                    })}
                  </div>
                </div>
              ))}
            </div>

            {filter === "all" && (
              <p className="text-xs text-center text-gray-400 pb-4">Showing {MOCK_GROUPS.length} of 18 groups · 9 holes remaining unassigned</p>
            )}
          </>
        )}

        {/* ── PAIRINGS VIEW ───────────────────────────────────────────── */}
        {view === "teams" && (
          <div className="space-y-3 pb-4">
            <div className="flex items-center justify-between">
              <p className="text-xs text-gray-500">
                {teams.length} team{teams.length !== 1 ? "s" : ""} · {pairedSet.size} of {totalPlayers} players paired
              </p>
              {!addingTeam && (
                <button onClick={() => setAddingTeam(true)}
                  className="flex items-center gap-1 px-3 py-1.5 rounded-lg text-xs font-medium text-white"
                  style={{ background: GREEN }}>
                  <svg className="h-3 w-3" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4v16m8-8H4" />
                  </svg>
                  Add Pairing
                </button>
              )}
            </div>

            {/* Defined teams */}
            {teams.map(team => {
              const assignedGroup = MOCK_GROUPS.find(g => team.players.some(p => g.players.includes(p)));
              return (
                <div key={team.id} className="bg-white rounded-xl border border-gray-200 shadow-sm overflow-hidden">
                  <div className="flex items-center gap-3 px-4 py-3 border-b border-gray-100" style={{ background: "#fafafa" }}>
                    <div className="w-3 h-3 rounded-full flex-shrink-0" style={{ background: team.color }} />
                    <span className="text-sm font-semibold text-gray-800">{team.name}</span>
                    <span className="text-xs text-gray-400">{team.players.length}-ball</span>
                    {assignedGroup && (
                      <span className="ml-auto text-[11px] px-2 py-0.5 rounded-full font-medium text-white" style={{ background: team.color }}>
                        Hole {assignedGroup.hole} · Group {assignedGroup.label}
                      </span>
                    )}
                    <button onClick={() => removeTeam(team.id)} className="text-gray-300 hover:text-red-400 ml-1" title="Remove pairing">
                      <svg className="h-3.5 w-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                      </svg>
                    </button>
                  </div>
                  <div className="px-4 py-3 flex flex-wrap gap-1.5">
                    {team.players.map(p => (
                      <span key={p} className="inline-flex items-center px-2.5 py-1 rounded-full text-xs font-medium text-white" style={{ background: team.color }}>
                        {p}
                      </span>
                    ))}
                  </div>
                </div>
              );
            })}

            {/* Add pairing form */}
            {addingTeam && (
              <div className="bg-white rounded-xl border-2 border-dashed shadow-sm p-4 space-y-4" style={{ borderColor: "#b7dfc8" }}>
                <div className="flex items-center justify-between">
                  <p className="text-sm font-semibold text-gray-800">New Team Pairing</p>
                  <div className="flex items-center gap-1">
                    <span className="text-xs text-gray-500 mr-1">Size:</span>
                    {[2, 4].map(n => (
                      <button key={n} onClick={() => { setDraftSize(n); setDraftPlayers(p => p.slice(0, n)); }}
                        className={`w-7 h-7 rounded text-xs font-bold transition-colors ${draftSize === n ? "text-white" : "border border-gray-200 text-gray-600"}`}
                        style={draftSize === n ? { background: GREEN } : {}}>
                        {n}
                      </button>
                    ))}
                  </div>
                </div>

                <div>
                  <p className="text-xs text-gray-500 mb-2">Select {draftSize} players ({draftPlayers.length}/{draftSize} selected)</p>
                  <div className="flex flex-wrap gap-1.5">
                    {unpaired.map(p => {
                      const selected = draftPlayers.includes(p);
                      const disabled = !selected && draftPlayers.length >= draftSize;
                      return (
                        <button key={p} onClick={() => toggleDraft(p)} disabled={disabled}
                          className={`px-2.5 py-1.5 rounded-full text-xs font-medium transition-colors border ${selected ? "text-white border-transparent" : "border-gray-200 text-gray-600"} ${disabled ? "opacity-40 cursor-default" : "hover:border-green-300"}`}
                          style={selected ? { background: TEAM_COLORS[teams.length % TEAM_COLORS.length] } : {}}>
                          {p}
                        </button>
                      );
                    })}
                    {unpaired.length === 0 && (
                      <p className="text-xs text-gray-400">All players are already paired.</p>
                    )}
                  </div>
                </div>

                <div className="flex gap-2">
                  <button onClick={() => { setAddingTeam(false); setDraftPlayers([]); }}
                    className="px-3 py-1.5 rounded-lg border border-gray-200 text-xs font-medium text-gray-600 hover:bg-gray-50">
                    Cancel
                  </button>
                  <button onClick={addTeam} disabled={draftPlayers.length < 2}
                    className="px-4 py-1.5 rounded-lg text-xs font-medium text-white disabled:opacity-40"
                    style={{ background: GREEN }}>
                    Add Team ({draftPlayers.length} player{draftPlayers.length !== 1 ? "s" : ""})
                  </button>
                </div>
              </div>
            )}

            {/* Unpaired players */}
            {unpaired.length > 0 && (
              <div className="bg-white rounded-xl border border-gray-200 shadow-sm p-4">
                <p className="text-xs font-medium text-gray-500 mb-3">
                  Unpaired ({unpaired.length}) — will be randomly assigned to groups
                </p>
                <div className="flex flex-wrap gap-1.5">
                  {unpaired.map(p => (
                    <span key={p} className="px-2.5 py-1 bg-gray-100 rounded-full text-xs text-gray-600">{p}</span>
                  ))}
                </div>
              </div>
            )}
          </div>
        )}

      </div>
    </div>
  );
}

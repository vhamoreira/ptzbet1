import React, { useState, useEffect, useCallback, useMemo } from 'react';
import { Trophy, Lock, ChevronDown, ChevronUp, ArrowLeft, RefreshCw } from 'lucide-react';
import { createClient } from '@supabase/supabase-js';

const SUPABASE_URL = 'https://eiphjwnycqorlddcfitw.supabase.co';
const SUPABASE_ANON_KEY = 'sb_publishable_0tP0CeVgysNLJk6S-fY0yA_qUN-jYvz';
const supabase = createClient(SUPABASE_URL, SUPABASE_ANON_KEY);

const PLAYERS = ['fabio', 'paulo', 'pesqui', 'sergio', 'vitor'];
const ADMIN_PIN = '2026';

// ---- storage helper (igual ao Mundial) ----
const storage = {
  async get(key, shared) {
    if (!shared) {
      try { const v = localStorage.getItem(key); return v !== null ? { key, value: v } : null; }
      catch (e) { return null; }
    }
    const { data, error } = await supabase.from('app_storage').select('value').eq('key', key).maybeSingle();
    if (error) throw error;
    return data ? { key, value: data.value } : null;
  },
  async set(key, value, shared) {
    if (!shared) {
      try { localStorage.setItem(key, value); } catch (e) {}
      return { key, value };
    }
    const { error } = await supabase.from('app_storage')
      .upsert({ key, value, updated_at: new Date().toISOString() }, { onConflict: 'key' });
    if (error) throw error;
    return { key, value };
  },
  async list(prefix, shared) {
    if (!shared) return { keys: [] };
    const { data, error } = await supabase.from('app_storage').select('key').like('key', `${prefix}%`);
    if (error) throw error;
    return { keys: (data || []).map(r => r.key) };
  },
};

function slug(name) {
  return name.trim().toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '').replace(/[^a-z0-9]/g, '_');
}

function outcomeOf(a, b) {
  const na = Number(a), nb = Number(b);
  if (na > nb) return 'A';
  if (nb > na) return 'B';
  return 'D';
}

// Pontos: exato +5, VED +3, ambas marcam +2
function pointsFor(pick, match) {
  if (!pick || !match || match.status !== 'FINISHED') return { exact: 0, outcome: 0, both: 0, total: 0 };
  const sA = match.scoreHome, sB = match.scoreAway;
  if (sA == null || sB == null) return { exact: 0, outcome: 0, both: 0, total: 0 };

  let exact = 0, outcome = 0, both = 0;
  if (pick.outcome === outcomeOf(sA, sB)) outcome = 3;
  if (pick.scoreA !== '' && pick.scoreA != null && pick.scoreB !== '' && pick.scoreB != null &&
      Number(pick.scoreA) === Number(sA) && Number(pick.scoreB) === Number(sB)) exact = 5;
  const actualBoth = sA > 0 && sB > 0;
  if (pick.bothScore != null && pick.bothScore === actualBoth) both = 2;
  return { exact, outcome, both, total: exact + outcome + both };
}

export default function LeaguesApp({ onBackToArchive }) {
  const [stage, setStage] = useState('loading'); // loading | name | app
  const [myName, setMyName] = useState('');
  const [nameInput, setNameInput] = useState('');
  const [isAdmin, setIsAdmin] = useState(false);

  const [view, setView] = useState('tournaments'); // tournaments | tournament | profile
  const [profilePlayer, setProfilePlayer] = useState(null);
  const [activeTournament, setActiveTournament] = useState(null);
  const [innerTab, setInnerTab] = useState('current'); // current | history | standings

  const [tournaments, setTournaments] = useState([]);
  const [weeks, setWeeks] = useState({});          // weekId -> weekData
  const [allPicks, setAllPicks] = useState([]);    // [{name, picks:{weekId:{matchId:pick}}}]
  const [toast, setToast] = useState(null);

  const showToast = useCallback((msg) => {
    setToast(msg);
    setTimeout(() => setToast(null), 2500);
  }, []);

  // ---- carregar nome guardado ----
  useEffect(() => {
    (async () => {
      try {
        const n = await storage.get('lg_myName', false);
        if (n && n.value) { setMyName(n.value); setStage('app'); }
        else setStage('name');
      } catch (e) { setStage('name'); }
    })();
  }, []);

  // ---- carregar torneios e semanas ----
  const loadData = useCallback(async () => {
    try {
      // índice de torneios
      const tRow = await storage.get('lg_tournaments', true);
      const tList = tRow && tRow.value ? JSON.parse(tRow.value) : [];
      setTournaments(tList);

      // todas as semanas de todos os torneios
      const wkList = await storage.list('week_', true);
      const wkKeys = (wkList && wkList.keys) || [];
      const wkMap = {};
      for (const k of wkKeys) {
        try {
          const v = await storage.get(k, true);
          if (v && v.value) {
            const wd = JSON.parse(v.value);
            wkMap[wd.id] = wd;
          }
        } catch (e) {}
      }
      setWeeks(wkMap);
    } catch (e) {}
  }, []);

  const loadAllPicks = useCallback(async () => {
    try {
      const list = await storage.list('lgpicks_', true);
      const keys = (list && list.keys) || [];
      const rows = [];
      for (const k of keys) {
        try {
          const v = await storage.get(k, true);
          if (v && v.value) {
            const parsed = JSON.parse(v.value);
            rows.push({ name: parsed.name, picks: parsed.picks || {}, specials: parsed.specials || {} });
          }
        } catch (e) {}
      }
      setAllPicks(rows);
    } catch (e) {}
  }, []);

  useEffect(() => {
    if (stage !== 'app') return;
    loadData();
    loadAllPicks();
    const iv = setInterval(() => { loadData(); loadAllPicks(); }, 15000);
    return () => clearInterval(iv);
  }, [stage, loadData, loadAllPicks]);

  const myPicks = useMemo(() => {
    const mine = allPicks.find(p => p.name === myName);
    return mine ? mine.picks : {};
  }, [allPicks, myName]);

  async function handleNameSubmit(e) {
    e.preventDefault();
    const t = nameInput.trim();
    if (!t) return;
    setMyName(t);
    try { await storage.set('lg_myName', t, false); } catch (e) {}
    setStage('app');
  }

  async function savePick(weekId, matchId, partial) {
    const cur = myPicks[weekId] ? { ...myPicks[weekId] } : {};
    cur[matchId] = { ...(cur[matchId] || {}), ...partial };
    const nextPicks = { ...myPicks, [weekId]: cur };
    setAllPicks(prev => {
      const others = prev.filter(p => p.name !== myName);
      return [...others, { name: myName, picks: nextPicks }];
    });
    try {
      await storage.set(`lgpicks_${slug(myName)}`, JSON.stringify({ name: myName, picks: nextPicks }), true);
    } catch (e) { showToast('Erro ao guardar'); }
  }

  if (stage === 'loading') {
    return <div className="min-h-screen bg-slate-950 flex items-center justify-center text-slate-400">A carregar...</div>;
  }

  if (stage === 'name') {
    return (
      <div className="min-h-screen bg-slate-950 flex items-center justify-center px-4">
        <form onSubmit={handleNameSubmit} className="w-full max-w-sm flex flex-col gap-4">
          <h1 className="text-2xl font-bold text-stone-100 text-center">PTZ Bet — Ligas</h1>
          <input
            value={nameInput}
            onChange={e => setNameInput(e.target.value)}
            placeholder="O teu nome..."
            className="rounded-xl bg-slate-800 border border-slate-700 text-stone-100 px-4 py-3"
          />
          <button type="submit" className="bg-amber-500 text-slate-900 font-bold py-3 rounded-xl">Entrar</button>
        </form>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-slate-950 text-stone-100 pb-10">
      {toast && (
        <div className="fixed top-4 left-1/2 -translate-x-1/2 z-50 bg-slate-800 border border-slate-600 px-4 py-2 rounded-lg text-sm shadow-lg">
          {toast}
        </div>
      )}

      <div className="max-w-2xl mx-auto px-4 pt-4">
        {/* Cabeçalho */}
        <div className="flex items-center justify-between mb-4">
          <div className="flex items-center gap-2">
            <Trophy className="text-amber-400" size={22} />
            <h1 className="font-bold text-lg">PTZ Bet</h1>
          </div>
          <div className="flex items-center gap-3 text-xs text-slate-400">
            <button
              onClick={() => { setProfilePlayer(myName); setView('profile'); }}
              className="flex items-center gap-1 hover:text-amber-300 transition"
            >
              <span className="w-6 h-6 rounded-full bg-amber-500 text-slate-900 font-bold flex items-center justify-center text-xs capitalize">
                {myName.charAt(0)}
              </span>
              <span className="capitalize">{myName}</span>
            </button>
            {onBackToArchive && (
              <button onClick={onBackToArchive} className="underline hover:text-amber-300">Mundial</button>
            )}
          </div>
        </div>

        {view === 'profile' && profilePlayer && (
          <ProfileView
            player={profilePlayer}
            myName={myName}
            tournaments={tournaments}
            weeks={weeks}
            allPicks={allPicks}
            onBack={() => setView('tournaments')}
            onOpenPlayer={(p) => setProfilePlayer(p)}
          />
        )}

        {view === 'tournaments' && (
          <TournamentList
            tournaments={tournaments}
            weeks={weeks}
            onOpen={(t) => { setActiveTournament(t); setView('tournament'); setInnerTab('current'); }}
          />
        )}

        {view === 'tournament' && activeTournament && (
          <TournamentView
            tournament={activeTournament}
            weeks={weeks}
            myName={myName}
            myPicks={myPicks}
            allPicks={allPicks}
            innerTab={innerTab}
            setInnerTab={setInnerTab}
            onBack={() => setView('tournaments')}
            onSavePick={savePick}
          />
        )}
      </div>
    </div>
  );
}

// ---- Lista de torneios ----
function TournamentList({ tournaments, weeks, onOpen }) {
  const active = tournaments.filter(t => t.status === 'active');
  const finished = tournaments.filter(t => t.status === 'finished');

  const TournamentCard = ({ t }) => {
    const typeIcon = t.type === 'league' ? '⚽' : t.type === 'champions' ? '🏆' : '🎯';
    return (
      <button
        onClick={() => onOpen(t)}
        className="w-full text-left rounded-xl border border-slate-700 bg-slate-800/60 p-4 hover:border-amber-500/50 transition"
      >
        <div className="flex items-center justify-between">
          <div>
            <p className="font-bold text-stone-100">{typeIcon} {t.name}</p>
            <p className="text-xs text-slate-400 mt-0.5">{t.season}</p>
          </div>
          <ChevronDown className="-rotate-90 text-slate-500" size={18} />
        </div>
      </button>
    );
  };

  return (
    <div className="flex flex-col gap-3">
      <p className="text-xs font-bold text-slate-400 uppercase">Activos</p>
      {active.length === 0 && <p className="text-sm text-slate-500">Ainda não há torneios activos.</p>}
      {active.map(t => <TournamentCard key={t.id} t={t} />)}

      {finished.length > 0 && (
        <>
          <p className="text-xs font-bold text-slate-400 uppercase mt-3">Terminados</p>
          {finished.map(t => <TournamentCard key={t.id} t={t} />)}
        </>
      )}
    </div>
  );
}

// ---- Vista de um torneio ----
function TournamentView({ tournament, weeks, myName, myPicks, allPicks, innerTab, setInnerTab, onBack, onSavePick }) {
  const tournamentWeeks = useMemo(() =>
    Object.values(weeks)
      .filter(w => w.tournamentId === tournament.id)
      .sort((a, b) => a.dateFrom.localeCompare(b.dateFrom)),
    [weeks, tournament]);

  const currentWeek = useMemo(() => {
    const now = Date.now();
    // semana actual = a que ainda não terminou, ou a mais recente
    const upcoming = tournamentWeeks.filter(w => new Date(w.dateTo).getTime() > now - 24 * 3600 * 1000);
    return upcoming[0] || tournamentWeeks[tournamentWeeks.length - 1];
  }, [tournamentWeeks]);

  return (
    <div className="flex flex-col gap-4">
      <button onClick={onBack} className="flex items-center gap-1 text-sm text-slate-400 hover:text-amber-300 w-fit">
        <ArrowLeft size={16} /> Torneios
      </button>

      <div>
        <h2 className="text-xl font-bold">{tournament.name}</h2>
        <p className="text-xs text-slate-400">{tournament.season}</p>
      </div>

      <div className="flex rounded-xl bg-slate-800 p-1">
        {[['current', 'Semana Actual'], ['history', 'Histórico'], ['standings', 'Classificação']].map(([val, label]) => (
          <button
            key={val}
            onClick={() => setInnerTab(val)}
            className={`flex-1 rounded-lg py-2 text-xs font-bold transition ${innerTab === val ? 'bg-amber-500 text-slate-900' : 'text-slate-400'}`}
          >{label}</button>
        ))}
      </div>

      {innerTab === 'current' && currentWeek && (
        <WeekView week={currentWeek} myName={myName} myPicks={myPicks} allPicks={allPicks} onSavePick={onSavePick} />
      )}
      {innerTab === 'current' && !currentWeek && (
        <p className="text-sm text-slate-500 text-center py-8">Ainda não há jogos definidos para este torneio.</p>
      )}

      {innerTab === 'history' && (
        <HistoryView weeks={tournamentWeeks} myName={myName} myPicks={myPicks} allPicks={allPicks} />
      )}

      {innerTab === 'standings' && (
        <StandingsView weeks={tournamentWeeks} allPicks={allPicks} myName={myName} />
      )}
    </div>
  );
}

// ---- Semana actual: jogos + apostas ----
function WeekView({ week, myName, myPicks, allPicks, onSavePick }) {
  const now = Date.now();
  const locked = new Date(week.deadline).getTime() <= now;
  const weekPicks = myPicks[week.id] || {};

  return (
    <div className="flex flex-col gap-3">
      <div className="flex items-center justify-between text-xs">
        <span className="text-slate-400">
          {new Date(week.dateFrom).toLocaleDateString('pt-PT', { day: 'numeric', month: 'short' })} – {new Date(week.dateTo).toLocaleDateString('pt-PT', { day: 'numeric', month: 'short' })}
        </span>
        <span className={locked ? 'text-rose-400' : 'text-emerald-400'}>
          {locked ? '🔒 Fechado' : `Fecha ${new Date(week.deadline).toLocaleDateString('pt-PT', { weekday: 'short', hour: '2-digit', minute: '2-digit' })}`}
        </span>
      </div>

      {week.matches.map(m => (
        <LeagueMatchCard
          key={m.id}
          match={m}
          weekId={week.id}
          pick={weekPicks[m.id]}
          locked={locked}
          myName={myName}
          allPicks={allPicks}
          onSavePick={onSavePick}
        />
      ))}
    </div>
  );
}

// ---- Card de um jogo ----
function LeagueMatchCard({ match, weekId, pick, locked, myName, allPicks, onSavePick }) {
  const [draft, setDraft] = useState(pick || { outcome: '', scoreA: '', scoreB: '', bothScore: null });
  const [othersOpen, setOthersOpen] = useState(false);

  useEffect(() => { if (pick) setDraft(pick); }, [pick]);

  const finished = match.status === 'FINISHED';
  const live = match.status === 'IN_PLAY' || match.status === 'PAUSED';
  const kickedOff = new Date(match.kickoff).getTime() <= Date.now();
  const editable = !locked && !kickedOff;
  const pts = finished ? pointsFor(pick, match) : null;

  function update(partial) {
    const next = { ...draft, ...partial };
    // inferir VED do exato
    const a = next.scoreA !== '' && next.scoreA != null ? Number(next.scoreA) : null;
    const b = next.scoreB !== '' && next.scoreB != null ? Number(next.scoreB) : null;
    if (a != null && b != null) {
      next.outcome = a > b ? 'A' : a < b ? 'B' : 'D';
      next.bothScore = a > 0 && b > 0;
    }
    setDraft(next);
    onSavePick(weekId, match.id, next);
  }

  const kickoffStr = new Date(match.kickoff).toLocaleDateString('pt-PT', { weekday: 'short', day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' });

  // palpites dos outros (só depois do kickoff)
  const otherPicks = allPicks
    .filter(p => p.name !== myName && p.picks?.[weekId]?.[match.id])
    .map(p => ({ name: p.name, pick: p.picks[weekId][match.id] }));

  return (
    <div className="rounded-xl border border-slate-700 bg-slate-800/60 overflow-hidden">
      {/* Cabeçalho */}
      <div className="px-4 py-2 flex items-center justify-between border-b border-slate-700/50">
        <span className="text-[10px] uppercase tracking-wide text-slate-500">{match.leagueName}{match.isClassic ? ' ⭐' : ''}</span>
        <span className="text-[10px] text-slate-500">{kickoffStr}</span>
      </div>

      {/* Equipas e placar */}
      <div className="px-4 py-3 flex items-center justify-between">
        <span className="font-bold text-sm flex-1">{match.homeTeam}</span>
        <span className="px-3 text-center tabular-nums font-bold">
          {finished || live ? `${match.scoreHome ?? 0} - ${match.scoreAway ?? 0}` : 'vs'}
          {live && <span className="block text-[10px] text-rose-400">AO VIVO</span>}
        </span>
        <span className="font-bold text-sm flex-1 text-right">{match.awayTeam}</span>
      </div>

      {/* Apostas */}
      <div className="px-4 py-3 border-t border-dashed border-slate-600 flex flex-col gap-3">
        {!editable && !finished && (
          <p className="text-xs text-rose-400">{live ? 'Jogo a decorrer' : locked ? 'Semana fechada' : 'Jogo já começou'} — palpites bloqueados.</p>
        )}

        {/* 1X2 */}
        <div>
          <p className="text-xs text-slate-400 mb-1.5">Resultado {finished && pts ? <span className={pts.outcome ? 'text-emerald-400' : 'text-rose-400'}>({pts.outcome ? '+3' : '0'})</span> : <span className="text-slate-600">+3 pts</span>}</p>
          <div className="grid grid-cols-3 gap-1.5">
            {[['A', '1'], ['D', 'X'], ['B', '2']].map(([val, label]) => (
              <button
                key={val}
                disabled={!editable}
                onClick={() => editable && update({ outcome: val })}
                className={`rounded-lg py-2 text-sm font-bold transition ${
                  draft.outcome === val ? 'bg-amber-500 text-slate-900' : editable ? 'bg-slate-700 text-slate-300 hover:bg-slate-600' : 'bg-slate-700/50 text-slate-500'
                }`}
              >{label}</button>
            ))}
          </div>
        </div>

        {/* Resultado exato */}
        <div>
          <p className="text-xs text-slate-400 mb-1.5">Resultado exato {finished && pts ? <span className={pts.exact ? 'text-emerald-400' : 'text-rose-400'}>({pts.exact ? '+5' : '0'})</span> : <span className="text-slate-600">+5 pts</span>}</p>
          <div className="flex items-center gap-2">
            <input type="number" min="0" disabled={!editable} value={draft.scoreA ?? ''} onChange={e => update({ scoreA: e.target.value })}
              className="w-14 text-center rounded-md bg-slate-700 border border-slate-600 text-stone-100 py-1.5 disabled:opacity-50" />
            <span className="text-slate-500">-</span>
            <input type="number" min="0" disabled={!editable} value={draft.scoreB ?? ''} onChange={e => update({ scoreB: e.target.value })}
              className="w-14 text-center rounded-md bg-slate-700 border border-slate-600 text-stone-100 py-1.5 disabled:opacity-50" />
          </div>
        </div>

        {/* Ambas marcam */}
        <div>
          <p className="text-xs text-slate-400 mb-1.5">Ambas marcam {finished && pts ? <span className={pts.both ? 'text-emerald-400' : 'text-rose-400'}>({pts.both ? '+2' : '0'})</span> : <span className="text-slate-600">+2 pts</span>}</p>
          <div className="grid grid-cols-2 gap-1.5">
            {[[true, 'Sim'], [false, 'Não']].map(([val, label]) => (
              <button
                key={label}
                disabled={!editable}
                onClick={() => editable && update({ bothScore: val })}
                className={`rounded-lg py-2 text-sm font-bold transition ${
                  draft.bothScore === val ? 'bg-amber-500 text-slate-900' : editable ? 'bg-slate-700 text-slate-300 hover:bg-slate-600' : 'bg-slate-700/50 text-slate-500'
                }`}
              >{label}</button>
            ))}
          </div>
        </div>

        {finished && pts && (
          <p className="text-xs text-center font-bold text-amber-300">Total: +{pts.total} pts</p>
        )}
      </div>

      {/* Palpites da galera */}
      {kickedOff && otherPicks.length > 0 && (
        <div className="border-t border-slate-700">
          <button onClick={() => setOthersOpen(v => !v)} className="w-full flex items-center justify-between px-4 py-2 text-xs font-bold text-slate-400">
            Palpites da galera ({otherPicks.length})
            {othersOpen ? <ChevronUp size={14} /> : <ChevronDown size={14} />}
          </button>
          {othersOpen && (
            <div className="px-4 pb-3 flex flex-col gap-1">
              {otherPicks.map(({ name, pick: p }) => {
                const op = finished ? pointsFor(p, match) : null;
                return (
                  <div key={name} className="flex items-center justify-between text-xs">
                    <span className={name === myName ? 'text-amber-300 font-bold' : 'text-slate-300'}>{name}</span>
                    <span className="text-slate-400">
                      {p.outcome === 'A' ? '1' : p.outcome === 'B' ? '2' : p.outcome === 'D' ? 'X' : '—'}
                      {p.scoreA !== '' && p.scoreB !== '' ? ` (${p.scoreA}-${p.scoreB})` : ''}
                      {p.bothScore != null ? ` · AM:${p.bothScore ? 'S' : 'N'}` : ''}
                      {op ? ` · +${op.total}` : ''}
                    </span>
                  </div>
                );
              })}
            </div>
          )}
        </div>
      )}
      {!kickedOff && otherPicks.length > 0 && (
        <p className="px-4 py-2 text-[11px] text-slate-600 border-t border-slate-700">
          🔒 {otherPicks.length} palpite(s) — revelados quando o jogo começar
        </p>
      )}
    </div>
  );
}

// ---- Histórico: semanas anteriores jogo a jogo ----
function HistoryView({ weeks, myName, myPicks, allPicks }) {
  const [openWeek, setOpenWeek] = useState(null);
  const finishedWeeks = weeks.filter(w => new Date(w.dateTo).getTime() < Date.now()).reverse();

  if (finishedWeeks.length === 0) {
    return <p className="text-sm text-slate-500 text-center py-8">Ainda não há semanas terminadas.</p>;
  }

  return (
    <div className="flex flex-col gap-2">
      {finishedWeeks.map(week => {
        const isOpen = openWeek === week.id;
        // pontos da semana por jogador
        const weekPts = {};
        for (const p of allPicks) {
          let sum = 0;
          for (const m of week.matches) {
            sum += pointsFor(p.picks?.[week.id]?.[m.id], m).total;
          }
          weekPts[p.name] = sum;
        }
        const myWeekPts = weekPts[myName] || 0;

        return (
          <div key={week.id} className="rounded-xl border border-slate-700 bg-slate-800/40 overflow-hidden">
            <button onClick={() => setOpenWeek(isOpen ? null : week.id)} className="w-full flex items-center justify-between px-4 py-3">
              <span className="text-sm font-bold">
                {new Date(week.dateFrom).toLocaleDateString('pt-PT', { day: 'numeric', month: 'short' })}
              </span>
              <span className="flex items-center gap-2">
                <span className="text-xs text-amber-300 font-bold">{myWeekPts} pts</span>
                {isOpen ? <ChevronUp size={16} /> : <ChevronDown size={16} />}
              </span>
            </button>
            {isOpen && (
              <div className="px-4 pb-3 flex flex-col gap-2">
                {week.matches.map(m => {
                  const myP = myPicks[week.id]?.[m.id];
                  const pts = pointsFor(myP, m);
                  return (
                    <div key={m.id} className="text-xs border-t border-slate-700/50 pt-2">
                      <div className="flex items-center justify-between">
                        <span className="text-slate-300">{m.homeTeam} {m.scoreHome ?? '-'}-{m.scoreAway ?? '-'} {m.awayTeam}</span>
                        <span className={pts.total > 0 ? 'text-emerald-400 font-bold' : 'text-slate-500'}>+{pts.total}</span>
                      </div>
                      {myP && (
                        <p className="text-slate-500 mt-0.5">
                          Palpite: {myP.outcome === 'A' ? '1' : myP.outcome === 'B' ? '2' : 'X'}
                          {myP.scoreA !== '' ? ` ${myP.scoreA}-${myP.scoreB}` : ''}
                          {myP.bothScore != null ? ` · AM:${myP.bothScore ? 'S' : 'N'}` : ''}
                        </p>
                      )}
                    </div>
                  );
                })}
              </div>
            )}
          </div>
        );
      })}
    </div>
  );
}

// ---- Classificação do torneio ----
function StandingsView({ weeks, allPicks, myName }) {
  const rows = useMemo(() => {
    const finishedWeeks = weeks.filter(w => new Date(w.dateTo).getTime() < Date.now());
    return allPicks.map(p => {
      let total = 0, exact = 0, outcome = 0, both = 0;
      for (const week of finishedWeeks) {
        for (const m of week.matches) {
          const pts = pointsFor(p.picks?.[week.id]?.[m.id], m);
          total += pts.total;
          if (pts.exact) exact++;
          if (pts.outcome) outcome++;
          if (pts.both) both++;
        }
      }
      return { name: p.name, total, exact, outcome, both };
    }).sort((a, b) => b.total - a.total || a.name.localeCompare(b.name));
  }, [weeks, allPicks]);

  return (
    <div className="flex flex-col gap-2">
      {rows.map((row, i) => {
        const medal = ['🥇', '🥈', '🥉'][i] || `${i + 1}`;
        return (
          <div key={row.name} className={`flex items-center gap-3 rounded-xl px-3 py-3 border ${row.name === myName ? 'border-amber-500/50 bg-amber-500/5' : 'border-slate-700 bg-slate-800/40'}`}>
            <span className="w-6 text-center font-bold">{medal}</span>
            <div className="flex-1">
              <p className="font-bold text-sm capitalize">{row.name}</p>
              <p className="text-xs text-slate-400">{row.exact} exatos · {row.outcome} V/E/D · {row.both} ambas marcam</p>
            </div>
            <span className="px-3 py-1 rounded-lg bg-slate-700 font-bold tabular-nums">{row.total}</span>
          </div>
        );
      })}
      {rows.length === 0 && <p className="text-sm text-slate-500 text-center py-8">Sem dados ainda.</p>}
    </div>
  );
}

// ---- Página de perfil do jogador ----
function ProfileView({ player, myName, tournaments, weeks, allPicks, onBack, onOpenPlayer }) {
  const playerData = allPicks.find(p => p.name === player);

  // Estatísticas globais e por torneio
  const stats = useMemo(() => {
    const perTournament = [];
    let globalTotal = 0, globalExact = 0, globalOutcome = 0, globalBoth = 0, globalGames = 0, globalHits = 0;

    for (const t of tournaments) {
      const tWeeks = Object.values(weeks).filter(w => w.tournamentId === t.id);
      let tTotal = 0, tExact = 0, tOutcome = 0, tBoth = 0, tGames = 0, tHits = 0;
      for (const week of tWeeks) {
        if (new Date(week.dateTo).getTime() > Date.now()) continue; // só terminadas
        for (const m of week.matches) {
          if (m.status !== 'FINISHED') continue;
          const pick = playerData?.picks?.[week.id]?.[m.id];
          if (pick) tGames++;
          const pts = pointsFor(pick, m);
          tTotal += pts.total;
          if (pts.exact) { tExact++; tHits++; }
          if (pts.outcome) { tOutcome++; tHits++; }
          if (pts.both) { tBoth++; tHits++; }
        }
      }
      if (tGames > 0 || tTotal > 0) {
        perTournament.push({ name: t.name, type: t.type, total: tTotal, exact: tExact, outcome: tOutcome, both: tBoth, games: tGames });
      }
      globalTotal += tTotal; globalExact += tExact; globalOutcome += tOutcome;
      globalBoth += tBoth; globalGames += tGames;
    }
    return { perTournament, globalTotal, globalExact, globalOutcome, globalBoth, globalGames };
  }, [player, playerData, tournaments, weeks]);

  // Ranking global entre todos os jogadores
  const globalRanking = useMemo(() => {
    return allPicks.map(p => {
      let total = 0;
      for (const t of tournaments) {
        const tWeeks = Object.values(weeks).filter(w => w.tournamentId === t.id);
        for (const week of tWeeks) {
          if (new Date(week.dateTo).getTime() > Date.now()) continue;
          for (const m of week.matches) {
            total += pointsFor(p.picks?.[week.id]?.[m.id], m).total;
          }
        }
      }
      return { name: p.name, total };
    }).sort((a, b) => b.total - a.total);
  }, [allPicks, tournaments, weeks]);

  const myRank = globalRanking.findIndex(r => r.name === player) + 1;

  return (
    <div className="flex flex-col gap-4">
      <button onClick={onBack} className="flex items-center gap-1 text-sm text-slate-400 hover:text-amber-300 w-fit">
        <ArrowLeft size={16} /> Voltar
      </button>

      {/* Cartão do perfil */}
      <div className="rounded-2xl border border-slate-700 bg-gradient-to-br from-slate-800 to-slate-900 p-6 flex items-center gap-4">
        <div className="w-16 h-16 rounded-full bg-amber-500 text-slate-900 font-bold flex items-center justify-center text-2xl capitalize">
          {player.charAt(0)}
        </div>
        <div className="flex-1">
          <h2 className="text-2xl font-bold capitalize">{player}</h2>
          <p className="text-sm text-slate-400">
            {myRank > 0 && <>#{myRank} global · </>}{stats.globalTotal} pts totais
          </p>
        </div>
      </div>

      {/* Estatísticas globais */}
      <div className="grid grid-cols-3 gap-2">
        <div className="rounded-xl bg-slate-800/60 border border-slate-700 p-3 text-center">
          <p className="text-2xl font-bold text-amber-300">{stats.globalExact}</p>
          <p className="text-[10px] text-slate-400 uppercase mt-0.5">Exatos</p>
        </div>
        <div className="rounded-xl bg-slate-800/60 border border-slate-700 p-3 text-center">
          <p className="text-2xl font-bold text-emerald-400">{stats.globalOutcome}</p>
          <p className="text-[10px] text-slate-400 uppercase mt-0.5">V/E/D</p>
        </div>
        <div className="rounded-xl bg-slate-800/60 border border-slate-700 p-3 text-center">
          <p className="text-2xl font-bold text-sky-400">{stats.globalBoth}</p>
          <p className="text-[10px] text-slate-400 uppercase mt-0.5">Ambas M.</p>
        </div>
      </div>

      {/* Pontos por torneio */}
      <div>
        <p className="text-xs font-bold text-slate-400 uppercase mb-2">Histórico por torneio</p>
        <div className="flex flex-col gap-2">
          {stats.perTournament.length === 0 && (
            <p className="text-sm text-slate-500">Ainda não há torneios com pontos.</p>
          )}
          {stats.perTournament.map(t => {
            const icon = t.type === 'league' ? '⚽' : t.type === 'champions' ? '🏆' : '🎯';
            return (
              <div key={t.name} className="rounded-xl border border-slate-700 bg-slate-800/40 p-3 flex items-center justify-between">
                <div>
                  <p className="font-bold text-sm">{icon} {t.name}</p>
                  <p className="text-xs text-slate-400 mt-0.5">{t.exact} exatos · {t.outcome} V/E/D · {t.both} AM · {t.games} jogos</p>
                </div>
                <span className="px-3 py-1 rounded-lg bg-slate-700 font-bold tabular-nums">{t.total}</span>
              </div>
            );
          })}
        </div>
      </div>

      {/* Ranking global */}
      <div>
        <p className="text-xs font-bold text-slate-400 uppercase mb-2">Classificação global</p>
        <div className="flex flex-col gap-1.5">
          {globalRanking.map((r, i) => {
            const medal = ['🥇', '🥈', '🥉'][i] || `${i + 1}`;
            return (
              <button
                key={r.name}
                onClick={() => onOpenPlayer(r.name)}
                className={`flex items-center gap-3 rounded-lg px-3 py-2 border transition ${
                  r.name === player ? 'border-amber-500/50 bg-amber-500/5' : 'border-slate-700 bg-slate-800/40 hover:border-slate-600'
                }`}
              >
                <span className="w-5 text-center text-sm">{medal}</span>
                <span className="flex-1 text-left text-sm font-bold capitalize">{r.name}</span>
                <span className="text-sm font-bold tabular-nums text-slate-300">{r.total}</span>
              </button>
            );
          })}
        </div>
      </div>
    </div>
  );
}

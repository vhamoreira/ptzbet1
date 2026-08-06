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

// Pontos: exato +5, VED +3, ambas marcam +2. Jogo highlight = pontos a dobrar.
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

  const mult = match.isHighlight ? 2 : 1;
  return { exact: exact * mult, outcome: outcome * mult, both: both * mult, total: (exact + outcome + both) * mult };
}

export default function LeaguesApp({ onBackToArchive }) {
  const [stage, setStage] = useState('loading'); // loading | name | app
  const [myName, setMyName] = useState('');
  const [nameInput, setNameInput] = useState('');
  const [isAdmin, setIsAdmin] = useState(false);

  const [view, setView] = useState('home'); // home | tournaments | tournament | history | settings
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
    <div className="min-h-screen bg-slate-950 text-stone-100 pb-24">
      {toast && (
        <div className="fixed top-4 left-1/2 -translate-x-1/2 z-50 bg-slate-800 border border-slate-600 px-4 py-2 rounded-lg text-sm shadow-lg">
          {toast}
        </div>
      )}

      {/* Cabeçalho global */}
      <div className="sticky top-0 z-30 bg-slate-950/90 backdrop-blur border-b border-slate-800/60">
        <div className="max-w-2xl mx-auto px-4 py-3 flex items-center justify-between">
          <div className="flex items-center gap-2">
            <div className="w-8 h-8 rounded-lg bg-gradient-to-br from-amber-400 to-amber-600 flex items-center justify-center">
              <Trophy className="text-slate-900" size={18} />
            </div>
            <h1 className="font-black text-lg tracking-tight">PTZ Bet<span className="text-amber-400">+</span></h1>
          </div>
          <button
            onClick={() => { setProfilePlayer(myName); setView('settings'); }}
            className="w-9 h-9 rounded-full bg-amber-500 text-slate-900 font-bold flex items-center justify-center text-sm capitalize"
          >
            {myName.charAt(0)}
          </button>
        </div>
      </div>

      <div className="max-w-2xl mx-auto px-4 pt-5">
        {/* HOME — todos os jogos da semana agrupados por torneio */}
        {view === 'home' && (
          <HomePage
            tournaments={tournaments}
            weeks={weeks}
            myName={myName}
            myPicks={myPicks}
            allPicks={allPicks}
            onSavePick={savePick}
          />
        )}

        {/* TORNEIOS — lista para entrar e consultar */}
        {view === 'tournaments' && (
          <>
            <PageTitle title="Torneios" subtitle="Entra para ver jogos e classificação" />
            <TournamentList
              tournaments={tournaments.filter(t => t.status === 'active')}
              weeks={weeks}
              onOpen={(t) => { setActiveTournament(t); setView('tournament'); setInnerTab('current'); }}
            />
          </>
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

        {/* HISTÓRICO — torneios terminados */}
        {view === 'history' && (
          <>
            <PageTitle title="Histórico" subtitle="Torneios terminados e resultados" />
            <TournamentList
              tournaments={tournaments.filter(t => t.status === 'finished')}
              weeks={weeks}
              onOpen={(t) => { setActiveTournament(t); setView('tournament'); setInnerTab('standings'); }}
              emptyMsg="Ainda não há torneios terminados."
            />
            {onBackToArchive && (
              <button
                onClick={onBackToArchive}
                className="mt-3 w-full rounded-xl border border-slate-700 bg-slate-800/40 p-4 flex items-center justify-between hover:border-amber-500/50 transition"
              >
                <div className="flex items-center gap-3">
                  <span className="text-2xl">🏆</span>
                  <div className="text-left">
                    <p className="font-bold text-sm">Mundial 2026</p>
                    <p className="text-xs text-slate-400">Ver classificação e histórico</p>
                  </div>
                </div>
                <ChevronDown className="-rotate-90 text-slate-500" size={18} />
              </button>
            )}
          </>
        )}

        {/* DEFINIÇÕES — perfil */}
        {view === 'settings' && (
          <ProfileView
            player={profilePlayer || myName}
            myName={myName}
            tournaments={tournaments}
            weeks={weeks}
            allPicks={allPicks}
            onOpenPlayer={(p) => setProfilePlayer(p)}
            onBackToArchive={onBackToArchive}
          />
        )}
      </div>

      <BottomNav active={view} onNav={(v) => { setProfilePlayer(myName); setView(v); }} />
    </div>
  );
}

// ---- Título de página ----
function PageTitle({ title, subtitle }) {
  return (
    <div className="mb-4">
      <h1 className="text-2xl font-black">{title}</h1>
      {subtitle && <p className="text-xs text-slate-400 mt-0.5">{subtitle}</p>}
    </div>
  );
}

// ---- Barra de navegação inferior (4 tabs) ----
function BottomNav({ active, onNav }) {
  const items = [
    { id: 'home', label: 'Início', icon: <HomeIcon />, group: ['home'] },
    { id: 'tournaments', label: 'Torneios', icon: <TrophyIcon />, group: ['tournaments', 'tournament'] },
    { id: 'history', label: 'Histórico', icon: <HistoryIcon />, group: ['history'] },
    { id: 'settings', label: 'Perfil', icon: <SettingsIcon />, group: ['settings'] },
  ];
  return (
    <div className="fixed bottom-0 left-0 right-0 z-40 bg-slate-900/95 backdrop-blur border-t border-slate-800">
      <div className="max-w-2xl mx-auto flex items-center justify-around px-2 py-1.5">
        {items.map(item => {
          const isActive = item.group.includes(active);
          return (
            <button key={item.id} onClick={() => onNav(item.id)} className={`flex flex-col items-center gap-0.5 py-1.5 px-4 rounded-xl transition ${isActive ? 'text-amber-400' : 'text-slate-500'}`}>
              <div className={`w-10 h-10 rounded-full flex items-center justify-center transition ${isActive ? 'bg-amber-500/20' : ''}`}>
                {item.icon}
              </div>
              <span className="text-[10px] font-bold">{item.label}</span>
            </button>
          );
        })}
      </div>
    </div>
  );
}

function HomeIcon() {
  return <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M3 9.5L12 3l9 6.5"/><path d="M5 10v10h14V10"/></svg>;
}
function TrophyIcon() {
  return <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M6 4h12v4a6 6 0 01-12 0V4z"/><path d="M6 6H4a2 2 0 002 4M18 6h2a2 2 0 01-2 4M9 18h6M10 14v4M14 14v4M8 21h8"/></svg>;
}
function HistoryIcon() {
  return <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M3 12a9 9 0 109-9 9 9 0 00-8 5"/><path d="M3 4v4h4M12 7v5l3 2"/></svg>;
}
function SettingsIcon() {
  return <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><circle cx="12" cy="8" r="4"/><path d="M4 21v-1a7 7 0 0114 0v1"/></svg>;
}

// ---- HOMEPAGE: selector de dias + jogos agrupados por torneio ----
function HomePage({ tournaments, weeks, myName, myPicks, allPicks, onSavePick }) {
  const now = Date.now();
  const [selectedDay, setSelectedDay] = useState(null); // 'YYYY-MM-DD' ou null = todos

  // Secções (torneios com semana actual)
  const sections = useMemo(() => {
    const out = [];
    for (const t of tournaments.filter(t => t.status === 'active')) {
      const tWeeks = Object.values(weeks)
        .filter(w => w.tournamentId === t.id)
        .sort((a, b) => a.dateFrom.localeCompare(b.dateFrom));
      const current = tWeeks.filter(w => new Date(w.dateTo).getTime() > now - 24 * 3600 * 1000)[0];
      if (current && current.matches?.length) out.push({ tournament: t, week: current });
    }
    return out;
  }, [tournaments, weeks, now]);

  // Todos os jogos de todas as secções, para montar os dias
  const allMatches = useMemo(() => {
    const arr = [];
    for (const s of sections) {
      for (const m of s.week.matches) {
        arr.push({ ...m, _tournament: s.tournament, _week: s.week });
      }
    }
    return arr;
  }, [sections]);

  // Dias únicos com jogos
  const days = useMemo(() => {
    const set = new Set();
    for (const m of allMatches) {
      if (m.kickoff) set.add(m.kickoff.split('T')[0]);
    }
    return [...set].sort();
  }, [allMatches]);

  // Selecciona por defeito o próximo dia com jogos
  useEffect(() => {
    if (selectedDay || days.length === 0) return;
    const todayStr = new Date().toISOString().split('T')[0];
    const upcoming = days.find(d => d >= todayStr) || days[0];
    setSelectedDay(upcoming);
  }, [days, selectedDay]);

  const highlight = useMemo(() => {
    for (const s of sections) {
      const h = s.week.matches.find(m => m.isHighlight);
      if (h) return { match: h, week: s.week };
    }
    return null;
  }, [sections]);

  const dayLabel = (iso) => {
    const d = new Date(iso + 'T12:00:00Z');
    return {
      weekday: d.toLocaleDateString('pt-PT', { weekday: 'short' }).replace('.', '').toUpperCase(),
      day: d.getUTCDate(),
    };
  };

  return (
    <div className="flex flex-col gap-4">
      <div>
        <h1 className="text-2xl font-black">Jogos da Semana</h1>
      </div>

      {sections.length === 0 && (
        <p className="text-sm text-slate-500 text-center py-12">Ainda não há jogos definidos para esta semana.</p>
      )}

      {/* Selector de dias */}
      {days.length > 0 && (
        <div className="flex items-center gap-1.5 overflow-x-auto pb-1 -mx-1 px-1">
          <button
            onClick={() => setSelectedDay(null)}
            className={`shrink-0 px-3 py-2 rounded-full text-xs font-bold transition ${selectedDay === null ? 'bg-lime-400 text-slate-900' : 'bg-slate-800 text-slate-400'}`}
          >Todos</button>
          {days.map(iso => {
            const { weekday, day } = dayLabel(iso);
            const isSel = selectedDay === iso;
            const count = allMatches.filter(m => m.kickoff?.startsWith(iso)).length;
            return (
              <button
                key={iso}
                onClick={() => setSelectedDay(iso)}
                className={`shrink-0 flex flex-col items-center px-3.5 py-1.5 rounded-full transition ${isSel ? 'bg-lime-400 text-slate-900' : 'bg-slate-800 text-slate-400'}`}
              >
                <span className="text-[9px] font-bold uppercase">{weekday}</span>
                <span className="text-base font-black leading-none">{day}</span>
                <span className={`text-[8px] ${isSel ? 'text-slate-700' : 'text-slate-500'}`}>{count} jogo{count !== 1 ? 's' : ''}</span>
              </button>
            );
          })}
        </div>
      )}

      {/* Jogo da Semana (só quando não filtrado, ou quando o highlight é nesse dia) */}
      {highlight && (selectedDay === null || highlight.match.kickoff?.startsWith(selectedDay)) && (
        <div>
          <SectionLabel icon="🔥" text="Jogo da Semana" />
          <HighlightCard
            match={highlight.match}
            weekId={highlight.week.id}
            pick={(myPicks[highlight.week.id] || {})[highlight.match.id]}
            locked={new Date(highlight.week.deadline).getTime() <= now}
            myName={myName}
            allPicks={allPicks}
            onSavePick={onSavePick}
          />
        </div>
      )}

      {/* Secções por torneio, filtradas pelo dia */}
      {sections.map(({ tournament, week }) => {
        const locked = new Date(week.deadline).getTime() <= now;
        const weekPicks = myPicks[week.id] || {};
        let matches = week.matches.filter(m => !m.isHighlight);
        if (selectedDay) matches = matches.filter(m => m.kickoff?.startsWith(selectedDay));
        if (matches.length === 0) return null;
        return (
          <div key={tournament.id}>
            <div className="flex items-center justify-between mb-2">
              <SectionLabel emblem={LEAGUE_EMBLEM_BY_ID[tournament.id]} text={tournament.name} />
              <span className={`text-[10px] font-bold ${locked ? 'text-rose-400' : 'text-emerald-400'}`}>
                {locked ? '🔒 Fechado' : `Fecha ${new Date(week.deadline).toLocaleDateString('pt-PT', { weekday: 'short', hour: '2-digit', minute: '2-digit' })}`}
              </span>
            </div>
            <div className="flex flex-col gap-2.5">
              {matches.map(m => (
                <ScoreCard
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
          </div>
        );
      })}
    </div>
  );
}

const LEAGUE_EMBLEM_BY_ID = {
  liga_principal: 'https://crests.football-data.org/PL.png',
  champions: 'https://crests.football-data.org/CL.png',
};

function SectionLabel({ icon, emblem, text }) {
  return (
    <div className="flex items-center gap-2 mb-2">
      {emblem ? <img src={emblem} alt="" className="w-5 h-5 object-contain" /> : icon ? <span>{icon}</span> : null}
      <span className="text-sm font-bold text-slate-200">{text}</span>
    </div>
  );
}

// ---- SCORECARD limpo com expansão para apostar ----
function ScoreCard({ match, weekId, pick, locked, myName, allPicks, onSavePick }) {
  const [expanded, setExpanded] = useState(false);
  const [draft, setDraft] = useState(pick || { outcome: '', scoreA: '', scoreB: '', bothScore: null });
  useEffect(() => { if (pick) setDraft(pick); }, [pick]);

  const finished = match.status === 'FINISHED';
  const live = match.status === 'IN_PLAY' || match.status === 'PAUSED';
  const kickedOff = new Date(match.kickoff).getTime() <= Date.now();
  const editable = !locked && !kickedOff;
  const pts = finished ? pointsFor(pick, match) : null;
  const hasPick = pick && (pick.outcome || pick.scoreA !== '');

  function update(partial) {
    const next = { ...draft, ...partial };
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

  // palpites dos outros (só após kickoff)
  const otherPicks = allPicks
    .filter(p => p.name !== myName && p.picks?.[weekId]?.[match.id])
    .map(p => ({ name: p.name, pick: p.picks[weekId][match.id] }));

  return (
    <div className="rounded-2xl overflow-hidden bg-slate-900 border border-slate-800">
      {/* Card principal — clicável para expandir */}
      <button onClick={() => setExpanded(v => !v)} className="w-full">
        {/* estado */}
        <div className="flex items-center justify-center pt-3 pb-1">
          {live && <span className="text-[10px] font-bold text-emerald-400 bg-emerald-400/10 px-2.5 py-0.5 rounded-full">● AO VIVO</span>}
          {finished && <span className="text-[10px] font-bold text-slate-400 bg-slate-700/50 px-2.5 py-0.5 rounded-full">TERMINADO</span>}
          {!finished && !live && <span className="text-[10px] font-medium text-slate-500">{kickoffStr}</span>}
        </div>

        {/* equipas */}
        <div className="flex items-center justify-between px-4 py-3 gap-2">
          <div className="flex-1 flex flex-col items-center gap-2">
            <div className="w-14 h-14 rounded-full bg-slate-800 flex items-center justify-center p-2">
              {match.homeCrest && <img src={match.homeCrest} alt="" className="w-full h-full object-contain" />}
            </div>
            <span className="text-xs font-bold text-center leading-tight">{match.homeTeam}</span>
          </div>

          <div className="px-3 text-center min-w-[64px]">
            {finished || live ? (
              <div className="text-2xl font-black tabular-nums">{match.scoreHome ?? 0}<span className="text-slate-600 mx-0.5">:</span>{match.scoreAway ?? 0}</div>
            ) : (
              <div className="text-lg font-bold text-slate-600">VS</div>
            )}
          </div>

          <div className="flex-1 flex flex-col items-center gap-2">
            <div className="w-14 h-14 rounded-full bg-slate-800 flex items-center justify-center p-2">
              {match.awayCrest && <img src={match.awayCrest} alt="" className="w-full h-full object-contain" />}
            </div>
            <span className="text-xs font-bold text-center leading-tight">{match.awayTeam}</span>
          </div>
        </div>

        {/* rodapé: estado do palpite + expandir */}
        <div className="flex items-center justify-between px-4 py-2 border-t border-slate-800 bg-slate-800/30">
          <span className="text-[11px] text-slate-400">
            {finished && pts ? <span className="text-amber-300 font-bold">+{pts.total} pts</span>
              : hasPick ? <span className="text-emerald-400">✓ Palpite feito</span>
              : editable ? <span className="text-slate-500">Sem palpite</span>
              : <span className="text-rose-400">Fechado</span>}
          </span>
          <span className="flex items-center gap-1 text-[11px] text-slate-400">
            {expanded ? 'Fechar' : 'Apostar'}
            {expanded ? <ChevronUp size={14} /> : <ChevronDown size={14} />}
          </span>
        </div>
      </button>

      {/* Painel expandido de apostas */}
      {expanded && (
        <div className="px-4 py-3 border-t border-slate-800 flex flex-col gap-3 bg-slate-900">
          {!editable && !finished && (
            <p className="text-xs text-rose-400">{live ? 'Jogo a decorrer' : locked ? 'Semana fechada' : 'Jogo já começou'} — palpites bloqueados.</p>
          )}

          <div>
            <p className="text-xs text-slate-400 mb-1.5">Resultado {finished && pts ? <span className={pts.outcome ? 'text-emerald-400' : 'text-rose-400'}>({pts.outcome})</span> : <span className="text-slate-600">+3 pts</span>}</p>
            <div className="grid grid-cols-3 gap-1.5">
              {[['A', '1'], ['D', 'X'], ['B', '2']].map(([val, label]) => (
                <button key={val} disabled={!editable} onClick={() => editable && update({ outcome: val })}
                  className={`rounded-lg py-2 text-sm font-bold transition ${draft.outcome === val ? 'bg-amber-500 text-slate-900' : editable ? 'bg-slate-700 text-slate-300 hover:bg-slate-600' : 'bg-slate-700/50 text-slate-500'}`}>{label}</button>
              ))}
            </div>
          </div>

          <div>
            <p className="text-xs text-slate-400 mb-1.5">Resultado exato {finished && pts ? <span className={pts.exact ? 'text-emerald-400' : 'text-rose-400'}>({pts.exact})</span> : <span className="text-slate-600">+5 pts</span>}</p>
            <div className="flex items-center gap-2">
              <input type="number" min="0" disabled={!editable} value={draft.scoreA ?? ''} onChange={e => update({ scoreA: e.target.value })}
                className="w-14 text-center rounded-md bg-slate-700 border border-slate-600 text-stone-100 py-1.5 disabled:opacity-50" />
              <span className="text-slate-500">-</span>
              <input type="number" min="0" disabled={!editable} value={draft.scoreB ?? ''} onChange={e => update({ scoreB: e.target.value })}
                className="w-14 text-center rounded-md bg-slate-700 border border-slate-600 text-stone-100 py-1.5 disabled:opacity-50" />
            </div>
          </div>

          <div>
            <p className="text-xs text-slate-400 mb-1.5">Ambas marcam {finished && pts ? <span className={pts.both ? 'text-emerald-400' : 'text-rose-400'}>({pts.both})</span> : <span className="text-slate-600">+2 pts</span>}</p>
            <div className="grid grid-cols-2 gap-1.5">
              {[[true, 'Sim'], [false, 'Não']].map(([val, label]) => (
                <button key={label} disabled={!editable} onClick={() => editable && update({ bothScore: val })}
                  className={`rounded-lg py-2 text-sm font-bold transition ${draft.bothScore === val ? 'bg-amber-500 text-slate-900' : editable ? 'bg-slate-700 text-slate-300 hover:bg-slate-600' : 'bg-slate-700/50 text-slate-500'}`}>{label}</button>
              ))}
            </div>
          </div>

          {/* palpites da galera — só após kickoff */}
          {kickedOff && otherPicks.length > 0 && (
            <div className="border-t border-slate-800 pt-2 flex flex-col gap-1">
              <p className="text-[10px] text-slate-500 uppercase mb-0.5">Palpites da galera</p>
              {otherPicks.map(({ name, pick: p }) => {
                const op = finished ? pointsFor(p, match) : null;
                return (
                  <div key={name} className="flex items-center justify-between text-xs">
                    <span className="text-slate-300 capitalize">{name}</span>
                    <span className="text-slate-400">
                      {p.outcome === 'A' ? '1' : p.outcome === 'B' ? '2' : p.outcome === 'D' ? 'X' : '—'}
                      {p.scoreA !== '' && p.scoreB !== '' ? ` (${p.scoreA}-${p.scoreB})` : ''}
                      {op ? ` · +${op.total}` : ''}
                    </span>
                  </div>
                );
              })}
            </div>
          )}
          {!kickedOff && otherPicks.length > 0 && (
            <p className="text-[11px] text-slate-600 border-t border-slate-800 pt-2">🔒 {otherPicks.length} palpite(s) — revelados quando o jogo começar</p>
          )}
        </div>
      )}
    </div>
  );
}

// ---- Lista de torneios ----
function TournamentList({ tournaments, weeks, onOpen, emptyMsg }) {
  const STYLE = {
    liga_principal: {
      emblem: 'https://crests.football-data.org/PL.png',
      card: 'bg-gradient-to-br from-purple-600/40 via-indigo-700/30 to-slate-900',
      accent: 'text-purple-300',
    },
    champions: {
      emblem: 'https://crests.football-data.org/CL.png',
      card: 'bg-gradient-to-br from-blue-700/40 via-blue-900/30 to-slate-900',
      accent: 'text-blue-300',
    },
    _default: {
      emblem: '',
      card: 'bg-gradient-to-br from-slate-700/40 to-slate-900',
      accent: 'text-amber-300',
    },
  };

  const TournamentCard = ({ t }) => {
    const style = STYLE[t.id] || STYLE[t.type] || STYLE._default;
    const typeLabel = t.type === 'league' ? 'Liga' : t.type === 'champions' ? 'Champions' : 'Mini-torneio';
    const tWeeks = Object.values(weeks).filter(w => w.tournamentId === t.id);
    const now = Date.now();
    const activeWeek = tWeeks.find(w => new Date(w.dateTo).getTime() > now - 24 * 3600 * 1000);

    return (
      <button
        onClick={() => onOpen(t)}
        className={`w-full text-left rounded-2xl overflow-hidden border border-slate-700 ${style.card} p-5 hover:border-amber-500/50 transition group relative`}
      >
        <div className="flex items-center gap-4">
          {style.emblem ? (
            <img src={style.emblem} alt="" className="w-14 h-14 object-contain drop-shadow-lg" />
          ) : (
            <div className="w-14 h-14 rounded-xl bg-slate-800 flex items-center justify-center text-2xl">🎯</div>
          )}
          <div className="flex-1">
            <p className={`text-[10px] font-bold uppercase tracking-wider ${style.accent}`}>{typeLabel}</p>
            <p className="font-bold text-lg text-stone-100">{t.name}</p>
            <p className="text-xs text-slate-400 mt-0.5">
              {t.season}
              {activeWeek && <> · {activeWeek.matches.length} jogos esta semana</>}
            </p>
          </div>
          <ChevronDown className="-rotate-90 text-slate-500 group-hover:text-amber-400 transition" size={20} />
        </div>
      </button>
    );
  };

  return (
    <div className="flex flex-col gap-3">
      {tournaments.length === 0 && <p className="text-sm text-slate-500 text-center py-8">{emptyMsg || 'Nenhum torneio.'}</p>}
      {tournaments.map(t => <TournamentCard key={t.id} t={t} />)}
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

  const highlightMatch = week.matches.find(m => m.isHighlight);
  const normalMatches = week.matches.filter(m => !m.isHighlight);

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

      {/* Jogo da Semana em destaque */}
      {highlightMatch && (
        <HighlightCard
          match={highlightMatch}
          weekId={week.id}
          pick={weekPicks[highlightMatch.id]}
          locked={locked}
          myName={myName}
          allPicks={allPicks}
          onSavePick={onSavePick}
        />
      )}

      {normalMatches.map(m => (
        <ScoreCard
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

// ---- Card do Jogo da Semana (highlight, pontos a dobrar) ----
function HighlightCard({ match, weekId, pick, locked, myName, allPicks, onSavePick }) {
  const [draft, setDraft] = useState(pick || { outcome: '', scoreA: '', scoreB: '', bothScore: null });
  const [nowTick, setNowTick] = useState(Date.now());
  useEffect(() => { if (pick) setDraft(pick); }, [pick]);
  useEffect(() => {
    const iv = setInterval(() => setNowTick(Date.now()), 1000);
    return () => clearInterval(iv);
  }, []);

  const finished = match.status === 'FINISHED';
  const live = match.status === 'IN_PLAY' || match.status === 'PAUSED';
  const koMs = new Date(match.kickoff).getTime();
  const kickedOff = koMs <= nowTick;
  const editable = !locked && !kickedOff;
  const pts = finished ? pointsFor(pick, match) : null;

  // Contagem decrescente até ao jogo
  const diff = Math.max(0, koMs - nowTick);
  const days = Math.floor(diff / 86400000);
  const hours = Math.floor((diff % 86400000) / 3600000);
  const mins = Math.floor((diff % 3600000) / 60000);
  const secs = Math.floor((diff % 60000) / 1000);
  const pad = (n) => String(n).padStart(2, '0');

  // Distribuição de palpites (só após kickoff, para não revelar antes)
  const split = useMemo(() => {
    if (!kickedOff) return null;
    let a = 0, d = 0, b = 0;
    for (const p of allPicks) {
      const pk = p.picks?.[weekId]?.[match.id];
      if (!pk?.outcome) continue;
      if (pk.outcome === 'A') a++;
      else if (pk.outcome === 'D') d++;
      else if (pk.outcome === 'B') b++;
    }
    const total = a + d + b;
    if (total === 0) return null;
    return { a, d, b, total, pctA: Math.round(a / total * 100), pctB: Math.round(b / total * 100) };
  }, [kickedOff, allPicks, weekId, match.id]);

  function update(partial) {
    const next = { ...draft, ...partial };
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

  return (
    <div className="rounded-2xl overflow-hidden border-2 border-amber-500/60 bg-gradient-to-br from-purple-700/40 via-indigo-800/30 to-slate-900 relative shadow-lg shadow-amber-500/10">
      {/* Faixa de topo */}
      <div className="px-4 py-2.5 flex items-center justify-between bg-gradient-to-r from-amber-500/20 to-transparent border-b border-amber-500/30">
        <span className="flex items-center gap-1.5 text-xs font-black uppercase tracking-wider text-amber-300">
          🔥 Jogo da Semana
        </span>
        <span className="text-[10px] font-bold text-amber-200 bg-amber-500/20 px-2 py-0.5 rounded-full">PONTOS A DOBRAR</span>
      </div>

      {/* Liga */}
      <div className="pt-4 flex items-center justify-center gap-1.5">
        {match.leagueEmblem && <img src={match.leagueEmblem} alt="" className="w-4 h-4 object-contain" />}
        <span className="text-[10px] uppercase tracking-wider text-slate-300">{match.leagueName}</span>
      </div>

      {/* Contagem decrescente ou estado */}
      <div className="flex items-center justify-center py-2">
        {finished ? (
          <span className="text-[10px] font-bold text-slate-400 bg-slate-700/50 px-3 py-1 rounded-full">TERMINADO</span>
        ) : live ? (
          <span className="text-[10px] font-bold text-emerald-400 bg-emerald-400/10 px-3 py-1 rounded-full">● AO VIVO</span>
        ) : (
          <div className="flex items-center gap-1 text-center">
            {[[pad(days), 'd'], [pad(hours), 'h'], [pad(mins), 'm'], [pad(secs), 's']].map(([v, l], i) => (
              <React.Fragment key={l}>
                {i > 0 && <span className="text-slate-600 font-bold">:</span>}
                <div className="bg-slate-800/80 rounded-lg px-2 py-1 min-w-[34px]">
                  <span className="block text-sm font-black tabular-nums">{v}</span>
                  <span className="block text-[8px] text-slate-500 uppercase">{l}</span>
                </div>
              </React.Fragment>
            ))}
          </div>
        )}
      </div>

      {/* Equipas com escudos grandes */}
      <div className="px-4 py-4 flex items-center justify-between gap-2">
        <div className="flex-1 flex flex-col items-center gap-2 text-center">
          <div className="w-20 h-20 rounded-full bg-slate-800/60 flex items-center justify-center p-3">
            {match.homeCrest && <img src={match.homeCrest} alt="" className="w-full h-full object-contain drop-shadow-lg" />}
          </div>
          <span className="font-bold text-sm leading-tight">{match.homeTeam}</span>
        </div>
        <div className="px-2 text-center min-w-[70px]">
          {finished || live ? (
            <div className="text-3xl font-black tabular-nums">{match.scoreHome ?? 0}<span className="text-slate-500 mx-1">:</span>{match.scoreAway ?? 0}</div>
          ) : (
            <div className="text-2xl font-black text-amber-400">VS</div>
          )}
        </div>
        <div className="flex-1 flex flex-col items-center gap-2 text-center">
          <div className="w-20 h-20 rounded-full bg-slate-800/60 flex items-center justify-center p-3">
            {match.awayCrest && <img src={match.awayCrest} alt="" className="w-full h-full object-contain drop-shadow-lg" />}
          </div>
          <span className="font-bold text-sm leading-tight">{match.awayTeam}</span>
        </div>
      </div>

      {/* Barra de distribuição de palpites (após kickoff) */}
      {split && (
        <div className="px-4 pb-3">
          <div className="flex items-center justify-between text-[10px] text-slate-400 mb-1">
            <span>{split.pctA}% · {match.homeTeam}</span>
            <span className="text-slate-500">Palpites da galera</span>
            <span>{match.awayTeam} · {split.pctB}%</span>
          </div>
          <div className="h-2 rounded-full overflow-hidden bg-slate-700 flex">
            <div className="bg-purple-500" style={{ width: `${split.pctA}%` }} />
            <div className="bg-slate-500" style={{ width: `${100 - split.pctA - split.pctB}%` }} />
            <div className="bg-sky-500" style={{ width: `${split.pctB}%` }} />
          </div>
        </div>
      )}

      {!split && (
        <div className="px-4 pb-2 text-center">
          <span className="text-[10px] text-slate-400">{kickoffStr}</span>
        </div>
      )}

      {/* Apostas */}
      <div className="px-4 py-3 border-t border-amber-500/20 bg-slate-900/40 flex flex-col gap-3">
        {!editable && !finished && (
          <p className="text-xs text-rose-400">{live ? 'Jogo a decorrer' : locked ? 'Semana fechada' : 'Jogo já começou'} — palpites bloqueados.</p>
        )}
        <div>
          <p className="text-xs text-slate-300 mb-1.5 font-bold">Resultado {finished && pts ? <span className={pts.outcome ? 'text-emerald-400' : 'text-rose-400'}>({pts.outcome})</span> : <span className="text-amber-400">+6 pts</span>}</p>
          <div className="grid grid-cols-3 gap-1.5">
            {[['A', '1'], ['D', 'X'], ['B', '2']].map(([val, label]) => (
              <button key={val} disabled={!editable} onClick={() => editable && update({ outcome: val })}
                className={`rounded-lg py-2 text-sm font-bold transition ${draft.outcome === val ? 'bg-amber-500 text-slate-900' : editable ? 'bg-slate-700 text-slate-300 hover:bg-slate-600' : 'bg-slate-700/50 text-slate-500'}`}>{label}</button>
            ))}
          </div>
        </div>
        <div>
          <p className="text-xs text-slate-300 mb-1.5 font-bold">Resultado exato {finished && pts ? <span className={pts.exact ? 'text-emerald-400' : 'text-rose-400'}>({pts.exact})</span> : <span className="text-amber-400">+10 pts</span>}</p>
          <div className="flex items-center gap-2">
            <input type="number" min="0" disabled={!editable} value={draft.scoreA ?? ''} onChange={e => update({ scoreA: e.target.value })}
              className="w-14 text-center rounded-md bg-slate-700 border border-slate-600 text-stone-100 py-1.5 disabled:opacity-50" />
            <span className="text-slate-500">-</span>
            <input type="number" min="0" disabled={!editable} value={draft.scoreB ?? ''} onChange={e => update({ scoreB: e.target.value })}
              className="w-14 text-center rounded-md bg-slate-700 border border-slate-600 text-stone-100 py-1.5 disabled:opacity-50" />
          </div>
        </div>
        <div>
          <p className="text-xs text-slate-300 mb-1.5 font-bold">Ambas marcam {finished && pts ? <span className={pts.both ? 'text-emerald-400' : 'text-rose-400'}>({pts.both})</span> : <span className="text-amber-400">+4 pts</span>}</p>
          <div className="grid grid-cols-2 gap-1.5">
            {[[true, 'Sim'], [false, 'Não']].map(([val, label]) => (
              <button key={label} disabled={!editable} onClick={() => editable && update({ bothScore: val })}
                className={`rounded-lg py-2 text-sm font-bold transition ${draft.bothScore === val ? 'bg-amber-500 text-slate-900' : editable ? 'bg-slate-700 text-slate-300 hover:bg-slate-600' : 'bg-slate-700/50 text-slate-500'}`}>{label}</button>
            ))}
          </div>
        </div>
        {finished && pts && <p className="text-sm text-center font-black text-amber-300">Total: +{pts.total} pts 🔥</p>}
      </div>
    </div>
  );
}

// ---- Histórico de semanas do torneio ----
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
function ProfileView({ player, myName, tournaments, weeks, allPicks, onOpenPlayer, onBackToArchive }) {
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

      {/* Arquivo do Mundial (só no próprio perfil) */}
      {player === myName && onBackToArchive && (
        <div>
          <p className="text-xs font-bold text-slate-400 uppercase mb-2">Arquivo</p>
          <button
            onClick={onBackToArchive}
            className="w-full rounded-xl border border-slate-700 bg-slate-800/40 p-4 flex items-center justify-between hover:border-amber-500/50 transition"
          >
            <div className="flex items-center gap-3">
              <span className="text-2xl">🏆</span>
              <div className="text-left">
                <p className="font-bold text-sm">Mundial 2026</p>
                <p className="text-xs text-slate-400">Ver classificação e histórico</p>
              </div>
            </div>
            <ChevronDown className="-rotate-90 text-slate-500" size={18} />
          </button>
        </div>
      )}
    </div>
  );
}

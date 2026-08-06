import React, { useState } from 'react';
import LeaguesApp from './LeaguesApp.jsx';
import MundialApp from './App.jsx';

export default function Root() {
  // 'leagues' é a app activa; 'mundial' é o arquivo do Mundial 2026
  const [mode, setMode] = useState('leagues');

  if (mode === 'mundial') {
    return (
      <div>
        <div className="bg-amber-500/10 border-b border-amber-500/30 px-4 py-2 text-center text-xs text-amber-300">
          📚 Arquivo — Mundial 2026 ·{' '}
          <button onClick={() => setMode('leagues')} className="underline font-bold">Voltar às Ligas</button>
        </div>
        <MundialApp />
      </div>
    );
  }

  return <LeaguesApp onBackToArchive={() => setMode('mundial')} />;
}

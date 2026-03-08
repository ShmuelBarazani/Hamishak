import React, { createContext, useState, useContext, useEffect } from 'react';
import { supabase } from '@/api/supabaseClient';
import { Game, GameParticipant } from '@/api/entities';

const GameContext = createContext();

export const useGame = () => {
  const context = useContext(GameContext);
  if (!context) throw new Error('useGame must be used within GameProvider');
  return context;
};

export const GameProvider = ({ children }) => {
  const [currentGame, setCurrentGame] = useState(null);
  const [games, setGames] = useState([]);
  const [loading, setLoading] = useState(true);
  const [currentUser, setCurrentUser] = useState(null);
  const [currentParticipant, setCurrentParticipant] = useState(null);

  useEffect(() => {
    // קבל משתמש נוכחי מ-Supabase
    supabase.auth.getSession().then(({ data: { session } }) => {
      if (session?.user) {
        const u = session.user;
        setCurrentUser({
          id: u.id,
          email: u.email,
          full_name: u.user_metadata?.full_name || u.email?.split('@')[0],
          role: u.user_metadata?.role || 'predictor',
        });
      }
      loadGames(session?.user || null);
    });

    const { data: { subscription } } = supabase.auth.onAuthStateChange((_event, session) => {
      const u = session?.user || null;
      const formatted = u ? {
        id: u.id,
        email: u.email,
        full_name: u.user_metadata?.full_name || u.email?.split('@')[0],
        role: u.user_metadata?.role || 'predictor',
      } : null;
      setCurrentUser(formatted);
      loadGames(u);
    });

    return () => subscription.unsubscribe();
  }, []);

  const loadGames = async (user) => {
    setLoading(true);
    try {
      const allGames = await Game.filter({}, '-created_at', 100);

      let visibleGames;
      if (user?.user_metadata?.role === 'admin') {
        visibleGames = allGames;
      } else if (user) {
        const participations = await GameParticipant.filter({ user_email: user.email, is_active: true }, null, 100);
        const gameIds = participations.map(p => p.game_id);
        visibleGames = allGames.filter(g => gameIds.includes(g.id) && ['active', 'locked'].includes(g.status));
      } else {
        visibleGames = allGames.filter(g => ['active', 'locked'].includes(g.status));
      }

      setGames(visibleGames);

      // בחר משחק נוכחי
      const savedGameId = localStorage.getItem('currentGameId');
      const selected = visibleGames.find(g => g.id === savedGameId) || visibleGames[0] || null;
      setCurrentGame(selected);

      if (selected) {
        localStorage.setItem('currentGameId', selected.id);
      }
    } catch (err) {
      console.error('שגיאה בטעינת משחקים:', err);
      setGames([]);
    }
    setLoading(false);
  };

  // טען participant כשמשתנה משחק או משתמש
  useEffect(() => {
    if (!currentUser || !currentGame || currentUser.role === 'admin') {
      setCurrentParticipant(null);
      return;
    }
    GameParticipant.filter({ game_id: currentGame.id, user_email: currentUser.email }, null, 1)
      .then(results => setCurrentParticipant(results[0] || null))
      .catch(() => setCurrentParticipant(null));
  }, [currentUser, currentGame]);

  const selectGame = (game) => {
    setCurrentGame(game);
    localStorage.setItem('currentGameId', game.id);
  };

  const refreshGames = async () => {
    const { data: { session } } = await supabase.auth.getSession();
    await loadGames(session?.user || null);
  };

  return (
    <GameContext.Provider value={{ currentGame, games, loading, selectGame, refreshGames, currentUser, currentParticipant }}>
      {children}
    </GameContext.Provider>
  );
};

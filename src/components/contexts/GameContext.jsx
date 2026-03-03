import React, { createContext, useState, useContext, useEffect } from 'react';
import { supabase } from '@/api/supabaseClient';
import { Game, GameParticipant } from '@/api/entities';

const ADMIN_EMAILS = ["tropikan1@gmail.com"];

const isAdminUser = (user) => {
  if (!user) return false;
  return (
    user.app_metadata?.role === 'admin' ||
    user.user_metadata?.role === 'admin' ||
    ADMIN_EMAILS.includes(user.email)
  );
};

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
    supabase.auth.getSession().then(({ data: { session } }) => {
      if (session?.user) {
        const u = session.user;
        setCurrentUser({
          id: u.id,
          email: u.email,
          full_name: u.user_metadata?.full_name || u.email?.split('@')[0],
          role: isAdminUser(u) ? 'admin' : (u.user_metadata?.role || 'predictor'),
          app_metadata: u.app_metadata,
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
        role: isAdminUser(u) ? 'admin' : (u.user_metadata?.role || 'predictor'),
        app_metadata: u.app_metadata,
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

      if (isAdminUser(user)) {
        visibleGames = allGames;
      } else {
        // כל משתמש (מחובר או לא) רואה משחקים פעילים
        visibleGames = allGames.filter(g => ['active', 'locked'].includes(g.status));
      }

      setGames(visibleGames);

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

  useEffect(() => {
    if (!currentUser || !currentGame || currentUser.role === 'admin') {
      setCurrentParticipant(null);
      return;
    }
    GameParticipant.filter({ game_id: currentGame.id, user_email: currentUser.email }, null, 1)
      .then(results => {
        if (results[0]) {
          setCurrentParticipant(results[0]);
        } else {
          const fullName = currentUser.full_name;
          if (fullName) {
            return GameParticipant.filter({ game_id: currentGame.id, participant_name: fullName }, null, 1)
              .then(r => setCurrentParticipant(r[0] || null));
          }
          setCurrentParticipant(null);
        }
      })
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

  const linkParticipant = async (participantId) => {
    if (!currentUser || !currentGame) return;
    try {
      await GameParticipant.update(participantId, { user_email: currentUser.email });
      const updated = await GameParticipant.filter({ game_id: currentGame.id, user_email: currentUser.email }, null, 1);
      setCurrentParticipant(updated[0] || null);
    } catch (err) {
      console.error('שגיאה בחיבור משתתף:', err);
    }
  };

  return (
    <GameContext.Provider value={{ 
      currentGame, games, loading, selectGame, refreshGames, 
      currentUser, currentParticipant, linkParticipant
    }}>
      {children}
    </GameContext.Provider>
  );
};

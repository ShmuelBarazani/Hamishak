import React, { useState } from "react";
import { useGame } from "@/components/contexts/GameContext";
import { useNavigate } from "react-router-dom";
import { Loader2, Trophy, ChevronLeft, Calendar, LogIn, LogOut, UserPlus } from "lucide-react";
import { supabase } from '@/api/supabaseClient';
import { useToast } from "@/components/ui/use-toast";
import LeaderboardNew from "./LeaderboardNew";
import { createPageUrl } from "@/utils";

export default function Home() {
  const { games, currentGame, selectGame, loading, currentUser } = useGame();
  const navigate = useNavigate();
  const { toast } = useToast();
  const [showGamePicker, setShowGamePicker] = useState(false);

  const handleLogout = async () => {
    await supabase.auth.signOut();
    window.location.href = '/';
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center min-h-screen"
        style={{ background: 'linear-gradient(135deg, var(--bg1) 0%, var(--bg2) 50%, var(--bg1) 100%)' }}>
        <Loader2 className="w-8 h-8 animate-spin" style={{ color: 'var(--tp)' }} />
      </div>
    );
  }

  const multipleGames = games && games.length > 1;

  return (
    <div dir="rtl" style={{ background: 'linear-gradient(135deg, var(--bg1) 0%, var(--bg2) 50%, var(--bg1) 100%)', minHeight: '100vh' }}>

      {/* ===== HEADER: התחברות / יציאה ===== */}
      <div style={{ background: 'rgba(0,0,0,0.55)', borderBottom: '1px solid var(--tp-15)', padding: '10px 16px' }}>
        <div className="max-w-7xl mx-auto flex items-center justify-between gap-3">

          {/* שמאל: מידע משתמש / כפתורי כניסה */}
          {currentUser ? (
            <div className="flex items-center gap-3">
              <div style={{ fontSize: '0.8rem', color: '#94a3b8' }}>
                שלום, <span style={{ color: '#f8fafc', fontWeight: '600' }}>{currentUser.full_name || currentUser.email}</span>
              </div>
              <button
                onClick={handleLogout}
                style={{
                  display: 'flex', alignItems: 'center', gap: '5px',
                  fontSize: '0.75rem', color: '#64748b',
                  background: 'transparent', border: '1px solid rgba(100,116,139,0.3)',
                  borderRadius: '8px', padding: '4px 10px', cursor: 'pointer'
                }}
              >
                <LogOut className="w-3.5 h-3.5" />
                התנתק
              </button>
            </div>
          ) : (
            /* אורח — כפתורי התחברות והרשמה */
            <div className="flex items-center gap-2">
              <button
                onClick={() => navigate(createPageUrl('Login'))}
                style={{
                  display: 'flex', alignItems: 'center', gap: '6px',
                  fontSize: '0.8rem', fontWeight: '600', color: 'var(--tp)',
                  background: 'rgba(6,182,212,0.12)', border: '1px solid rgba(6,182,212,0.35)',
                  borderRadius: '8px', padding: '6px 14px', cursor: 'pointer'
                }}
              >
                <LogIn className="w-4 h-4" />
                התחבר
              </button>
              <button
                onClick={() => navigate(createPageUrl('Login'))}
                style={{
                  display: 'flex', alignItems: 'center', gap: '6px',
                  fontSize: '0.8rem', fontWeight: '600', color: '#10b981',
                  background: 'rgba(16,185,129,0.10)', border: '1px solid rgba(16,185,129,0.30)',
                  borderRadius: '8px', padding: '6px 14px', cursor: 'pointer'
                }}
              >
                <UserPlus className="w-4 h-4" />
                הרשמה
              </button>
            </div>
          )}

          {/* ימין: שם האתר */}
          <div className="flex items-center gap-2">
            <Trophy className="w-5 h-5" style={{ color: 'var(--tp)' }} />
            <span style={{ fontSize: '0.9rem', fontWeight: '700', color: '#f8fafc' }}>המשחק</span>
          </div>
        </div>
      </div>

      {/* ===== בורר משחק ===== */}
      {multipleGames && (
        <div style={{ background: 'rgba(0,0,0,0.40)', borderBottom: '1px solid var(--tp-12)', padding: '8px 16px' }}>
          <div className="max-w-7xl mx-auto">

            <button
              onClick={() => setShowGamePicker(p => !p)}
              style={{
                display: 'flex', alignItems: 'center', gap: '10px',
                background: 'rgba(0,0,0,0.35)', border: '1px solid var(--tp-30)',
                borderRadius: '10px', padding: '8px 14px', cursor: 'pointer',
                width: '100%', textAlign: 'right', color: '#f8fafc',
              }}
            >
              {currentGame?.game_icon
                ? <img src={currentGame.game_icon} alt="" className="w-7 h-7 rounded-lg object-cover" />
                : <Trophy className="w-5 h-5 flex-shrink-0" style={{ color: 'var(--tp)' }} />
              }
              <div style={{ flex: 1, minWidth: 0 }}>
                <div style={{ fontSize: '0.9rem', fontWeight: '700', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                  {currentGame?.game_name || 'בחר משחק'}
                </div>
                {currentGame?.game_subtitle && (
                  <div style={{ fontSize: '0.72rem', color: 'var(--tp)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                    {currentGame.game_subtitle}
                  </div>
                )}
              </div>
              <StatusBadge status={currentGame?.status} />
              <ChevronLeft className="w-4 h-4 flex-shrink-0" style={{
                color: '#64748b',
                transform: showGamePicker ? 'rotate(-90deg)' : 'rotate(0deg)',
                transition: 'transform 0.2s'
              }} />
            </button>

            {showGamePicker && (
              <div style={{
                marginTop: '8px', borderRadius: '12px',
                border: '1px solid var(--tp-20)',
                background: 'rgba(10,15,28,0.97)',
                backdropFilter: 'blur(12px)', overflow: 'hidden'
              }}>
                {games.map((game, idx) => {
                  const isSelected = game.id === currentGame?.id;
                  return (
                    <button
                      key={game.id}
                      onClick={() => { selectGame(game); setShowGamePicker(false); }}
                      style={{
                        display: 'flex', alignItems: 'center', gap: '12px',
                        width: '100%', textAlign: 'right', padding: '12px 16px',
                        background: isSelected ? 'rgba(6,182,212,0.12)' : 'transparent',
                        borderBottom: idx < games.length - 1 ? '1px solid var(--tp-10)' : 'none',
                        cursor: 'pointer', transition: 'background 0.15s',
                        borderRight: isSelected ? '3px solid var(--tp)' : '3px solid transparent'
                      }}
                    >
                      {game.game_icon
                        ? <img src={game.game_icon} alt="" className="w-9 h-9 rounded-lg object-cover flex-shrink-0" />
                        : <div style={{ width: 36, height: 36, borderRadius: 8, background: 'var(--tp-20)', display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
                            <Trophy className="w-5 h-5" style={{ color: 'var(--tp)' }} />
                          </div>
                      }
                      <div style={{ flex: 1, minWidth: 0 }}>
                        <div style={{ fontSize: '0.88rem', fontWeight: isSelected ? '700' : '500', color: isSelected ? 'var(--tp)' : '#f8fafc', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                          {game.game_name}
                        </div>
                        {game.game_subtitle && (
                          <div style={{ fontSize: '0.72rem', color: '#64748b', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                            {game.game_subtitle}
                          </div>
                        )}
                        {game.start_date && (
                          <div style={{ fontSize: '0.7rem', color: '#475569', display: 'flex', alignItems: 'center', gap: 3, marginTop: 2 }}>
                            <Calendar className="w-3 h-3" />
                            {new Date(game.start_date).toLocaleDateString('he-IL')}
                          </div>
                        )}
                      </div>
                      <StatusBadge status={game.status} />
                    </button>
                  );
                })}
              </div>
            )}
          </div>
        </div>
      )}

      {/* ===== תוכן: לוח דירוג ===== */}
      {(!games || games.length === 0) ? (
        <div className="flex flex-col items-center justify-center gap-6 p-12">
          <Trophy className="w-16 h-16" style={{ color: 'var(--tp)', opacity: 0.3 }} />
          <p style={{ color: '#64748b' }}>אין משחקים זמינים כרגע</p>
        </div>
      ) : (
        <LeaderboardNew />
      )}
    </div>
  );
}

function StatusBadge({ status }) {
  const config = {
    active:  { label: 'פתוח',  bg: 'rgba(16,185,129,0.15)', color: '#10b981', border: 'rgba(16,185,129,0.35)' },
    locked:  { label: 'נעול',  bg: 'rgba(239,68,68,0.12)',  color: '#ef4444', border: 'rgba(239,68,68,0.35)' },
    draft:   { label: 'טיוטה', bg: 'rgba(245,158,11,0.12)', color: '#f59e0b', border: 'rgba(245,158,11,0.35)' },
    closed:  { label: 'סגור',  bg: 'rgba(100,116,139,0.12)',color: '#64748b', border: 'rgba(100,116,139,0.35)' },
  };
  const c = config[status] || config.closed;
  return (
    <span style={{
      fontSize: '0.68rem', fontWeight: '600', padding: '2px 8px',
      borderRadius: '999px', flexShrink: 0,
      background: c.bg, color: c.color, border: `1px solid ${c.border}`
    }}>
      {c.label}
    </span>
  );
}

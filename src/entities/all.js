export { 
  Game, 
  GameParticipant, 
  Question, 
  Prediction, 
  Ranking, 
  ValidationList, 
  Team, 
  ScoreTable, 
  SystemSettings
} from '@/api/entities';

// User stub for backward compatibility
export const User = {
  async filter(filters = {}) {
    const { supabase } = await import('@/api/supabaseClient');
    let query = supabase.from('users').select('*');
    Object.entries(filters).forEach(([key, value]) => {
      if (value !== undefined && value !== null) query = query.eq(key, value);
    });
    const { data, error } = await query;
    if (error) throw error;
    return data || [];
  },
  async get(id) {
    const { supabase } = await import('@/api/supabaseClient');
    const { data, error } = await supabase.from('users').select('*').eq('id', id).single();
    if (error) throw error;
    return data;
  }
};

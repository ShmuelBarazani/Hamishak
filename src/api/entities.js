import { supabase } from './supabaseClient';

// ─── סדר ברירת מחדל לכל טבלה ─────────────────────────────────────────────────
// טבלאות שאין להן created_at צריכות סדר ברירת מחדל אחר
const DEFAULT_ORDER = {
  rankings:          'current_position',   // אין created_at
  questions:         'question_id',        // מיון לפי מספר שאלה
  game_participants: 'participant_name',   // אין created_at
  games:             'id',                 // אין created_at
  validation_lists:  'id',
  teams:             'name',
  score_tables:      'id',
  system_settings:   'id',
  // טבלאות עם created_at — ברירת מחדל תקינה
  predictions:       'created_at',
};

// ─── עזר גנרי ────────────────────────────────────────────────────────────────
function buildQuery(table, filters = {}, orderBy = null, limit = null, offset = 0) {
  let query = supabase.from(table).select('*');

  Object.entries(filters).forEach(([key, value]) => {
    if (value !== undefined && value !== null) {
      query = query.eq(key, value);
    }
  });

  if (orderBy) {
    // סדר מפורש שהועבר מהקריאה
    const desc = orderBy.startsWith('-');
    const col = desc ? orderBy.slice(1) : orderBy;
    query = query.order(col, { ascending: !desc });
  } else {
    // סדר ברירת מחדל לפי הטבלה
    const defaultCol = DEFAULT_ORDER[table] || 'id';
    const desc = defaultCol.startsWith('-');
    const col = desc ? defaultCol.slice(1) : defaultCol;
    query = query.order(col, { ascending: !desc });
  }

  if (limit) query = query.limit(limit);
  if (offset) query = query.range(offset, offset + (limit || 1000) - 1);

  return query;
}

// ─── ישות גנרית ──────────────────────────────────────────────────────────────
function createEntity(table) {
  return {
    async filter(filters = {}, orderBy = null, limit = 1000, offset = 0) {
      const { data, error } = await buildQuery(table, filters, orderBy, limit, offset);
      if (error) throw error;
      return data || [];
    },

    async get(id) {
      const { data, error } = await supabase
        .from(table).select('*').eq('id', id).single();
      if (error) throw error;
      return data;
    },

    async create(payload) {
      const { data, error } = await supabase
        .from(table).insert(payload).select().single();
      if (error) throw error;
      return data;
    },

    async update(id, payload) {
      const { data, error } = await supabase
        .from(table).update(payload).eq('id', id).select().single();
      if (error) throw error;
      return data;
    },

    async delete(id) {
      const { error } = await supabase.from(table).delete().eq('id', id);
      if (error) throw error;
      return true;
    },

    async upsert(payload, conflictColumn = 'id') {
      const { data, error } = await supabase
        .from(table).upsert(payload, { onConflict: conflictColumn }).select().single();
      if (error) throw error;
      return data;
    }
  };
}

// ─── ישויות ───────────────────────────────────────────────────────────────────
export const Game              = createEntity('games');
export const GameParticipant   = createEntity('game_participants');
export const Question          = createEntity('questions');
export const Prediction        = createEntity('predictions');
export const Ranking           = createEntity('rankings');
export const ValidationList    = createEntity('validation_lists');
export const Team              = createEntity('teams');
export const ScoreTable        = createEntity('score_tables');
export const SystemSettings    = createEntity('system_settings');

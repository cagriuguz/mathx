import { SUPABASE_URL, SUPABASE_ANON_KEY } from '../config.js';
import { createLocalStore } from './local.js';

export async function createStore() {
  if (SUPABASE_URL && SUPABASE_ANON_KEY) {
    const { createSupabaseStore } = await import('./supabase.js');
    return createSupabaseStore({ url: SUPABASE_URL, anonKey: SUPABASE_ANON_KEY });
  }
  return createLocalStore();
}

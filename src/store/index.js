import { SUPABASE_URL, SUPABASE_ANON_KEY } from '../config.js';
import { createLocalStore } from './local.js';

export async function createStore() {
  // Yalnız geliştirme sunucusunda: ?deneme ile gerçek veriye dokunmadan yerel deneme verisi
  const demo = import.meta.env?.DEV && new URLSearchParams(globalThis.location?.search || '').has('deneme');
  if (SUPABASE_URL && SUPABASE_ANON_KEY && !demo) {
    const { createSupabaseStore } = await import('./supabase.js');
    return createSupabaseStore({ url: SUPABASE_URL, anonKey: SUPABASE_ANON_KEY });
  }
  return createLocalStore();
}

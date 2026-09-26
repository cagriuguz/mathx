import { SUPABASE_URL, SUPABASE_ANON_KEY } from '../config.js';
import { createLocalStore } from './local.js';

export async function createStore() {
  // Yalnız geliştirme sunucusunda: ?deneme ile gerçek veriye dokunmadan yerel deneme verisi
  const demo = (import.meta.env?.DEV && new URLSearchParams(globalThis.location?.search || '').has('deneme'))
    || import.meta.env?.VITE_DENEME === '1'; // test APK'sı: VITE_DENEME=1 ile derlenir
  // Yalnız test derlemesi: VITE_SUPABASE_URL ile yerel sahte sunucuya (tools/sahte_supabase.mjs) bağlanır
  const url = import.meta.env?.VITE_SUPABASE_URL || SUPABASE_URL;
  const anonKey = import.meta.env?.VITE_SUPABASE_ANON_KEY || SUPABASE_ANON_KEY;
  if (url && anonKey && !demo) {
    const { createSupabaseStore } = await import('./supabase.js');
    return createSupabaseStore({ url, anonKey });
  }
  return createLocalStore();
}

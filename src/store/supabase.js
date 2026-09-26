// ÇEVRİMİÇİ MOD: tüm telefonlar aynı Supabase veritabanını kullanır (senkron).
// Güvenlik veritabanındadır (supabase/kurulum.sql içindeki RLS kuralları): veli ve öğrenci
// yalnızca kendi öğrencisinin satırlarını alabilir; öğrenci ödeme tablolarını hiç okuyamaz.
import { createClient } from '@supabase/supabase-js';
import { TABLES, ROLE_TABLES } from './common.js';

export const EMAIL_DOMAIN = 'kullanici.mathx.app';
const toEmail = (username) => `${username}@${EMAIL_DOMAIN}`;

function fail(error, fallback) {
  if (!error) return;
  const m = error.message || '';
  if (/Invalid login credentials/i.test(m)) throw new Error('Kullanıcı adı ya da şifre hatalı.');
  if (/already registered|already been registered/i.test(m)) throw new Error('Bu kullanıcı adı zaten kullanılıyor.');
  if (/Failed to fetch|NetworkError/i.test(m)) throw new Error('İnternet bağlantısı yok. Bağlantıyı kontrol edip tekrar deneyin.');
  throw new Error(fallback ? `${fallback} (${m})` : m);
}

export function createSupabaseStore({ url, anonKey }) {
  const sb = createClient(url, anonKey, { auth: { persistSession: true, autoRefreshToken: true } });
  // Öğretmen, öğrenci/veli hesabı açarken kendi oturumu bozulmasın diye ayrı istemci
  const signer = () => createClient(url, anonKey, { auth: { persistSession: false, autoRefreshToken: false, storageKey: 'mathx-signer' } });
  let profile = null;

  async function readProfile() {
    const { data: { session } } = await sb.auth.getSession();
    if (!session) return (profile = null);
    const { data, error } = await sb.from('profiles').select('user_id, username, role, student_id').eq('user_id', session.user.id).maybeSingle();
    fail(error, 'Profil okunamadı');
    if (!data) return (profile = null);
    return (profile = data);
  }

  return {
    mode: 'online',
    async init() { return readProfile(); },
    async teacherExists() {
      const { data, error } = await sb.rpc('teacher_exists');
      fail(error, 'Sunucuya ulaşılamadı');
      return !!data;
    },
    async setupTeacher(username, password) {
      const { error } = await sb.auth.signUp({ email: toEmail(username), password });
      fail(error, 'Öğretmen hesabı açılamadı');
      const r = await sb.auth.signInWithPassword({ email: toEmail(username), password });
      fail(r.error);
      const c = await sb.rpc('claim_teacher', { p_username: username });
      fail(c.error, 'Öğretmen yetkisi verilemedi');
      return readProfile();
    },
    async login(username, password) {
      const { error } = await sb.auth.signInWithPassword({ email: toEmail(String(username).trim().toLowerCase()), password });
      fail(error);
      const p = await readProfile();
      if (!p) { await sb.auth.signOut(); throw new Error('Bu hesabın profili yok. Öğretmeninize başvurun.'); }
      return p;
    },
    async logout() { await sb.auth.signOut(); profile = null; },
    async load() {
      if (!profile) return null;
      const out = {};
      await Promise.all(TABLES.map(async (t) => {
        if (!ROLE_TABLES[profile.role].includes(t)) { out[t] = []; return; }
        const { data, error } = await sb.from(t).select('*');
        fail(error, `${t} okunamadı`);
        out[t] = data || [];
      }));
      if (profile.role === 'student') {
        const { data } = await sb.rpc('my_student_name');
        out.me = { name: data || '' };
      }
      return out;
    },
    async insert(table, row) {
      const { data, error } = await sb.from(table).insert(row).select().single();
      fail(error, 'Kaydedilemedi');
      return data;
    },
    async update(table, id, patch) {
      const { data, error } = await sb.from(table).update(patch).eq('id', id).select().single();
      fail(error, 'Güncellenemedi');
      return data;
    },
    async remove(table, id) {
      const { error } = await sb.from(table).delete().eq('id', id);
      fail(error, 'Silinemedi');
    },
    async upsertSettings(patch) {
      const { data, error } = await sb.from('settings').upsert({ id: 'main', ...patch }).select().single();
      fail(error, 'Ayarlar kaydedilemedi');
      return data;
    },
    async accountExists(username) {
      const { data, error } = await sb.rpc('username_taken', { p_username: username });
      fail(error);
      return !!data;
    },
    async createAccount({ username, password, role, student_id }) {
      if (await this.accountExists(username)) throw new Error(`"${username}" kullanıcı adı zaten kullanılıyor.`);
      const { data, error } = await signer().auth.signUp({ email: toEmail(username), password });
      fail(error, 'Hesap açılamadı');
      if (!data.user) throw new Error('Hesap açılamadı. Supabase ayarlarında "Confirm email" kapalı olmalı.');
      const r = await sb.from('profiles').insert({ user_id: data.user.id, username, role, student_id });
      fail(r.error, 'Profil kaydedilemedi');
      return data.user.id;
    },
    async setPassword({ username, password }) {
      const { error } = await sb.rpc('admin_set_password', { p_username: username, p_password: password });
      fail(error, 'Şifre değiştirilemedi');
    },
    async deleteAccountsFor(studentId) {
      const { error } = await sb.rpc('delete_accounts_for', { p_student: studentId });
      fail(error, 'Hesaplar silinemedi');
    },
    async setHomeworkDone(id, done) {
      const { error } = await sb.rpc('set_homework_done', { p_id: id, p_done: done });
      fail(error, 'Ödev güncellenemedi');
    },
    subscribe(fn) {
      let t = null;
      const ch = sb.channel('mathx-all');
      for (const table of TABLES) ch.on('postgres_changes', { event: '*', schema: 'public', table }, () => { clearTimeout(t); t = setTimeout(fn, 300); });
      ch.subscribe();
      return () => sb.removeChannel(ch);
    },
  };
}

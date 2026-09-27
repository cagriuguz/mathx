// ÇEVRİMİÇİ MOD: tüm telefonlar aynı Supabase veritabanını kullanır (senkron).
// Güvenlik veritabanındadır (supabase/kurulum.sql içindeki RLS kuralları): veli ve öğrenci
// yalnızca kendi öğrencisinin satırlarını alabilir; öğrenci ödeme tablolarını hiç okuyamaz.
import { createClient } from '@supabase/supabase-js';
import { TABLES, ROLE_TABLES, VOICE_COLS } from './common.js';

export const EMAIL_DOMAIN = 'kullanici.mathx.app';
const toEmail = (username) => `${username}@${EMAIL_DOMAIN}`;

const CONFIRM_MSG = 'Supabase\'te "Confirm email" (e-posta onayı) açık kalmış. Supabase → Authentication → Sign In / Providers → "Confirm email" kapatıp "Save changes" deyin, sonra tekrar deneyin.';

/** Kurulum ekranı: yapıştırılan bağlantıyı dener. Hata metni fırlatır; başarıda { teacher } döner. */
export async function probeConn(url, key) {
  const h = { apikey: key };
  let r;
  try { r = await fetch(`${url}/auth/v1/settings`, { headers: h }); }
  catch { throw new Error('Bu adrese ulaşılamadı. İnternet bağlantınızı ve kopyaladığınız adresi kontrol edin.'); }
  if (r.status === 401 || r.status === 403) throw new Error('Anahtar kabul edilmedi. Supabase\'teki "Publishable key"i yeniden kopyalayın.');
  if (!r.ok) throw new Error('Supabase projesi yanıt vermedi. Proje yeni açıldıysa 1-2 dakika bekleyip tekrar deneyin.');
  const cfg = await r.json().catch(() => ({}));
  if (cfg.disable_signup) throw new Error('Supabase\'te yeni kullanıcı kaydı kapalı. Authentication → Sign In / Providers → "Allow new users to sign up" açık olmalı.');
  if (cfg.mailer_autoconfirm === false) throw new Error(CONFIRM_MSG);
  const t = await fetch(`${url}/rest/v1/rpc/teacher_exists`, { method: 'POST', headers: { ...h, 'Content-Type': 'application/json' }, body: '{}' }).catch(() => null);
  if (!t) throw new Error('Bu adrese ulaşılamadı. İnternet bağlantınızı kontrol edin.');
  if (!t.ok) throw new Error('Kurulum kodu çalıştırılmamış görünüyor. 2. adımdaki kodu Supabase → SQL Editor\'e yapıştırıp "Run" deyin.');
  return { teacher: (await t.json().catch(() => false)) === true };
}

function fail(error, fallback) {
  if (!error) return;
  const m = error.message || '';
  if (/Invalid login credentials/i.test(m)) throw new Error('Kullanıcı adı ya da şifre hatalı.');
  if (/Email not confirmed/i.test(m)) throw new Error(CONFIRM_MSG);
  if (/already registered|already been registered/i.test(m)) throw new Error('Bu kullanıcı adı zaten kullanılıyor.');
  if (/student_id.*books|books.*student_id/i.test(m)) throw new Error('Öğrenci kitapları için veritabanı güncellemesi gerekiyor: supabase/guncelleme-2026-09-26d-ogrenci-kitaplari.sql dosyasını Supabase SQL Editor\'de bir kez çalıştırın.');
  if (/voice_notes|mark_voice_heard/i.test(m) && /does not exist|schema cache|not find/i.test(m)) throw new Error('Sesli not için veritabanı güncellemesi gerekiyor: supabase/guncelleme-2026-09-27-sesli-not.sql dosyasını Supabase SQL Editor\'de bir kez çalıştırın.');
  if (/extra_lessons/i.test(m) && /does not exist|schema cache|not find/i.test(m)) throw new Error('Ek ders için veritabanı güncellemesi gerekiyor: supabase/guncelleme-2026-09-27b-ek-ders.sql dosyasını Supabase SQL Editor\'de bir kez çalıştırın.');
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
      const { data, error } = await sb.auth.signUp({ email: toEmail(username), password });
      fail(error, 'Öğretmen hesabı açılamadı');
      if (data?.user && !data.session) throw new Error(CONFIRM_MSG);
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
        const { data, error } = await sb.from(t).select(t === 'voice_notes' ? VOICE_COLS : '*');
        // Şifre / sesli not tablosu henüz kurulmamışsa (güncelleme SQL'i çalışmadan önce) program yine açılsın
        if (error && (t === 'logins' || t === 'voice_notes' || t === 'extra_lessons')) { out[t] = []; return; }
        fail(error, `${t} okunamadı`);
        out[t] = data || [];
      }));
      if (profile.role === 'student') {
        const { data } = await sb.rpc('my_student_name');
        out.me = { name: data || '' };
      }
      return out;
    },
    async voiceAudio(id) {
      const { data, error } = await sb.from('voice_notes').select('audio').eq('id', id).single();
      fail(error, 'Ses yüklenemedi');
      return data.audio;
    },
    async markVoiceHeard(id) {
      const { error } = await sb.rpc('mark_voice_heard', { p_id: id });
      fail(error);
    },
    async insert(table, row) {
      const { data, error } = await sb.from(table).insert(row).select(table === 'voice_notes' ? VOICE_COLS : '*').single();
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
    // ── Otomatik WhatsApp (WhatsApp Business). Hata fırlatmaz: sonuç döner, program elle yönteme düşer.
    async waSend(kind, homework_id) {
      try {
        const { data, error } = await sb.functions.invoke('wa-send', { body: { kind, homework_id } });
        if (error) {
          const body = await error.context?.json?.().catch(() => null);
          return { ok: false, error: body?.error || 'Otomatik gönderim sunucusuna ulaşılamadı.' };
        }
        return data || { ok: false };
      } catch (e) { return { ok: false, error: e.message || 'Otomatik gönderim başarısız.' }; }
    },
    async waStatus() {
      const { data, error } = await sb.rpc('wa_config_status');
      if (error) return { business_phone: '', phone_number_id: '', has_token: false, missingSetup: true };
      return data;
    },
    async setWaConfig({ business_phone, phone_number_id, token }) {
      const { error } = await sb.rpc('set_wa_config', { p_business_phone: business_phone, p_phone_number_id: phone_number_id, p_token: token || '' });
      fail(error, 'WhatsApp bilgileri kaydedilemedi');
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

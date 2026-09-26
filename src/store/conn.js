// Arkadaş öğretmenler için "Kendi MathX'ini kur": her öğretmen KENDİ Supabase projesine bağlanır.
// Bağlantı (proje kodu + herkese açık anahtar) bu cihazda saklanır; velilere giden linkte de taşınır
// (?db=...&k=...) ki veli/öğrenci aynı öğretmenin veritabanına bağlansın. Yalnızca *.supabase.co adresine
// ve yalnızca herkese açık (publishable/anon) anahtara izin verilir: gizli anahtar asla kabul edilmez.

const KEY = 'mathx.db';
const REF = /^[a-z0-9]{20}$/;

function jwtRole(k) {
  try { return JSON.parse(atob(k.split('.')[1].replace(/-/g, '+').replace(/_/g, '/'))).role || null; } catch { return null; }
}

/** Anahtarı denetler: hata metni ya da null */
export function checkKey(k) {
  if (!k) return 'Anahtar bulunamadı.';
  if (/^sb_secret_/.test(k) || (/^eyJ/.test(k) && jwtRole(k) === 'service_role'))
    return 'Bu GİZLİ anahtar! Onu kimseyle paylaşmayın. "Publishable" (sb_publishable_ ile başlayan) anahtarı kopyalayın.';
  if (/^sb_publishable_[A-Za-z0-9_-]{10,}$/.test(k)) return null;
  if (/^eyJ[\w-]+\.[\w-]+\.[\w-]+$/.test(k) && jwtRole(k) === 'anon') return null;
  return 'Anahtar tanınmadı. "sb_publishable_" ile başlayan anahtarı kopyalayın.';
}

/** Yapıştırılan metinden (tek tek ya da Supabase "Connect" penceresindeki blok) proje kodunu ve anahtarı bulur */
export function parseConn(text) {
  const s = String(text || '');
  // Adres ya da Supabase panelindeki sayfa linki (supabase.com/dashboard/project/<kod>/...)
  const ref = (s.match(/https?:\/\/([a-z0-9]{20})\.supabase\.co/) || s.match(/supabase\.com\/dashboard\/project\/([a-z0-9]{20})(?![a-z0-9])/) || [])[1] || null;
  const secret = (s.match(/sb_secret_[A-Za-z0-9_-]+/) || [])[0];
  const key = secret || (s.match(/sb_publishable_[A-Za-z0-9_-]+/) || [])[0] || (s.match(/eyJ[\w-]+\.[\w-]+\.[\w-]+/) || [])[0] || null;
  return { ref, key };
}

export const connUrl = (c) => `https://${c.ref}.supabase.co`;
const valid = (c) => !!c && REF.test(c.ref || '') && !checkKey(c.key);

function fromLink() {
  try {
    const q = new URLSearchParams(globalThis.location?.search || '');
    const c = { ref: q.get('db'), key: q.get('k') };
    return valid(c) ? c : null;
  } catch { return null; }
}

function fromDevice() {
  try { const c = JSON.parse(localStorage.getItem(KEY) || 'null'); return valid(c) ? c : null; } catch { return null; }
}

/** Geçerli bağlantı: önce linkteki, sonra bu cihazda kayıtlı olan; yoksa null (programın kendi veritabanı) */
export function readConn() {
  const link = fromLink();
  if (link) { saveConn(link); return link; }
  return fromDevice();
}

export function saveConn(c) {
  if (!valid(c)) throw new Error('Bağlantı bilgisi geçersiz.');
  try { localStorage.setItem(KEY, JSON.stringify({ ref: c.ref, key: c.key })); } catch {}
}

export function clearConn() { try { localStorage.removeItem(KEY); } catch {} }

/** Velilere/öğrencilere giden giriş linki: öğretmen kendi veritabanını kullanıyorsa bağlantı linke eklenir */
export function withConn(base, c = readConn()) {
  if (!base || !c) return base;
  const u = new URL(base);
  u.searchParams.set('db', c.ref);
  u.searchParams.set('k', c.key);
  return u.toString();
}

/** Linkte "?kur" varsa kurulum ekranı açılır (arkadaş öğretmenlere verilen link) */
export const wantsSetup = () => { try { return new URLSearchParams(globalThis.location?.search || '').has('kur'); } catch { return false; } };

// Ortak yardımcılar: kullanıcı adı, şifre üretimi, tablo listesi.

export const TABLES = ['students', 'schedules', 'plans', 'marks', 'payments', 'books', 'homework', 'expenses', 'expense_payments', 'settings', 'logins', 'voice_notes', 'extra_lessons', 'homework_photos'];

// logins = öğrenci/veli şifreleri: YALNIZCA öğretmen görür (aşağıda veli/öğrenci listesinde yok).
// Rol başına görünen tablolar (Supabase'de bu kural veritabanında RLS ile ayrıca zorunlu tutulur).
export const ROLE_TABLES = {
  teacher: TABLES,
  parent: ['students', 'schedules', 'plans', 'marks', 'payments', 'homework', 'voice_notes', 'extra_lessons', 'homework_photos'],
  student: ['homework', 'homework_photos'],
};

const TR = { ç: 'c', ğ: 'g', ı: 'i', ö: 'o', ş: 's', ü: 'u', İ: 'i', Ç: 'c', Ğ: 'g', Ö: 'o', Ş: 's', Ü: 'u' };

export function cleanUsername(text) {
  return String(text || '')
    .trim() // telefon klavyesi kelimeden sonra kendiliğinden boşluk koyar; sonda nokta olmasın
    .replace(/[çğıöşüİÇĞÖŞÜ]/g, (c) => TR[c])
    .toLowerCase()
    .replace(/\s+/g, '.')
    .replace(/[^a-z0-9._]/g, '')
    .slice(0, 30);
}

export function checkUsername(u) {
  if (u.length < 3) return 'Kullanıcı adı en az 3 karakter olmalı.';
  if (!/^[a-z0-9]/.test(u)) return 'Kullanıcı adı harf ya da rakamla başlamalı.';
  return null;
}

// Karışabilecek karakterler (0/O, 1/l/I) yok.
const ALPHA = 'abcdefghjkmnpqrstuvwxyz', UPPER = 'ABCDEFGHJKMNPQRSTUVWXYZ', DIGITS = '23456789';

function pick(set) {
  const a = new Uint32Array(1);
  crypto.getRandomValues(a);
  return set[a[0] % set.length];
}

/** 9 karakter: büyük harf + küçük harfler + rakamlar, ör. "Kmp4-7rtx" biçiminde kolay okunur */
export function generatePassword() {
  const s = pick(UPPER) + pick(ALPHA) + pick(ALPHA) + pick(DIGITS) + '-' + pick(DIGITS) + pick(ALPHA) + pick(ALPHA) + pick(ALPHA);
  return s;
}

export function generatePasswordPair() {
  const a = generatePassword();
  let b = generatePassword();
  while (b === a) b = generatePassword();
  return [a, b];
}

export const uid = () => (crypto.randomUUID ? crypto.randomUUID() : Math.random().toString(36).slice(2) + Date.now().toString(36));

export const DEFAULT_SETTINGS = {
  id: 'main',
  teacher_name: '',
  teacher_phone: '',
  remind_days: { weekly: 3, '4weekly': 5, monthly: 3, oneoff: 3 },
  cash_on_hand: 0,
  wa_mode: 'manual',
};

// Sesli not: liste yüklenirken ses verisi (audio) GELMEZ; "Dinle"ye basınca ayrıca iner.
export const VOICE_COLS = 'id, student_id, mime, seconds, created_at, heard_at';
export const VOICE_MAX_SEC = 90;

// Ödev fotoğrafları: liste yüklenirken resimler GELMEZ (yalnız sayı/boyut); ekranda açılınca ayrıca iner.
export const PHOTO_COLS = 'id, homework_id, student_id, bytes, created_at';

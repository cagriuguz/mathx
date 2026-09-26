// Tarihler 'YYYY-MM-DD' metni olarak tutulur; hesaplar UTC gün sayısıyla yapılır (saat dilimi kayması olmaz).

export const TR_MONTHS = ['Ocak', 'Şubat', 'Mart', 'Nisan', 'Mayıs', 'Haziran', 'Temmuz', 'Ağustos', 'Eylül', 'Ekim', 'Kasım', 'Aralık'];
export const TR_DAYS = ['Pazartesi', 'Salı', 'Çarşamba', 'Perşembe', 'Cuma', 'Cumartesi', 'Pazar'];
export const TR_DAYS_SHORT = ['Pzt', 'Sal', 'Çar', 'Per', 'Cum', 'Cmt', 'Paz'];

const DAY = 86400000;

export function toDays(iso) {
  const [y, m, d] = iso.split('-').map(Number);
  return Math.round(Date.UTC(y, m - 1, d) / DAY);
}

export function fromDays(n) {
  const dt = new Date(n * DAY);
  return `${dt.getUTCFullYear()}-${String(dt.getUTCMonth() + 1).padStart(2, '0')}-${String(dt.getUTCDate()).padStart(2, '0')}`;
}

export const addDays = (iso, n) => fromDays(toDays(iso) + n);
export const diffDays = (a, b) => toDays(a) - toDays(b); // a - b

/** 1 = Pazartesi … 7 = Pazar */
export function dow(iso) {
  const w = new Date(toDays(iso) * DAY).getUTCDay();
  return w === 0 ? 7 : w;
}

export function addMonths(iso, n) {
  const [y, m, d] = iso.split('-').map(Number);
  const total = y * 12 + (m - 1) + n;
  const ny = Math.floor(total / 12), nm = total % 12;
  const last = new Date(Date.UTC(ny, nm + 1, 0)).getUTCDate();
  return `${ny}-${String(nm + 1).padStart(2, '0')}-${String(Math.min(d, last)).padStart(2, '0')}`;
}

export const monthKey = (iso) => iso.slice(0, 7);
export const monthFirst = (key) => `${key}-01`;
export function monthLast(key) {
  const [y, m] = key.split('-').map(Number);
  return `${key}-${String(new Date(Date.UTC(y, m, 0)).getUTCDate()).padStart(2, '0')}`;
}
export function clampDay(key, day) {
  const last = Number(monthLast(key).slice(8));
  return `${key}-${String(Math.min(day, last)).padStart(2, '0')}`;
}

/** Haftanın Pazartesi'si */
export const weekStart = (iso) => addDays(iso, 1 - dow(iso));

export function localNow(date = new Date()) {
  const p = (n) => String(n).padStart(2, '0');
  return {
    date: `${date.getFullYear()}-${p(date.getMonth() + 1)}-${p(date.getDate())}`,
    time: `${p(date.getHours())}:${p(date.getMinutes())}`,
  };
}

export function fmtDate(iso, withDay = false) {
  if (!iso) return '';
  const [y, m, d] = iso.split('-').map(Number);
  const s = `${d} ${TR_MONTHS[m - 1]} ${y}`;
  return withDay ? `${s}, ${TR_DAYS[dow(iso) - 1]}` : s;
}
export const fmtShort = (iso) => { const [, m, d] = iso.split('-').map(Number); return `${d} ${TR_MONTHS[m - 1]}`; };
export const fmtDots = (iso) => { const [y, m, d] = iso.split('-'); return `${d}.${m}.${y}`; };
export function fmtMonth(key) { const [y, m] = key.split('-').map(Number); return `${TR_MONTHS[m - 1]} ${y}`; }

// Veli WhatsApp mesajları (ücretsiz, yarı otomatik: wa.me bağlantısı açılır, Gönder'e siz basarsınız).
// Kalıplar kullanıcının onayladığı metinlerdir; değiştirmeden kullanın.
import { fmtDate, fmtDots } from './dates.js';
import { fmtTL } from './money.js';

const BACK = 'aıou', FRONT = 'eiöü', VOICELESS = 'fstkçşhp';
const ONES = ['', 'bir', 'iki', 'üç', 'dört', 'beş', 'altı', 'yedi', 'sekiz', 'dokuz'];
const TENS = ['', 'on', 'yirmi', 'otuz', 'kırk', 'elli', 'altmış', 'yetmiş', 'seksen', 'doksan'];
const LETTERS = { a: 'a', b: 'be', c: 'ce', ç: 'çe', d: 'de', e: 'e', f: 'fe', g: 'ge', ğ: 'yumuşak ge', h: 'he', ı: 'ı', i: 'i', j: 'je', k: 'ke', l: 'le', m: 'me', n: 'ne', o: 'o', ö: 'ö', p: 'pe', r: 're', s: 'se', ş: 'şe', t: 'te', u: 'u', ü: 'ü', v: 've', y: 'ye', z: 'ze', q: 'kü', w: 've', x: 'iks' };

function numberWord(n) {
  if (n === 0) return 'sıfır';
  if (n % 10) return ONES[n % 10];
  if (n % 100) return TENS[(n % 100) / 10];
  if (n % 1000) return 'yüz';
  if (n % 1e6) return 'bin';
  if (n % 1e9) return 'milyon';
  return 'milyar';
}

/** Sözcüğün okunuşunun son parçası (sayı ve kısaltmalar okunduğu gibi) */
export function spoken(word) {
  const w = String(word).trim();
  const num = w.match(/(\d+)\D*$/);
  if (num && /\d[.)'’"\s]*$/.test(w)) return numberWord(Number(num[1].slice(-12)));
  const lastToken = w.split(/\s+/).pop().replace(/[^A-Za-zÇĞİÖŞÜçğıöşü]/g, '');
  if (lastToken.length >= 2 && lastToken.length <= 5 && lastToken === lastToken.toLocaleUpperCase('tr') && /[A-ZÇĞİÖŞÜ]/.test(lastToken)) {
    return LETTERS[lastToken.slice(-1).toLocaleLowerCase('tr')] || lastToken.toLocaleLowerCase('tr');
  }
  return lastToken.toLocaleLowerCase('tr');
}

function suffix(word, kind) {
  const s = spoken(word);
  let v = 'e';
  for (let i = s.length - 1; i >= 0; i--) {
    if (BACK.includes(s[i])) { v = 'a'; break; }
    if (FRONT.includes(s[i])) { v = 'e'; break; }
  }
  const hard = VOICELESS.includes(s.slice(-1));
  const c = hard ? 't' : 'd';
  return kind === 'abl' ? `${c}${v}n` : `${c}${v}`;
}

// Tamlama ile biten adlar kaynaştırma "n" alır: Soru Bankası'ndan, Ödev Defteri'nden
const POSSESSIVE = /(sı|si|su|sü|kitabı|defteri|fasikülü|föyü|kitapçığı|testleri|soruları)$/;
const buffer = (name) => (/\s/.test(name.trim()) && POSSESSIVE.test(name.trim().split(/\s+/).pop().toLocaleLowerCase('tr')) ? 'n' : '');

/** Ayrılma hâli: Karekök 7'den, Limit'ten, Bilfen'den, Soru Bankası'ndan */
export const ablative = (name) => { const n = buffer(name); return `${name}'${n}${n ? suffix(name, 'abl').replace(/^t/, 'd') : suffix(name, 'abl')}`; };
/** Bulunma hâli: 26.09.2026'da */
export const locative = (name) => { const n = buffer(name); return `${name}'${n}${n ? suffix(name, 'loc').replace(/^t/, 'd') : suffix(name, 'loc')}`; };

export function pagesText(pages) {
  const p = String(pages).trim();
  return /[-–,\s]/.test(p) ? `${p}. sayfalar` : `${p}. sayfa`;
}

/** 1) Ödev verildi (öğrenci adı yazılmaz) */
export function msgHomeworkGiven(items, dueDate) {
  const parts = items.filter((i) => String(i.pages || '').trim()).map((i) => `${ablative(i.book_name)} ${pagesText(i.pages)}`);
  return `Sayın veli, öğrencinizin ${parts.join(', ')} ödevi verilmiştir. Son bitirme tarihi: ${fmtDate(dueDate)}.`;
}

/** 5) Ödev yapıldı (madde 8) — veliye ve öğretmene */
export function msgHomeworkDone(studentName, items) {
  const parts = items.filter((i) => String(i.pages || '').trim()).map((i) => `${i.book_name} (${pagesText(i.pages)})`);
  const word = parts.length > 1 ? 'kitaplarındaki' : 'kitabındaki';
  return `Sayın veli, ${studentName} isimli öğrenciniz ${parts.join(', ')} ${word} ödevini yapmıştır.`;
}

const PACKAGE_WORD = { weekly: 'haftalık', '4weekly': '4 haftalık', monthly: 'aylık', oneoff: 'ders' };

/** 2) Paket doldu */
export const msgPackageFull = (period) =>
  `Sayın veli, öğrencimizin ${PACKAGE_WORD[period.type]} paketi dolmuştur. Ödeme tutarı: ${fmtTL(period.remaining || period.amount)}. Bilginize.`;

/** 3) Ödeme alındı */
export const msgPaymentReceived = (amount) => `Sayın veli, ${fmtTL(amount)} ödemeniz alınmıştır, teşekkür ederim.`;

/** 4) Ödeme gecikti */
export const msgPaymentLate = (period) => `Sayın veli, ${locative(fmtDots(period.due))} dolan ödeme henüz görünmüyor, hatırlatmak istedim.`;

/** Türkiye numarası → 90XXXXXXXXXX */
export function normalizePhone(phone) {
  let d = String(phone || '').replace(/\D/g, '');
  if (d.startsWith('00')) d = d.slice(2);
  if (d.startsWith('0')) d = '90' + d.slice(1);
  if (d.length === 10 && d.startsWith('5')) d = '90' + d;
  return d;
}

export const isValidPhone = (phone) => /^905\d{9}$/.test(normalizePhone(phone));

export const waLink = (phone, text) => `https://wa.me/${normalizePhone(phone)}?text=${encodeURIComponent(text)}`;

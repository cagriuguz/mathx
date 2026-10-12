// Ders değerlendirmesi: her ders sonrası 5 puan (1-5) + konu + not. YALNIZ öğretmen görür.
// Eksik değerlendirme hatırlatması, öğrenci uyarıları ve haftalık rapor satırları burada hesaplanır.
import { lessonsFor, decorateLessons, lessonKey } from './lessons.js';
import { addDays, fmtDate } from './dates.js';
import { itemStatus } from './hwitems.js';

export const REVIEW_FIELDS = [
  ['verim', 'Ders verimli geçti mi'],
  ['calisma', 'Öğrenci çalışıyor mu'],
  ['gidisat', 'Gidişat'],
  ['dikkat', 'Dikkat / katılım'],
  ['anlama', 'Konuyu anlama'],
];
export const SCORE_LABEL = { 5: 'Çok iyi', 4: 'İyi', 3: 'Orta', 2: 'Kötü', 1: 'Sıkıntılı' };
export const KONU_MAX = 60;
export const NOTE_MAX = 200;
export const LOOKBACK_DAYS = 14; // değerlendirmesi girilmemiş dersler için geriye bakış

const reviewKey = (r) => lessonKey(r.student_id, r.date, r.time);

export function reviewMap(reviews) {
  const m = new Map();
  for (const r of reviews || []) m.set(reviewKey(r), r);
  return m;
}

/** Formdan gelen değerleri doğrular; en az bir puan şart. */
export function cleanReview(f) {
  const out = {};
  let any = false;
  for (const [k] of REVIEW_FIELDS) {
    const v = f[k];
    if (v === null || v === undefined || v === '') { out[k] = null; continue; }
    const n = Number(v);
    if (!Number.isInteger(n) || n < 1 || n > 5) throw new Error('Puanlar 1 ile 5 arasında olmalı.');
    out[k] = n; any = true;
  }
  if (!any) throw new Error('En az bir puan seçin.');
  const konu = String(f.konu ?? '').replace(/\s+/g, ' ').trim();
  const note = String(f.note ?? '').replace(/\s+/g, ' ').trim();
  if ([...konu].length > KONU_MAX) throw new Error(`Konu en fazla ${KONU_MAX} karakter olabilir.`);
  if ([...note].length > NOTE_MAX) throw new Error(`Not en fazla ${NOTE_MAX} karakter olabilir.`);
  return { ...out, konu, note, veli_gorusme: !!f.veli_gorusme };
}

/** Bir değerlendirmedeki puanların ortalaması (boş puanlar sayılmaz); puan yoksa null */
export function reviewAvg(r) {
  const v = REVIEW_FIELDS.map(([k]) => r[k]).filter((x) => x >= 1);
  return v.length ? v.reduce((a, b) => a + b, 0) / v.length : null;
}

/** Yapılmış (yapıldı sayılan) ama değerlendirmesi girilmemiş dersler; yeniden eskiye */
export function missingReviews(data, now, days = LOOKBACK_DAYS) {
  const rm = reviewMap(data.lesson_reviews);
  const from = addDays(now.date, -days);
  const out = [];
  for (const s of data.students) {
    if (s.active === false) continue;
    for (const l of decorateLessons(lessonsFor(s, data, from, now.date), data.marks, now)) {
      if (l.status === 'done' && !rm.has(l.key)) out.push({ ...l, student_name: s.name });
    }
  }
  return out.sort((a, b) => (b.date + b.time).localeCompare(a.date + a.time));
}

const mean = (a) => a.reduce((x, y) => x + y, 0) / a.length;

/** Öğrenci uyarıları (Keçeli'nin bilgi bankasındaki eşiklerle aynı):
 *  gidişat düşük · çalışma uyarısı · ödev uyarısı · devam uyarısı */
export function studentWarnings(data, now) {
  const out = [];
  const from = addDays(now.date, -60);
  for (const s of data.students) {
    if (s.active === false) continue;
    const revs = (data.lesson_reviews || []).filter((r) => r.student_id === s.id)
      .sort((a, b) => (a.date + a.time).localeCompare(b.date + b.time));
    const last3 = revs.slice(-3).map(reviewAvg).filter((x) => x !== null);
    if (last3.length === 3 && mean(last3) <= 2.5) out.push({ student_id: s.id, name: s.name, kind: 'gidisat', text: `Son 3 değerlendirme ortalaması ${mean(last3).toFixed(1).replace('.', ',')}: gidişat düşük` });
    const cal = revs.slice(-2).map((r) => r.calisma);
    if (cal.length === 2 && cal.every((x) => x >= 1 && x <= 2)) out.push({ student_id: s.id, name: s.name, kind: 'calisma', text: 'Üst üste 2 derste "çalışıyor mu" puanı düşük' });
    const hw = data.homework.filter((h) => h.student_id === s.id && h.due_date < now.date)
      .sort((a, b) => b.due_date.localeCompare(a.due_date)).slice(0, 4);
    const bad = hw.filter((h) => !h.done || (h.items || []).every((i) => itemStatus(h, i) === 'none')).length;
    if (hw.length >= 3 && bad >= 3) out.push({ student_id: s.id, name: s.name, kind: 'odev', text: `Son ${hw.length} ödevin ${bad} tanesi yapılmadı` });
    const ls = decorateLessons(generateOwn(s, data, from, now.date), data.marks, now).filter((l) => l.status === 'done' || l.status === 'not_held');
    const last2 = ls.slice(-2);
    if (last2.length === 2 && last2.every((l) => l.status === 'not_held')) out.push({ student_id: s.id, name: s.name, kind: 'devam', text: 'Üst üste 2 ders yapılmadı' });
  }
  return out;
}

function generateOwn(s, data, from, to) {
  return lessonsFor(s, data, from, to).filter((l) => !l.extra);
}

/** Haftalık (ya da herhangi aralık) rapor: öğrenci özeti, ödevler, dersler, değerlendirmeler */
export function buildReport(data, from, to, now) {
  const rm = reviewMap(data.lesson_reviews);
  const day = (iso) => (iso ? String(iso).slice(0, 10) : '');
  const students = data.students.filter((s) => s.active !== false || (s.end_date && s.end_date >= from));
  const summary = [], hwRows = [], lessonRows = [], reviewRows = [];
  for (const s of students) {
    const lessons = decorateLessons(lessonsFor(s, data, from, to), data.marks, now);
    const done = lessons.filter((l) => l.status === 'done').length;
    const notHeld = lessons.filter((l) => l.status === 'not_held').length;
    for (const l of lessons) {
      const rv = rm.get(l.key);
      lessonRows.push([s.name, fmtDate(l.date), l.time, l.extra ? 'Ek ders' : 'Program', { done: 'Yapıldı', not_held: 'Yapılmadı', today: 'Bugün', upcoming: 'Planlandı' }[l.status], l.reason || '', rv ? 'Girildi' : (l.status === 'done' ? 'GİRİLMEDİ' : '')]);
    }
    const hws = data.homework.filter((h) => h.student_id === s.id);
    const given = hws.filter((h) => h.given_date >= from && h.given_date <= to);
    const dueIn = hws.filter((h) => h.due_date >= from && h.due_date <= to);
    const comeIn = hws.filter((h) => h.done && day(h.done_at) >= from && day(h.done_at) <= to);
    const missed = dueIn.filter((h) => !h.done && h.due_date < now.date);
    for (const h of new Set([...given, ...dueIn, ...comeIn])) {
      const st = !h.done ? (h.due_date < now.date ? 'Gelmedi (süresi geçti)' : 'Bekleniyor')
        : (h.items || []).every((i) => itemStatus(h, i) === 'done') ? 'Yapıldı' : (h.items || []).every((i) => itemStatus(h, i) === 'none') ? 'Yapılmadı (bildirildi)' : 'Eksik yapıldı';
      hwRows.push([s.name, fmtDate(h.given_date), fmtDate(h.due_date), (h.items || []).map((i) => `${i.book_name} (${i.pages})`).join('; '), st, h.done ? fmtDate(day(h.done_at)) : '']);
    }
    const revs = (data.lesson_reviews || []).filter((r) => r.student_id === s.id && r.date >= from && r.date <= to)
      .sort((a, b) => (a.date + a.time).localeCompare(b.date + b.time));
    for (const r of revs) reviewRows.push([s.name, fmtDate(r.date), r.time, ...REVIEW_FIELDS.map(([k]) => r[k] ?? ''), r.konu || '', r.note || '', r.veli_gorusme ? 'Evet' : '']);
    const avgOf = (k) => { const v = revs.map((r) => r[k]).filter((x) => x >= 1); return v.length ? Math.round(mean(v) * 10) / 10 : ''; };
    const missing = lessons.filter((l) => l.status === 'done' && !rm.has(l.key)).length;
    summary.push([s.name, done, notHeld, given.length, comeIn.length, missed.length, ...REVIEW_FIELDS.map(([k]) => avgOf(k)), revs.length, missing]);
  }
  const sort = (a, b) => String(a[0]).localeCompare(String(b[0]), 'tr');
  const warns = studentWarnings(data, now).map((w) => [w.name, w.text]);
  return {
    sheets: [
      { name: 'Özet', widths: [24, 10, 11, 12, 12, 12, 14, 14, 10, 12, 12, 12, 12], rows: [
        [`Haftalık rapor: ${fmtDate(from)} – ${fmtDate(to)}`], [],
        ['Öğrenci', 'Yapılan ders', 'Yapılmayan ders', 'Verilen ödev', 'Gelen ödev', 'Gelmeyen ödev', ...REVIEW_FIELDS.map(([, l]) => `${l} (ort.)`), 'Değerlendirme sayısı', 'Girilmemiş değerlendirme'],
        ...summary.sort(sort),
        [], ['Puan: 5 çok iyi · 4 iyi · 3 orta · 2 kötü · 1 sıkıntılı'],
        ...(warns.length ? [[], ['Uyarılar'], ...warns] : []),
      ], headerRow: 2 },
      { name: 'Ödevler', widths: [24, 14, 14, 50, 24, 14], rows: [['Öğrenci', 'Veriliş', 'Son gün', 'Ödev', 'Durum', 'Yapıldığı gün'], ...hwRows.sort(sort)], headerRow: 0 },
      { name: 'Dersler', widths: [24, 14, 8, 10, 12, 30, 14], rows: [['Öğrenci', 'Tarih', 'Saat', 'Tür', 'Durum', 'Gerekçe', 'Değerlendirme'], ...lessonRows.sort(sort)], headerRow: 0 },
      { name: 'Değerlendirmeler', widths: [24, 14, 8, 12, 12, 10, 12, 12, 24, 50, 14], rows: [['Öğrenci', 'Tarih', 'Saat', ...REVIEW_FIELDS.map(([, l]) => l), 'Konu', 'Not', 'Veliyle görüşülsün'], ...reviewRows.sort(sort)], headerRow: 0 },
    ],
    summary, warns,
  };
}

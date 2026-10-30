import { test } from 'node:test';
import assert from 'node:assert/strict';
import { cleanReview, reviewAvg, missingReviews, studentWarnings, buildReport, REVIEW_FIELDS } from '../src/core/review.js';
import { buildXlsx, crc32 } from '../src/core/xlsx.js';
import { addDays, dow } from '../src/core/dates.js';
import { lessonsFor, decorateLessons } from '../src/core/lessons.js';

const now = { date: '2026-10-13', time: '12:00' }; // Salı
const base = () => ({
  students: [{ id: 's1', name: 'Ali', start_date: '2026-09-01', active: true }, { id: 's2', name: 'Şule', start_date: '2026-09-01', active: true }],
  schedules: [
    { id: 'a', student_id: 's1', valid_from: '2026-09-01', slots: [{ dow: 1, time: '17:00', hours: 1 }, { dow: 3, time: '17:00', hours: 1 }] },
    { id: 'b', student_id: 's2', valid_from: '2026-09-01', slots: [{ dow: 2, time: '10:00', hours: 1 }] },
  ],
  plans: [], marks: [], payments: [], homework: [], extra_lessons: [], lesson_reviews: [],
});

test('cleanReview: puan 1-5, en az bir puan, uzunluk sınırları', () => {
  assert.throws(() => cleanReview({}), /En az bir puan/);
  assert.throws(() => cleanReview({ verim: 6 }), /1 ile 5/);
  assert.throws(() => cleanReview({ verim: 2.5 }), /1 ile 5/);
  assert.throws(() => cleanReview({ verim: 3, konu: 'x'.repeat(61) }), /Konu/);
  assert.throws(() => cleanReview({ verim: 3, note: 'x'.repeat(201) }), /Not/);
  const r = cleanReview({ verim: '4', calisma: null, konu: '  Üslü   ifade ', veli_gorusme: 1 });
  assert.deepEqual([r.verim, r.calisma, r.konu, r.veli_gorusme], [4, null, 'Üslü ifade', true]);
  assert.equal(reviewAvg({ verim: 4, calisma: 2, gidisat: null }), 3);
  assert.equal(reviewAvg({}), null);
});

test('eksik değerlendirme: yalnız yapılmış dersler, yapılmayan ve girilmiş olanlar sayılmaz, 14 günden eski yok', () => {
  const d = base();
  d.marks.push({ student_id: 's1', date: '2026-10-12', time: '17:00', reason: 'hasta' }); // Pazartesi yapılmadı
  d.lesson_reviews.push({ student_id: 's2', date: '2026-10-13', time: '10:00', verim: 4 }); // bugünkü s2 dersi değerlendirildi
  const m = missingReviews(d, { date: '2026-10-13', time: '23:30' });
  const keys = m.map((l) => `${l.student_id}|${l.date}`);
  assert.ok(!keys.includes('s1|2026-10-12'), 'yapılmayan ders istenmez');
  assert.ok(!keys.includes('s2|2026-10-13'), 'girilmiş değerlendirme istenmez');
  assert.ok(keys.includes('s1|2026-10-07') && keys.includes('s2|2026-10-06'));
  assert.ok(m.every((l) => l.date >= '2026-09-29' && l.status === 'done'));
  // bugün saat 12:00: bugünkü ders henüz "yapıldı" sayılmaz → hatırlatma yok
  assert.ok(!missingReviews(base(), now).some((l) => l.date === now.date));
  // pasif öğrenci hatırlatılmaz
  const p = base(); p.students[0].active = false; p.students[0].end_date = '2026-09-10';
  assert.ok(!missingReviews(p, now).some((l) => l.student_id === 's1'));
});

test('uyarılar: gidişat düşük, çalışma, ödev, devam', () => {
  const d = base();
  const rv = (date, v) => ({ student_id: 's1', date, time: '17:00', verim: v, calisma: v, gidisat: v, dikkat: v, anlama: v });
  d.lesson_reviews.push(rv('2026-10-05', 2), rv('2026-10-07', 2), rv('2026-10-12', 2));
  const w = studentWarnings(d, now).map((x) => x.student_id + ':' + x.kind).sort();
  assert.deepEqual(w, ['s1:calisma', 's1:gidisat']);
  // iyi puanlar uyarı çıkarmaz
  const ok = base(); ok.lesson_reviews.push(rv('2026-10-05', 4), rv('2026-10-07', 5), rv('2026-10-12', 3));
  assert.deepEqual(studentWarnings(ok, now), []);
  // ödev: son 4 ödevin 3'ü yapılmadı
  const h = base();
  for (const [i, done] of [[1, false], [2, false], [3, false], [4, true]]) h.homework.push({ id: 'h' + i, student_id: 's2', given_date: '2026-09-20', due_date: addDays('2026-10-01', i), items: [{ book_name: 'K', pages: '1' }], done });
  assert.ok(studentWarnings(h, now).some((x) => x.student_id === 's2' && x.kind === 'odev'));
  // devam: üst üste 2 yapılmayan ders
  const v = base();
  v.marks.push({ student_id: 's2', date: '2026-10-06', time: '10:00', reason: 'x' }, { student_id: 's2', date: '2026-10-13', time: '10:00', reason: 'y' });
  assert.ok(studentWarnings(v, { date: '2026-10-13', time: '12:00' }).some((x) => x.student_id === 's2' && x.kind === 'devam'));
});

test('haftalık rapor: sayılar tutarlı, Özet sayfası başlıklarıyla satır genişliği aynı', () => {
  const d = base();
  d.marks.push({ student_id: 's1', date: '2026-10-07', time: '17:00', reason: 'hasta' });
  d.lesson_reviews.push({ student_id: 's1', date: '2026-10-05', time: '17:00', verim: 5, calisma: 3, konu: 'Üslü', note: 'iyi', veli_gorusme: true });
  d.homework.push({ id: 'h1', student_id: 's1', given_date: '2026-10-05', due_date: '2026-10-08', items: [{ book_name: 'K', pages: '1-3' }], done: false });
  d.homework.push({ id: 'h2', student_id: 's1', given_date: '2026-10-06', due_date: '2026-10-12', items: [{ book_name: 'L', pages: '4' }], done: true, done_at: '2026-10-11T10:00:00Z' });
  const r = buildReport(d, '2026-10-05', '2026-10-11', now);
  const row = r.summary.find((x) => x[0] === 'Ali');
  // [ad, yapılan, yapılmayan, verilen, gelen, gelmeyen, 5 ort, değ. sayısı, girilmemiş]
  assert.equal(row[1], 1); assert.equal(row[2], 1);
  assert.equal(row[3], 2); assert.equal(row[4], 1); assert.equal(row[5], 1);
  assert.equal(row[6], 5); assert.equal(row[7], 3);
  assert.equal(row[11], 1); assert.equal(row[12], 0);
  const ozet = r.sheets[0];
  assert.equal(ozet.rows[ozet.headerRow].length, row.length);
  assert.deepEqual(r.sheets.map((s) => s.name), ['Özet', 'Ödevler', 'Dersler', 'Değerlendirmeler']);
  assert.equal(r.sheets[3].rows[0].length, 3 + REVIEW_FIELDS.length + 3);
});

test('xlsx: geçerli zip yapısı (imzalar, CRC), Türkçe karakter ve özel karakter kaçışı', async () => {
  assert.equal(crc32(new TextEncoder().encode('123456789')), 0xcbf43926);
  const blob = buildXlsx([{ name: 'Özet/1', rows: [['Başlık <&>', 3.5, ''], ['İğüşöç', 'ok']], headerRow: 0, widths: [20, 10] }]);
  const buf = new Uint8Array(await blob.arrayBuffer());
  assert.deepEqual([...buf.slice(0, 4)], [0x50, 0x4b, 3, 4]);
  const txt = new TextDecoder().decode(buf);
  assert.ok(txt.includes('Başlık &lt;&amp;&gt;') && txt.includes('İğüşöç') && txt.includes('name="Özet 1"'));
  assert.deepEqual([...buf.slice(-22, -18)], [0x50, 0x4b, 5, 6]);
});

test('rastgele oturum: rapor hiçbir durumda çökmez, sayılar tutarlı (60 tohum)', () => {
  for (let seed = 1; seed <= 60; seed++) {
    let s = seed;
    const r = () => ((s = (s * 1664525 + 1013904223) >>> 0) / 2 ** 32);
    const d = base();
    const today = addDays('2026-10-13', Math.floor(r() * 80) - 40);
    const nw = { date: today, time: r() < 0.5 ? '12:00' : '23:30' };
    const all = d.students.flatMap((st) => lessonsFor(st, d, '2026-09-01', today));
    for (const l of all) {
      const x = r();
      if (x < 0.15) d.marks.push({ student_id: l.student_id, date: l.date, time: l.time, reason: 'r' });
      else if (x < 0.55) d.lesson_reviews.push({ student_id: l.student_id, date: l.date, time: l.time, verim: 1 + Math.floor(r() * 5), calisma: r() < 0.5 ? null : 1 + Math.floor(r() * 5) });
    }
    for (let i = 0; i < 6; i++) d.homework.push({ id: 'h' + i, student_id: r() < 0.5 ? 's1' : 's2', given_date: addDays(today, -10 - i), due_date: addDays(today, -3 - i), items: [{ book_name: 'K', pages: '1' }], done: r() < 0.5, done_at: r() < 0.5 ? addDays(today, -4) + 'T08:00:00Z' : null });
    const miss = missingReviews(d, nw);
    assert.ok(miss.every((l) => l.status === 'done' && !d.lesson_reviews.some((v) => v.student_id === l.student_id && v.date === l.date && v.time === l.time)));
    studentWarnings(d, nw);
    const from = addDays(today, -6 - dow(today) + 1 + 6 - 6);
    const rep = buildReport(d, from, addDays(from, 6), nw);
    for (const row of rep.summary) {
      assert.ok(row[1] >= 0 && row[2] >= 0 && row[12] <= row[1]);
      for (let k = 6; k <= 10; k++) assert.ok(row[k] === '' || (row[k] >= 1 && row[k] <= 5));
    }
    assert.ok(buildXlsx(rep.sheets).size > 500);
  }
});

test('ek ders değerlendirilince eksik listesinden kalkar', () => {
  const d = base();
  const now = { date: '2026-10-13', time: '12:00' };
  d.extra_lessons = [{ id: 'e1', student_id: 's1', date: '2026-10-09', time: '17:50', hours: 1 }];
  assert.ok(missingReviews(d, now).some((l) => l.extra));
  d.lesson_reviews = [{ id: 'r1', student_id: 's1', date: '2026-10-09', time: '17:50', verim: 5 }];
  assert.ok(!missingReviews(d, now).some((l) => l.extra));
});

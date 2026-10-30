// Ücret dökümü + tarih aralıklı değerlendirme raporu: salt okunur hesap, hiçbir kayıt değişmez.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { studentPeriods, feeBreakdown, lessonsPerPeriod } from '../src/core/billing.js';
import { buildReport } from '../src/core/review.js';

const ali = { id: 's1', name: 'Ali', start_date: '2026-09-01', active: true };
const veli = { id: 's2', name: 'Veli', start_date: '2026-09-01', active: true };
const slots = [{ dow: 2, time: '17:00', hours: 1 }, { dow: 5, time: '18:00', hours: 1 }];
const sched = (id) => ({ id: 'h' + id, student_id: id, valid_from: '2026-09-01', slots });
const plan = (id, type = '4weekly', fee = 800000, extra = {}) => ({ id: 'p' + id, student_id: id, valid_from: '2026-09-01', type, fee, hours: null, due_date: null, ...extra });
const mark = (id, date, time) => ({ id: `m${id}${date}`, student_id: id, date, time, reason: 'hasta' });
const mk = (o = {}) => ({ students: [ali], plans: [plan('s1')], schedules: [sched('s1')], marks: [], payments: [], extra_lessons: [], homework: [], lesson_reviews: [], settings: [], ...o });
const today = '2026-09-25';
const first = (d, t = today) => studentPeriods(ali, d, t).find((p) => p.key === 'ps1#1');

test('4 haftalık: ertelenen ders düşer, ek ders yapılınca tutar tekrar eklenir, toplam kuruşu kuruşuna tutar', () => {
  const m = [mark('s1', '2026-09-04', '18:00')];
  const a = first(mk({ marks: m }));
  assert.equal(a.amount, 700000);
  const da = feeBreakdown(a, today);
  assert.ok(da.check);
  assert.deepEqual(da.lines.map((l) => l.kind), ['base', 'minus']);
  assert.equal(da.missed.length, 1);

  const ex = [{ id: 'e1', student_id: 's1', date: '2026-09-10', time: '17:00', hours: 1, note: 'telafi' }];
  const b = first(mk({ marks: m, extra_lessons: ex }));
  const db = feeBreakdown(b, today);
  assert.ok(db.check);
  assert.equal(b.amount, 800000);
  assert.deepEqual(db.lines.map((l) => l.kind), ['base', 'minus', 'plus']);
  assert.equal(db.lines[1].amount, -100000);
  assert.equal(db.lines[2].amount, 100000);
  assert.equal(db.extras[0].counted, true);
  assert.equal(da.missed_hours, 1); assert.equal(da.minus, 100000); assert.equal(da.plus, 0); assert.equal(da.extra_hours_done, 0);
  assert.equal(db.missed_hours, 1); assert.equal(db.minus, 100000); assert.equal(db.plus, 100000); assert.equal(db.extra_hours_done, 1);
  assert.equal(db.base - db.minus + db.plus, db.total); // net = dönem ücreti − ertelenen + ek ders
});

test('tarihi gelmemiş ek ders tutara yansımaz ve bunu söyler', () => {
  const m = [mark('s1', '2026-09-04', '18:00')];
  const ex = [{ id: 'e2', student_id: 's1', date: '2026-09-27', time: '17:00', hours: 1, note: '' }];
  const p = first(mk({ marks: m, extra_lessons: ex }));
  const d = feeBreakdown(p, today);
  assert.ok(d.check);
  assert.equal(p.amount, 700000);
  assert.equal(d.extras[0].counted, false);
  assert.ok(d.notes.some((n) => n.includes('henüz gelmemiş')));
});

test('tek ödeme: ek ders ayrıca ücretlendirilmez, aylıkta döküm toplamı yine tutar', () => {
  for (const type of ['monthly', 'oneoff']) {
    const d = mk({ plans: [plan('s1', type, 600000, type === 'oneoff' ? { hours: 8, due_date: '2026-10-30' } : {})], marks: [mark('s1', '2026-09-04', '18:00')], extra_lessons: [{ id: 'e', student_id: 's1', date: '2026-09-10', time: '17:00', hours: 1, note: '' }] });
    for (const p of studentPeriods(ali, d, today)) {
      const f = feeBreakdown(p, today);
      assert.ok(f.check, `${type} ${p.key}`);
      assert.equal(f.total, p.amount);
    }
  }
});

test('hesap ve veri değişmedi: yeni alanlar eklendi, tutarlar aynı; döküm veriyi değiştirmez', () => {
  const d = mk({ marks: [mark('s1', '2026-09-04', '18:00')] });
  const before = JSON.stringify(d);
  const ps = studentPeriods(ali, d, today);
  for (const p of ps) feeBreakdown(p, today);
  assert.equal(JSON.stringify(d), before);
  assert.equal(ps[0].amount, 700000); // eski kuralla aynı
});

test('rastgele oturum: her dönemde döküm toplamı dönem ücretine eşit', () => {
  let seed = 7;
  const rnd = () => (seed = (seed * 1103515245 + 12345) & 0x7fffffff) / 0x7fffffff;
  const dates = ['2026-09-01', '2026-09-04', '2026-09-08', '2026-09-11', '2026-09-15', '2026-09-18', '2026-09-22', '2026-09-25', '2026-09-29', '2026-10-02', '2026-10-06', '2026-10-09'];
  for (let i = 0; i < 300; i++) {
    const type = ['weekly', '4weekly', 'monthly', 'oneoff'][Math.floor(rnd() * 4)];
    const marks = dates.filter(() => rnd() < 0.3).map((dt) => mark('s1', dt, new Date(dt + 'T00:00:00Z').getUTCDay() === 2 ? '17:00' : '18:00'));
    const extra_lessons = Array.from({ length: Math.floor(rnd() * 4) }, (_, k) => ({ id: 'x' + k, student_id: 's1', date: `2026-09-${String(2 + Math.floor(rnd() * 27)).padStart(2, '0')}`, time: '15:00', hours: [1, 1.5, 2][Math.floor(rnd() * 3)], note: '' }));
    const day = `2026-09-${String(10 + Math.floor(rnd() * 20)).padStart(2, '0')}`;
    const d = mk({ plans: [plan('s1', type, 100000 + Math.floor(rnd() * 900000), type === 'oneoff' ? { hours: 8, due_date: '2026-10-30' } : {})], marks, extra_lessons });
    for (const p of studentPeriods(ali, d, day)) assert.ok(feeBreakdown(p, day).check, `${type} ${p.key} ${day}`);
  }
});

test('rapor: tarih aralığı ve tek öğrenci / toplu', () => {
  const d = mk({ students: [ali, veli], plans: [plan('s1'), plan('s2')], schedules: [sched('s1'), sched('s2')], marks: [mark('s1', '2026-09-04', '18:00')] });
  const now = { date: '2026-09-25', time: '12:00' };
  const all = buildReport(d, '2026-09-01', '2026-09-30', now);
  assert.equal(all.summary.length, 2);
  const one = buildReport(d, '2026-09-01', '2026-09-30', now, 's1');
  assert.equal(one.summary.length, 1);
  assert.equal(one.summary[0][0], 'Ali');
  assert.equal(one.summary[0][2], 1); // 1 yapılmayan ders
  const short = buildReport(d, '2026-09-01', '2026-09-03', now, 's1');
  assert.equal(short.summary[0][1], 1); // yalnız 1 Eylül Salı yapıldı
  assert.equal(short.summary[0][2], 0);
});

test('Nisa: gün değişikliği yüzünden eksik ders ayrı satırda; ek ders +tutar görünür, toplam doğru', () => {
  const nisa = { id: 'n', name: 'NİSA', start_date: '2026-09-01', active: true };
  const schedules = [
    { id: 'a', student_id: 'n', valid_from: '2026-09-01', slots: [{ dow: 3, time: '14:00', hours: 2 }] },
    { id: 'b', student_id: 'n', valid_from: '2026-10-17', slots: [{ dow: 5, time: '14:00', hours: 2 }] },
  ];
  const plans = [{ id: 'p', student_id: 'n', valid_from: '2026-10-01', type: '4weekly', fee: 1200000 }];
  const marks = [{ id: 'm', student_id: 'n', date: '2026-10-23', time: '14:00', reason: 'HASTA' }];
  const ex = [{ id: 'e', student_id: 'n', date: '2026-10-25', time: '14:00', hours: 2, note: '' }];
  const p = studentPeriods(nisa, { plans, schedules, marks, payments: [], extra_lessons: ex }, '2026-10-26')[0];
  const d = feeBreakdown(p, '2026-10-26');
  assert.ok(d.check);
  assert.equal(p.amount, 900000);
  assert.deepEqual(d.lines.map((l) => [l.kind, l.amount]), [['base', 1200000], ['minus', -300000], ['plus', 300000], ['cut', -300000]]);
  assert.match(d.cut_label, /gün değişikliği/);
});

test('ek ders ertelenenden fazlaysa paket ücreti aşılmaz: kesinti satırı toplamı tutturur', () => {
  const ex = [1, 2, 3].map((i) => ({ id: 'q' + i, student_id: 's1', date: `2026-09-0${4 + i}`, time: '15:00', hours: 1, note: '' }));
  const p = first(mk({ marks: [mark('s1', '2026-09-04', '18:00')], extra_lessons: ex }));
  const d = feeBreakdown(p, today);
  assert.ok(d.check);
  assert.equal(p.amount, 800000);
  assert.ok(d.lines.some((l) => l.kind === 'cut'));
});

test('dönemi kalmayan ödeme kaybolmaz: kayıt değişmez, en eski ödenmemiş döneme sayılır', () => {
  const m = [mark('s1', '2026-09-04', '18:00')];
  const pay = (id, key, amount) => ({ id, student_id: 's1', period_key: key, amount, paid_date: '2026-09-20', method: 'nakit', note: '', deleted_at: null });
  const base = mk({ marks: m, payments: [pay('a', 'ps1#1', 700000), pay('b', 'silinmis-plan#2', 200000)] }); // bu plan artık yok
  const before = JSON.stringify(base);
  const ps = studentPeriods(ali, base, today);
  assert.equal(JSON.stringify(base), before, 'ödeme kayıtları değişmemeli');
  assert.equal(ps[0].paid, 700000);                         // #1 tam ödenmiş
  const carried = ps.find((p) => p.carried);
  assert.equal(carried.key, 'ps1#2');                       // fazla gelen 2.000 TL sıradaki döneme
  assert.equal(carried.paid, 200000);
  assert.equal(ps.reduce((a, p) => a + p.paid, 0), 900000); // alınan toplam = dönemlere bağlanan toplam
  // ufuktan sonraki (henüz üretilmemiş) dönem anahtarı yetim sayılmaz
  const far = mk({ payments: [pay('c', 'ps1#500', 100000)] });
  assert.equal(studentPeriods(ali, far, today).reduce((a, p) => a + p.paid, 0), 0);
});

test('aylık: yapılmayan dersin yerine ek ders yapılınca tam ücret çıkar (Duru örneği)', () => {
  const ayl = { id: 's1', name: 'Duru', start_date: '2026-10-03', active: true };
  const sl = [{ dow: 1, time: '17:00', hours: 1 }, { dow: 3, time: '17:00', hours: 1 }, { dow: 5, time: '17:00', hours: 1 }];
  const base = { students: [ayl], plans: [{ id: 'p1', student_id: 's1', valid_from: '2026-10-03', type: 'monthly', fee: 1200000, hours: null, due_date: null }], schedules: [{ id: 'h1', student_id: 's1', valid_from: '2026-10-03', slots: sl }], payments: [], homework: [], lesson_reviews: [], settings: [] };
  const t = '2026-10-31';
  const per = (d) => studentPeriods(ayl, d, t).find((p) => p.key === 'p1#1');
  const sade = per({ ...base, marks: [], extra_lessons: [] });
  const n = sade.scheduled_hours;
  const m = (date) => ({ id: 'm' + date, student_id: 's1', date, time: '17:00', reason: 'hasta' });
  const ms = [m('2026-10-05'), m('2026-10-07')];
  const eksik = per({ ...base, marks: ms, extra_lessons: [] });
  assert.equal(eksik.amount, 1200000 - Math.round((1200000 / n) * 2)); // telafi yoksa düşer
  const ex = [{ id: 'e1', student_id: 's1', date: '2026-10-10', time: '10:00', hours: 1, note: '' }, { id: 'e2', student_id: 's1', date: '2026-10-11', time: '10:00', hours: 1, note: '' }];
  const tam = per({ ...base, marks: ms, extra_lessons: ex });
  assert.equal(tam.amount, 1200000); // 2 ek ders telafi etti: tam ücret
  assert.ok(feeBreakdown(tam, t).check);
});

test('dönemdeki ders sayısı: haftalık, 4 haftalık, aylık (formdaki paket ücreti için)', () => {
  const sl = [{ dow: 2, time: '17:00', hours: 1 }, { dow: 5, time: '18:00', hours: 1.5 }];
  assert.equal(lessonsPerPeriod('weekly', sl, '2026-10-03'), 2.5);
  assert.equal(lessonsPerPeriod('4weekly', sl, '2026-10-03'), 10);
  const m = lessonsPerPeriod('monthly', sl, '2026-10-03'); // 3 Ekim – 2 Kasım, 31 gün: 5 Salı + 4 Cuma(1,5 saat)
  assert.ok(m >= 9 && m <= 12, String(m));
  assert.equal(lessonsPerPeriod('monthly', sl, ''), 0);
  assert.equal(lessonsPerPeriod('monthly', [], '2026-10-03'), 0);
  assert.equal(lessonsPerPeriod('oneoff', sl, '2026-10-03'), 0);
});

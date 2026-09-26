import { test } from 'node:test';
import assert from 'node:assert/strict';
import { generateLessons, decorateLessons, cleanReason, notHeldReport, lessonSummary } from '../src/core/lessons.js';
import { studentPeriods, packageFull } from '../src/core/billing.js';
import { ablative, locative, msgHomeworkGiven, isIOS, waHref, msgHomeworkDone, msgPaymentLate, msgPackageFull, msgPaymentReceived, normalizePhone, waLink } from '../src/core/messages.js';
import { parseTL, fmtTL } from '../src/core/money.js';
import { dow, addMonths } from '../src/core/dates.js';
import { incomeWeeks, monthView, rangeEarnings, paymentGroups, incomeForecast } from '../src/core/finance.js';

const ali = { id: 's1', name: 'Ali Yılmaz', start_date: '2026-09-01', active: true };
// 2026-09-01 Salı. Salı 17:00 (1 saat) + Cuma 18:00 (1 saat)
const sched = [{ id: 'h1', student_id: 's1', valid_from: '2026-09-01', slots: [{ dow: 2, time: '17:00', hours: 1 }, { dow: 5, time: '18:00', hours: 1 }] }];
const base = (extra = {}) => ({ plans: [], schedules: sched, marks: [], payments: [], ...extra });

test('tarih yardımcıları', () => {
  assert.equal(dow('2026-09-01'), 2);
  assert.equal(addMonths('2026-01-31', 1), '2026-02-28');
});

test('dersler programdan hesaplanır', () => {
  const ls = generateLessons(ali, sched, '2026-09-01', '2026-09-14');
  assert.deepEqual(ls.map((l) => l.date), ['2026-09-01', '2026-09-04', '2026-09-08', '2026-09-11']);
});

test('23:00 kuralı', () => {
  const ls = generateLessons(ali, sched, '2026-09-04', '2026-09-04');
  assert.equal(decorateLessons(ls, [], { date: '2026-09-04', time: '22:59' })[0].status, 'today');
  assert.equal(decorateLessons(ls, [], { date: '2026-09-04', time: '23:00' })[0].status, 'done');
  assert.equal(decorateLessons(ls, [], { date: '2026-09-05', time: '08:00' })[0].status, 'done');
  const mk = [{ id: 'm', student_id: 's1', date: '2026-09-04', time: '18:00', reason: 'Hastaydı' }];
  assert.equal(decorateLessons(ls, mk, { date: '2026-09-05', time: '08:00' })[0].status, 'not_held');
});

test('gerekçe: 50 karakter ve Türkçe', () => {
  assert.equal(cleanReason('  Öğrenci  şehir dışında, ığüşöç  '), 'Öğrenci şehir dışında, ığüşöç');
  assert.equal(cleanReason('ş'.repeat(50)).length, 50);
  assert.throws(() => cleanReason('ş'.repeat(51)));
  assert.throws(() => cleanReason('   '));
});

test('4 haftalık: yapılmayan ders düşülür, 5 gün sonra gecikme', () => {
  const plans = [{ id: 'p', student_id: 's1', valid_from: '2026-09-01', type: '4weekly', fee: 400000 }];
  const marks = [{ id: 'm', student_id: 's1', date: '2026-09-08', time: '17:00', reason: 'Tatil' }];
  const ps = studentPeriods(ali, base({ plans, marks }), '2026-09-20');
  const p1 = ps[0];
  assert.equal(p1.end, '2026-09-28');
  assert.equal(p1.scheduled_hours, 8);
  assert.equal(p1.deduction, 50000);
  assert.equal(p1.amount, 350000);
  assert.equal(p1.status, 'running');
  assert.equal(studentPeriods(ali, base({ plans, marks }), '2026-09-28')[0].status, 'due');
  assert.equal(studentPeriods(ali, base({ plans, marks }), '2026-10-02')[0].status, 'due');
  assert.equal(studentPeriods(ali, base({ plans, marks }), '2026-10-03')[0].status, 'late');
  const paid = [{ id: 'x', student_id: 's1', period_key: 'p#1', amount: 350000, paid_date: '2026-09-29', method: 'nakit' }];
  assert.equal(studentPeriods(ali, base({ plans, marks, payments: paid }), '2026-10-10')[0].status, 'paid');
});

test('aylık: ücret / ayın ders saati × yapılmayan saat; 3 gün sonra gecikme', () => {
  const plans = [{ id: 'p', student_id: 's1', valid_from: '2026-09-01', type: 'monthly', fee: 600000 }];
  // 1–30 Eylül: Salı 1,8,15,22,29 + Cuma 4,11,18,25 = 9 saat
  const marks = [{ id: 'a', student_id: 's1', date: '2026-09-15', time: '17:00', reason: 'x' }, { id: 'b', student_id: 's1', date: '2026-09-18', time: '18:00', reason: 'y' }];
  const p = studentPeriods(ali, base({ plans, marks }), '2026-09-30')[0];
  assert.equal(p.end, '2026-09-30');
  assert.equal(p.scheduled_hours, 9);
  assert.equal(p.deduction, Math.round(2 * 600000 / 9));
  assert.equal(p.amount, 600000 - Math.round(2 * 600000 / 9));
  assert.equal(studentPeriods(ali, base({ plans }), '2026-10-02')[0].status, 'due');
  assert.equal(studentPeriods(ali, base({ plans }), '2026-10-03')[0].status, 'late');
  assert.equal(studentPeriods(ali, base({ plans }), '2026-09-30')[0].amount, 600000);
});

test('haftalık ve plan değişikliği (kısmi dönem orantılı)', () => {
  const plans = [
    { id: 'w', student_id: 's1', valid_from: '2026-09-01', type: 'weekly', fee: 100000 },
    { id: 'm', student_id: 's1', valid_from: '2026-09-11', type: 'monthly', fee: 500000 },
  ];
  const ps = studentPeriods(ali, base({ plans }), '2026-09-12');
  const w = ps.filter((p) => p.plan_id === 'w');
  assert.equal(w.length, 2);
  assert.equal(w[1].start, '2026-09-08');
  assert.equal(w[1].end, '2026-09-10');
  assert.equal(w[1].amount, 50000); // 2 dersten 1'i bu dönemde
  assert.equal(ps.find((p) => p.plan_id === 'm').start, '2026-09-11');
});

test('pasif öğrenci: dersler ve dönemler bitiş tarihinde durur', () => {
  const s = { ...ali, active: false, end_date: '2026-09-05' };
  const plans = [{ id: 'p', student_id: 's1', valid_from: '2026-09-01', type: '4weekly', fee: 400000 }];
  const ps = studentPeriods(s, base({ plans }), '2026-10-20');
  assert.equal(ps.length, 1);
  assert.equal(ps[0].amount, 100000); // 8 dersten 2'si
  assert.equal(generateLessons(s, sched, '2026-09-01', '2026-12-01').length, 2);
});

test('tek ödeme paketi', () => {
  const plans = [{ id: 'o', student_id: 's1', valid_from: '2026-09-01', type: 'oneoff', fee: 300000, hours: 4, due_date: '2026-09-10' }];
  let p = studentPeriods(ali, base({ plans }), '2026-09-09')[0];
  assert.equal(p.amount, 300000);
  assert.equal(p.status, 'running');
  assert.equal(p.used_hours, 3);
  assert.equal(packageFull(p), false);
  p = studentPeriods(ali, base({ plans }), '2026-09-13')[0];
  assert.equal(p.status, 'late');
  assert.equal(packageFull(p), true);
});

test('Türkçe ekler', () => {
  assert.equal(ablative('Karekök 7'), "Karekök 7'den");
  assert.equal(ablative('Limit'), "Limit'ten");
  assert.equal(ablative('Bilfen'), "Bilfen'den");
  assert.equal(ablative('Palme'), "Palme'den");
  assert.equal(ablative('Acil Matematik'), "Acil Matematik'ten");
  assert.equal(ablative('3D'), "3D'den");
  assert.equal(ablative('TYT'), "TYT'den");
  assert.equal(ablative('Okyanus 10'), "Okyanus 10'dan");
  assert.equal(ablative('Hız 40'), "Hız 40'tan");
  assert.equal(ablative('Kitap 3'), "Kitap 3'ten");
  assert.equal(ablative('Soru Bankası'), "Soru Bankası'ndan");
  assert.equal(ablative('Ödev Defteri'), "Ödev Defteri'nden");
  assert.equal(ablative('Karekök Mavi'), "Karekök Mavi'den");
  assert.equal(locative('26.09.2026'), "26.09.2026'da");
  assert.equal(locative('03.10.2020'), "03.10.2020'de");
});

test('mesaj kalıpları', () => {
  const items = [{ book_name: 'Karekök 7', pages: '12-20' }, { book_name: 'Limit', pages: '5' }, { book_name: 'Boş', pages: '' }];
  assert.equal(msgHomeworkGiven(items, '2026-10-03'), "Sayın veli, öğrencinizin Karekök 7'den 12-20. sayfalar, Limit'ten 5. sayfa ödevi verilmiştir. Son bitirme tarihi: 3 Ekim 2026.");
  assert.equal(msgHomeworkDone('Ali Yılmaz', items), 'Sayın veli, Ali Yılmaz isimli öğrenciniz Karekök 7 (12-20. sayfalar), Limit (5. sayfa) kitaplarındaki ödevini yapmıştır.');
  assert.equal(msgHomeworkDone('Ali', items.slice(1, 2)), 'Sayın veli, Ali isimli öğrenciniz Limit (5. sayfa) kitabındaki ödevini yapmıştır.');
  assert.equal(msgPaymentLate({ due: '2026-09-26' }), "Sayın veli, 26.09.2026'da dolan ödeme henüz görünmüyor, hatırlatmak istedim.");
  assert.equal(msgPackageFull({ type: '4weekly', amount: 350000, remaining: 350000 }), 'Sayın veli, öğrencimizin 4 haftalık paketi dolmuştur. Ödeme tutarı: 3.500 TL. Bilginize.');
  assert.equal(msgPaymentReceived(125050), 'Sayın veli, 1.250,50 TL ödemeniz alınmıştır, teşekkür ederim.');
});

test('telefon ve wa.me', () => {
  assert.equal(normalizePhone('0532 123 45 67'), '905321234567');
  assert.equal(normalizePhone('+90 (532) 123-4567'), '905321234567');
  assert.equal(normalizePhone('5321234567'), '905321234567');
  assert.ok(waLink('05321234567', 'Ödev ş').startsWith('https://wa.me/905321234567?text=%C3%96dev'));
  assert.equal(waHref('05321234567', 'a b', true), 'whatsapp://send?phone=905321234567&text=a%20b');
  assert.equal(waHref('05321234567', 'a b', false), 'https://wa.me/905321234567?text=a%20b');
  assert.equal(isIOS('Mozilla/5.0 (iPhone; CPU iPhone OS 18_0 like Mac OS X)', 5), true);
  assert.equal(isIOS('Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7)', 5), true, 'iPad');
  assert.equal(isIOS('Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7)', 0), false, 'Mac');
  assert.equal(isIOS('Mozilla/5.0 (Linux; Android 14)', 5), false);
});

test('para', () => {
  assert.equal(parseTL('1.250'), 125000);
  assert.equal(parseTL('1250,5'), 125050);
  assert.equal(parseTL('1250.50'), 125050);
  assert.ok(Number.isNaN(parseTL('abc')));
  assert.equal(fmtTL(125000), '1.250 TL');
});

test('ders raporu', () => {
  const marks = [{ id: 'a', student_id: 's1', date: '2026-09-15', time: '17:00', reason: 'Hasta' }, { id: 'b', student_id: 's1', date: '2026-10-15', time: '17:00', reason: 'x' }];
  const r = notHeldReport([ali], marks, '2026-09-01', '2026-09-30');
  assert.equal(r.length, 1);
  assert.equal(r[0].student_name, 'Ali Yılmaz');
  // Eylül 2026: 5 Salı + 4 Cuma = 9 ders; 15'i yapılmadı, 29'u henüz gelmedi (bugün 26 Eylül)
  const sum = lessonSummary([ali], sched, marks, '2026-09-01', '2026-09-30', { date: '2026-09-26', time: '12:00' });
  assert.deepEqual([sum.done, sum.not_held, sum.upcoming, sum.rows[0].total], [7, 1, 1, 9]);
});

test('gelir takvimi ve muhasebe', () => {
  const plans = [{ id: 'p', student_id: 's1', valid_from: '2026-09-01', type: '4weekly', fee: 400000 }];
  const payments = [{ id: 'x', student_id: 's1', period_key: 'p#1', amount: 100000, paid_date: '2026-09-29', method: 'nakit' }];
  const periods = studentPeriods(ali, base({ plans, payments }), '2026-10-05');
  const w = incomeWeeks(periods, payments, '2026-10-05');
  const due = w.rows.find((r) => r.week_start === '2026-09-28');
  assert.equal(due.expected, 400000);
  assert.equal(due.collected, 100000);
  assert.equal(due.cash, 100000);
  assert.equal(w.overdue_total, 300000);
  const cur = w.rows.find((r) => r.is_current);
  assert.equal(cur.target, 300000);
  const mv = monthView({ periods, payments, expenses: [{ id: 'e', name: 'Kira', amount: 500000, due_day: 10, start_month: '2026-01' }], expensePayments: [], settings: { cash_on_hand: 0 } }, '2026-10', '2026-10-05');
  assert.equal(mv.summary.expenses_total, 500000);
  assert.equal(mv.summary.overdue_total, 300000);
  assert.ok(mv.summary.extra > 0);
});

test('sayfa yazımı: "12-15. sayfalar" gibi girişlerde tekrar oluşmaz', async () => {
  const { pagesText } = await import('../src/core/messages.js');
  const beklenen = {
    '12-15': '12-15. sayfalar', '12-15. sayfalar': '12-15. sayfalar', '12-15 sayfalar': '12-15. sayfalar',
    's. 12-15': '12-15. sayfalar', 'Sayfalar 3-5': '3-5. sayfalar', '30': '30. sayfa', '30. sayfa': '30. sayfa',
    'sayfa 30': '30. sayfa', 'sf. 7': '7. sayfa', '40 sayfa.': '40. sayfa', '12, 14, 16': '12, 14, 16. sayfalar',
  };
  for (const [g, c] of Object.entries(beklenen)) assert.equal(pagesText(g), c, g);
});

test('tarih aralığında kazanç: yapılan / kalan dersler, yapılmayan sayılmaz', () => {
  // Haftalık 1.000 TL, haftada 2 saat → 1 saat 500 TL. 4 Eylül yapılmadı.
  const plans = [{ id: 'p', student_id: 's1', valid_from: '2026-09-01', type: 'weekly', fee: 100000 }];
  const marks = [{ id: 'm', student_id: 's1', date: '2026-09-04', time: '18:00', reason: 'Hasta' }];
  const data = { students: [ali], ...base({ plans, marks }) };
  const now = { date: '2026-09-10', time: '12:00' };
  const periods = studentPeriods(ali, data, now.date);
  const r = rangeEarnings(data, {}, periods, '2026-09-01', '2026-09-14', now);
  assert.equal(r.earned, 100000);          // 1 ve 8 Eylül
  assert.equal(r.planned, 50000);          // 11 Eylül henüz gelmedi
  assert.equal(r.done_count, 2);
  assert.equal(r.not_held, 1);
  assert.equal(r.expected, 150000);        // 1. hafta 500 TL (kesintili) + 2. hafta 1.000 TL
});

test('tarih aralığında kazanç: tek ödeme paketi saatle sınırlı', () => {
  const plans = [{ id: 'p', student_id: 's1', valid_from: '2026-09-01', type: 'oneoff', fee: 200000, hours: 4, due_date: '2026-09-30' }];
  const data = { students: [ali], ...base({ plans }) };
  const now = { date: '2026-09-16', time: '12:00' };
  const periods = studentPeriods(ali, data, now.date);
  // 1, 4, 8 Eylül önceden 3 saat; aralıkta 11 ve 15 yapıldı ama paketin yalnız 1 saati kaldı
  const r = rangeEarnings(data, {}, periods, '2026-09-09', '2026-09-30', now);
  assert.equal(r.earned, 50000);
  assert.equal(r.planned, 0);
  const all = rangeEarnings(data, {}, periods, '2026-09-01', '2026-09-30', now);
  assert.equal(all.earned, 200000);
});

test('ödemeler sekmeleri ve 5 haftalık tahmin', () => {
  const plans = [{ id: 'p', student_id: 's1', valid_from: '2026-08-04', type: 'weekly', fee: 100000 }];
  const ali2 = { ...ali, start_date: '2026-08-04' };
  const periods = studentPeriods(ali2, base({ plans }), '2026-09-10');
  const g = paymentGroups(periods, '2026-09-10');
  assert.equal(g.upcoming.length, 1);                         // öğrenci başına en yakın ödeme
  assert.ok(g.critical.every((p) => p.days_past_due > p.remind_days + 7));
  assert.ok(g.critical.length > 0 && g.late.length > 0);
  const fc = incomeForecast(periods, '2026-09-10');
  assert.equal(fc[0].name, 'Bu hafta');
  assert.equal(fc[0].expected, 100000);                       // 8–14 Eylül dönemi, vade 14 Eylül
});

test('muhasebe: karşılanamayan gider, ek para ve haftalık döküm', () => {
  const plans = [{ id: 'p', student_id: 's1', valid_from: '2026-09-01', type: '4weekly', fee: 400000 }];
  const periods = studentPeriods(ali, base({ plans }), '2026-10-05');
  const expenses = [{ id: 'e', name: 'Kira', amount: 500000, due_day: 10, start_month: '2026-01' }];
  const mv = monthView({ periods, payments: [], expenses, expensePayments: [], settings: { cash_on_hand: 100000 } }, '2026-10', '2026-10-05');
  const kira = mv.expenses[0];
  assert.equal(kira.covered, false);
  assert.equal(kira.short, 400000);                           // 1.000 TL var, 5.000 TL kira
  assert.equal(mv.summary.extra, 400000);
  assert.equal(mv.summary.extra_date, '2026-10-10');
  assert.equal(mv.weeks.reduce((a, w) => a + w.expenses, 0), 500000);
  assert.ok(mv.advice.some((a) => a.level === 'bad' && a.text.includes('Kira')));
  assert.ok(mv.advice.some((a) => a.text.includes('Gecikmiş alacağınız')));
});

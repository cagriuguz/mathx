// Rastgele kullanıcı oturumu testi: rastgele öğrenci/program/plan/iptal/ödeme dizileri üretir,
// her adımdan sonra hesap kurallarının bozulmadığını denetler.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { allPeriods, studentPeriods, isOpen } from '../src/core/billing.js';
import { generateLessons, decorateLessons, notHeldReport } from '../src/core/lessons.js';
import { incomeWeeks, monthView, yearSummary } from '../src/core/finance.js';
import { msgHomeworkGiven, msgHomeworkDone, msgPaymentLate, msgPackageFull } from '../src/core/messages.js';
import { addDays, monthKey, diffDays } from '../src/core/dates.js';

function rng(seed) {
  let s = seed >>> 0;
  return () => ((s = (s * 1664525 + 1013904223) >>> 0) / 2 ** 32);
}

const TYPES = ['weekly', '4weekly', 'monthly', 'oneoff'];
const TIMES = ['09:00', '11:30', '15:00', '17:00', '19:45'];

function session(seed) {
  const r = rng(seed);
  const pick = (a) => a[Math.floor(r() * a.length)];
  const int = (a, b) => a + Math.floor(r() * (b - a + 1));
  const today = addDays('2026-09-26', int(-200, 200));
  const data = { students: [], schedules: [], plans: [], marks: [], payments: [], expenses: [], expense_payments: [] };
  let id = 0;
  const nid = () => `x${++id}`;
  const steps = int(10, 60);
  for (let i = 0; i < steps; i++) {
    const op = r();
    if (op < 0.2 || !data.students.length) {
      const sid = nid();
      const start = addDays(today, int(-150, 20));
      data.students.push({ id: sid, name: `Öğr ${sid}`, start_date: start, active: true });
      const n = int(1, 3), slots = [];
      for (let k = 0; k < n; k++) slots.push({ dow: int(1, 7), time: pick(TIMES), hours: pick([1, 1, 1.5, 2]) });
      data.schedules.push({ id: nid(), student_id: sid, valid_from: start, slots });
      const type = pick(TYPES);
      data.plans.push({ id: nid(), student_id: sid, valid_from: start, type, fee: int(1, 900) * 1000, hours: type === 'oneoff' ? int(1, 20) : null, due_date: type === 'oneoff' ? addDays(start, int(0, 60)) : null });
    } else if (op < 0.5) {
      const s = pick(data.students);
      const ls = generateLessons(s, data.schedules, addDays(today, -120), addDays(today, 10));
      if (ls.length) {
        const l = pick(ls);
        if (!data.marks.some((m) => m.student_id === s.id && m.date === l.date && m.time === l.time)) data.marks.push({ id: nid(), student_id: s.id, date: l.date, time: l.time, reason: 'Gerekçe ığüşöç' });
      }
    } else if (op < 0.62 && data.marks.length) {
      data.marks.splice(int(0, data.marks.length - 1), 1); // geri al
    } else if (op < 0.8) {
      const ps = allPeriods(data, today);
      const open = ps.filter((p) => p.remaining > 0);
      if (open.length) {
        const p = pick(open);
        data.payments.push({ id: nid(), student_id: p.student_id, period_key: p.key, amount: pick([p.remaining, Math.ceil(p.remaining / 2), p.remaining + 5000]), paid_date: addDays(today, int(-30, 0)), method: pick(['nakit', 'havale', 'indirim']) });
      }
    } else if (op < 0.86 && data.payments.length) {
      pick(data.payments).deleted_at = '2026-01-01';
    } else if (op < 0.92) {
      const s = pick(data.students);
      const from = addDays(today, int(-60, 10));
      if (from > s.start_date) data.plans.push({ id: nid(), student_id: s.id, valid_from: from, type: pick(TYPES), fee: int(1, 900) * 1000, hours: 5, due_date: addDays(from, 10) });
      if (from > s.start_date && r() < 0.5) data.schedules.push({ id: nid(), student_id: s.id, valid_from: from, slots: [{ dow: int(1, 7), time: pick(TIMES), hours: 1 }] });
    } else if (op < 0.96) {
      const s = pick(data.students);
      if (s.active !== false) { s.active = false; s.end_date = addDays(today, int(-40, 5)); if (s.end_date < s.start_date) s.end_date = s.start_date; }
      else { s.active = true; s.end_date = null; }
    } else {
      data.expenses.push({ id: nid(), name: 'Gider', amount: int(1, 500) * 1000, due_day: int(1, 31), start_month: monthKey(addDays(today, -60)), end_month: null, active: true });
    }
    check(data, today, `seed ${seed} adım ${i}`);
  }
}

function check(data, today, where) {
  const periods = allPeriods(data, today);
  for (const s of data.students) {
    const ps = periods.filter((p) => p.student_id === s.id);
    const keys = new Set();
    for (const p of ps) {
      const at = `${where} ${p.key}`;
      assert.ok(!keys.has(p.key), `${at}: tekrar eden dönem anahtarı`);
      keys.add(p.key);
      assert.ok(Number.isInteger(p.amount) && p.amount >= 0, `${at}: tutar negatif/kesirli`);
      assert.ok(p.amount <= Math.max(p.base, 0), `${at}: tutar tabandan büyük`);
      assert.ok(p.deduction >= 0 && p.deduction <= p.base, `${at}: kesinti aralık dışı`);
      assert.equal(p.remaining, Math.max(0, p.amount - p.paid), `${at}: kalan yanlış`);
      assert.ok(p.missed_hours <= p.scheduled_hours + 1e-9 || p.type === 'oneoff', `${at}: yapılmayan > planlı`);
      if (p.type !== 'oneoff') {
        assert.ok(p.start <= p.end, `${at}: ters dönem`);
        assert.equal(p.due, p.end, `${at}: vade dönem sonu değil`);
        if (s.active === false && s.end_date) assert.ok(p.end <= s.end_date, `${at}: pasif öğrenciye bitişten sonra dönem`);
      }
      if (p.status === 'late') assert.ok(diffDays(today, p.due) >= p.remind_days && p.remaining > 0, `${at}: erken gecikme`);
      if (p.status === 'due') assert.ok(today >= p.due && diffDays(today, p.due) < p.remind_days, `${at}: ödeme zamanı yanlış`);
      if (p.status === 'paid') assert.ok(p.remaining === 0, `${at}: ödendi ama kalan var`);
      if (p.status === 'running') assert.ok(today < p.due, `${at}: vadesi geçmiş ama sürüyor`);
      for (const t of [msgPaymentLate(p), msgPackageFull(p)]) assert.ok(!/undefined|NaN/.test(t), `${at}: mesajda boşluk`);
    }
    // Aynı plana ait tekrarlı dönemler çakışmaz ve boşluksuz ilerler
    const byPlan = {};
    for (const p of ps.filter((x) => x.type !== 'oneoff')) (byPlan[p.plan_id] ||= []).push(p);
    for (const list of Object.values(byPlan)) {
      for (let i = 1; i < list.length; i++) assert.equal(list[i].start, addDays(list[i - 1].end, 1), `${where}: dönemler arasında boşluk/çakışma`);
    }
    // Öğrencinin tekil dönem hesabı, toplu hesapla aynı
    assert.deepEqual(studentPeriods(s, data, today).map((p) => p.amount), ps.map((p) => p.amount), `${where}: tekil/toplu farkı`);
  }
  const ls = decorateLessons(data.students.flatMap((s) => generateLessons(s, data.schedules, addDays(today, -30), addDays(today, 7))), data.marks, { date: today, time: '12:00' });
  for (const l of ls) {
    if (l.date > today) assert.equal(l.status === 'upcoming' || l.status === 'not_held', true, `${where}: gelecekteki ders yapıldı sayıldı`);
    if (l.date < today && l.status !== 'not_held') assert.equal(l.status, 'done', `${where}: geçmiş ders yapıldı sayılmadı`);
  }
  notHeldReport(data.students, data.marks, addDays(today, -60), today);
  const w = incomeWeeks(periods, data.payments, today);
  for (const r of w.rows) assert.ok(r.collected <= r.expected && r.remaining >= 0 && r.cash >= 0, `${where}: gelir takvimi tutarsız`);
  const mv = monthView({ periods, payments: data.payments, expenses: data.expenses, expensePayments: data.expense_payments, settings: {} }, monthKey(today), today);
  assert.ok(mv.summary.extra >= 0 && mv.summary.overdue_total >= 0, `${where}: muhasebe tutarsız`);
  assert.equal(periods.filter(isOpen).every((p) => p.due <= today), true, `${where}: vadesi gelmemiş borç açık görünüyor`);
  yearSummary({ payments: data.payments, expenses: data.expenses, expensePayments: data.expense_payments }, today);
}

test('rastgele oturumlar (400 tohum)', () => {
  for (let seed = 1; seed <= 400; seed++) session(seed);
});

test('mesajlarda boş alan yok', () => {
  const items = [{ book_name: 'Kitap 1', pages: '1-2' }];
  assert.ok(!/undefined/.test(msgHomeworkGiven(items, '2026-10-01') + msgHomeworkDone('Ali', items)));
});

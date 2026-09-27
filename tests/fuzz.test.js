// Rastgele kullanıcı oturumu testi: rastgele öğrenci/program/plan/iptal/ödeme dizileri üretir,
// her adımdan sonra hesap kurallarının bozulmadığını denetler.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { allPeriods, studentPeriods, isOpen } from '../src/core/billing.js';
import { generateLessons, decorateLessons, notHeldReport } from '../src/core/lessons.js';
import { incomeWeeks, monthView, yearSummary, paymentGroups, rangeEarnings, incomeForecast, monthsOutlook, expenseList } from '../src/core/finance.js';
import { msgHomeworkGiven, msgHomeworkDone, msgPaymentLate, msgPackageFull } from '../src/core/messages.js';
import { addDays, monthKey, diffDays, monthFirst, monthLast } from '../src/core/dates.js';

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
  const data = { students: [], schedules: [], plans: [], marks: [], payments: [], expenses: [], expense_payments: [], extra_lessons: [] };
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
      const eid = nid();
      data.expenses.push({ id: eid, name: `Gider ${eid}`, amount: int(1, 500) * 1000, due_day: int(1, 31), start_month: monthKey(addDays(today, int(-60, 40))), end_month: r() < 0.3 ? monthKey(addDays(today, int(0, 90))) : null, active: r() < 0.9 });
      if (r() < 0.4) data.expense_payments.push({ id: nid(), expense_id: eid, month: monthKey(today), paid_date: addDays(today, int(-20, 0)), amount: int(1, 500) * 1000 });
    }
    // Ek ders ekle / sil; derslere başlama tarihini kaydır (ilk program ve ücret sürümüyle birlikte)
    if (data.students.length && r() < 0.18) {
      const s = pick(data.students);
      data.extra_lessons.push({ id: nid(), student_id: s.id, date: addDays(today, int(-120, 15)), time: pick(TIMES), hours: pick([1, 1, 1.5, 2]), note: r() < 0.5 ? 'Sınav öncesi' : '' });
    }
    if (data.extra_lessons.length && r() < 0.05) data.extra_lessons.splice(int(0, data.extra_lessons.length - 1), 1);
    if (data.students.length && r() < 0.04) {
      const s = pick(data.students);
      const byDate = (a, b) => a.valid_from.localeCompare(b.valid_from);
      const sch = data.schedules.filter((x) => x.student_id === s.id).sort(byDate);
      const pl = data.plans.filter((x) => x.student_id === s.id).sort(byDate);
      const nd = addDays(s.start_date, int(-30, 30));
      const next = [sch[1], pl[1]].filter(Boolean).map((x) => x.valid_from).sort()[0];
      if ((!next || nd < next) && (s.active !== false || !s.end_date || nd <= s.end_date)) {
        if (sch[0].valid_from <= s.start_date) sch[0].valid_from = nd;
        if (pl[0].valid_from <= s.start_date) pl[0].valid_from = nd;
        s.start_date = nd;
      }
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
    // Ek ders: her ek ders en fazla bir dönemde; ek dersle kısalan dönem tam ders saatine ulaşmış olmalı; ücret artmaz
    const exSeen = new Set();
    for (const p of ps) {
      for (const x of p.extra || []) { assert.ok(!exSeen.has(x.extra_id), `${where}: ek ders iki dönemde`); exSeen.add(x.extra_id); }
      assert.ok(p.amount <= p.fee || p.type === 'oneoff', `${where}: ek ders ücreti artırdı`);
      if (p.shortened && !p.truncated && p.hourly > 0) assert.ok(p.scheduled_hours + p.extra_hours >= p.fee / p.hourly - 1e-6, `${where}: dolmadan kısalan dönem`);
      if (p.shortened) assert.ok(p.end < p.cal_end, `${where}: kısalma işareti yanlış`);
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

  // ── Para bölümü: haftalık döküm ay toplamlarıyla birebir tutar
  const W = mv.weeks, tot = (k) => W.reduce((a, w) => a + w[k], 0);
  assert.equal(tot('received'), mv.summary.received, `${where}: haftalık gelen ≠ ay`);
  assert.equal(tot('expected'), mv.summary.expected, `${where}: haftalık beklenen ≠ ay`);
  assert.equal(tot('expenses'), mv.summary.expenses_total, `${where}: haftalık gider ≠ ay`);
  for (const e of mv.expenses) if (e.covered === false) assert.ok(e.short > 0, `${where}: karşılanmıyor ama eksik 0`);
  for (const t of mv.timeline) assert.ok(Number.isFinite(t.balance), `${where}: bakiye sayı değil`);
  for (const a of mv.advice) assert.ok(!/undefined|NaN/.test(a.text), `${where}: tavsiyede boşluk: ${a.text}`);
  const nextMonth = monthKey(addDays(monthLast(monthKey(today)), 1));
  const mv2 = monthView({ periods, payments: data.payments, expenses: data.expenses, expensePayments: data.expense_payments, settings: { cash_on_hand: 100000 } }, nextMonth, today);
  assert.ok(mv2.summary.extra >= 0 && mv2.weeks.every((w) => Number.isFinite(w.net)), `${where}: gelecek ay muhasebesi tutarsız`);
  monthsOutlook({ periods, payments: data.payments, expenses: data.expenses, expensePayments: data.expense_payments, settings: {} }, today, 3);
  expenseList(data.expenses, today);

  // ── Ödemeler sekmeleri ayrık; kritik/gecikmiş/ödeme zamanı borçlu
  const g = paymentGroups(periods, today);
  const seen = new Set();
  for (const k of ['upcoming', 'due', 'late', 'critical', 'paid']) for (const p of g[k]) { assert.ok(!seen.has(p.key), `${where}: dönem iki sekmede`); seen.add(p.key); }
  for (const k of ['due', 'late', 'critical']) for (const p of g[k]) assert.ok(p.remaining > 0 && p.due <= today, `${where}: ${k} sekmesinde yanlış dönem`);
  assert.equal(new Set(g.upcoming.map((p) => p.student_id)).size, g.upcoming.length, `${where}: yaklaşan öğrenci başına tek değil`);

  // ── Tahmin ve tarih aralığında kazanç
  const fc = incomeForecast(periods, today);
  assert.equal(fc.length, 5);
  for (const f of fc) assert.ok(f.remaining >= 0 && f.remaining <= f.expected, `${where}: tahmin tutarsız`);
  const now = { date: today, time: '12:00' };
  const ms = monthFirst(monthKey(today)), me = monthLast(monthKey(today));
  const whole = rangeEarnings(data, {}, periods, ms, me, now);
  for (const k of ['received', 'expected', 'earned', 'planned', 'done_hours', 'planned_hours']) assert.ok(Number.isFinite(whole[k]) && whole[k] >= 0, `${where}: kazanç ${k} geçersiz`);
  // Aralık bölünürse kazanç toplanabilir kalır (paket saati sınırı iki kez sayılmaz); yuvarlama payı parça başına 1 kuruş
  const mid = addDays(ms, 13);
  const a = rangeEarnings(data, {}, periods, ms, mid, now), b = rangeEarnings(data, {}, periods, addDays(mid, 1), me, now);
  assert.ok(Math.abs(a.earned + b.earned - whole.earned) <= 2 * (periods.length + 1), `${where}: kazanç toplanabilir değil ${a.earned}+${b.earned}≠${whole.earned}`);
  assert.equal(a.received + b.received, whole.received, `${where}: alınan toplanabilir değil`);
  assert.equal(a.expected + b.expected, whole.expected, `${where}: beklenen toplanabilir değil`);
  assert.equal(a.done_count + b.done_count, whole.done_count, `${where}: ders sayısı toplanabilir değil`);
}

test('rastgele oturumlar (400 tohum)', () => {
  for (let seed = 1; seed <= 400; seed++) session(seed);
});

test('mesajlarda boş alan yok', () => {
  const items = [{ book_name: 'Kitap 1', pages: '1-2' }];
  assert.ok(!/undefined/.test(msgHomeworkGiven(items, '2026-10-01') + msgHomeworkDone('Ali', items)));
});

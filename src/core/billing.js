// Ödeme dönemleri (madde 2, 4, 5, 6). Tutarlar KURUŞ (tam sayı) olarak tutulur.
//
// Ödeme türleri:
//   weekly   Haftalık     — 7 günlük dönem, ücret haftalık
//   4weekly  4 Haftalık   — 28 günlük dönem, ücret 4 haftalık
//   monthly  Aylık        — başlangıç gününden bir sonraki ayın aynı gününe kadar, ücret aylık
//   oneoff   Tek Ödeme    — X saatlik paket, sabit tutar, elle girilen son ödeme tarihi
//
// Kesinti (madde 2 ve 5): 1 ders saatinin değeri = dönem ücreti / dönemdeki planlı ders saati;
// yapılmayan ders saati × bu değer dönem tutarından düşülür. Yapılmayan ders yoksa tutar aynen kalır.
// Ek ders (madde: "fazladan ders yaptım"): dönemin planlı ders saatini doldurur. Programdaki dersler + ek dersler
// dönemin tam ders saatine ulaştığı anda dönem biter, bir sonraki dönem ertesi gün başlar. Örn. haftada 2 saat,
// 4 haftalık paket (8 saat): 2. hafta 2 saat ek ders yapılırsa paket 3. haftanın son dersinde dolar.
// Tek Ödeme paketinde ek ders kullanılan saate eklenir. Ek ders ayrıca ücretlendirilmez.
// Vade = dönemin son günü. Hatırlatma, vadeden N gün SONRA verilir (aylık 3, 4 haftalık 5; Ayarlar'dan değişir).
import { addDays, addMonths, diffDays } from './dates.js';
import { generateLessons, extraLessons, marksMap, lessonKey, lessonsFor, decorateLessons } from './lessons.js';

export const PLAN_TYPES = {
  weekly: 'Haftalık',
  '4weekly': '4 Haftalık',
  monthly: 'Aylık',
  oneoff: 'Tek Ödeme',
};

export const PAY_METHODS = { nakit: 'Nakit', havale: 'Havale / EFT', kart: 'Kart', indirim: 'İndirim (gelir sayılmaz)' };

// Dönemler bugünden bu kadar gün ilerisine kadar üretilir (gelir takviminin 8 hafta ilerisi eksiksiz görünsün diye).
export const HORIZON_DAYS = 63;

export const DEFAULT_REMIND = { weekly: 3, '4weekly': 5, monthly: 3, oneoff: 3 };

export const STATUS_LABEL = {
  paid: 'Ödendi', none: 'Tutar yok', future: 'Başlamadı', running: 'Devam ediyor',
  due: 'Ödeme zamanı', late: 'Gecikti',
};

function periodEnd(type, start) {
  if (type === 'weekly') return addDays(start, 6);
  if (type === '4weekly') return addDays(start, 27);
  return addDays(addMonths(start, 1), -1);
}

const sumHours = (ls) => ls.reduce((a, l) => a + l.hours, 0);

/**
 * Ek dersli dönemin bitişi: programdaki + ek derslerin toplamı dönemin tam ders saatine ulaştığı dersin günü,
 * o günden sonraki ilk dersin bir gün öncesine kadar uzatılır (takvim bitişini geçmez). Dolmazsa takvim bitişi.
 */
function filledEnd(full, extras, fullHours, calEnd) {
  if (fullHours <= 0) return calEnd;
  const all = full.concat(extras).sort((x, y) => (x.date + x.time).localeCompare(y.date + y.time));
  let acc = 0;
  for (const l of all) {
    acc += l.hours;
    if (acc >= fullHours - 1e-9) {
      const next = all.find((x) => x.date > l.date);
      return next ? addDays(next.date, -1) : calEnd;
    }
  }
  return calEnd;
}

/**
 * Bir öğrencinin tüm dönemleri.
 * horizon: bu tarihe kadar başlayan dönemler üretilir (varsayılan bugün + HORIZON_DAYS).
 */
export function studentPeriods(student, { plans, schedules, marks, payments, extra_lessons }, today, settings = {}, horizon = addDays(today, HORIZON_DAYS)) {
  const remind = { ...DEFAULT_REMIND, ...(settings.remind_days || {}) };
  const own = plans.filter((p) => p.student_id === student.id).sort((a, b) => a.valid_from.localeCompare(b.valid_from));
  const ownMarks = marksMap(marks.filter((m) => m.student_id === student.id));
  const paidBy = new Map();
  for (const p of payments) {
    if (p.student_id !== student.id || p.deleted_at) continue;
    paidBy.set(p.period_key, (paidBy.get(p.period_key) || 0) + p.amount);
  }
  const openStudent = { ...student, active: true, end_date: null };
  const studentEnd = student.active === false && student.end_date ? student.end_date : null;
  const out = [];

  own.forEach((plan, i) => {
    const next = own[i + 1];
    let hardEnd = next ? addDays(next.valid_from, -1) : null;
    if (studentEnd && (!hardEnd || studentEnd < hardEnd)) hardEnd = studentEnd;
    if (hardEnd && hardEnd < plan.valid_from) return; // hiç yürürlüğe girmemiş plan

    if (plan.type === 'oneoff') {
      const end = hardEnd || '9999-12-31';
      const last = end < horizon ? end : horizon;
      const ls = generateLessons(student, schedules, plan.valid_from, last);
      const ex = extraLessons(student, extra_lessons, plan.valid_from, last).filter((l) => l.date <= today);
      const usedHours = sumHours(ls.filter((l) => !ownMarks.has(l.key) && l.date <= today)) + sumHours(ex);
      out.push(finish({
        key: `${plan.id}#1`, plan_id: plan.id, type: 'oneoff', seq: 1,
        start: plan.valid_from, end: hardEnd, due: plan.due_date || plan.valid_from,
        base: plan.fee, fee: plan.fee, scheduled_hours: Number(plan.hours) || 0,
        missed_hours: 0, missed: [], hourly: plan.hours ? plan.fee / plan.hours : 0, deduction: 0,
        package_hours: Number(plan.hours) || 0, used_hours: usedHours, extra: ex, extra_hours: sumHours(ex),
        truncated: false, final: true,
      }));
      return;
    }

    let s = plan.valid_from;
    for (let seq = 1; s <= horizon && (!hardEnd || s <= hardEnd) && seq < 2000; seq++) {
      const calEnd = periodEnd(plan.type, s);
      const full = generateLessons(openStudent, schedules, s, calEnd); // tam dönem (ayrılış hesaba katılmadan)
      const fullHours = sumHours(full);
      const exAll = extraLessons(openStudent, extra_lessons, s, calEnd);
      const fullEnd = exAll.length ? filledEnd(full, exAll, fullHours, calEnd) : calEnd;
      const truncated = !!hardEnd && fullEnd > hardEnd;
      const e = truncated ? hardEnd : fullEnd;
      const inside = full.filter((l) => l.date <= e);
      const extra = exAll.filter((l) => l.date <= e);
      const hours = sumHours(inside), extraHours = sumHours(extra);
      let base = plan.fee;
      if (truncated) base = fullHours > 0 ? Math.min(plan.fee, Math.round(plan.fee * (hours + extraHours) / fullHours)) : 0;
      const hourly = fullHours > 0 ? plan.fee / fullHours : 0;
      const missed = inside.filter((l) => ownMarks.has(l.key)).map((l) => ({ ...l, reason: ownMarks.get(l.key).reason }));
      const missedHours = sumHours(missed);
      const deduction = Math.min(base, Math.round(missedHours * hourly));
      out.push(finish({
        key: `${plan.id}#${seq}`, plan_id: plan.id, type: plan.type, seq,
        start: s, end: e, due: e, fee: plan.fee, base, scheduled_hours: hours,
        missed_hours: missedHours, missed, hourly, deduction, truncated, final: e < today,
        extra, extra_hours: extraHours, shortened: fullEnd < calEnd, cal_end: calEnd,
      }));
      s = addDays(fullEnd, 1);
    }
  });

  function finish(p) {
    p.student_id = student.id;
    p.student_name = student.name;
    p.amount = Math.max(0, p.base - p.deduction);
    p.paid = paidBy.get(p.key) || 0;
    p.remaining = Math.max(0, p.amount - p.paid);
    p.remind_days = remind[p.type] ?? 3;
    p.remind_on = addDays(p.due, p.remind_days);
    p.days_past_due = diffDays(today, p.due);
    if (p.amount <= 0) p.status = p.paid > 0 ? 'paid' : 'none';
    else if (p.remaining <= 0) p.status = 'paid';
    else if (today < p.start) p.status = 'future';
    else if (today < p.due) p.status = 'running';
    else if (today < p.remind_on) p.status = 'due';
    else p.status = 'late';
    return p;
  }
  return out;
}

export function allPeriods(data, today, settings, horizon) {
  return data.students.flatMap((s) => studentPeriods(s, data, today, settings, horizon));
}

/** Tahsil edilmesi gereken (vadesi gelmiş) dönemler */
export const isOpen = (p) => (p.status === 'due' || p.status === 'late') && p.remaining > 0;

export function studentSummary(periods) {
  const open = periods.filter(isOpen);
  const current = periods.find((p) => p.status === 'running') || null;
  return {
    open_total: open.reduce((a, p) => a + p.remaining, 0),
    late: open.filter((p) => p.status === 'late'),
    due: open.filter((p) => p.status === 'due'),
    current,
  };
}

/** Oneoff paket: kullanılan saat paketi doldurdu mu */
export const packageFull = (p) => p.type === 'oneoff' && p.package_hours > 0 && p.used_hours >= p.package_hours;

export { lessonKey };

/**
 * Öğrenci ders defteri (Dersler → Öğrenci): tarih aralığı seçmeden, ödeme dönemi dönemi kaç ders yapıldı / yapılmadı / kaldı.
 * periods: studentPeriods çıktısı. Başlamamış dönemler gösterilmez. En yeni dönem başta.
 * last_payment: silinmemiş en son ödeme; done_since: o ödemenin gününden SONRA yapılan ders sayısı.
 */
export function studentLedger(student, data, periods, now) {
  const pays = data.payments.filter((p) => p.student_id === student.id && !p.deleted_at);
  const rows = periods.filter((p) => p.status !== 'future' && p.start <= now.date).map((p) => {
    const to = p.end || (now.date > p.start ? now.date : p.start);
    const ls = decorateLessons(lessonsFor(student, data, p.start, to), data.marks, now);
    const c = { done: 0, not_held: 0, upcoming: 0, extra: 0 };
    for (const l of ls) {
      c[l.status === 'not_held' ? 'not_held' : l.status === 'done' ? 'done' : 'upcoming']++;
      if (l.extra && l.status === 'done') c.extra++;
    }
    const pd = pays.filter((x) => x.period_key === p.key).map((x) => x.paid_date).sort();
    return { period: p, lessons: ls, ...c, total: ls.length, paid_on: pd.length ? pd[pd.length - 1] : null };
  }).reverse();
  const last = [...pays].sort((a, b) => (a.paid_date + (a.created_at || '')).localeCompare(b.paid_date + (b.created_at || ''))).pop() || null;
  let doneSince = 0;
  if (last) {
    const ls = decorateLessons(lessonsFor(student, data, addDays(last.paid_date, 1), now.date), data.marks, now);
    doneSince = ls.filter((l) => l.status === 'done').length;
  }
  const all = rows.reduce((a, r) => ({ done: a.done + r.done, not_held: a.not_held + r.not_held }), { done: 0, not_held: 0 });
  return { rows, last_payment: last, done_since: doneSince, ...all };
}

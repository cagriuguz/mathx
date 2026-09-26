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
// Vade = dönemin son günü. Hatırlatma, vadeden N gün SONRA verilir (aylık 3, 4 haftalık 5; Ayarlar'dan değişir).
import { addDays, addMonths, diffDays } from './dates.js';
import { generateLessons, marksMap, lessonKey } from './lessons.js';

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
 * Bir öğrencinin tüm dönemleri.
 * horizon: bu tarihe kadar başlayan dönemler üretilir (varsayılan bugün + HORIZON_DAYS).
 */
export function studentPeriods(student, { plans, schedules, marks, payments }, today, settings = {}, horizon = addDays(today, HORIZON_DAYS)) {
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
      const ls = generateLessons(student, schedules, plan.valid_from, end < horizon ? end : horizon);
      const usedHours = sumHours(ls.filter((l) => !ownMarks.has(l.key) && l.date <= today));
      out.push(finish({
        key: `${plan.id}#1`, plan_id: plan.id, type: 'oneoff', seq: 1,
        start: plan.valid_from, end: hardEnd, due: plan.due_date || plan.valid_from,
        base: plan.fee, fee: plan.fee, scheduled_hours: Number(plan.hours) || 0,
        missed_hours: 0, missed: [], hourly: plan.hours ? plan.fee / plan.hours : 0, deduction: 0,
        package_hours: Number(plan.hours) || 0, used_hours: usedHours,
        truncated: false, final: true,
      }));
      return;
    }

    let s = plan.valid_from;
    for (let seq = 1; s <= horizon && (!hardEnd || s <= hardEnd) && seq < 2000; seq++) {
      const fullEnd = periodEnd(plan.type, s);
      const truncated = !!hardEnd && fullEnd > hardEnd;
      const e = truncated ? hardEnd : fullEnd;
      const full = generateLessons(openStudent, schedules, s, fullEnd); // tam dönem (ayrılış hesaba katılmadan)
      const inside = full.filter((l) => l.date <= e);
      const fullHours = sumHours(full), hours = sumHours(inside);
      let base = plan.fee;
      if (truncated) base = fullHours > 0 ? Math.round(plan.fee * hours / fullHours) : 0;
      const hourly = fullHours > 0 ? plan.fee / fullHours : 0;
      const missed = inside.filter((l) => ownMarks.has(l.key)).map((l) => ({ ...l, reason: ownMarks.get(l.key).reason }));
      const missedHours = sumHours(missed);
      const deduction = Math.min(base, Math.round(missedHours * hourly));
      out.push(finish({
        key: `${plan.id}#${seq}`, plan_id: plan.id, type: plan.type, seq,
        start: s, end: e, due: e, fee: plan.fee, base, scheduled_hours: hours,
        missed_hours: missedHours, missed, hourly, deduction, truncated, final: e < today,
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

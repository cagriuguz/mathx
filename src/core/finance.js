// Para bölümü: Ödemeler, Gelir Takvimi ve Muhasebe (Özel Ders Takip mantığıyla, daha ayrıntılı).
//
// Gelir takvimi: bir dönem, VADE tarihinin düştüğü haftaya aittir.
//   Beklenen = o haftaya vadesi düşen dönem tutarları, Tahsil = bu dönemlere yapılan ödemeler,
//   Kalan = beklenen − tahsil, Kasaya giren = o hafta alınan TÜM ödemeler (indirim hariç),
//   Hedef (yalnızca bu hafta) = bu haftanın kalanı + bugünden önce vadesi geçip ödenmemiş TÜM borç.
// Tarih aralığında kazanç: alınan ödemeler, vadesi aralıkta olan tahsilat ve yapılan derslerin kazancı
//   (yapılan ders saati × dönemin 1 saatlik değeri; kesinti hesabıyla aynı ölçü).
// Muhasebe: ayın giderleri ↔ o ay alınan tahsilat ↔ ay sonuna kadar beklenen tahsilat;
//   bugünden ay sonuna nakit akışı (aynı gün önce gelen para, sonra gider), her gider karşılanıyor mu,
//   en sıkışık an, haftalık döküm, önümüzdeki aylar ve tavsiyeler.
//   Varsayım (temkinli): tahsilat vade günü gelir; gecikmiş alacak ana hesaba girmez, ayrı senaryodur.
//   Bu bir nakit planlamasıdır; yatırım tavsiyesi değildir.
import { addDays, weekStart, monthKey, monthFirst, monthLast, clampDay, addMonths, fmtDots, fmtMonth } from './dates.js';
import { fmtTL } from './money.js';
import { generateLessons, marksMap, lessonStatus } from './lessons.js';
import { allPeriods, HORIZON_DAYS } from './billing.js';

export const EXPENSE_CATEGORIES = ['Kira', 'Faturalar', 'Ulaşım', 'Kırtasiye / Kitap', 'Reklam', 'Vergi / SGK', 'Diğer'];

// Gecikmiş ödeme, hatırlatma gününden bu kadar gün sonra "kritik" sayılır.
export const CRITICAL_AFTER_DAYS = 7;

export const income = (payments) => payments.filter((p) => !p.deleted_at && p.method !== 'indirim');
const sumBy = (xs, k) => xs.reduce((a, x) => a + x[k], 0);

/* ───────────── Ödemeler */

/** Ödemeler sekmeleri: yaklaşan (öğrenci başına en yakın), ödeme zamanı gelen, gecikmiş, kritik, ödenen */
export function paymentGroups(periods, today) {
  const live = periods.filter((p) => p.amount > 0);
  const byDue = (a, b) => a.due.localeCompare(b.due) || a.student_name.localeCompare(b.student_name, 'tr');
  const late = live.filter((p) => p.status === 'late' && p.remaining > 0);
  const critical = late.filter((p) => p.days_past_due > p.remind_days + CRITICAL_AFTER_DAYS).sort(byDue);
  const nearest = new Map();
  for (const p of live.filter((x) => (x.status === 'running' || x.status === 'future') && x.remaining > 0).sort(byDue)) {
    if (!nearest.has(p.student_id)) nearest.set(p.student_id, p);
  }
  return {
    upcoming: [...nearest.values()].sort(byDue),
    due: live.filter((p) => p.status === 'due' && p.remaining > 0).sort(byDue),
    late: late.filter((p) => !critical.includes(p)).sort(byDue),
    critical,
    paid: live.filter((p) => p.status === 'paid').sort((a, b) => b.due.localeCompare(a.due)).slice(0, 100),
  };
}

/** Ödeme geçmişi CSV (Excel Türkçe için ; ayraç + BOM) */
export function paymentsCsv(payments, students, periods, methods) {
  const names = new Map(students.map((s) => [s.id, s.name]));
  const per = new Map(periods.map((p) => [p.key, p]));
  const esc = (v) => `"${String(v ?? '').replace(/"/g, '""')}"`;
  const rows = payments.filter((p) => !p.deleted_at).sort((a, b) => b.paid_date.localeCompare(a.paid_date)).map((p) => {
    const d = per.get(p.period_key);
    return [fmtDots(p.paid_date), names.get(p.student_id) || '', (p.amount / 100).toFixed(2).replace('.', ','), methods[p.method] || p.method,
      d ? `${fmtDots(d.start)} – ${d.end ? fmtDots(d.end) : ''}` : '', p.note || ''].map(esc).join(';');
  });
  return '﻿' + ['Tarih;Öğrenci;Tutar (TL);Yöntem;Dönem;Not', ...rows].join('\r\n');
}

/* ───────────── Gelir takvimi */

export function incomeWeeks(periods, payments, today, { back = 4, ahead = 8, offset = 0 } = {}) {
  const thisWeek = weekStart(today);
  const live = periods.filter((p) => p.amount > 0);
  const overdueBefore = live.filter((p) => p.due < today && p.remaining > 0).reduce((a, p) => a + p.remaining, 0);
  const rows = [];
  for (let i = offset - back; i <= offset + ahead; i++) {
    const ws = addDays(thisWeek, i * 7), we = addDays(ws, 6);
    const cohort = live.filter((p) => p.due >= ws && p.due <= we);
    const expected = cohort.reduce((a, p) => a + p.amount, 0);
    const collected = cohort.reduce((a, p) => a + Math.min(p.paid, p.amount), 0);
    const cash = income(payments).filter((p) => p.paid_date >= ws && p.paid_date <= we).reduce((a, p) => a + p.amount, 0);
    const remaining = expected - collected;
    const isCurrent = i === 0;
    const overdue = we < today ? remaining : cohort.filter((p) => p.due < today).reduce((a, p) => a + p.remaining, 0);
    rows.push({
      week_start: ws, week_end: we, is_current: isCurrent, is_past: we < today,
      expected, collected, remaining, overdue, cash,
      target: isCurrent ? remaining + overdueBefore - cohort.filter((p) => p.due < today).reduce((a, p) => a + p.remaining, 0) : remaining,
      rate: expected ? Math.round((collected / expected) * 100) : null,
      items: cohort.sort((a, b) => a.due.localeCompare(b.due)),
    });
  }
  return { rows, overdue_total: overdueBefore };
}

/** Bu hafta + gelecek 4 hafta: henüz tahsil edilmemiş beklenen tahsilat */
export function incomeForecast(periods, today) {
  const names = ['Bu hafta', 'Gelecek hafta', '2 hafta sonra', '3 hafta sonra', '4 hafta sonra'];
  const ws0 = weekStart(today);
  const live = periods.filter((p) => p.amount > 0);
  return names.map((name, i) => {
    const ws = addDays(ws0, i * 7), we = addDays(ws, 6);
    const cohort = live.filter((p) => p.due >= ws && p.due <= we);
    return {
      name, week_start: ws, week_end: we,
      expected: sumBy(cohort, 'amount'),
      remaining: cohort.reduce((a, p) => a + p.remaining, 0),
      students: new Set(cohort.map((p) => p.student_id)).size,
    };
  });
}

/**
 * Tarih aralığında kazancım.
 *   received  = aralıkta alınan ödemeler (indirim hariç)
 *   expected  = vadesi aralığa düşen dönem tutarları (remaining: hâlâ ödenmemiş kısmı)
 *   earned    = aralıkta YAPILAN derslerin kazancı (ders saati × dönemin saatlik değeri)
 *   planned   = aralıkta henüz yapılmamış (gelecek/bugün) derslerin kazancı
 * Tek Ödeme paketinde kazanç paket saatiyle sınırlıdır (aralıktan önce kullanılan saatler düşülür).
 */
export function rangeEarnings(data, settings, periods, from, to, now) {
  if (to > addDays(now.date, HORIZON_DAYS)) periods = allPeriods(data, now.date, settings, to);
  const students = new Map(data.students.map((s) => [s.id, s]));
  const mm = marksMap(data.marks || []);
  const r = { from, to, received: 0, expected: 0, expected_remaining: 0, earned: 0, planned: 0, done_hours: 0, done_count: 0, planned_hours: 0, not_held: 0, by_student: new Map() };
  const row = (p) => {
    if (!r.by_student.has(p.student_id)) r.by_student.set(p.student_id, { student_id: p.student_id, name: p.student_name, received: 0, expected: 0, earned: 0, planned: 0, hours: 0 });
    return r.by_student.get(p.student_id);
  };

  for (const p of income(data.payments)) {
    if (p.paid_date < from || p.paid_date > to || !students.has(p.student_id)) continue;
    r.received += p.amount;
    const s = students.get(p.student_id);
    row({ student_id: s.id, student_name: s.name }).received += p.amount;
  }

  for (const p of periods) {
    const s = students.get(p.student_id);
    if (!s) continue;
    if (p.amount > 0 && p.due >= from && p.due <= to) {
      r.expected += p.amount; r.expected_remaining += p.remaining;
      row(p).expected += p.amount;
    }
    const pEnd = p.end || '9999-12-31';
    if (pEnd < from || p.start > to) continue;
    if (p.type === 'oneoff') {
      const pkg = p.package_hours || 0;
      if (!pkg) {                                   // saatsiz paket: kazanç = vadesi aralıkta olan ücret
        if (p.due >= from && p.due <= to) { r.earned += p.amount; row(p).earned += p.amount; }
        continue;
      }
      const hourly = p.amount / pkg;
      const lessons = generateLessons(s, data.schedules, p.start, pEnd < to ? pEnd : to);
      let before = 0, within = 0, fut = 0;
      for (const l of lessons) {
        const st = lessonStatus(l, mm, now);
        if (st === 'not_held') { if (l.date >= from) r.not_held++; continue; }
        if (st === 'done') { if (l.date < from) before += l.hours; else { within += l.hours; r.done_count++; } }
        else if (l.date >= from) fut += l.hours;
      }
      const usedTo = Math.min(pkg, before + within), usedBefore = Math.min(pkg, before);
      const doneH = usedTo - usedBefore, futH = Math.min(pkg - usedTo, fut);
      r.done_hours += within; r.planned_hours += futH;
      r.earned += doneH * hourly; r.planned += futH * hourly;
      row(p).earned += doneH * hourly; row(p).planned += futH * hourly; row(p).hours += within;
      continue;
    }
    const a = p.start > from ? p.start : from, b = pEnd < to ? pEnd : to;
    for (const l of generateLessons(s, data.schedules, a, b)) {
      const st = lessonStatus(l, mm, now);
      if (st === 'not_held') { r.not_held++; continue; }
      const v = l.hours * p.hourly;
      if (st === 'done') { r.done_hours += l.hours; r.done_count++; r.earned += v; row(p).earned += v; row(p).hours += l.hours; }
      else { r.planned_hours += l.hours; r.planned += v; row(p).planned += v; }
    }
  }
  r.earned = Math.round(r.earned); r.planned = Math.round(r.planned);
  r.students = [...r.by_student.values()].map((x) => ({ ...x, earned: Math.round(x.earned), planned: Math.round(x.planned) }))
    .filter((x) => x.received || x.expected || x.earned || x.planned)
    .sort((x, y) => (y.earned + y.planned) - (x.earned + x.planned) || x.name.localeCompare(y.name, 'tr'));
  delete r.by_student;
  return r;
}

/* ───────────── Muhasebe */

export function expenseInstances(expenses, expensePayments, month) {
  const paid = new Map(expensePayments.filter((e) => e.month === month && !e.deleted_at).map((e) => [e.expense_id, e]));
  return expenses
    .filter((e) => !e.deleted_at && e.start_month <= month && (!e.end_month || e.end_month >= month) && (e.active !== false || paid.has(e.id)))
    .map((e) => {
      const pr = paid.get(e.id);
      return {
        expense_id: e.id, name: e.name, category: e.category || 'Diğer', note: e.note || '', month,
        amount: e.amount, due_date: clampDay(month, e.due_day || 1), one_time: e.end_month === e.start_month,
        paid: !!pr, paid_date: pr?.paid_date || null, paid_amount: pr?.amount || 0, payment_id: pr?.id || null,
      };
    })
    .sort((a, b) => a.due_date.localeCompare(b.due_date) || a.name.localeCompare(b.name, 'tr'));
}

/** Rutin gider listesi (tüm kalemler) ve şu an yürürlükteki aylık toplam */
export function expenseList(expenses, today) {
  const m = monthKey(today);
  const items = expenses.filter((e) => !e.deleted_at).map((e) => ({
    ...e, one_time: e.end_month === e.start_month,
    running_now: e.active !== false && e.start_month <= m && (!e.end_month || e.end_month >= m),
    ended: !!e.end_month && e.end_month < m,
  })).sort((a, b) => Number(b.running_now) - Number(a.running_now) || (a.due_day || 1) - (b.due_day || 1) || a.name.localeCompare(b.name, 'tr'));
  return { items, recurring_total: items.filter((e) => e.running_now && !e.one_time).reduce((a, e) => a + e.amount, 0) };
}

function simulate(events, cash) {
  const ev = [...events].sort((a, b) => a.date.localeCompare(b.date) || (a.kind === 'in' ? -1 : 1) - (b.kind === 'in' ? -1 : 1) || a.name.localeCompare(b.name, 'tr'));
  let bal = cash, low = cash, lowDate = null;
  const rows = ev.map((e) => {
    bal += e.kind === 'in' ? e.amount : -e.amount;
    if (bal < low) { low = bal; lowDate = e.date; }
    const short = e.kind === 'out' ? Math.min(e.amount, Math.max(-bal, 0)) : 0;
    return { ...e, balance: bal, covered: e.kind === 'out' ? short === 0 : null, short };
  });
  return { rows, extra: Math.max(0, -low), extraDate: low < 0 ? lowDate : null };
}

const monthsBetween = (a, b) => { const out = []; for (let m = a; m <= b; m = monthKey(addMonths(monthFirst(m), 1))) out.push(m); return out; };

export function monthView({ periods, payments, expenses, expensePayments, settings = {} }, month, today) {
  const ms = monthFirst(month), me = monthLast(month);
  const isPast = me < today, isFuture = ms > today;
  const cash = settings.cash_on_hand || 0;
  const insts = expenseInstances(expenses, expensePayments, month);
  const paidSum = insts.filter((i) => i.paid).reduce((a, i) => a + i.paid_amount, 0);
  const unpaidSum = insts.filter((i) => !i.paid).reduce((a, i) => a + i.amount, 0);
  const total = paidSum + unpaidSum;
  const inc = income(payments);
  const received = inc.filter((p) => p.paid_date >= ms && p.paid_date <= me).reduce((a, p) => a + p.amount, 0);
  const lo = today > ms ? today : ms;
  const coming = isPast ? [] : periods.filter((p) => p.remaining > 0 && p.due >= lo && p.due <= me);
  const expected = coming.reduce((a, p) => a + p.remaining, 0);
  const overdue = periods.filter((p) => p.remaining > 0 && p.due < today).sort((a, b) => b.remaining - a.remaining);
  const overdueTotal = overdue.reduce((a, p) => a + p.remaining, 0);
  const moreNeeded = Math.max(total - received, 0);
  const gap = received + expected - total;
  const definedCount = expenses.filter((e) => !e.deleted_at).length;

  // ---- nakit akışı (bugünden ay sonuna)
  let flow = { rows: [], extra: 0, extraDate: null }, flowB = { extra: 0 }, outs = [], ins = [];
  const uncovered = [];
  if (!isPast) {
    for (const m of monthsBetween(monthKey(today), month)) {
      for (const i of expenseInstances(expenses, expensePayments, m)) {
        if (i.paid) continue;
        outs.push({ kind: 'out', date: i.due_date < today ? today : i.due_date, orig: i.due_date, name: i.name, amount: i.amount, late: i.due_date < today, expense_id: i.expense_id, month: m });
      }
    }
    ins = periods.filter((p) => p.remaining > 0 && p.due >= today && p.due <= me)
      .map((p) => ({ kind: 'in', date: p.due, orig: p.due, name: p.student_name, amount: p.remaining, plan_type: p.type }));
    flow = simulate([...outs, ...ins], cash);
    flowB = simulate([...outs, ...ins, ...overdue.map((p) => ({ kind: 'in', date: today, orig: p.due, name: p.student_name, amount: p.remaining }))], cash);
    for (const r of flow.rows) if (r.kind === 'out' && !r.covered) uncovered.push(r);
  }
  const coverBy = new Map(flow.rows.filter((r) => r.kind === 'out').map((r) => [`${r.expense_id}|${r.month}`, r]));
  const expensesOut = insts.map((i) => {
    const c = coverBy.get(`${i.expense_id}|${i.month}`);
    return { ...i, covered: i.paid || !c ? null : c.covered, short: c ? c.short : 0, overdue: !i.paid && i.due_date < today };
  });

  // ---- haftalık döküm (ayın Pazartesi başlayan haftaları, ay sınırına kırpılır)
  const weeks = [];
  for (let ws = weekStart(ms); ws <= me; ws = addDays(ws, 7)) {
    const a = ws < ms ? ms : ws, we = addDays(ws, 6), b = we > me ? me : we;
    const rec = inc.filter((p) => p.paid_date >= a && p.paid_date <= b).reduce((s, p) => s + p.amount, 0);
    const lo2 = a > today ? a : today;
    const exp = isPast || b < today ? 0 : periods.filter((p) => p.remaining > 0 && p.due >= lo2 && p.due <= b).reduce((s, p) => s + p.remaining, 0);
    const out = insts.reduce((s, i) => {
      let d = i.paid ? i.paid_date : (i.due_date < today && !isPast ? today : i.due_date);
      if (d < ms) d = ms; if (d > me) d = me;
      return d >= a && d <= b ? s + (i.paid ? i.paid_amount : i.amount) : s;
    }, 0);
    let balance = null;
    if (!isPast && b >= today) {
      balance = cash;
      for (const r of flow.rows) if (r.date <= b) balance = r.balance;
    }
    weeks.push({ week_start: ws, from: a, to: b, is_current: today >= a && today <= b, is_past: b < today, received: rec, expected: exp, expenses: out, net: rec + exp - out, balance });
  }

  // ---- tavsiyeler
  const advice = [];
  const add = (level, text) => advice.push({ level, text });
  const label = fmtMonth(month);
  if (!definedCount) {
    add('info', 'Henüz gider eklemediniz. "Gider ekle" ile kira, fatura gibi aylık giderlerinizi girin; program bunları gelecek tahsilatlarla karşılaştırıp uyarı ve tavsiye verir.');
  } else if (!insts.length) {
    add('info', `${label} için gider kalemi yok.`);
  } else {
    let head = `${label} giderleriniz toplam ${fmtTL(total)}. `;
    if (!isFuture) head += `Bu ay şu ana kadar ${fmtTL(received)} tahsil ettiniz. `;
    if (isFuture) add('info', head + 'Bu aya ait tahsilat henüz alınmadı; aşağıdaki nakit akışı bugünden bu aya kadar hesaplanır.');
    else if (moreNeeded > 0) add(isPast ? 'info' : 'warn', head + `Giderleri karşılamak için ${fmtTL(moreNeeded)} daha gelmesi gerekiyor.`);
    else add('ok', head + 'Bu ayın giderleri tahsilatla karşılandı ✓');

    if (!isPast && !isFuture && (expected || moreNeeded)) {
      if (gap >= 0) add('ok', `Ayın kalanında ${fmtTL(expected)} tahsilat bekleniyor; gider farkını karşılıyor, ${fmtTL(gap)} fazla kalır.`);
      else add('bad', `Ayın kalanında ${fmtTL(expected)} tahsilat bekleniyor; bu, gider farkına yetmiyor: ay sonunda ${fmtTL(-gap)} açık oluşur.`);
    }
    if (isPast) {
      add(received >= total ? 'ok' : 'info', `Geçmiş ay: tahsilat ${fmtTL(received)}, gider ${fmtTL(total)} → fark ${fmtTL(received - total, { sign: true })}.`);
    }
  }
  if (!isPast && definedCount && insts.length) {
    if (flow.extra > 0) add('bad', `Ödemeleri zamanında yapabilmek için ek olarak en az ${fmtTL(flow.extra)} paraya ihtiyacınız var (en sıkışık gün: ${fmtDots(flow.extraDate)}).`);
    else add('ok', 'Elinizdeki para ve bekleyen tahsilatlar, tarih sırasıyla tüm giderleri zamanında karşılıyor ✓');
    for (const r of uncovered) {
      const when = r.late ? 'vadesi geçmiş, bugün ödenmesi gerekiyor' : `${fmtDots(r.orig)} tarihli`;
      add('bad', `${r.name} (${fmtTL(r.amount)}) — ${when}: o güne kadar gelecek para yetmiyor, ${fmtTL(r.short)} eksik kalıyor.`);
    }
    if (!cash) add('info', 'Elinizdeki (hesaptaki) parayı "Elinizdeki para" alanına girerseniz hesap daha doğru olur; şu an 0 TL kabul ediliyor.');
    if (overdueTotal > 0) {
      const names = overdue.slice(0, 3).map((p) => `${p.student_name} ${fmtTL(p.remaining)}`).join(', ');
      const more = overdue.length > 3 ? ` ve ${overdue.length - 3} kişi daha` : '';
      const text = `Gecikmiş alacağınız ${fmtTL(overdueTotal)} (${names}${more}). `;
      if (flow.extra > 0 && flowB.extra === 0) add('warn', text + 'Bunlar tahsil edilirse açığın tamamı kapanır: önce bu ödemeleri hatırlatın.');
      else if (flow.extra > 0) add('warn', text + `Bunlar tahsil edilse bile ${fmtTL(flowB.extra)} açık kalır; bu tutar için ek kaynak gerekir.`);
      else add('info', text + 'Tahsil edildiğinde nakit durumunuz daha da rahatlar.');
    }
    // erteleme önerisi: ilk karşılanamayan gider, hangi tarihe ertelenirse açık kapanır?
    if (uncovered.length) {
      const first = uncovered[0];
      const base = outs.filter((e) => !(e.expense_id === first.expense_id && e.month === first.month));
      const orig = outs.find((e) => e.expense_id === first.expense_id && e.month === first.month);
      const later = [...new Set(ins.map((e) => e.date).filter((d) => d > first.date))].sort();
      for (const d2 of later) {
        if (simulate([...base, { ...orig, date: d2 }, ...ins], cash).extra === 0) {
          add('warn', `${first.name} (${fmtTL(first.amount)}) ödemesini ${fmtDots(d2)} tarihine kadar erteleyebilirseniz (vade uzatma/taksit görüşmesi), o güne kadar gelecek tahsilat açığı kapatır.`);
          break;
        }
      }
    }
    add('info', 'Tahsilatlar, ödeme vadesinin son günü gelecek varsayılır (temkinli hesap). Bu bir nakit akışı planlamasıdır; yatırım veya finansal danışmanlık değildir.');
  }

  return {
    month, label, is_past: isPast, is_future: isFuture, is_current: !isPast && !isFuture,
    partial: !isPast && me > addDays(today, HORIZON_DAYS),
    summary: {
      expenses_total: total, expenses_paid: paidSum, expenses_unpaid: unpaidSum, received, expected, more_needed: moreNeeded, gap,
      overdue_total: overdueTotal, overdue_count: overdue.length, cash, extra: flow.extra, extra_date: flow.extraDate, extra_with_overdue: flowB.extra,
    },
    expenses: expensesOut, timeline: flow.rows, weeks, advice,
  };
}

/** Bu ay + önümüzdeki aylar: her ay için gider, beklenen, ek para ihtiyacı (kısa özet) */
export function monthsOutlook(input, today, count = 3) {
  const out = [];
  for (let i = 0; i < count; i++) {
    const m = monthKey(addMonths(monthFirst(monthKey(today)), i));
    const v = monthView(input, m, today);
    out.push({ month: m, label: v.label, partial: v.partial, expenses: v.summary.expenses_total, received: v.summary.received, expected: v.summary.expected, gap: v.summary.gap, extra: v.summary.extra, extra_date: v.summary.extra_date });
  }
  return out;
}

/** Son 12 ayın gelir / gider / net özeti */
export function yearSummary({ payments, expenses, expensePayments }, today, months = 12) {
  const out = [];
  for (let i = months - 1; i >= 0; i--) {
    const m = monthKey(addMonths(monthFirst(monthKey(today)), -i));
    const inc = income(payments).filter((p) => monthKey(p.paid_date) === m).reduce((a, p) => a + p.amount, 0);
    const exp = expensePayments.filter((e) => e.month === m && !e.deleted_at).reduce((a, e) => a + e.amount, 0);
    out.push({ month: m, income: inc, expense: exp, net: inc - exp });
  }
  return out;
}

/** Öğrenci bazında tahsilat (tarih aralığı) */
export function incomeByStudent(students, payments, from, to) {
  const map = new Map();
  for (const p of income(payments)) {
    if (p.paid_date < from || p.paid_date > to) continue;
    map.set(p.student_id, (map.get(p.student_id) || 0) + p.amount);
  }
  return students.map((s) => ({ student_id: s.id, name: s.name, total: map.get(s.id) || 0 }))
    .filter((r) => r.total > 0).sort((a, b) => b.total - a.total);
}

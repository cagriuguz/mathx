// Para bölümü: Gelir Takvimi ve Muhasebe (Özel Ders Takip mantığıyla, daha ayrıntılı).
//
// Gelir takvimi: bir dönem, VADE tarihinin düştüğü haftaya aittir.
//   Beklenen = o haftaya vadesi düşen dönem tutarları, Tahsil = bu dönemlere yapılan ödemeler,
//   Kalan = beklenen − tahsil, Kasaya giren = o hafta alınan TÜM ödemeler (indirim hariç),
//   Hedef (yalnızca bu hafta) = bu haftanın kalanı + bugünden önce vadesi geçip ödenmemiş TÜM borç.
// Muhasebe: ayın giderleri ↔ o ay alınan tahsilat ↔ ay sonuna kadar beklenen tahsilat;
//   bugünden ay sonuna nakit akışı (aynı gün önce gelen para, sonra gider), en sıkışık an ve tavsiyeler.
//   Bu bir nakit planlamasıdır; yatırım tavsiyesi değildir.
import { addDays, weekStart, monthKey, monthFirst, monthLast, clampDay, addMonths } from './dates.js';
import { fmtTL } from './money.js';

export const EXPENSE_CATEGORIES = ['Kira', 'Faturalar', 'Ulaşım', 'Kırtasiye / Kitap', 'Reklam', 'Vergi / SGK', 'Diğer'];

const income = (payments) => payments.filter((p) => !p.deleted_at && p.method !== 'indirim');

export function incomeWeeks(periods, payments, today, { back = 4, ahead = 8 } = {}) {
  const thisWeek = weekStart(today);
  const live = periods.filter((p) => p.amount > 0);
  const overdueBefore = live.filter((p) => p.due < today && p.remaining > 0).reduce((a, p) => a + p.remaining, 0);
  const rows = [];
  for (let i = -back; i <= ahead; i++) {
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

function simulate(events, cash) {
  events.sort((a, b) => a.date.localeCompare(b.date) || (a.kind === 'in' ? -1 : 1));
  let bal = cash, low = cash, lowDate = null;
  const rows = events.map((e) => {
    bal += e.kind === 'in' ? e.amount : -e.amount;
    if (bal < low) { low = bal; lowDate = e.date; }
    return { ...e, balance: bal, covered: e.kind === 'out' ? bal >= 0 : true, short: e.kind === 'out' && bal < 0 ? Math.min(e.amount, -bal) : 0 };
  });
  return { rows, extra: Math.max(0, -low), extraDate: low < 0 ? lowDate : null };
}

export function monthView({ periods, payments, expenses, expensePayments, settings = {} }, month, today) {
  const ms = monthFirst(month), me = monthLast(month);
  const isPast = me < today, isFuture = ms > today;
  const cash = settings.cash_on_hand || 0;
  const insts = expenseInstances(expenses, expensePayments, month);
  const paidSum = insts.filter((i) => i.paid).reduce((a, i) => a + i.paid_amount, 0);
  const unpaidSum = insts.filter((i) => !i.paid).reduce((a, i) => a + i.amount, 0);
  const total = paidSum + unpaidSum;
  const received = income(payments).filter((p) => p.paid_date >= ms && p.paid_date <= me).reduce((a, p) => a + p.amount, 0);
  const lo = today > ms ? today : ms;
  const coming = isPast ? [] : periods.filter((p) => p.remaining > 0 && p.due >= lo && p.due <= me);
  const expected = coming.reduce((a, p) => a + p.remaining, 0);
  const overdue = periods.filter((p) => p.remaining > 0 && p.due < today).sort((a, b) => b.remaining - a.remaining);
  const overdueTotal = overdue.reduce((a, p) => a + p.remaining, 0);
  const gap = received + expected - total;

  let flow = { rows: [], extra: 0, extraDate: null }, flowWithOverdue = { extra: 0 };
  if (!isPast) {
    const outs = [];
    for (let m = monthKey(today); m <= month; m = monthKey(addMonths(monthFirst(m), 1))) {
      for (const i of expenseInstances(expenses, expensePayments, m)) {
        if (i.paid) continue;
        outs.push({ kind: 'out', date: i.due_date < today ? today : i.due_date, orig: i.due_date, name: i.name, amount: i.amount, late: i.due_date < today });
      }
    }
    const ins = periods.filter((p) => p.remaining > 0 && p.due >= today && p.due <= me)
      .map((p) => ({ kind: 'in', date: p.due, orig: p.due, name: p.student_name, amount: p.remaining }));
    flow = simulate([...outs, ...ins], cash);
    flowWithOverdue = simulate([...outs, ...ins, ...overdue.map((p) => ({ kind: 'in', date: today, name: p.student_name, amount: p.remaining }))], cash);
  }

  const advice = [];
  const add = (level, text) => advice.push({ level, text });
  if (!insts.length) add('info', 'Bu ay için kayıtlı gider yok. Kira, fatura gibi düzenli giderlerinizi ekleyin; hesap daha gerçekçi olur.');
  if (isPast) {
    const net = received - total;
    add(net >= 0 ? 'ok' : 'warn', net >= 0 ? `Bu ay ${fmtTL(net)} artıyla kapandı.` : `Bu ay giderler tahsilatı ${fmtTL(-net)} aştı.`);
  } else {
    if (gap >= 0) add('ok', `Beklenen tahsilatlar gelirse ay sonunda ${fmtTL(gap)} artı kalır.`);
    else add('warn', `Beklenen tahsilatlar gelse bile ay ${fmtTL(-gap)} açık veriyor.`);
    if (flow.extra > 0) add('warn', `Ödeme günlerinin sırası yüzünden ${flow.extraDate ? flow.extraDate.split('-').reverse().join('.') : ''} civarında ${fmtTL(flow.extra)} ek nakit gerekiyor.`);
    if (overdueTotal > 0) {
      const names = overdue.slice(0, 3).map((p) => p.student_name).join(', ');
      add('warn', `Gecikmiş alacak ${fmtTL(overdueTotal)} (${names}${overdue.length > 3 ? '…' : ''}). ` +
        (flow.extra > 0 && flowWithOverdue.extra === 0 ? 'Bunlar tahsil edilirse sıkışıklık tamamen kapanır.' : 'Önce bunları hatırlatın.'));
    }
  }
  return {
    month, is_past: isPast, is_future: isFuture, is_current: !isPast && !isFuture,
    summary: { expenses_total: total, expenses_paid: paidSum, expenses_unpaid: unpaidSum, received, expected, gap, overdue_total: overdueTotal, cash, extra: flow.extra, extra_date: flow.extraDate, extra_with_overdue: flowWithOverdue.extra },
    expenses: insts, timeline: flow.rows, advice,
  };
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

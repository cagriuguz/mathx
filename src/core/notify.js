// Panel → Bildirimler: öğretmenin her gün açınca göreceği üç liste.
import { isOpen } from './billing.js';
import { diffDays } from './dates.js';

/** doneHw: "yaptım" işaretlenip henüz görülmeyen; lateHw: son günü geçmiş, yapılmamış; latePay: gecikmiş ödeme */
export function buildNotifications(data, periods, today) {
  const known = new Set(data.students.map((s) => s.id));
  const doneHw = data.homework.filter((h) => h.done && !h.seen_done && known.has(h.student_id))
    .sort((a, b) => String(b.done_at || '').localeCompare(String(a.done_at || '')));
  const lateHw = data.homework.filter((h) => !h.done && h.due_date < today && known.has(h.student_id))
    .map((h) => ({ ...h, days_late: diffDays(today, h.due_date) }))
    .sort((a, b) => b.days_late - a.days_late);
  const latePay = periods.filter((p) => isOpen(p) && p.status === 'late').sort((a, b) => a.due.localeCompare(b.due));
  return { doneHw, lateHw, latePay, count: doneHw.length + lateHw.length + latePay.length };
}

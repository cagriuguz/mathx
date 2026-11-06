// ÇALIŞMA TAKİBİ: öğrenci başına haftalık çalışma günleri; o günlerde "Çalıştım" demeyen öğrenci öğretmenin listesine düşer.
// Saf işlevler (testler doğrudan dener). Takip öğrenci başına AÇIK/KAPALI'dır; varsayılan KAPALI,
// kapalı öğrencide hiçbir uyarı, liste ya da mesaj üretilmez (ör. koçluğa giden öğrenciler).
import { addDays, dow, fmtShort, weekStart, TR_DAYS_SHORT } from './dates.js';

export const STUDY_HOUR = 21;   // bu saatten sonra çalışma günü hâlâ boşsa "çalışmadı" sayılır
export const LOOKBACK = 3;      // geçmişte en çok kaç gün öncesine kadar çalışmayanlar listede kalır

export const planOf = (data, studentId) => (data.study_plans || []).find((p) => p.student_id === studentId && p.enabled) || null;
export const isStudyDay = (plan, iso) => !!plan && plan.days.includes(dow(iso)) && iso >= (plan.start_date || '0000-00-00');
export const logOf = (data, studentId, iso) => (data.study_logs || []).find((l) => l.student_id === studentId && l.date === iso) || null;

/**
 * Bir günün durumu:
 *  'none' (çalışma günü değil / takip kapalı) · 'done' (çalıştı; çalışma günü olmayan günde de sayılır) ·
 *  'excused' (mazeretli) · 'handled' (ele alındı) · 'future' · 'waiting' (bugün, akşam saatine kadar) · 'missed'
 */
export function dayStatus(data, studentId, iso, now) {
  const plan = planOf(data, studentId);
  if (!plan) return 'none';
  const log = logOf(data, studentId, iso);
  if (log?.status === 'done') return 'done';
  if (!isStudyDay(plan, iso)) return 'none';
  if (log) return log.status; // excused | handled
  if (iso > now.date) return 'future';
  if (iso === now.date) return Number(now.time.slice(0, 2)) >= STUDY_HOUR ? 'missed' : 'waiting';
  return 'missed';
}

/** Öğretmenin bildirim listesi: son LOOKBACK gün içinde çalışmadığı hâlde ele alınmamış günler (yeniden eskiye) */
export function studyMissed(data, now, lookback = LOOKBACK) {
  const out = [];
  for (const s of data.students) {
    if (s.active === false || !planOf(data, s.id)) continue;
    for (let n = 0; n <= lookback; n++) {
      const date = addDays(now.date, -n);
      if (dayStatus(data, s.id, date, now) === 'missed') out.push({ student_id: s.id, name: s.name, date, key: `${s.id}|${date}` });
    }
  }
  return out.sort((a, b) => b.date.localeCompare(a.date) || a.name.localeCompare(b.name, 'tr'));
}

/** Bugün çalışması beklenen ama henüz bildirmeyen öğrenciler (akşam saatine kadar bilgi amaçlı) */
export function studyWaiting(data, now) {
  return data.students.filter((s) => s.active !== false && dayStatus(data, s.id, now.date, now) === 'waiting');
}

/** Bu haftanın (Pzt-Paz) özeti: { days: [{date, label, status}], planned, done } */
export function studyWeek(data, studentId, now) {
  const start = weekStart(now.date);
  const days = Array.from({ length: 7 }, (_, i) => {
    const date = addDays(start, i);
    return { date, label: TR_DAYS_SHORT[i], status: dayStatus(data, studentId, date, now), today: date === now.date };
  });
  const counted = days.filter((d) => d.status !== 'none' && d.status !== 'future' && d.status !== 'waiting');
  return { days, planned: days.filter((d) => d.status !== 'none').length, done: days.filter((d) => d.status === 'done').length, due: counted.length };
}

/** Veliye gidecek mesaj (öğretmen WhatsApp'ta Gönder'e basar) */
export function msgStudyMissed(name, date, today) {
  const when = date === today ? 'bugün' : `${fmtShort(date)} günü`;
  return `Sayın veli, ${name} ${when} planlanan matematik çalışmasını yapmadı. Çalışmasını tamamlamasına destek olursanız sevinirim.`;
}

// ÇALIŞMA TAKİBİ: öğrenci başına haftalık çalışma günleri; ertesi gün öğretmene "çalıştı mı?" diye sorulur; öğretmen Evet/Hayır der, veliye mesaj gider.
// Saf işlevler (testler doğrudan dener). Takip öğrenci başına AÇIK/KAPALI'dır; varsayılan KAPALI,
// kapalı öğrencide hiçbir uyarı, liste ya da mesaj üretilmez (ör. koçluğa giden öğrenciler).
import { addDays, dow, fmtShort, weekStart, TR_DAYS_SHORT } from './dates.js';

export const LOOKBACK = 3;      // geçmişte en çok kaç gün öncesine kadar cevapsız sorular listede kalır

export const planOf = (data, studentId) => (data.study_plans || []).find((p) => p.student_id === studentId && p.enabled) || null;
export const isStudyDay = (plan, iso) => !!plan && plan.days.includes(dow(iso)) && iso >= (plan.start_date || '0000-00-00');
export const logOf = (data, studentId, iso) => (data.study_logs || []).find((l) => l.student_id === studentId && l.date === iso) || null;

/**
 * Bir günün durumu:
 *  'none' (çalışma günü değil / takip kapalı) · 'done' (öğretmen: çalıştı) · 'notdone' (öğretmen: çalışmadı) ·
 *  'excused' (mazeretli) · 'future' · 'waiting' (bugün; öğretmen ERTESİ GÜN sorulur) · 'ask' (geçmiş gün, öğretmen henüz cevaplamadı)
 */
export function dayStatus(data, studentId, iso, now) {
  const plan = planOf(data, studentId);
  if (!plan) return 'none';
  const log = logOf(data, studentId, iso);
  if (log?.status === 'done') return 'done';
  if (!isStudyDay(plan, iso)) return 'none';
  if (log) return log.status === 'excused' ? 'excused' : 'notdone'; // notdone | eski 'handled'
  if (iso > now.date) return 'future';
  return iso === now.date ? 'waiting' : 'ask';
}

/** Öğretmenin sorusu: "dün çalışacaktı, çalıştı mı?" Son LOOKBACK gün içindeki cevapsız çalışma günleri (yeniden eskiye) */
export function studyAsk(data, now, lookback = LOOKBACK) {
  const out = [];
  for (const s of data.students) {
    if (s.active === false || !planOf(data, s.id)) continue;
    for (let n = 1; n <= lookback; n++) {
      const date = addDays(now.date, -n);
      if (dayStatus(data, s.id, date, now) === 'ask') out.push({ student_id: s.id, name: s.name, date, key: `${s.id}|${date}` });
    }
  }
  return out.sort((a, b) => b.date.localeCompare(a.date) || a.name.localeCompare(b.name, 'tr'));
}

/** Bu haftanın (Pzt-Paz) özeti: { days: [{date, label, status}], planned, done } */
export function studyWeek(data, studentId, now) {
  const start = weekStart(now.date);
  const days = Array.from({ length: 7 }, (_, i) => {
    const date = addDays(start, i);
    return { date, label: TR_DAYS_SHORT[i], status: dayStatus(data, studentId, date, now), today: date === now.date };
  });
  const counted = days.filter((d) => ['done', 'notdone', 'excused'].includes(d.status));
  return { days, planned: days.filter((d) => d.status !== 'none').length, done: days.filter((d) => d.status === 'done').length, due: counted.length };
}

const whenText = (date, today) => (date === addDays(today, -1) ? 'dün' : `${fmtShort(date)} günü`);

/** Veliye giden mesajlar (öğretmen WhatsApp'ta Gönder'e basar) */
export function msgStudyDone(name, date, today) {
  return `Sayın veli, ${name} söz verdiği gibi ${whenText(date, today)} matematik çalışmasını yapmıştır. Emeği için teşekkür ederim.`;
}
export function msgStudyNotDone(name, date, today) {
  return `Sayın veli, ${name} söz verdiği halde ${whenText(date, today)} matematik çalışmasını yapmamıştır, ödevini tamamlamamıştır. Çalışmasını tamamlamasına destek olursanız sevinirim.`;
}

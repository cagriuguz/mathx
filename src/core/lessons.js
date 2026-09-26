// Ders takvimi: dersler kayıtlı tutulmaz, haftalık programdan HESAPLANIR.
// Yalnızca "yapılmadı" işaretleri saklanır. Saat 23:00'ı geçen ve işaretlenmemiş ders "yapıldı" sayılır (madde 11).
import { addDays, dow, toDays, fromDays } from './dates.js';

export const AUTO_DONE_TIME = '23:00';
export const REASON_MAX = 50;

export const lessonKey = (studentId, date, time) => `${studentId}|${date}|${time}`;

/** Öğrencinin ders dönemi: başlangıç ↔ (pasifse) bitiş */
export function activeRange(student) {
  return { from: student.start_date, to: student.active === false && student.end_date ? student.end_date : '9999-12-31' };
}

/** `iso` gününde geçerli program sürümü (valid_from'a göre en sonuncusu) */
export function scheduleAt(schedules, iso) {
  let best = null;
  for (const s of schedules) if (s.valid_from <= iso && (!best || s.valid_from > best.valid_from)) best = s;
  return best;
}

export function generateLessons(student, schedules, from, to) {
  const own = schedules.filter((s) => s.student_id === student.id);
  const r = activeRange(student);
  const a = from > r.from ? from : r.from;
  const b = to < r.to ? to : r.to;
  const out = [];
  if (!own.length || a > b) return out;
  for (let n = toDays(a), end = toDays(b); n <= end; n++) {
    const iso = fromDays(n);
    const sch = scheduleAt(own, iso);
    if (!sch) continue;
    const d = dow(iso);
    for (const slot of sch.slots) {
      if (Number(slot.dow) !== d) continue;
      out.push({ student_id: student.id, date: iso, time: slot.time, hours: Number(slot.hours) || 1, key: lessonKey(student.id, iso, slot.time) });
    }
  }
  out.sort((x, y) => (x.date + x.time).localeCompare(y.date + y.time));
  return out;
}

export function marksMap(marks) {
  const m = new Map();
  for (const k of marks) m.set(lessonKey(k.student_id, k.date, k.time), k);
  return m;
}

/** 'not_held' | 'done' | 'today' (henüz 23:00 olmadı) | 'upcoming' */
export function lessonStatus(lesson, mmap, now) {
  if (mmap.has(lesson.key)) return 'not_held';
  if (lesson.date < now.date) return 'done';
  if (lesson.date === now.date) return now.time >= AUTO_DONE_TIME ? 'done' : 'today';
  return 'upcoming';
}

export function decorateLessons(lessons, marks, now) {
  const mm = marksMap(marks);
  return lessons.map((l) => {
    const mk = mm.get(l.key);
    return { ...l, status: lessonStatus(l, mm, now), reason: mk ? mk.reason : '', mark_id: mk ? mk.id : null };
  });
}

export function cleanReason(text) {
  const t = String(text ?? '').replace(/\s+/g, ' ').trim();
  if (!t) throw new Error('Gerekçe boş olamaz.');
  if ([...t].length > REASON_MAX) throw new Error(`Gerekçe en fazla ${REASON_MAX} karakter olabilir.`);
  return t;
}

/** Ders raporu (madde 3): tarih aralığında yapılmayan dersler */
export function notHeldReport(students, marks, from, to) {
  const byId = new Map(students.map((s) => [s.id, s]));
  return marks
    .filter((m) => m.date >= from && m.date <= to && byId.has(m.student_id))
    .map((m) => ({ ...m, student_name: byId.get(m.student_id).name }))
    .sort((a, b) => (a.date + a.time).localeCompare(b.date + b.time) || a.student_name.localeCompare(b.student_name, 'tr'));
}

export const weekDays = (mondayIso) => Array.from({ length: 7 }, (_, i) => addDays(mondayIso, i));

/** Ders raporu özeti: tarih aralığında öğrenci başına yapılan / yapılmayan / henüz gelmeyen ders sayısı */
export function lessonSummary(students, schedules, marks, from, to, now) {
  const rows = students.map((s) => {
    const ls = decorateLessons(generateLessons(s, schedules, from, to), marks, now);
    const c = { done: 0, not_held: 0, upcoming: 0 };
    for (const l of ls) c[l.status === 'not_held' ? 'not_held' : l.status === 'done' ? 'done' : 'upcoming']++;
    return { id: s.id, name: s.name, ...c, total: ls.length };
  }).filter((r) => r.total > 0).sort((a, b) => a.name.localeCompare(b.name, 'tr'));
  const sum = (k) => rows.reduce((a, r) => a + r[k], 0);
  return { rows, done: sum('done'), not_held: sum('not_held'), upcoming: sum('upcoming') };
}

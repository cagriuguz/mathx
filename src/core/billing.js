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
import { generateLessons, extraLessons, marksMap, lessonKey, lessonsFor, decorateLessons, scheduleAt } from './lessons.js';

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
const isWeekly = (t) => t === 'weekly' || t === '4weekly';

/**
 * Ek dersli dönemin bitişi: programdaki + ek derslerin toplamı dönemin tam ders saatine ulaştığı dersin günü,
 * o günden sonraki ilk dersin bir gün öncesine kadar uzatılır (takvim bitişini geçmez). Dolmazsa takvim bitişi.
 */
function filledEnd(full, extras, fullHours, calEnd, skip) {
  if (fullHours <= 0) return calEnd;
  const all = full.concat(extras).sort((x, y) => (x.date + x.time).localeCompare(y.date + y.time));
  let acc = 0;
  for (const l of all) {
    if (skip && skip.has(l.key)) continue; // yapılmadı işaretli ders paketi doldurmaz
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
  const openEnded = new Map(); // plan id → bitişi yok mu (son plan): ufuktan sonraki dönemler henüz üretilmez

  own.forEach((plan, i) => {
    const next = own[i + 1];
    let hardEnd = next ? addDays(next.valid_from, -1) : null;
    if (studentEnd && (!hardEnd || studentEnd < hardEnd)) hardEnd = studentEnd;
    if (hardEnd && hardEnd < plan.valid_from) return; // hiç yürürlüğe girmemiş plan
    openEnded.set(plan.id, !hardEnd);

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
      let fullHours = sumHours(full);
      // Haftalık / 4 haftalık: paketin ders sayısı = haftalık ders × hafta. Programı gün değiştirince
      // takvimde "kaybolan" bir hafta ders başı ücreti şişirmesin (ücret ÷ gerçek paket saati).
      const sch0 = isWeekly(plan.type) ? scheduleAt(schedules.filter((x) => x.student_id === student.id), s) : null;
      // Aylık: paketin ders sayısı o ayın takvimdeki ders sayısıdır (ay uzunluğuna göre değişir).
      const nominal = sch0 ? sch0.slots.reduce((a, x) => a + (Number(x.hours) || 1), 0) * (plan.type === 'weekly' ? 1 : 4) : plan.type === 'monthly' ? fullHours : 0;
      if (nominal > 0) fullHours = nominal;
      const exAll = extraLessons(openStudent, extra_lessons, s, calEnd);
      const fullEnd = exAll.length ? filledEnd(full, exAll, fullHours, calEnd, nominal > 0 ? ownMarks : null) : calEnd;
      const truncated = !!hardEnd && fullEnd > hardEnd;
      const e = truncated ? hardEnd : fullEnd;
      const inside = full.filter((l) => l.date <= e);
      const extra = exAll.filter((l) => l.date <= e);
      const hours = sumHours(inside), extraHours = sumHours(extra);
      let base = plan.fee;
      const hourly = fullHours > 0 ? plan.fee / fullHours : 0;
      const missed = inside.filter((l) => ownMarks.has(l.key)).map((l) => ({ ...l, reason: ownMarks.get(l.key).reason }));
      const missedHours = sumHours(missed);
      let deduction;
      let doneExtra = 0; // yalnız gösterim için: tutara yansıyan (tarihi gelmiş) ek ders saati
      if (nominal > 0) {
        // Tutar = ders başı ücret × gerçekten verilen ders. Telafi (ek ders) yapılınca (tarihi geldiyse) yapılmayanın yerini tutar.
        doneExtra = sumHours(extra.filter((l) => l.date <= today));
        const given = Math.max(0, hours - missedHours + doneExtra);
        base = Math.min(plan.fee, Math.round(hourly * (hours + doneExtra)));
        deduction = base - Math.min(plan.fee, Math.round(hourly * given));
      } else {
        if (truncated) base = fullHours > 0 ? Math.min(plan.fee, Math.round(plan.fee * (hours + extraHours) / fullHours)) : 0;
        deduction = Math.min(base, Math.round(missedHours * hourly));
      }
      out.push(finish({
        key: `${plan.id}#${seq}`, plan_id: plan.id, type: plan.type, seq,
        start: s, end: e, due: e, fee: plan.fee, base, scheduled_hours: hours,
        missed_hours: missedHours, missed, hourly, deduction, truncated, final: e < today,
        extra, extra_hours: extraHours, shortened: fullEnd < calEnd, cal_end: calEnd,
        by_lessons: nominal > 0, extra_credit_hours: doneExtra,
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
    return setStatus(p);
  }
  function setStatus(p) {
    if (p.amount <= 0) p.status = p.paid > 0 ? 'paid' : 'none';
    else if (p.remaining <= 0) p.status = 'paid';
    else if (today < p.start) p.status = 'future';
    else if (today < p.due) p.status = 'running';
    else if (today < p.remind_on) p.status = 'due';
    else p.status = 'late';
    return p;
  }

  // Dönemi kalmayan (yetim) ödeme: ödeme kaydı DEĞİŞMEZ; öğrencinin en eski ödenmemiş dönemine sayılır, para kaybolmaz.
  // (Ek ders dönemi erken kapatınca ya da yeni paket başlayınca eski dönem anahtarı artık olmayabilir.)
  const keys = new Set(out.map((x) => x.key));
  let orphan = 0, orphanOn = '';
  for (const pay of payments) {
    if (pay.student_id !== student.id || pay.deleted_at || keys.has(pay.period_key)) continue;
    const [pid, seq] = String(pay.period_key).split('#');
    if (openEnded.get(pid) && Number(seq) > out.filter((x) => x.plan_id === pid).length) continue; // ufuktan sonraki dönem
    orphan += pay.amount;
    if (pay.paid_date > orphanOn) orphanOn = pay.paid_date;
  }
  for (const p of [...out].sort((a, b) => a.start.localeCompare(b.start))) {
    if (orphan <= 0) break;
    if (p.remaining <= 0) continue;
    const use = Math.min(orphan, p.remaining);
    p.paid += use; p.remaining -= use; p.carried = use; p.carried_on = orphanOn; orphan -= use;
    setStatus(p);
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
    return { period: p, lessons: ls, ...c, total: ls.length, paid_on: pd.length ? pd[pd.length - 1] : (p.carried_on || null) };
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

/**
 * "Ödeme al ve yeni pakete geç": süren dönemi `start` gününden önce kapatıp aynı türde yeni bir paket başlatır.
 * Hiçbir kayıt değişmez ya da silinmez; yalnız yeni bir `plans` satırı eklenir (süren dönemin tutarı mevcut
 * kuralla yapılan ders oranında yeniden hesaplanır, ödemeler dönem anahtarıyla bağlı kalır).
 * Yeni paket eski paketle AYNI tür ve ücrettedir (ör. 4 haftalık).
 */
export function canStartNewPackage(period, today) {
  return !!period && period.type !== 'oneoff' && period.status === 'running' && !!period.end && addDays(today, 1) <= period.end;
}

/** Önizleme: { ok, error } ya da { ok, row (eklenecek plan), old (eski dönemin yeni hâli), start } */
export function previewNewPackage(student, data, period, start, today, settings = {}) {
  if (!canStartNewPackage(period, today)) return { ok: false, error: 'Bu dönem için yeni paket başlatılamaz (dönem sürmüyor ya da tek ödemeli).' };
  if (!/^\d{4}-\d{2}-\d{2}$/.test(start || '')) return { ok: false, error: 'Yeni paketin başlangıç tarihini seçin.' };
  if (start <= period.start) return { ok: false, error: 'Başlangıç, eski paketin başlangıcından sonra olmalı.' };
  if (start > period.end) return { ok: false, error: 'Başlangıç, eski paketin bitişinden sonra olamaz (o zaman zaten yeni dönem başlar).' };
  const plan = data.plans.find((p) => p.id === period.plan_id);
  if (!plan) return { ok: false, error: 'Paketin planı bulunamadı.' };
  if (data.plans.some((p) => p.student_id === student.id && p.valid_from === start)) return { ok: false, error: 'Bu tarihte zaten başka bir paket başlıyor; başka bir tarih seçin.' };
  const row = { student_id: student.id, valid_from: start, type: plan.type, fee: plan.fee, hours: plan.hours ?? null, due_date: plan.due_date ?? null };
  const after = studentPeriods(student, { ...data, plans: [...data.plans, { ...row, id: '__yeni__' }] }, today, settings);
  const old = after.find((p) => p.key === period.key);
  const next = after.find((p) => p.plan_id === '__yeni__' && p.seq === 1);
  if (!old || !next) return { ok: false, error: 'Önizleme hesaplanamadı; bir şey kaydedilmedi.' };
  if (old.amount <= 0) return { ok: false, error: 'Bu pakette henüz hiç ders yapılmadı; eski paket 0 TL olacağı için yeni paket başlatılamaz. Ödemeyi "Ödemeyi kaydet" ile alın.' };
  return { ok: true, row, old, next, start };
}

/**
 * Ücret dökümü (yalnız gösterim, hiçbir kayıt değişmez): bir dönemin tutarı nasıl çıktı?
 * Satırlar her zaman toplanınca p.amount'a TAM eşittir (kuruşu kuruşuna):
 *   dönem tutarı − yapılmayan (ertelenen) dersler + ek ders telafisi (haftalık/4 haftalık/aylık paketlerde) = ödenecek.
 * Ek ders tek ödemeli pakette ayrıca ücretlendirilmez; yalnız dönemi erken doldurur (notla belirtilir).
 */
export function feeBreakdown(p, today) {
  const credit = !!p.by_lessons;
  const minus = credit ? Math.min(p.base, Math.round(p.hourly * p.missed_hours)) : p.deduction;
  let plus = credit ? Math.round(p.hourly * p.extra_credit_hours) : 0;
  let gap = credit ? p.amount - (p.base - minus + plus) : 0; // ek dersin karşılığı ile gerçek tutar arasındaki fark
  if (Math.abs(gap) <= 2) { plus += gap; gap = 0; }           // kuruş yuvarlaması
  const shortHours = credit && p.hourly > 0 ? Math.max(0, p.fee / p.hourly - p.scheduled_hours) : 0; // program değişince takvimde yer almayan ders
  const cutLabel = gap < 0 ? (shortHours > 0.01 && !p.shortened ? 'Programda yer almayan ders (gün değişikliği) düşüldü' : 'Paket ücretini aşan kısım kesildi') : 'Düzeltme';
  const lines = [{ kind: 'base', label: p.truncated ? 'Dönem tutarı (öğrenci ayrıldığı için kısaltıldı)' : 'Dönem tutarı', amount: p.base }];
  if (minus > 0) lines.push({ kind: 'minus', label: 'Yapılmayan (ertelenen) dersler düşüldü', amount: -minus });
  if (plus !== 0) lines.push({ kind: 'plus', label: 'Ek ders (telafi) tekrar eklendi', amount: plus });
  if (gap !== 0) lines.push({ kind: 'cut', label: cutLabel, amount: gap });
  const missed = (p.missed || []).map((l) => ({ date: l.date, time: l.time, hours: l.hours, reason: l.reason || '', value: Math.round(p.hourly * l.hours) }));
  const extras = (p.extra || []).map((l) => {
    const counted = l.date <= today;
    return { date: l.date, time: l.time, hours: l.hours, note: l.note || '', counted, value: p.by_lessons && counted ? Math.round(p.hourly * l.hours) : 0 };
  });
  const notes = [];
  if (extras.length && !p.by_lessons) notes.push('Tek ödemeli pakette ek ders ayrıca ücretlendirilmez; yalnız dönemi erken doldurur.');
  if (extras.some((x) => !x.counted)) notes.push('Tarihi henüz gelmemiş ek ders tutara şimdilik yansımaz.');
  const sumH = (xs) => xs.reduce((a, x) => a + x.hours, 0);
  return {
    lines, missed, extras, notes, hourly: Math.round(p.hourly || 0),
    base: p.base, minus, plus, cut: gap < 0 ? -gap : 0, cut_label: cutLabel, // minus/plus/cut pozitif sayı
    missed_hours: sumH(missed), extra_hours_done: sumH(extras.filter((x) => x.counted)),
    total: p.amount, paid: p.paid, remaining: p.remaining,
    check: lines.reduce((a, l) => a + l.amount, 0) === p.amount,
  };
}

/**
 * Bir ödeme döneminde kaç ders var (ders başı ücretten paket ücretini bulmak için).
 * Haftalık: haftalık ders; 4 haftalık: ×4; aylık: başlangıçtan itibaren ilk ayın takvimdeki ders sayısı.
 */
export function lessonsPerPeriod(type, slots, start) {
  const weekly = (slots || []).reduce((a, x) => a + (Number(x.hours) || 1), 0);
  if (type === 'weekly') return weekly;
  if (type === '4weekly') return weekly * 4;
  if (type !== 'monthly' || !weekly || !/^\d{4}-\d{2}-\d{2}$/.test(start || '')) return 0;
  const sid = '_';
  const ls = generateLessons({ id: sid, start_date: '0000-01-01', active: true, end_date: null }, [{ student_id: sid, valid_from: '0000-01-01', slots }], start, periodEnd('monthly', start));
  return sumHours(ls);
}

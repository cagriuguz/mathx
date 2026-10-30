// Birden çok ekranda kullanılan parçalar: ders satırı ("Yapılmadı" + 50 karakter gerekçe), dönem satırı.
import { useState } from 'preact/hooks';
import { useApp, useAction, Icon, StatusChip, Sheet, Field, StudentPicker } from '../ui.jsx';
import { REASON_MAX, cleanReason, scheduleAt } from '../core/lessons.js';
import { fmtShort, fmtDate } from '../core/dates.js';
import { fmtTL, fmtHours, fmtNum } from '../core/money.js';
import { PLAN_TYPES, STATUS_LABEL, feeBreakdown } from '../core/billing.js';
import { ReviewSheet } from './review.jsx';
import { reviewMap, reviewAvg, reviewKey } from '../core/review.js';

const LESSON_CHIP = {
  done: ['ok', 'Yapıldı'],
  not_held: ['bad', 'Yapılmadı'],
  today: ['gold', 'Bugün'],
  upcoming: ['info', 'Planlandı'],
};

export function LessonRow({ lesson, name, editable = true }) {
  const { store, reload, data } = useApp();
  const [run, busy] = useAction();
  const [open, setOpen] = useState(false);
  const [reviewing, setReviewing] = useState(false);
  const review = editable && lesson.status !== 'not_held' && lesson.status !== 'upcoming' ? reviewMap(data.lesson_reviews).get(reviewKey(lesson)) : null;
  const canReview = editable && (lesson.status === 'done' || lesson.status === 'today');
  const [text, setText] = useState('');
  const [err, setErr] = useState('');
  const [cls, label] = LESSON_CHIP[lesson.status];
  const count = [...text].length;

  const save = async () => {
    let reason;
    try { reason = cleanReason(text); } catch (e) { return setErr(e.message); }
    const ok = await run(async () => {
      await store.insert('marks', { student_id: lesson.student_id, date: lesson.date, time: lesson.time, reason });
      await reload();
    }, 'Kaydedildi: ders yapılmadı');
    if (ok) { setOpen(false); setText(''); setErr(''); }
  };
  const undo = () => run(async () => { await store.remove('marks', lesson.mark_id); await reload(); }, 'Geri alındı');
  const delExtra = () => {
    if (!confirm('Bu ek ders silinsin mi? Ödeme dönemi yeniden hesaplanır.')) return;
    run(async () => { await store.remove('extra_lessons', lesson.extra_id); await reload(); }, 'Ek ders silindi');
  };

  return (
    <div class="lesson">
      <div class="time">{lesson.time}<small>{fmtHours(lesson.hours)}</small></div>
      <div class="grow">
        <div class="item-title">{name}</div>
        {lesson.extra
          ? <div class="item-sub">Ek ders{lesson.note ? ` · ${lesson.note}` : ''} · paketi doldurur</div>
          : lesson.status === 'not_held'
          ? <div class="item-sub">Gerekçe: {lesson.reason}</div>
          : lesson.status === 'today' ? <div class="item-sub">İşaretlenmezse 23:00'te yapıldı sayılır</div> : null}
      </div>
      <div class="row">
        {lesson.extra && <span class="chip gold">Ek ders</span>}
        <span class={`chip ${cls}`}>{label}</span>
        {editable && lesson.extra && (
          <button class="btn small ghost" disabled={busy} onClick={delExtra}>Sil</button>
        )}
        {editable && !lesson.extra && lesson.status !== 'not_held' && !open && (
          <button class="btn small" onClick={() => setOpen(true)}>Yapılmadı</button>
        )}
        {editable && lesson.status === 'not_held' && (
          <button class="btn small ghost" disabled={busy} onClick={undo}>Geri al</button>
        )}
        {canReview && (
          <button class={`btn small${review ? ' ghost' : ' primary'}`} onClick={() => setReviewing(true)}>
            {review ? `Değerlendirildi · ${String(Math.round(reviewAvg(review) * 10) / 10).replace('.', ',')}` : 'Değerlendir'}
          </button>
        )}
      </div>
      {reviewing && <ReviewSheet lesson={lesson} onClose={() => setReviewing(false)} />}
      {open && (
        <div class="reason-box">
          <div class="spread">
            <label class="small" for={`r-${lesson.key}`} style="font-weight:600">Neden yapılmadı?</label>
            <span class="counter">{count}/{REASON_MAX}</span>
          </div>
          <input id={`r-${lesson.key}`} class={`input${err ? ' invalid' : ''}`} maxLength={REASON_MAX} value={text} autoFocus
            placeholder="Ör. Öğrenci hastalandı" onInput={(e) => { setText(e.currentTarget.value); setErr(''); }}
            onKeyDown={(e) => e.key === 'Enter' && save()} />
          {err && <div class="error">{err}</div>}
          {lesson.status === 'done' && <div class="hint">Bu ders otomatik "yapıldı" sayılmıştı; kaydedince düzeltilir ve ücretten düşülür.</div>}
          <div class="row">
            <button class="btn primary small" disabled={busy} onClick={save}>Kaydet</button>
            <button class="btn small ghost" onClick={() => { setOpen(false); setText(''); setErr(''); }}>Vazgeç</button>
          </div>
        </div>
      )}
    </div>
  );
}

export function periodRange(p) {
  if (p.type === 'oneoff') return `${fmtNum(p.package_hours)} derslik paket · son ödeme ${fmtShort(p.due)}`;
  return `${fmtShort(p.start)} – ${fmtShort(p.end)}`;
}

/** Dönem özeti: tutar, kesinti ayrıntısı, durum */
export function PeriodBody({ p, showName = true }) {
  return (
    <div class="spread" style="align-items:flex-start">
      <div class="grow">
        {showName && <div class="item-title">{p.student_name}</div>}
        <div class="item-sub">{PLAN_TYPES[p.type]} · {periodRange(p)}</div>
        {p.deduction > 0 && (
          <div class="item-sub">
            {fmtTL(p.base)} − {fmtHours(p.missed_hours)} yapılmadı ({fmtTL(p.deduction)})
          </div>
        )}
        {p.extra_hours > 0 && (
          <div class="item-sub">{fmtNum(p.extra_hours)} ek ders dahil{p.shortened ? ` · bitiş ${fmtShort(p.end)} (${fmtShort(p.cal_end)} yerine)` : ''}</div>
        )}
        {p.type === 'oneoff' && <div class="item-sub">Kullanılan: {fmtHours(p.used_hours)} / {fmtHours(p.package_hours)}</div>}
        {p.paid > 0 && p.remaining > 0 && <div class="item-sub">Ödenen {fmtTL(p.paid)}, kalan {fmtTL(p.remaining)}</div>}
        {p.status === 'late' && <div class="item-sub" style="color:var(--madder)">Vade {fmtDate(p.due)} · {p.days_past_due} gün gecikti</div>}
        {p.status === 'due' && <div class="item-sub">Vade {fmtDate(p.due)}</div>}
        {p.status === 'running' && p.type !== 'oneoff' && <div class="item-sub">Dönem sürüyor; tutar yapılmayan derslere göre güncellenir</div>}
      </div>
      <div class="right">
        <div class="num" style="font-size:21px">{fmtTL(p.status === 'paid' ? p.amount : p.remaining || p.amount)}</div>
        <StatusChip status={p.status} label={STATUS_LABEL[p.status]} />
      </div>
    </div>
  );
}

export function MissedList({ missed }) {
  if (!missed?.length) return null;
  return (
    <ul class="list">
      {missed.map((m) => (
        <li key={m.key} class="spread">
          <span>{fmtDate(m.date, true)} · {m.time}</span>
          <span class="muted small">{m.reason}</span>
        </li>
      ))}
    </ul>
  );
}

/**
 * Ek ders girişi: programda olmayan, fazladan yapılan ders. Ödeme dönemini doldurur
 * (ör. haftada 2 derslik öğrenciye 2 ek ders = 1 hafta sayılır).
 */
export function ExtraLessonSheet({ studentId = '', onClose }) {
  const { data, now, store, reload } = useApp();
  const [run, busy] = useAction();
  const [f, setF] = useState({ student_id: studentId, date: now.date, time: '17:00', hours: 1, note: '' });
  const [errors, setErrors] = useState({});
  const set = (k) => (e) => setF((o) => ({ ...o, [k]: k === 'hours' ? Number(e.currentTarget.value) : e.currentTarget.value }));
  const s = data.students.find((x) => x.id === f.student_id);
  const sch = s ? scheduleAt(data.schedules.filter((x) => x.student_id === s.id), f.date || now.date) : null;
  const weekly = (sch?.slots || []).reduce((a, x) => a + (Number(x.hours) || 1), 0);

  const save = async () => {
    const e = {};
    if (!s) e.student_id = 'Öğrenci seçin.';
    if (!/^\d{4}-\d{2}-\d{2}$/.test(f.date)) e.date = 'Tarih seçin.';
    else if (s && f.date < s.start_date) e.date = `Derslere başlama tarihinden (${fmtDate(s.start_date)}) önce olamaz.`;
    else if (s && s.active === false && s.end_date && f.date > s.end_date) e.date = `Öğrencinin son ders tarihinden (${fmtDate(s.end_date)}) sonra olamaz.`;
    if (!/^\d\d:\d\d$/.test(f.time)) e.time = 'Saat yazın.';
    const note = f.note.replace(/\s+/g, ' ').trim();
    if ([...note].length > REASON_MAX) e.note = `Not en fazla ${REASON_MAX} karakter olabilir.`;
    setErrors(e);
    if (Object.keys(e).length) return;
    const ok = await run(async () => {
      await store.insert('extra_lessons', { student_id: s.id, date: f.date, time: f.time, hours: f.hours, note });
      await reload();
    }, 'Ek ders kaydedildi');
    if (ok) onClose();
  };

  return (
    <Sheet title="Ek ders ekle" onClose={onClose}>
      <div class="stack">
        <StudentPicker label="Öğrenci *" students={data.students} value={f.student_id} onChange={(id) => setF((o) => ({ ...o, student_id: id }))} extra={(x) => (x.active === false ? ' (pasif)' : '')} />
        {errors.student_id && <div class="error">{errors.student_id}</div>}
        <Field label="Tarih" required error={errors.date}><input class="input" type="date" value={f.date} onInput={set('date')} /></Field>
        <div class="grid2">
          <Field label="Saat" required error={errors.time}><input class="input" type="time" value={f.time} onInput={set('time')} /></Field>
          <Field label="Süre">
            <select class="input" value={f.hours} onChange={set('hours')}>
              {[1, 1.5, 2, 2.5, 3].map((h) => <option key={h} value={h}>{fmtHours(h)}</option>)}
            </select>
          </Field>
        </div>
        <Field label="Not (isteğe bağlı)" error={errors.note}>
          <input class="input" maxLength={REASON_MAX} value={f.note} placeholder="Ör. Sınav öncesi ek çalışma" onInput={set('note')} />
        </Field>
        <div class="hint">
          Ek ders ücrete eklenmez; ödeme paketini doldurur.
          {weekly > 0 && ` Bu öğrencinin programı haftada ${fmtHours(weekly)}; ${fmtNum(f.hours)} ek ders ${fmtWeeks(f.hours / weekly)} sayılır, paket o kadar erken dolar.`}
        </div>
        <button class="btn primary block" disabled={busy} onClick={save}>Kaydet</button>
      </div>
    </Sheet>
  );
}

const fmtWeeks = (w) => {
  const r = Math.round(w * 10) / 10;
  return `${Number.isInteger(r) ? r : String(r).replace('.', ',')} hafta`;
};

/** Ücret detayları: dönem tutarı − ertelenen dersler + ek ders telafisi = ödenecek (salt okunur) */
export function FeeDetail({ p }) {
  const { now } = useApp();
  const d = feeBreakdown(p, now.date);
  return (
    <div class="stack fee-detail" style="gap:8px">
      <div class="table-wrap"><table class="t">
        <tbody>
          <tr><td>{p.truncated ? 'Dönem ücreti (öğrenci ayrıldığı için kısaltıldı)' : 'Dönem ücreti'}</td><td class="n num">{fmtTL(d.base)}</td></tr>
          <tr><td>Ertelenen ders: <b>{fmtNum(d.missed_hours)}</b></td><td class="n num" style={d.minus ? 'color:var(--madder);font-weight:700' : ''}>{d.minus ? '−' + fmtTL(d.minus) : '0'}</td></tr>
          <tr><td>Yapılan ek ders: <b>{fmtNum(d.extra_hours_done)}</b></td><td class="n num" style={d.plus ? 'color:var(--sage);font-weight:700' : ''}>{d.plus ? '+' + fmtTL(d.plus) : '0'}</td></tr>
          {d.cut > 0 && <tr><td>{d.cut_label}</td><td class="n num" style="color:var(--madder)">{'−' + fmtTL(d.cut)}</td></tr>}
          <tr><td><b>Net ücret</b></td><td class="n num"><b>{fmtTL(d.total)}</b></td></tr>
          {d.paid > 0 && <tr><td>Ödenen{p.carried > 0 ? ` (dönemi kalmayan önceki ödemeden ${fmtTL(p.carried)} sayıldı)` : ''}</td><td class="n num">{fmtTL(d.paid)}</td></tr>}
          <tr><td><b>Kalan</b></td><td class="n num"><b>{fmtTL(d.remaining)}</b></td></tr>
        </tbody>
      </table></div>
      {d.hourly > 0 && <div class="small muted">1 ders = {fmtTL(d.hourly)} (dönem ücreti ÷ paketteki ders sayısı)</div>}
      {d.missed.length > 0 && (
        <div>
          <div class="small"><b>Ertelenen / yapılmayan dersler</b> ({d.missed.length})</div>
          <ul class="list">{d.missed.map((m, i) => (
            <li key={i} class="spread small"><span>{fmtDate(m.date, true)} · {m.time} · {fmtHours(m.hours)}{m.reason ? ` · ${m.reason}` : ''}</span><span class="num" style="color:var(--madder)">−{fmtTL(m.value)}</span></li>
          ))}</ul>
        </div>
      )}
      {d.extras.length > 0 && (
        <div>
          <div class="small"><b>Ek dersler</b> ({d.extras.length})</div>
          <ul class="list">{d.extras.map((x, i) => (
            <li key={i} class="spread small"><span>{fmtDate(x.date, true)} · {x.time} · {fmtHours(x.hours)}{x.note ? ` · ${x.note}` : ''}{x.counted ? '' : ' · henüz yapılmadı'}</span><span class="num" style="color:var(--sage)">{x.value ? '+' + fmtTL(x.value) : '—'}</span></li>
          ))}</ul>
        </div>
      )}
      {d.missed.length === 0 && d.extras.length === 0 && <div class="small muted">Bu dönemde ertelenen ders ya da ek ders yok; ücret paket tutarıyla aynı.</div>}
      {d.notes.map((n, i) => <div key={i} class="small muted">{n}</div>)}
    </div>
  );
}

/** "Ücret detayları" açılır bölümü (Ödemeler listesinde öğrencinin altında) */
export function FeeDetailToggle({ p }) {
  const [open, setOpen] = useState(false);
  return (
    <div class="stack" style="gap:8px">
      <button class="btn small ghost" aria-expanded={open} onClick={() => setOpen(!open)}>{open ? '▾' : '▸'} Ücret detayları</button>
      {open && <FeeDetail p={p} />}
    </div>
  );
}

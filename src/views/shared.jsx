// Birden çok ekranda kullanılan parçalar: ders satırı ("Yapılmadı" + 50 karakter gerekçe), dönem satırı.
import { useState } from 'preact/hooks';
import { useApp, useAction, Icon, StatusChip } from '../ui.jsx';
import { REASON_MAX, cleanReason } from '../core/lessons.js';
import { fmtShort, fmtDate } from '../core/dates.js';
import { fmtTL, fmtHours } from '../core/money.js';
import { PLAN_TYPES, STATUS_LABEL } from '../core/billing.js';

const LESSON_CHIP = {
  done: ['ok', 'Yapıldı'],
  not_held: ['bad', 'Yapılmadı'],
  today: ['gold', 'Bugün'],
  upcoming: ['info', 'Planlandı'],
};

export function LessonRow({ lesson, name, editable = true }) {
  const { store, reload } = useApp();
  const [run, busy] = useAction();
  const [open, setOpen] = useState(false);
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

  return (
    <div class="lesson">
      <div class="time">{lesson.time}<small>{fmtHours(lesson.hours)}</small></div>
      <div class="grow">
        <div class="item-title">{name}</div>
        {lesson.status === 'not_held'
          ? <div class="item-sub">Gerekçe: {lesson.reason}</div>
          : lesson.status === 'today' ? <div class="item-sub">İşaretlenmezse 23:00'te yapıldı sayılır</div> : null}
      </div>
      <div class="row">
        <span class={`chip ${cls}`}>{label}</span>
        {editable && lesson.status !== 'not_held' && !open && (
          <button class="btn small" onClick={() => setOpen(true)}>Yapılmadı</button>
        )}
        {editable && lesson.status === 'not_held' && (
          <button class="btn small ghost" disabled={busy} onClick={undo}>Geri al</button>
        )}
      </div>
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
  if (p.type === 'oneoff') return `${p.package_hours} saatlik paket · son ödeme ${fmtShort(p.due)}`;
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

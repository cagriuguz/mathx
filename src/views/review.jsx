// Ders değerlendirmesi kutusu: öğrencinin adına/dersine dokununca açılır. YALNIZ öğretmen görür.
import { useState } from 'preact/hooks';
import { useApp, useAction, Sheet, Field, Seg } from '../ui.jsx';
import { REVIEW_FIELDS, SCORE_LABEL, KONU_MAX, NOTE_MAX, cleanReview, reviewMap } from '../core/review.js';
import { lessonKey } from '../core/lessons.js';
import { fmtDate } from '../core/dates.js';

const SCORES = [1, 2, 3, 4, 5].map((n) => [n, String(n)]);

export function ReviewSheet({ lesson, onClose }) {
  const { data, store, reload } = useApp();
  const [run, busy] = useAction();
  const student = data.students.find((s) => s.id === lesson.student_id);
  const old = reviewMap(data.lesson_reviews).get(lessonKey(lesson.student_id, lesson.date, lesson.time));
  const [f, setF] = useState(() => ({
    ...Object.fromEntries(REVIEW_FIELDS.map(([k]) => [k, old?.[k] ?? null])),
    konu: old?.konu || '', note: old?.note || '', veli_gorusme: !!old?.veli_gorusme,
  }));
  const [err, setErr] = useState('');
  const setScore = (k, n) => setF((o) => ({ ...o, [k]: o[k] === n ? null : n })); // seçili puana tekrar dokunmak temizler

  const save = async () => {
    let row;
    try { row = cleanReview(f); } catch (e) { return setErr(e.message); }
    const ok = await run(async () => {
      if (old) await store.update('lesson_reviews', old.id, row);
      else await store.insert('lesson_reviews', { student_id: lesson.student_id, date: lesson.date, time: lesson.time, ...row });
      await reload();
    }, 'Değerlendirme kaydedildi');
    if (ok) onClose();
  };
  const del = async () => {
    if (!confirm('Bu değerlendirme silinsin mi?')) return;
    const ok = await run(async () => { await store.remove('lesson_reviews', old.id); await reload(); }, 'Değerlendirme silindi');
    if (ok) onClose();
  };

  return (
    <Sheet title={`${student?.name || 'Öğrenci'} · değerlendirme`} onClose={onClose}>
      <div class="stack">
        <div class="small muted">{fmtDate(lesson.date)} · {lesson.time}. 5 çok iyi · 4 iyi · 3 orta · 2 kötü · 1 sıkıntılı. Boş bıraktığınız puan sayılmaz.</div>
        {REVIEW_FIELDS.map(([k, label]) => (
          <div class="score-row" key={k}>
            <div class="score-label"><span>{label}</span><small>{f[k] ? SCORE_LABEL[f[k]] : '—'}</small></div>
            <Seg cls="five" options={SCORES} value={f[k]} onChange={(n) => setScore(k, n)} />
          </div>
        ))}
        <button class="btn small ghost" onClick={() => setF((o) => ({ ...o, ...Object.fromEntries(REVIEW_FIELDS.map(([k]) => [k, o[k] ?? 4])) }))}>Boşları "4 · İyi" yap</button>
        <Field label="Bugünkü konu" hint={`${[...f.konu].length}/${KONU_MAX}`}><input class="input" maxLength={KONU_MAX} value={f.konu} placeholder="Ör. Üslü ifadeler" onInput={(e) => setF((o) => ({ ...o, konu: e.currentTarget.value }))} /></Field>
        <Field label="Not" hint={`${[...f.note].length}/${NOTE_MAX}`}><textarea class="input" rows="2" maxLength={NOTE_MAX} value={f.note} placeholder="Ör. İşlem hatası çok, tekrar gerek" onInput={(e) => setF((o) => ({ ...o, note: e.currentTarget.value }))} /></Field>
        <label class="row" style="gap:10px"><input type="checkbox" checked={f.veli_gorusme} onChange={(e) => setF((o) => ({ ...o, veli_gorusme: e.currentTarget.checked }))} /> <span>Veliyle görüşülsün</span></label>
        {err && <div class="error">{err}</div>}
        <div class="row wrap">
          <button class="btn primary" disabled={busy} onClick={save}>Kaydet</button>
          {old && <button class="btn ghost" disabled={busy} onClick={del}>Sil</button>}
        </div>
      </div>
    </Sheet>
  );
}

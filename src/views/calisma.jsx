// ÇALIŞMA TAKİBİ ekranları: öğretmen (öğrenci kartında gün seçimi + panelde çalışmayanlar), öğrenci ("Çalıştım"), veli (hafta özeti).
import { useState } from 'preact/hooks';
import { useApp, useAction, Icon, WaButton, Empty } from '../ui.jsx';
import { TR_DAYS_SHORT, fmtShort, dow } from '../core/dates.js';
import { planOf, dayStatus, studyWeek, studyMissed, studyWaiting, msgStudyMissed, STUDY_HOUR } from '../core/calisma.js';

const MARK = { done: '✓', missed: '✕', excused: 'M', handled: '✕', waiting: '·', future: '·', none: '' };
const LABEL = { done: 'çalıştı', missed: 'çalışmadı', excused: 'mazeretli', handled: 'çalışmadı', waiting: 'bekleniyor', future: '', none: '' };

/** Haftalık 7 kutu: Pzt-Paz; çalışma günü olmayan günler boş görünür */
export function StudyWeekStrip({ studentId }) {
  const { data, now } = useApp();
  const w = studyWeek(data, studentId, now);
  return (
    <div class="study-week" role="list">
      {w.days.map((d) => (
        <div key={d.date} role="listitem" class={`study-day ${d.status}${d.today ? ' today' : ''}`} aria-label={`${d.label} ${LABEL[d.status] || ''}`}>
          <span class="l">{d.label}</span>
          <span class="m">{MARK[d.status]}</span>
        </div>
      ))}
    </div>
  );
}

/** Öğretmen: öğrenci kartında takip açık/kapalı + haftanın hangi günleri */
export function StudyPlanSection({ s }) {
  const { data, store, reload, now } = useApp();
  const [run, busy] = useAction();
  const plan = (data.study_plans || []).find((p) => p.student_id === s.id);
  const [open, setOpen] = useState(false);
  const [days, setDays] = useState(plan?.days || []);
  const [enabled, setEnabled] = useState(!!plan?.enabled);
  const toggle = (n) => setDays((d) => (d.includes(n) ? d.filter((x) => x !== n) : [...d, n].sort()));
  const save = () => run(async () => {
    if (enabled && !days.length) throw new Error('Takibi açmak için en az bir gün seçin.');
    const row = { enabled, days };
    // Takip yeni açılıyor ya da günler değişiyorsa sayım BUGÜNDEN başlar (geçmiş günler yanlışlıkla "çalışmadı" çıkmasın)
    if (!plan || plan.enabled !== enabled || String(plan.days) !== String(days)) row.start_date = now.date;
    if (plan) await store.update('study_plans', plan.id, row);
    else await store.insert('study_plans', { student_id: s.id, ...row });
    await reload();
    setOpen(false);
  }, 'Çalışma takibi kaydedildi');
  const summary = plan?.enabled && plan.days.length ? `Açık · ${plan.days.map((n) => TR_DAYS_SHORT[n - 1]).join(', ')}` : 'Kapalı';
  return (
    <section>
      <div class="section-head"><h3 class="section-title">Çalışma takibi</h3></div>
      <div class="card card-pad stack">
        <div class="spread"><span class="muted">Durum</span><b>{summary}</b></div>
        {plan?.enabled && <StudyWeekStrip studentId={s.id} />}
        {!open && <div><button class="btn small" onClick={() => { setDays(plan?.days || []); setEnabled(!!plan?.enabled); setOpen(true); }}><Icon name="edit" /> {plan ? 'Değiştir' : 'Takibi aç'}</button></div>}
        {open && (
          <div class="stack">
            <div class="seg two">
              <button type="button" aria-pressed={enabled} onClick={() => setEnabled(true)}>Açık</button>
              <button type="button" aria-pressed={!enabled} onClick={() => setEnabled(false)}>Kapalı</button>
            </div>
            {enabled && (
              <>
                <div class="small muted">Öğrencinin matematik çalışacağı günler:</div>
                <div class="seg seven">
                  {TR_DAYS_SHORT.map((l, i) => <button type="button" key={l} aria-pressed={days.includes(i + 1)} onClick={() => toggle(i + 1)}>{l}</button>)}
                </div>
                <div class="hint">Seçilen günlerde öğrenci "Çalıştım" der. Akşam {STUDY_HOUR}:00'ye kadar demezse Panel'de görünür; veliye tek dokunuşla mesaj gönderirsiniz.</div>
              </>
            )}
            {!enabled && <div class="hint">Kapalıyken bu öğrenci için hiçbir uyarı ya da liste çıkmaz.</div>}
            <div class="row wrap">
              <button class="btn small primary" disabled={busy} onClick={save}>Kaydet</button>
              <button class="btn small ghost" onClick={() => setOpen(false)}>Vazgeç</button>
            </div>
          </div>
        )}
      </div>
    </section>
  );
}

/** Öğretmen paneli: bugün çalışmayanlar + son günlerde çalışmayıp ele alınmamışlar */
export function StudyPanelSection() {
  const { data, now, store, reload } = useApp();
  const [run] = useAction();
  const anyOn = (data.study_plans || []).some((p) => p.enabled);
  if (!anyOn) return null;
  const missed = studyMissed(data, now);
  const waiting = studyWaiting(data, now);
  const byId = new Map(data.students.map((s) => [s.id, s]));
  const mark = (m, status) => run(async () => { await store.insert('study_logs', { student_id: m.student_id, date: m.date, status, note: '' }); await reload(); });
  return (
    <section>
      <div class="section-head"><h2 class="section-title">Çalışma takibi</h2>{missed.length > 0 && <span class="chip bad">{missed.length}</span>}</div>
      <div class="card">
        {missed.length === 0 && waiting.length === 0 ? <Empty title="Çalışmayan öğrenci yok ✓">Çalışma günü olup "Çalıştım" demeyenler akşam {STUDY_HOUR}:00'den sonra burada görünür.</Empty> : (
          <ul class="list">
            {missed.map((m) => (
              <li key={m.key} class="stack">
                <div class="spread"><span class="item-title">{m.name}</span><span class="chip bad">Çalışmadı</span></div>
                <div class="small muted">{fmtShort(m.date)} {m.date === now.date ? '(bugün)' : ''} çalışma günüydü, "Çalıştım" demedi</div>
                <div class="row wrap">
                  <WaButton small phone={byId.get(m.student_id)?.parent_phone} text={msgStudyMissed(m.name, m.date, now.date)} label="Veliye bildir" onSent={() => mark(m, 'handled')} />
                  <button class="btn small" onClick={() => mark(m, 'excused')}>Mazeretli</button>
                  <button class="btn small ghost" onClick={() => mark(m, 'handled')}>Ele aldım</button>
                </div>
              </li>
            ))}
            {waiting.length > 0 && <li class="small muted">Bugün bekleniyor ({STUDY_HOUR}:00'e kadar): {waiting.map((s) => s.name).join(', ')}</li>}
          </ul>
        )}
      </div>
    </section>
  );
}

/** Öğrenci: bugün çalışma günüyse "Çalıştım" düğmesi + hafta özeti. Takip kapalıysa hiçbir şey göstermez. */
export function StudyToday() {
  const { data, now, store, reload } = useApp();
  const [run, busy] = useAction();
  const [note, setNote] = useState('');
  const sid = data.study_plans?.[0]?.student_id;
  const plan = sid ? planOf(data, sid) : null;
  if (!plan) return null;
  const st = dayStatus(data, sid, now.date, now);
  const isToday = plan.days.includes(dow(now.date));
  const finished = st === 'done';
  return (
    <div class="card card-pad stack">
      <div class="spread"><b>Matematik çalışması</b><span class={`chip ${finished ? 'ok' : isToday ? 'warn' : 'info'}`}>{finished ? 'Bugün tamam ✓' : isToday ? 'Bugün çalışma günün' : 'Bugün çalışma günü değil'}</span></div>
      <StudyWeekStrip studentId={sid} />
      {!finished && (
        <>
          <input class="input" maxLength={60} placeholder="İstersen kısa not (ne çalıştın?)" value={note} onInput={(e) => setNote(e.currentTarget.value)} />
          <button class="btn primary" disabled={busy} onClick={() => run(async () => { await store.logStudy(note); setNote(''); await reload(); }, 'Aferin! Çalışman kaydedildi.')}>
            <Icon name="check" /> Bugün çalıştım
          </button>
        </>
      )}
    </div>
  );
}

/** Veli: çocuğunun haftalık çalışma özeti (takip kapalıysa gösterilmez) */
export function StudyParentCard({ student }) {
  const { data, now } = useApp();
  if (!planOf(data, student.id)) return null;
  const { done, due } = studyWeek(data, student.id, now);
  return (
    <div class="card card-pad stack">
      <div class="spread"><b>Bu haftaki matematik çalışması</b><span class="muted small">{due ? `${done}/${due} gün` : 'henüz gün gelmedi'}</span></div>
      <StudyWeekStrip studentId={student.id} />
    </div>
  );
}

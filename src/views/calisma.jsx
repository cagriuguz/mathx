// ÇALIŞMA TAKİBİ ekranları: öğretmen (öğrenci kartında gün seçimi + panelde "dün çalıştı mı?" sorusu), veli (hafta özeti).
import { useState } from 'preact/hooks';
import { useApp, useAction, Icon, WaButton, Empty } from '../ui.jsx';
import { TR_DAYS_SHORT, fmtShort, addDays } from '../core/dates.js';
import { planOf, studyWeek, studyAsk, msgStudyDone, msgStudyNotDone } from '../core/calisma.js';

const MARK = { done: '✓', notdone: '✕', excused: 'M', ask: '?', waiting: '·', future: '·', none: '' };
const LABEL = { done: 'çalıştı', notdone: 'çalışmadı', excused: 'mazeretli', ask: 'sorulacak', waiting: 'bugün', future: '', none: '' };

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
                <div class="hint">Seçilen günün ertesinde Panel'de "çalıştı mı?" diye sorulur. Evet ya da Hayır dersiniz; veliye hazır WhatsApp mesajı açılır.</div>
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

/** Öğretmen paneli: "dün matematik çalışacaktı, çalıştı mı?" Evet → veliye "çalışmıştır", Hayır → "çalışmamıştır" */
export function StudyPanelSection() {
  const { data, now, store, reload } = useApp();
  const [run] = useAction();
  if (!(data.study_plans || []).some((p) => p.enabled)) return null;
  const asks = studyAsk(data, now);
  const byId = new Map(data.students.map((s) => [s.id, s]));
  const mark = (m, status) => run(async () => { await store.insert('study_logs', { student_id: m.student_id, date: m.date, status, note: '' }); await reload(); });
  const when = (d) => (d === addDays(now.date, -1) ? 'Dün' : `${fmtShort(d)} günü`);
  return (
    <section>
      <div class="section-head"><h2 class="section-title">Çalışma takibi</h2>{asks.length > 0 && <span class="chip bad">{asks.length}</span>}</div>
      <div class="card">
        {asks.length === 0 ? <Empty title="Sorulacak çalışma yok ✓">Çalışma günü geçen öğrenciler için ertesi gün "çalıştı mı?" sorusu burada çıkar.</Empty> : (
          <ul class="list">
            {asks.map((m) => {
              const phone = byId.get(m.student_id)?.parent_phone;
              return (
                <li key={m.key} class="stack">
                  <div class="item-title">{m.name} · {when(m.date)} matematik çalışacaktı</div>
                  <div class="small muted">Çalıştı mı? Cevabınıza göre veliye mesaj hazırlanır.</div>
                  <div class="row wrap">
                    <WaButton small phone={phone} text={msgStudyDone(m.name, m.date, now.date)} label="Evet, çalıştı" onSent={() => mark(m, 'done')} />
                    <WaButton small phone={phone} text={msgStudyNotDone(m.name, m.date, now.date)} label="Hayır, çalışmadı" onSent={() => mark(m, 'notdone')} />
                    <button class="btn small ghost" onClick={() => mark(m, 'excused')}>Mazeretli (mesaj yok)</button>
                  </div>
                </li>
              );
            })}
          </ul>
        )}
      </div>
    </section>
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

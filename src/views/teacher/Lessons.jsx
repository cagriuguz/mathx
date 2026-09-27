import { useMemo, useState } from 'preact/hooks';
import { useApp, Tabs, Icon, Empty, Field } from '../../ui.jsx';
import { lessonsFor, decorateLessons, notHeldReport, lessonSummary } from '../../core/lessons.js';
import { addDays, weekStart, fmtShort, fmtDate, TR_DAYS, monthKey, monthFirst, monthLast, dow } from '../../core/dates.js';
import { LessonRow, ExtraLessonSheet } from '../shared.jsx';

export function Lessons() {
  const [tab, setTab] = useState('week');
  return (
    <>
      <Tabs tabs={[['week', 'Takvim'], ['report', 'Ders Raporu']]} value={tab} onChange={setTab} />
      {tab === 'week' ? <Week /> : <Report />}
    </>
  );
}

function Week() {
  const { data, now } = useApp();
  const [monday, setMonday] = useState(weekStart(now.date));
  const [who, setWho] = useState('');
  const [adding, setAdding] = useState(false);
  const byId = useMemo(() => new Map(data.students.map((s) => [s.id, s])), [data.students]);
  const sunday = addDays(monday, 6);

  const lessons = useMemo(() => {
    const ss = data.students.filter((s) => (!who || s.id === who));
    return decorateLessons(ss.flatMap((s) => lessonsFor(s, data, monday, sunday)), data.marks, now);
  }, [data, monday, who, now]);

  const days = Array.from({ length: 7 }, (_, i) => addDays(monday, i));
  const notHeld = lessons.filter((l) => l.status === 'not_held').length;
  const extraN = lessons.filter((l) => l.extra).length;

  if (adding) return <ExtraLessonSheet studentId={who} onClose={() => setAdding(false)} />;

  return (
    <div class="stack">
      <div class="card card-pad spread">
        <button class="btn small" aria-label="Önceki hafta" onClick={() => setMonday(addDays(monday, -7))}><Icon name="back" /></button>
        <div style="text-align:center">
          <div class="num" style="font-size:19px">{fmtShort(monday)} – {fmtShort(sunday)}</div>
          <div class="small muted">{lessons.length} ders{extraN ? ` (${extraN} ek)` : ''}{notHeld ? `, ${notHeld} yapılmadı` : ''}</div>
        </div>
        <button class="btn small" aria-label="Sonraki hafta" onClick={() => setMonday(addDays(monday, 7))}><Icon name="chevron" /></button>
      </div>
      <div class="row">
        <select class="input grow" value={who} onChange={(e) => setWho(e.currentTarget.value)} aria-label="Öğrenci">
          <option value="">Tüm öğrenciler</option>
          {data.students.map((s) => <option key={s.id} value={s.id}>{s.name}{s.active === false ? ' (pasif)' : ''}</option>)}
        </select>
        {monday !== weekStart(now.date) && <button class="btn" onClick={() => setMonday(weekStart(now.date))}>Bu hafta</button>}
      </div>
      {data.students.length > 0 && <button class="btn" onClick={() => setAdding(true)}><Icon name="plus" /> Ek ders ekle</button>}
      <div class="card">
        {lessons.length === 0 ? <Empty title="Bu hafta ders yok">Öğrenci kartından ders günlerini ekleyebilirsiniz.</Empty> : days.map((d) => {
          const ls = lessons.filter((l) => l.date === d);
          if (!ls.length) return null;
          return (
            <div key={d}>
              <div class={`day-head${d === now.date ? ' today' : ''}`}>{TR_DAYS[dow(d) - 1]}, {fmtShort(d)}{d === now.date ? ' · bugün' : ''}</div>
              <ul class="list">{ls.map((l) => <li key={l.key}><LessonRow lesson={l} name={byId.get(l.student_id)?.name} /></li>)}</ul>
            </div>
          );
        })}
      </div>
    </div>
  );
}

function Report() {
  const { data, now } = useApp();
  const m = monthKey(now.date);
  const [from, setFrom] = useState(monthFirst(m));
  const [to, setTo] = useState(monthLast(m));
  const [who, setWho] = useState('');
  const [rows, setRows] = useState(null);
  const [sum, setSum] = useState(null);
  const [err, setErr] = useState('');

  const make = () => {
    if (!from || !to) return setErr('İki tarihi de seçin.');
    if (from > to) return setErr('Başlangıç tarihi bitişten sonra olamaz.');
    setErr('');
    const ss = data.students.filter((s) => !who || s.id === who);
    setRows(notHeldReport(ss, data.marks, from, to));
    setSum(lessonSummary(ss, data, from, to, now));
  };

  return (
    <div class="stack">
      <div class="card card-pad stack">
        <div class="grid2">
          <Field label="Başlangıç"><input class="input" type="date" value={from} onInput={(e) => setFrom(e.currentTarget.value)} /></Field>
          <Field label="Bitiş"><input class="input" type="date" value={to} onInput={(e) => setTo(e.currentTarget.value)} /></Field>
        </div>
        <Field label="Öğrenci">
          <select class="input" value={who} onChange={(e) => setWho(e.currentTarget.value)}>
            <option value="">Tüm öğrenciler</option>
            {data.students.map((s) => <option key={s.id} value={s.id}>{s.name}</option>)}
          </select>
        </Field>
        {err && <div class="error">{err}</div>}
        <button class="btn primary" onClick={make}><Icon name="report" /> Raporla</button>
      </div>
      {sum && (
        <div class="card">
          <div class="card-pad" style="padding-bottom:6px">
            <h2 class="section-title">Özet</h2>
            <div class="muted small">{fmtDate(from)} – {fmtDate(to)}</div>
          </div>
          <div class="figures" style="box-shadow:none">
            <div class="figure"><div class="v">{sum.done}</div><div class="l">Yapıldı{sum.extra ? ` (${sum.extra} ek)` : ''}</div></div>
            <div class="figure"><div class="v">{sum.not_held}</div><div class="l">Yapılmadı</div></div>
            <div class="figure"><div class="v">{sum.upcoming}</div><div class="l">Henüz gelmedi</div></div>
          </div>
          {sum.rows.length > 1 && (
            <ul class="list">
              {sum.rows.map((r) => (
                <li key={r.id} class="spread"><span>{r.name}</span>
                  <span class="small"><b>{r.done}</b> yapıldı{r.extra ? ` (${r.extra} ek)` : ''} · <b>{r.not_held}</b> yapılmadı{r.upcoming ? ` · ${r.upcoming} gelecek` : ''}</span></li>
              ))}
            </ul>
          )}
        </div>
      )}
      {rows && (
        <div class="card">
          <div class="card-pad" style="padding-bottom:6px">
            <h2 class="section-title">Yapılmayan dersler</h2>
            <div class="muted small">{fmtDate(from)} – {fmtDate(to)}</div>
          </div>
          {rows.length === 0 ? <Empty title="Bu aralıkta yapılmayan ders yok" /> : (
            <ul class="list">
              {rows.map((r) => (
                <li key={r.id}>
                  <div class="spread"><span class="item-title">{r.student_name}</span><span class="small muted" style="white-space:nowrap">{fmtDate(r.date)} · {r.time}</span></div>
                  <div class="item-sub">{r.reason}</div>
                </li>
              ))}
            </ul>
          )}
          {rows.length > 0 && <div class="card-pad small muted">Toplam {rows.length} ders yapılmadı.</div>}
        </div>
      )}
    </div>
  );
}

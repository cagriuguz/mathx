import { useMemo, useState } from 'preact/hooks';
import { useApp, Tabs, Icon, Empty, Field, StudentPicker } from '../../ui.jsx';
import { lessonsFor, decorateLessons, notHeldReport, lessonSummary } from '../../core/lessons.js';
import { addDays, weekStart, fmtShort, fmtDate, TR_DAYS, monthKey, monthFirst, monthLast, dow } from '../../core/dates.js';
import { LessonRow, ExtraLessonSheet } from '../shared.jsx';
import { studentPeriods, studentLedger, PLAN_TYPES, STATUS_LABEL } from '../../core/billing.js';
import { fmtTL, fmtHours } from '../../core/money.js';

const passive = (s) => (s.active === false ? ' (pasif)' : '');

export function Lessons() {
  const [tab, setTab] = useState('week');
  return (
    <>
      <Tabs tabs={[['week', 'Takvim'], ['student', 'Öğrenci'], ['report', 'Ders Raporu']]} value={tab} onChange={setTab} />
      {tab === 'week' ? <Week /> : tab === 'student' ? <StudentLedger /> : <Report />}
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
      <div class="row" style="align-items:flex-end">
        <div class="grow"><StudentPicker students={data.students} value={who} onChange={setWho} allLabel="Tüm öğrenciler" extra={passive} /></div>
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
        <StudentPicker label="Öğrenci" students={data.students} value={who} onChange={setWho} allLabel="Tüm öğrenciler" />
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

const STATUS_CHIP = { paid: 'ok', none: 'info', running: 'info', due: 'warn', late: 'bad' };

/** Tarih aralığı seçmeden tek öğrencinin ödeme dönemi dönemi ders durumu */
function StudentLedger() {
  const { data, now, settings } = useApp();
  const first = (data.students.find((s) => s.active !== false) || data.students[0])?.id || '';
  const [who, setWho] = useState(first);
  const [open, setOpen] = useState(0);
  const s = data.students.find((x) => x.id === who);
  const led = useMemo(() => (s ? studentLedger(s, data, studentPeriods(s, data, now.date, settings), now) : null), [s, data, now, settings]);

  if (!data.students.length) return <Empty title="Henüz öğrenci yok">Öğrenciler bölümünden ekleyebilirsiniz.</Empty>;
  return (
    <div class="stack">
      <StudentPicker students={data.students} value={who} onChange={(id) => { setWho(id); setOpen(0); }} extra={passive} />
      {led && (
        <div class="card">
          <div class="figures" style="box-shadow:none">
            <div class="figure"><div class="v">{led.done}</div><div class="l">Toplam yapılan</div></div>
            <div class="figure"><div class="v">{led.not_held}</div><div class="l">Yapılmadı</div></div>
          </div>
          <div class="card-pad small" style="padding-top:0">
            {led.last_payment
              ? <>Son ödeme <b>{fmtDate(led.last_payment.paid_date)}</b> · {fmtTL(led.last_payment.amount)}. O günden sonra <b>{led.done_since}</b> ders yapıldı.</>
              : 'Henüz ödeme alınmadı.'}
          </div>
        </div>
      )}
      {led && led.rows.length === 0 && <Empty title="Başlamış ödeme dönemi yok">Öğrenci kartından ders programı ve ücret ekleyin.</Empty>}
      {led && led.rows.map((r, i) => {
        const p = r.period;
        const pkg = p.type === 'oneoff' && p.package_hours > 0;
        return (
          <div class="card" key={p.key}>
            <button class="card-pad" style="display:block;width:100%;text-align:left;background:none;border:0;cursor:pointer;color:inherit;font:inherit" aria-expanded={open === i} onClick={() => setOpen(open === i ? -1 : i)}>
              <div class="spread">
                <div class="item-title">{fmtShort(p.start)} – {p.end ? fmtShort(p.end) : 'devam'}</div>
                <span class={`chip ${STATUS_CHIP[p.status] || ''}`}>{STATUS_LABEL[p.status]}</span>
              </div>
              <div>
                <div class="small muted">{PLAN_TYPES[p.type]} dönem · derslerini görmek için dokunun</div>
                <div class="small" style="margin-top:4px">
                  <b>{r.done}</b> ders yapıldı{r.extra ? ` (${r.extra} ek)` : ''}
                  {r.not_held ? <> · <b>{r.not_held}</b> yapılmadı</> : ''}
                  {r.upcoming ? <> · <b>{r.upcoming}</b> kaldı</> : ''}
                  {pkg ? <> · paket {fmtHours(p.used_hours)} / {fmtHours(p.package_hours)}</> : ''}
                </div>
                {(r.paid_on || p.remaining > 0) && (
                  <div class="small muted" style="margin-top:2px">
                    {p.status === 'paid' ? `Ödeme günü ${fmtDate(r.paid_on)}` : `${fmtTL(p.remaining)} ödenecek`}
                  </div>
                )}
              </div>
            </button>
            {open === i && (r.lessons.length === 0
              ? <div class="card-pad small muted">Bu dönemde ders yok.</div>
              : <ul class="list">{r.lessons.map((l) => <li key={l.key}><LessonRow lesson={l} name={`${TR_DAYS[dow(l.date) - 1]}, ${fmtShort(l.date)}`} /></li>)}</ul>)}
          </div>
        );
      })}
    </div>
  );
}

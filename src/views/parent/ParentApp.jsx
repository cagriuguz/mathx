// VELİ: yalnızca kendi öğrencisinin ödevleri, dersleri ve ödemeleri (veritabanı başka öğrenciyi hiç göndermez).
import { useMemo, useState } from 'preact/hooks';
import { Shell } from '../../app.jsx';
import { useApp, Icon, Empty } from '../../ui.jsx';
import { generateLessons, decorateLessons } from '../../core/lessons.js';
import { studentSummary, PAY_METHODS } from '../../core/billing.js';
import { addDays, fmtDate, fmtShort, TR_DAYS, dow } from '../../core/dates.js';
import { fmtTL } from '../../core/money.js';
import { PeriodBody, MissedList } from '../shared.jsx';
import { HomeworkCard } from '../student/StudentApp.jsx';

const NAV = [
  { key: 'hw', label: 'Ödevler', icon: 'book' },
  { key: 'lessons', label: 'Dersler', icon: 'calendar' },
  { key: 'pay', label: 'Ödemeler', icon: 'wallet' },
];

export function ParentApp() {
  const { data, logout, periods } = useApp();
  const [tab, setTab] = useState('hw');
  const s = data.students[0];
  if (!s) return <Shell title="MathX" actions={<button class="iconbtn" onClick={logout} aria-label="Çıkış"><Icon name="logout" /></button>}><div class="card"><Empty title="Kayıt bulunamadı">Öğretmeninize başvurun.</Empty></div></Shell>;
  const late = studentSummary(periods).late.length > 0;
  const nav = NAV.map((n) => ({ ...n, dot: n.key === 'pay' && late }));
  return (
    <Shell title={s.name} sub={NAV.find((n) => n.key === tab).label} nav={nav} current={tab} onNav={(k) => { setTab(k); window.scrollTo(0, 0); }}
      actions={<button class="iconbtn" onClick={logout} aria-label="Çıkış"><Icon name="logout" /></button>}>
      {tab === 'hw' && <ParentHomework />}
      {tab === 'lessons' && <ParentLessons s={s} />}
      {tab === 'pay' && <ParentPayments />}
    </Shell>
  );
}

function ParentHomework() {
  const { data } = useApp();
  const list = [...data.homework].sort((a, b) => Number(a.done) - Number(b.done) || b.given_date.localeCompare(a.given_date));
  if (!list.length) return <div class="card"><Empty title="Henüz ödev yok" /></div>;
  const open = list.filter((h) => !h.done).length;
  return (
    <div class="stack">
      <div class="card figures">
        <div class="figure"><div class="v" style="color:var(--madder)">{open}</div><div class="l">Yapılacak</div></div>
        <div class="figure"><div class="v" style="color:var(--sage)">{list.length - open}</div><div class="l">Yapıldı</div></div>
      </div>
      {list.map((h) => <HomeworkCard key={h.id} h={h} readOnly />)}
    </div>
  );
}

function ParentLessons({ s }) {
  const { data, now } = useApp();
  const lessons = useMemo(() => decorateLessons(generateLessons(s, data.schedules, addDays(now.date, -56), addDays(now.date, 14)), data.marks, now).reverse(), [data, now]);
  const past = lessons.filter((l) => l.status === 'done' || l.status === 'not_held');
  const next = lessons.filter((l) => l.status === 'today' || l.status === 'upcoming').reverse();
  const nh = past.filter((l) => l.status === 'not_held');
  return (
    <div class="stack">
      <div class="card figures">
        <div class="figure"><div class="v">{past.length - nh.length}</div><div class="l">Yapılan (son 8 hafta)</div></div>
        <div class="figure"><div class="v">{nh.length}</div><div class="l">Yapılmayan</div></div>
      </div>
      {next.length > 0 && (
        <>
          <div class="section-head"><h2 class="section-title">Yaklaşan dersler</h2></div>
          <div class="card"><ul class="list">
            {next.map((l) => <li key={l.key} class="spread"><span>{TR_DAYS[dow(l.date) - 1]}, {fmtShort(l.date)} · {l.time}</span><span class={`chip ${l.status === 'today' ? 'gold' : 'info'}`}>{l.status === 'today' ? 'Bugün' : 'Planlandı'}</span></li>)}
          </ul></div>
        </>
      )}
      <div class="section-head"><h2 class="section-title">Geçmiş dersler</h2></div>
      <div class="card">
        {past.length === 0 ? <Empty title="Henüz ders yok" /> : (
          <ul class="list">
            {past.map((l) => (
              <li key={l.key} class="spread">
                <div>
                  <div>{fmtDate(l.date, true)} · {l.time}</div>
                  {l.status === 'not_held' && <div class="item-sub">Gerekçe: {l.reason}</div>}
                </div>
                <span class={`chip ${l.status === 'done' ? 'ok' : 'bad'}`}>{l.status === 'done' ? 'Yapıldı' : 'Yapılmadı'}</span>
              </li>
            ))}
          </ul>
        )}
      </div>
    </div>
  );
}

function ParentPayments() {
  const { data, periods } = useApp();
  const sum = studentSummary(periods);
  const shown = periods.filter((p) => p.status !== 'future' && p !== sum.current).reverse();
  const history = data.payments.filter((p) => !p.deleted_at && p.method !== 'indirim').sort((a, b) => b.paid_date.localeCompare(a.paid_date));
  return (
    <div class="stack">
      <div class="card figures">
        <div class="figure"><div class="v" style={sum.open_total ? 'color:var(--madder)' : ''}>{fmtTL(sum.open_total)}</div><div class="l">Ödenecek tutar</div></div>
        <div class="figure"><div class="v">{sum.late.length ? `${Math.max(...sum.late.map((p) => p.days_past_due))} gün` : '—'}</div><div class="l">Gecikme</div></div>
      </div>
      {sum.current && (
        <>
          <div class="section-head"><h2 class="section-title">Şu anki dönem</h2></div>
          <div class="card">
            <div class="card-pad"><PeriodBody p={sum.current} showName={false} /></div>
            {sum.current.missed?.length > 0 && <div style="border-top:1px solid var(--line)"><div class="card-pad small muted" style="padding-bottom:0">Yapılmayan dersler tutardan düşüldü</div><MissedList missed={sum.current.missed} /></div>}
          </div>
        </>
      )}
      <div class="section-head"><h2 class="section-title">Önceki dönemler</h2></div>
      <div class="card">
        {shown.length === 0 ? <Empty title="Henüz dönem yok" /> : (
          <ul class="list">{shown.map((p) => <li key={p.key} class="stack"><PeriodBody p={p} showName={false} />{p.missed?.length > 0 && <MissedList missed={p.missed} />}</li>)}</ul>
        )}
      </div>
      <div class="section-head"><h2 class="section-title">Yapılan ödemeler</h2></div>
      <div class="card">
        {history.length === 0 ? <Empty title="Ödeme kaydı yok" /> : (
          <ul class="list">{history.map((p) => <li key={p.id} class="spread"><span>{fmtDate(p.paid_date)} <span class="muted small">· {PAY_METHODS[p.method] || p.method}</span></span><span class="num">{fmtTL(p.amount)}</span></li>)}</ul>
        )}
      </div>
    </div>
  );
}

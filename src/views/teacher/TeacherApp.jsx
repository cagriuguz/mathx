import { useEffect, useMemo, useRef, useState } from 'preact/hooks';
import { Shell, todayLabel } from '../../app.jsx';
import { useApp, useAction, Icon, WaButton, Empty } from '../../ui.jsx';
import { lessonsFor, decorateLessons } from '../../core/lessons.js';
import { isOpen } from '../../core/billing.js';
import { msgHomeworkDone, msgPaymentLate, msgPackageFull } from '../../core/messages.js';
import { fmtTL } from '../../core/money.js';
import { monthKey, fmtDate } from '../../core/dates.js';
import { buildNotifications } from '../../core/notify.js';
import { LessonRow, PeriodBody } from '../shared.jsx';
import { Lessons } from './Lessons.jsx';
import { Students } from './Students.jsx';
import { Homework } from './Homework.jsx';
import { Money, PaymentSheet } from './Money.jsx';
import { Settings } from './Settings.jsx';

const NAV = [
  { key: 'panel', label: 'Panel', icon: 'home', title: 'Günaydın' },
  { key: 'lessons', label: 'Dersler', icon: 'calendar', title: 'Dersler' },
  { key: 'students', label: 'Öğrenciler', icon: 'users', title: 'Öğrenciler' },
  { key: 'homework', label: 'Ödevler', icon: 'book', title: 'Ödevler' },
  { key: 'money', label: 'Para', icon: 'wallet', title: 'Para' },
];

function greeting(time) {
  const h = Number(time.slice(0, 2));
  return h < 5 ? 'İyi geceler' : h < 12 ? 'Günaydın' : h < 18 ? 'İyi günler' : 'İyi akşamlar';
}

export function TeacherApp() {
  const { data, periods, toast, now } = useApp();
  const [tab, setTab] = useState(() => { try { return sessionStorage.getItem('mathx.tab') || 'panel'; } catch { return 'panel'; } });
  const [settingsOpen, setSettingsOpen] = useState(false);
  const go = (k) => { setTab(k); try { sessionStorage.setItem('mathx.tab', k); } catch {} window.scrollTo(0, 0); };

  // Uygulama açıkken öğrenci ödevini işaretlerse anında haber ver
  const seen = useRef(null);
  const doneIds = data.homework.filter((h) => h.done && !h.seen_done).map((h) => h.id);
  useEffect(() => {
    if (seen.current) {
      const fresh = doneIds.filter((id) => !seen.current.includes(id));
      if (fresh.length) {
        const h = data.homework.find((x) => x.id === fresh[0]);
        const s = data.students.find((x) => x.id === h?.student_id);
        toast(`${s?.name || 'Bir öğrenci'} ödevini yaptı`);
      }
    }
    seen.current = doneIds;
  }, [doneIds.join()]);

  const lateCount = periods.filter((p) => isOpen(p) && p.status === 'late').length;
  const notifCount = buildNotifications(data, periods, now.date).count;
  const nav = NAV.map((n) => ({ ...n, dot: (n.key === 'panel' && notifCount > 0) || (n.key === 'homework' && doneIds.length > 0) || (n.key === 'money' && lateCount > 0) }));
  const cur = NAV.find((n) => n.key === tab) || NAV[0];

  return (
    <Shell
      title={tab === 'panel' ? `${greeting(now.time)}${data.settings?.[0]?.teacher_name ? ', ' + data.settings[0].teacher_name.split(' ')[0] : ''}` : cur.title}
      sub={todayLabel(now)}
      nav={nav} current={tab} onNav={go}
      actions={<button class="iconbtn" aria-label="Ayarlar" onClick={() => setSettingsOpen(true)}><Icon name="gear" /></button>}
    >
      {tab === 'panel' && <Panel go={go} />}
      {tab === 'lessons' && <Lessons />}
      {tab === 'students' && <Students />}
      {tab === 'homework' && <Homework />}
      {tab === 'money' && <Money />}
      {settingsOpen && <Settings onClose={() => setSettingsOpen(false)} />}
    </Shell>
  );
}

function Panel({ go }) {
  const { data, periods, now, store, reload } = useApp();
  const [run] = useAction();
  const [paying, setPaying] = useState(null);
  const byId = useMemo(() => new Map(data.students.map((s) => [s.id, s])), [data.students]);

  const todays = useMemo(() => {
    const ls = data.students.filter((s) => s.active !== false).flatMap((s) => lessonsFor(s, data, now.date, now.date));
    return decorateLessons(ls, data.marks, now).sort((a, b) => a.time.localeCompare(b.time));
  }, [data, now]);

  const open = periods.filter(isOpen).sort((a, b) => (a.status === b.status ? a.due.localeCompare(b.due) : a.status === 'late' ? -1 : 1));
  const openTotal = open.reduce((a, p) => a + p.remaining, 0);
  const notif = buildNotifications(data, periods, now.date);
  const upcomingPay = open.filter((p) => p.status !== 'late');
  const month = monthKey(now.date);
  const monthIncome = data.payments.filter((p) => !p.deleted_at && p.method !== 'indirim' && p.paid_date.startsWith(month)).reduce((a, p) => a + p.amount, 0);
  const activeCount = data.students.filter((s) => s.active !== false).length;

  const markSeen = (h, sent) => run(async () => { await store.update('homework', h.id, sent ? { seen_done: true, sent_done: true } : { seen_done: true }); await reload(); });

  if (!data.students.length) {
    return (
      <div class="card">
        <Empty title="İlk öğrencinizi ekleyin" action={<button class="btn primary" onClick={() => go('students')}><Icon name="plus" /> Öğrenci ekle</button>}>
          Ders günleri ve ücret girildiğinde ders takvimi ve ödemeler kendiliğinden hesaplanır.
        </Empty>
      </div>
    );
  }

  return (
    <div class="stack-lg">
      <div class="card figures">
        <div class="figure"><div class="v">{todays.length}</div><div class="l">Bugünkü ders</div></div>
        <div class="figure"><div class="v">{fmtTL(openTotal)}</div><div class="l">Tahsil edilecek</div></div>
        <div class="figure"><div class="v">{fmtTL(monthIncome)}</div><div class="l">Bu ay alınan</div></div>
        <div class="figure"><div class="v">{activeCount}</div><div class="l">Aktif öğrenci</div></div>
      </div>

      <section>
        <div class="section-head"><h2 class="section-title">Bildirimler</h2>{notif.count > 0 && <span class="chip bad">{notif.count}</span>}</div>
        <div class="card">
          {notif.count === 0 ? <Empty title="Yeni bildirim yok ✓">Öğrenci ödevini işaretleyince, ödev ya da ödeme gecikince burada görünür.</Empty> : (
            <ul class="list">
              {notif.doneHw.map((h) => {
                const s = byId.get(h.student_id);
                const text = msgHomeworkDone(s.name, h.items);
                return (
                  <li key={'d' + h.id} class="stack">
                    <div class="spread"><span class="item-title">{s.name}</span><span class="chip ok">Ödevini yaptı</span></div>
                    <div class="msg">{text}</div>
                    <div class="row wrap">
                      {h.wa_done_at
                        ? <span class="chip ok">Size ve veliye otomatik gönderildi ✓</span>
                        : <WaButton small phone={s.parent_phone} text={text} label="Veliye gönder" onSent={() => markSeen(h, true)} />}
                      <button class="btn small" onClick={() => markSeen(h, false)}>Gördüm</button>
                    </div>
                  </li>
                );
              })}
              {notif.lateHw.map((h) => (
                <li key={'l' + h.id} class="stack">
                  <div class="spread"><span class="item-title">{byId.get(h.student_id).name}</span><span class="chip bad">Ödevi gecikti</span></div>
                  <div class="small">{h.items.map((i) => `${i.book_name} (${i.pages})`).join(', ')}</div>
                  <div class="spread small muted"><span>Son gün {fmtDate(h.due_date)} · {h.days_late} gün geçti</span>
                    <button class="btn small ghost" onClick={() => go('homework')}>Ödevlere git</button></div>
                </li>
              ))}
              {notif.latePay.map((p) => {
                const s = byId.get(p.student_id);
                return (
                  <li key={'p' + p.key} class="stack">
                    <PeriodBody p={p} />
                    <div class="row wrap">
                      <button class="btn small primary" onClick={() => setPaying(p)}>Ödeme al</button>
                      <WaButton small phone={s.parent_phone} text={msgPaymentLate(p)} label="Hatırlat" />
                    </div>
                  </li>
                );
              })}
            </ul>
          )}
        </div>
      </section>

      <section>
        <div class="section-head"><h2 class="section-title">Bugünün dersleri</h2><button class="btn small ghost" onClick={() => go('lessons')}>Takvim</button></div>
        <div class="card">
          {todays.length ? (
            <ul class="list">{todays.map((l) => <li key={l.key}><LessonRow lesson={l} name={byId.get(l.student_id)?.name} /></li>)}</ul>
          ) : <Empty title="Bugün ders yok">Haftalık programdaki bir sonraki ders Dersler sekmesinde.</Empty>}
        </div>
      </section>

      <section>
        <div class="section-head"><h2 class="section-title">Vadesi gelen ödemeler</h2>{upcomingPay.length > 0 && <span class="num muted">{fmtTL(upcomingPay.reduce((a, p) => a + p.remaining, 0))}</span>}</div>
        <div class="card">
          {upcomingPay.length ? (
            <ul class="list">
              {upcomingPay.map((p) => {
                const s = byId.get(p.student_id);
                return (
                  <li key={p.key} class="stack">
                    <PeriodBody p={p} />
                    <div class="row wrap">
                      <button class="btn small primary" onClick={() => setPaying(p)}>Ödeme al</button>
                      {p.status === 'late'
                        ? <WaButton small phone={s.parent_phone} text={msgPaymentLate(p)} label="Hatırlat" />
                        : <WaButton small phone={s.parent_phone} text={msgPackageFull(p)} label="Paket doldu mesajı" />}
                    </div>
                  </li>
                );
              })}
            </ul>
          ) : <Empty title="Vadesi gelen ödeme yok">Geciken ödemeler yukarıda, Bildirimler'de görünür.</Empty>}
        </div>
      </section>
      {paying && <PaymentSheet period={paying} onClose={() => setPaying(null)} />}
    </div>
  );
}

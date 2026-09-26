import { useEffect, useMemo, useState } from 'preact/hooks';
import { AppCtx, Icon, useToast } from './ui.jsx';
import { createStore } from './store/index.js';
import { localNow, fmtDate } from './core/dates.js';
import { allPeriods } from './core/billing.js';
import { DEFAULT_SETTINGS, cleanUsername, checkUsername } from './store/common.js';
import { Login } from './views/Login.jsx';
import { TeacherApp } from './views/teacher/TeacherApp.jsx';
import { ParentApp } from './views/parent/ParentApp.jsx';
import { StudentApp } from './views/student/StudentApp.jsx';

try { const t = localStorage.getItem('mathx.theme'); if (t) document.documentElement.dataset.theme = t; } catch {}

export function App() {
  const [store, setStore] = useState(null);
  const [session, setSession] = useState(undefined);
  const [data, setData] = useState(null);
  const [now, setNow] = useState(localNow());
  const [toastMsg, toast] = useToast();
  const [fatal, setFatal] = useState(null);

  useEffect(() => {
    (async () => {
      try {
        const s = await createStore();
        setStore(s);
        setSession(await s.init());
      } catch (e) { setFatal(e.message); }
    })();
    const t = setInterval(() => setNow(localNow()), 30000);
    return () => clearInterval(t);
  }, []);

  const reload = async () => { if (store) setData(await store.load()); };

  useEffect(() => {
    if (!store || !session) { setData(null); return; }
    reload().catch((e) => toast(e.message));
    const off = store.subscribe(() => reload().catch(() => {}));
    const vis = () => document.visibilityState === 'visible' && reload().catch(() => {});
    document.addEventListener('visibilitychange', vis);
    return () => { off(); document.removeEventListener('visibilitychange', vis); };
  }, [store, session]);

  const settings = useMemo(() => ({ ...DEFAULT_SETTINGS, ...(data?.settings?.[0] || {}) }), [data]);
  const periods = useMemo(() => (data && session && session.role !== 'student' ? allPeriods(data, now.date, settings) : []), [data, now.date, settings]);

  if (fatal) return <div class="login"><div class="panel"><p>Program açılamadı: {fatal}</p></div></div>;
  if (!store || session === undefined) return <div class="login"><img class="logo" src="./logo.svg" alt="" /></div>;
  if (!session) return <AppCtx.Provider value={{ store, toast }}><Login onLogin={setSession} />{toastMsg && <div class="toast">{toastMsg}</div>}</AppCtx.Provider>;

  const logout = async () => { await store.logout(); setSession(null); };
  const ctx = { store, session, data, reload, now, settings, periods, toast, logout };

  return (
    <AppCtx.Provider value={ctx}>
      {!data ? <div class="login"><img class="logo" src="./logo.svg" alt="" /></div>
        : session.role === 'teacher' ? <TeacherApp />
        : session.role === 'parent' ? <ParentApp />
        : <StudentApp />}
      {toastMsg && <div class="toast" role="status">{toastMsg}</div>}
    </AppCtx.Provider>
  );
}

/** Ortak sayfa kabuğu: kareli başlık bandı + menü */
export function Shell({ title, sub, nav, current, onNav, actions, children }) {
  return (
    <div class="shell">
      {nav && (
        <nav class="nav" aria-label="Ana menü">
          <div class="navbrand"><img src="./logo.svg" alt="" />MathX</div>
          {nav.map((n) => (
            <button key={n.key} aria-current={current === n.key ? 'page' : undefined} onClick={() => onNav(n.key)}>
              <Icon name={n.icon} /> <span>{n.label}</span>
              {n.dot && <span class="dot" aria-label="yeni" />}
            </button>
          ))}
        </nav>
      )}
      <div>
        <header class="band">
          <div class="top">
            <div class="brand"><img src="./logo.svg" alt="" />MathX</div>
            <div class="row">{actions}</div>
          </div>
          <h1>{title}</h1>
          {sub && <div class="sub">{sub}</div>}
        </header>
        <main class="main"><div class="content">{children}</div></main>
      </div>
    </div>
  );
}

export const todayLabel = (now) => fmtDate(now.date, true);
export { cleanUsername, checkUsername };

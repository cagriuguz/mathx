import { useEffect, useState } from 'preact/hooks';
import { useApp, Field } from '../ui.jsx';
import { cleanUsername, checkUsername } from '../store/common.js';

export function Login({ onLogin }) {
  const { store } = useApp();
  const [u, setU] = useState('');
  const [p, setP] = useState('');
  const [p2, setP2] = useState('');
  const [err, setErr] = useState('');
  const [busy, setBusy] = useState(false);
  const [setup, setSetup] = useState(false);

  useEffect(() => {
    if (store.mode === 'online') store.teacherExists().then((x) => setSetup(!x)).catch((e) => setErr(e.message));
  }, []);

  const submit = async (e) => {
    e.preventDefault();
    setErr('');
    const name = cleanUsername(u);
    if (!name || !p) return setErr('Kullanıcı adı ve şifreyi yazın.');
    setBusy(true);
    try {
      if (setup) {
        const bad = checkUsername(name);
        if (bad) throw new Error(bad);
        if (p.length < 8) throw new Error('Şifre en az 8 karakter olmalı.');
        if (p !== p2) throw new Error('İki şifre aynı değil.');
        onLogin(await store.setupTeacher(name, p));
      } else {
        onLogin(await store.login(name, p));
      }
    } catch (x) { setErr(x.message); }
    finally { setBusy(false); }
  };

  return (
    <div class="login">
      <div class="panel">
        <img class="logo" src="./logo.svg" alt="" />
        <h1>MathX</h1>
        <p class="tag">{setup ? 'İlk kurulum: öğretmen hesabınızı oluşturun' : 'Ders, ödev ve ödeme takibi'}</p>
        <form onSubmit={submit}>
          <Field label="Kullanıcı adı">
            <input class="input" autocomplete="username" autocapitalize="none" value={u} onInput={(e) => setU(e.currentTarget.value)} />
          </Field>
          <Field label="Şifre">
            <input class="input" type="password" autocomplete={setup ? 'new-password' : 'current-password'} value={p} onInput={(e) => setP(e.currentTarget.value)} />
          </Field>
          {setup && (
            <Field label="Şifre (tekrar)">
              <input class="input" type="password" autocomplete="new-password" value={p2} onInput={(e) => setP2(e.currentTarget.value)} />
            </Field>
          )}
          {err && <div class="error" role="alert">{err}</div>}
          <button class="btn primary block" disabled={busy}>{busy ? 'Bekleyin…' : setup ? 'Öğretmen hesabını oluştur' : 'Giriş yap'}</button>
        </form>
        {store.mode === 'demo' && (
          <div class="demo">
            Deneme modu: veriler yalnızca bu cihazda.<br />
            Öğretmen <code>ogretmen</code> / <code>deneme123</code><br />
            Veli <code>deniz.veli</code> / <code>veli123</code> · Öğrenci <code>deniz</code> / <code>ogrenci123</code>
          </div>
        )}
      </div>
    </div>
  );
}

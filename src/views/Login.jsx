import { useEffect, useState } from 'preact/hooks';
import { useApp, Field } from '../ui.jsx';
import { cleanUsername, checkUsername } from '../store/common.js';
import { installKind, canPrompt, promptInstall, onInstallChange } from '../core/install.js';

// Telefonda tarayıcıdan açılınca: "MathX'i ana ekrana ekle" (Android'de tek dokunuş, iPhone'da kısa tarif)
function InstallHint() {
  const [kind] = useState(() => { try { return installKind(); } catch { return null; } });
  const [, tick] = useState(0);
  const [open, setOpen] = useState(false);
  useEffect(() => onInstallChange(() => tick((n) => n + 1)), []);
  if (!kind) return null;
  const share = <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" style="vertical-align:-3px"><path d="M12 3v12M7 8l5-5 5 5M5 12v8h14v-8" /></svg>;
  return (
    <div class="install">
      <img src="./icon-192.png" alt="" />
      <div class="grow">
        <b>MathX'i ana ekrana ekleyin</b>
        <div class="small">Simgesine dokunup uygulama gibi açın; güncellemeler kendiliğinden gelir.</div>
        {kind === 'android' && canPrompt() && <button type="button" class="btn primary block" onClick={promptInstall}>MathX'i yükle</button>}
        {kind === 'android' && !canPrompt() && <div class="steps">Chrome'da sağ üstteki <b>⋮</b> menüsüne, sonra <b>Ana ekrana ekle</b>'ye (ya da <b>Uygulamayı yükle</b>'ye) dokunun.</div>}
        {kind === 'ios-other' && <div class="steps">Bu sayfayı <b>Safari</b>'de açın (bağlantıyı basılı tutup "Safari'de aç"), sonra oradan ana ekrana ekleyin.</div>}
        {kind === 'ios-safari' && (open
          ? <ol class="steps"><li>Alttaki <b>Paylaş</b> {share} düğmesine dokunun.</li><li>Listeden <b>Ana Ekrana Ekle</b>'yi seçin.</li><li>Sağ üstte <b>Ekle</b>'ye dokunun.</li></ol>
          : <button type="button" class="btn primary small" onClick={() => setOpen(true)}>Nasıl eklenir?</button>)}
      </div>
    </div>
  );
}

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
        <InstallHint />
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

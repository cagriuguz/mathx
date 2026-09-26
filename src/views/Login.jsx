import { useEffect, useState } from 'preact/hooks';
import { useApp, Field } from '../ui.jsx';
import { cleanUsername, checkUsername } from '../store/common.js';
import { Kurulum } from './Kurulum.jsx';
import { readConn, wantsSetup } from '../store/conn.js';
import { installKind, canPrompt, promptInstall, onInstallChange, wasInstalled } from '../core/install.js';

const I = {
  share: <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M12 3v12M7 8l5-5 5 5M5 12v8h14v-8" /></svg>,
  dots: <svg viewBox="0 0 24 24" fill="currentColor"><circle cx="5" cy="12" r="2" /><circle cx="12" cy="12" r="2" /><circle cx="19" cy="12" r="2" /></svg>,
  vdots: <svg viewBox="0 0 24 24" fill="currentColor"><circle cx="12" cy="5" r="2" /><circle cx="12" cy="12" r="2" /><circle cx="12" cy="19" r="2" /></svg>,
  plus: <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"><rect x="4" y="4" width="16" height="16" rx="4" /><path d="M12 8v8M8 12h8" /></svg>,
  tap: <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M20 6 9 17l-5-5" /></svg>,
  safari: <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="9" /><path d="m15.5 8.5-2 5-5 2 2-5z" /></svg>,
  book: <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><path d="M4 5a2 2 0 0 1 2-2h13v16H6a2 2 0 0 0-2 2z" /><path d="M4 19V5M9 7h6" /></svg>,
  cal: <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><rect x="3" y="5" width="18" height="16" rx="3" /><path d="M3 10h18M8 3v4M16 3v4" /></svg>,
  wallet: <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><path d="M4 7a2 2 0 0 1 2-2h12v4" /><rect x="3" y="9" width="18" height="11" rx="2.5" /><circle cx="16" cy="14.5" r="1.3" fill="currentColor" /></svg>,
};

const Step = ({ n, icon, children }) => (
  <li class="wstep"><span class="wn">{n}</span><span class="wtxt">{children}</span>{icon && <span class="wico">{icon}</span>}</li>
);

// Telefonda tarayıcıdan açılınca ilk ekran: MathX'i ana ekrana yükletir (Android'de tek dokunuş, iPhone'da resimli tarif).
function Welcome({ kind, onSkip }) {
  const [, tick] = useState(0);
  const [copied, setCopied] = useState(false);
  useEffect(() => onInstallChange(() => tick((n) => n + 1)), []);
  const copy = async () => {
    try { await navigator.clipboard.writeText(location.href); setCopied(true); } catch { setCopied(false); }
  };
  const done = wasInstalled();
  return (
    <div class="welcome">
      <div class="wpanel">
        <div class="wicon"><img src="./icon-512.png" alt="MathX" /></div>
        <h1>MathX</h1>
        <p class="wtag">Ders, ödev ve ödeme takibi<br />her an cebinizde</p>
        <ul class="wfeat">
          <li><span>{I.book}</span>Ödevler</li>
          <li><span>{I.cal}</span>Dersler</li>
          <li><span>{I.wallet}</span>Ödemeler</li>
        </ul>

        <div class="wcard">
          {done ? (
            <div class="wdone">
              <div class="wok">{I.tap}</div>
              <b>MathX ana ekranınıza eklendi</b>
              <p>Şimdi ana ekrandaki <b>MathX</b> simgesine dokunun ve kullanıcı adınızla giriş yapın.</p>
            </div>
          ) : kind === 'android' ? (
            <>
              <b class="wh">Ana ekrana yükleyin</b>
              {canPrompt()
                ? <><p class="wsub">Tek dokunuşla yüklenir; simgesinden uygulama gibi açılır.</p><button type="button" class="wbtn" onClick={promptInstall}>MathX'i yükle</button></>
                : <ol class="wsteps">
                    <Step n="1" icon={I.vdots}>Sağ üstteki <b>⋮</b> menüsüne dokunun.</Step>
                    <Step n="2" icon={I.plus}><b>Uygulamayı yükle</b> ya da <b>Ana ekrana ekle</b>'yi seçin.</Step>
                    <Step n="3" icon={I.tap}><b>Yükle</b>'ye dokunun.</Step>
                  </ol>}
            </>
          ) : kind === 'android-inapp' ? (
            <>
              <b class="wh">Önce Chrome'da açın</b>
              <ol class="wsteps">
                <Step n="1" icon={I.vdots}>Sağ üstteki <b>⋮</b> menüsüne dokunun.</Step>
                <Step n="2"><b>Chrome'da aç</b> (ya da <b>Tarayıcıda aç</b>) seçin.</Step>
                <Step n="3" icon={I.plus}>Açılan sayfada <b>MathX'i yükle</b>'ye dokunun.</Step>
              </ol>
            </>
          ) : kind === 'ios-other' ? (
            <>
              <b class="wh">Safari'de açın</b>
              <p class="wsub">iPhone'da ana ekrana ekleme Safari'den yapılır.</p>
              <button type="button" class="wbtn" onClick={copy}>{copied ? 'Bağlantı kopyalandı ✓' : 'Bağlantıyı kopyala'}</button>
              <ol class="wsteps">
                <Step n="1" icon={I.safari}><b>Safari</b>'yi açın.</Step>
                <Step n="2">Adres çubuğuna dokunup <b>Yapıştır ve Git</b>'i seçin.</Step>
              </ol>
            </>
          ) : (
            <>
              <b class="wh">Ana ekrana ekleyin</b>
              <ol class="wsteps">
                <Step n="1" icon={I.share}>Alttaki <b>Paylaş</b> düğmesine dokunun. Görmüyorsanız önce <b>•••</b> düğmesine dokunun.</Step>
                <Step n="2" icon={I.plus}>Listeden <b>Ana Ekrana Ekle</b>'yi seçin. Yoksa listeyi aşağı kaydırın.</Step>
                <Step n="3" icon={I.tap}>Sağ üstte <b>Ekle</b>'ye dokunun.</Step>
              </ol>
            </>
          )}
        </div>
        <p class="wnote">Simgeden açınca uygulama gibi tam ekran çalışır; internet üzerinden öğretmeninizle anında eşitlenir, güncellemeler kendiliğinden gelir.</p>
        <button type="button" class="wskip" onClick={onSkip}>{done ? 'Burada devam et' : 'Yüklemeden devam et'}</button>
      </div>
    </div>
  );
}

// Veli/öğrenci öğretmeninin linkiyle geldiyse (db=...) bağlantı ayarını görmesin
const viaLink = () => { try { return new URLSearchParams(location.search).has('db'); } catch { return false; } };

const SKIP_KEY = 'mathx_kurulum_gec';
const readSkip = () => { try { return sessionStorage.getItem(SKIP_KEY) === '1'; } catch { return false; } };

export function Login({ onLogin }) {
  const { store } = useApp();
  const [u, setU] = useState('');
  const [p, setP] = useState('');
  const [p2, setP2] = useState('');
  const [err, setErr] = useState('');
  const [busy, setBusy] = useState(false);
  const [setup, setSetup] = useState(false);
  // Geliştirirken ?onizle=ios-safari|ios-other|android|android-inapp ile ekran önizlenir (yayında etkisiz)
  const [kind] = useState(() => { try { return (import.meta.env.DEV && new URLSearchParams(location.search).get('onizle')) || installKind(); } catch { return null; } });
  const [skip, setSkip] = useState(readSkip);
  // Arkadaş öğretmen: "?kur" linkiyle gelip henüz kendi veritabanına bağlanmadıysa kurulum ekranı açılır
  const [kur, setKur] = useState(() => store.mode === 'online' && wantsSetup() && !readConn());

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

  if (kur && !(kind && !skip)) return <Kurulum custom={!!store.custom} onCancel={() => setKur(false)} />;
  if (kind && !skip) return <Welcome kind={kind} onSkip={() => { try { sessionStorage.setItem(SKIP_KEY, '1'); } catch {} setSkip(true); }} />;

  return (
    <div class="login">
      <div class="panel">
        <img class="logo" src="./logo.svg" alt="" />
        <h1>MathX</h1>
        <p class="tag">{setup ? 'İlk kurulum: öğretmen hesabınızı oluşturun' : 'Ders, ödev ve ödeme takibi'}</p>
        {kind && <button type="button" class="wback" onClick={() => setSkip(false)}>MathX'i ana ekrana yükle</button>}
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
        {store.mode === 'online' && (setup || (store.custom && !viaLink()) || wantsSetup()) && (
          <button type="button" class="klink" onClick={() => setKur(true)}>{store.custom ? 'Veritabanı bağlantısı' : 'Öğretmen misiniz? Kendi MathX\'inizi kurun'}</button>
        )}
      </div>
    </div>
  );
}

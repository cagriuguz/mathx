import { useState } from 'preact/hooks';
import SQL from '../../supabase/kurulum.sql?raw';
import { parseConn, checkKey, connUrl, saveConn, clearConn } from '../store/conn.js';

// Arkadaş öğretmen: "Kendi MathX'ini kur". Supabase'te kendi projesini açar, kurulum kodunu çalıştırır,
// bağlantı bilgisini buraya yapıştırır. Verisi yalnız kendi projesinde durur; başka öğretmenle hiçbir bağı yoksa.
const DASH = 'https://supabase.com/dashboard';
const LINKS = {
  start: `${DASH}/projects`,
  sql: `${DASH}/project/_/sql/new`,
  auth: `${DASH}/project/_/auth/providers`,
};

const open = (url) => window.open(url, '_blank', 'noopener');

export function Kurulum({ custom, onCancel }) {
  const [copied, setCopied] = useState(false);
  const [text, setText] = useState('');
  const [err, setErr] = useState('');
  const [busy, setBusy] = useState(false);
  const c = parseConn(text);
  const keyErr = c.key ? checkKey(c.key) : null;

  const copySql = async () => {
    try { await navigator.clipboard.writeText(SQL); setCopied(true); }
    catch { setErr('Kopyalanamadı. Tekrar dokunun.'); }
  };
  const paste = async () => {
    try { const t = await navigator.clipboard.readText(); setText((x) => (x ? x + '\n' : '') + t); setErr(''); }
    catch { setErr('Kutucuğa basılı tutup "Yapıştır" deyin.'); }
  };
  const connect = async () => {
    setErr('');
    if (!c.ref) return setErr('Proje adresi (https://....supabase.co) bulunamadı. Supabase\'te "Connect" penceresinden kopyalayıp yapıştırın.');
    if (keyErr || !c.key) return setErr(keyErr || 'Anahtar bulunamadı. "sb_publishable_" ile başlayan anahtarı da yapıştırın.');
    setBusy(true);
    try {
      const { probeConn } = await import('../store/supabase.js');
      await probeConn(connUrl(c), c.key);
      saveConn(c);
      // Bağlantı linkte değil cihazda saklandı: adresi sade hale getirip programı yeni veritabanıyla aç
      location.replace(location.pathname);
    } catch (e) { setErr(e.message); setBusy(false); }
  };

  return (
    <div class="welcome">
      <div class="wpanel kurulum">
        <div class="wicon"><img src="./icon-512.png" alt="MathX" /></div>
        <h1>Kendi MathX'in</h1>
        <p class="wtag">Verilerin yalnızca <b>senin</b> Supabase hesabında durur.<br />Kimseyle paylaşılmaz.</p>

        <ol class="wsteps ksteps">
          <li class="wstep"><span class="wn">1</span><span class="wtxt"><b>Supabase</b>'te ücretsiz hesap ve <b>New project</b> aç (adı MathX, bölge Frankfurt).
            <button type="button" class="kbtn" onClick={() => open(LINKS.start)}>Supabase'i aç</button></span></li>
          <li class="wstep"><span class="wn">2</span><span class="wtxt">Kurulum kodunu kopyala, Supabase'te <b>SQL Editor</b>'e yapıştır, <b>Run</b>'a dokun.
            <button type="button" class="kbtn" onClick={copySql}>{copied ? 'Kopyalandı ✓' : 'Kurulum kodunu kopyala'}</button>
            <button type="button" class="kbtn ghost" onClick={() => open(LINKS.sql)}>SQL Editor'ü aç</button></span></li>
          <li class="wstep"><span class="wn">3</span><span class="wtxt"><b>Confirm email</b> düğmesini kapat, <b>Save changes</b>'e dokun.
            <button type="button" class="kbtn ghost" onClick={() => open(LINKS.auth)}>Ayarı aç</button></span></li>
          <li class="wstep"><span class="wn">4</span><span class="wtxt">Supabase'te üstteki <b>Connect</b>'e dokun; adresi ve <b>publishable</b> anahtarı kopyalayıp buraya yapıştır.</span></li>
        </ol>

        <div class="wcard kcard">
          <textarea class="input ktext" rows="4" placeholder={'https://....supabase.co\nsb_publishable_....'} value={text}
            autocapitalize="none" autocomplete="off" spellcheck={false} onInput={(e) => { setText(e.currentTarget.value); setErr(''); }} />
          <div class="kchk">
            <span class={c.ref ? 'on' : ''}>{c.ref ? '✓' : '○'} Adres</span>
            <span class={c.key && !keyErr ? 'on' : keyErr ? 'bad' : ''}>{c.key && !keyErr ? '✓' : keyErr ? '✕' : '○'} Anahtar</span>
          </div>
          <button type="button" class="kbtn ghost" onClick={paste}>Yapıştır</button>
          {err && <div class="error" role="alert">{err}</div>}
          <button type="button" class="wbtn" disabled={busy} onClick={connect}>{busy ? 'Deneniyor…' : 'Bağlan'}</button>
        </div>

        {custom && <button type="button" class="wskip" onClick={() => { if (confirm('Bu cihaz kendi veritabanından ayrılsın mı? (Verilerin silinmez, Supabase\'te durur.)')) { clearConn(); location.replace(location.pathname); } }}>Bu cihazın bağlantısını kaldır</button>}
        <button type="button" class="wskip" onClick={onCancel}>Geri dön</button>
      </div>
    </div>
  );
}

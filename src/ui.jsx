import { createContext } from 'preact';
import { useContext, useEffect, useState } from 'preact/hooks';
import { waLink, waHref, isIOS, isValidPhone } from './core/messages.js';

export const AppCtx = createContext(null);
export const useApp = () => useContext(AppCtx);

const P = {
  home: 'M3 10.5 12 3l9 7.5V20a1 1 0 0 1-1 1h-5v-6h-6v6H4a1 1 0 0 1-1-1z',
  calendar: 'M4 6.5A1.5 1.5 0 0 1 5.5 5h13A1.5 1.5 0 0 1 20 6.5v12a1.5 1.5 0 0 1-1.5 1.5h-13A1.5 1.5 0 0 1 4 18.5zM4 10h16M8 3v4M16 3v4',
  users: 'M16 19v-1.5a3.5 3.5 0 0 0-3.5-3.5h-5A3.5 3.5 0 0 0 4 17.5V19M10 11a3.5 3.5 0 1 0 0-7 3.5 3.5 0 0 0 0 7M20 19v-1.2a3.2 3.2 0 0 0-2.5-3.1M15.5 4.3a3.3 3.3 0 0 1 0 6.4',
  book: 'M5 4.5A1.5 1.5 0 0 1 6.5 3H19v15H6.5A1.5 1.5 0 0 0 5 19.5zM5 19.5A1.5 1.5 0 0 0 6.5 21H19M9 7h6',
  wallet: 'M4 7.5A2.5 2.5 0 0 1 6.5 5H18v3M4 7.5V17a2 2 0 0 0 2 2h13a1 1 0 0 0 1-1v-9a1 1 0 0 0-1-1H6.5A2.5 2.5 0 0 1 4 7.5M16 13.5h.01',
  gear: 'M12 15a3 3 0 1 0 0-6 3 3 0 0 0 0 6M19.4 15a1.7 1.7 0 0 0 .3 1.8l.1.1a2 2 0 1 1-2.8 2.8l-.1-.1a1.7 1.7 0 0 0-1.8-.3 1.7 1.7 0 0 0-1 1.5V21a2 2 0 1 1-4 0v-.1a1.7 1.7 0 0 0-1.1-1.5 1.7 1.7 0 0 0-1.8.3l-.1.1a2 2 0 1 1-2.8-2.8l.1-.1a1.7 1.7 0 0 0 .3-1.8 1.7 1.7 0 0 0-1.5-1H3a2 2 0 1 1 0-4h.1a1.7 1.7 0 0 0 1.5-1.1 1.7 1.7 0 0 0-.3-1.8l-.1-.1a2 2 0 1 1 2.8-2.8l.1.1a1.7 1.7 0 0 0 1.8.3H9a1.7 1.7 0 0 0 1-1.5V3a2 2 0 1 1 4 0v.1a1.7 1.7 0 0 0 1 1.5 1.7 1.7 0 0 0 1.8-.3l.1-.1a2 2 0 1 1 2.8 2.8l-.1.1a1.7 1.7 0 0 0-.3 1.8V9a1.7 1.7 0 0 0 1.5 1H21a2 2 0 1 1 0 4h-.1a1.7 1.7 0 0 0-1.5 1',
  plus: 'M12 5v14M5 12h14',
  check: 'M5 12.5 10 17 19 7',
  x: 'M6 6l12 12M18 6 6 18',
  chevron: 'M9 6l6 6-6 6',
  back: 'M15 6l-6 6 6 6',
  logout: 'M15 4h3a2 2 0 0 1 2 2v12a2 2 0 0 1-2 2h-3M10 17l5-5-5-5M15 12H4',
  bell: 'M6 8a6 6 0 1 1 12 0c0 7 3 9 3 9H3s3-2 3-9M10.3 21a1.9 1.9 0 0 0 3.4 0',
  key: 'M15.5 7.5a3.5 3.5 0 1 1-3.4 4.3L4 20H2v-2l8.2-8.1a3.5 3.5 0 0 1 5.3-2.4M16 8h.01',
  copy: 'M9 9h10v10H9zM5 15V5h10',
  trash: 'M4 7h16M9 7V4h6v3M6 7l1 13h10l1-13',
  edit: 'M4 20h4L19 9l-4-4L4 16zM13.5 6.5l4 4',
  report: 'M7 3h7l5 5v13H7zM14 3v5h5M10 13h6M10 17h6',
  chart: 'M4 20V10M10 20V4M16 20v-7M22 20H2',
  mic: 'M12 3a3 3 0 0 0-3 3v6a3 3 0 0 0 6 0V6a3 3 0 0 0-3-3M5.5 11a6.5 6.5 0 0 0 13 0M12 17.5V21M8.5 21h7',
  play: 'M7 4.5v15l12.5-7.5z',
  stop: 'M7 7h10v10H7z',
  moon: 'M20 14.5A8 8 0 1 1 9.5 4a6.5 6.5 0 0 0 10.5 10.5',
};

export function Icon({ name, size = 20 }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">
      <path d={P[name]} />
    </svg>
  );
}

export function WaIcon() {
  return (
    <svg width="18" height="18" viewBox="0 0 24 24" fill="currentColor" aria-hidden="true">
      <path d="M12 2a10 10 0 0 0-8.6 15.1L2 22l5-1.3A10 10 0 1 0 12 2m5.3 14.1c-.2.6-1.3 1.2-1.8 1.2-.5.1-1 .2-3.4-.7-2.9-1.1-4.7-4-4.8-4.2-.1-.2-1.2-1.5-1.2-2.9s.7-2.1 1-2.4c.3-.3.6-.3.8-.3h.6c.2 0 .4 0 .6.5l.8 2c.1.2.1.4 0 .5l-.3.5-.4.4c-.1.1-.3.3-.1.6.2.3.8 1.3 1.7 2.1 1.1 1 2.1 1.3 2.4 1.5.3.1.5.1.6-.1l.9-1c.2-.3.4-.2.6-.1l1.9.9c.3.1.5.2.5.3.1.2.1.7-.1 1.2" />
    </svg>
  );
}

/** WhatsApp'ı hazır mesajla açar (siz Gönder'e basarsınız). iPhone'da uygulama doğrudan açılır;
 *  WhatsApp yüklü değilse (sayfa hâlâ önündeyse) wa.me sayfasına geçilir. */
export function WaButton({ phone, text, label = "WhatsApp'a gönder", onSent, small, disabled }) {
  const noPhone = !isValidPhone(phone);
  const off = disabled || noPhone;
  const ios = isIOS();
  const click = () => {
    if (off) return;
    if (ios) setTimeout(() => { if (document.visibilityState === 'visible') window.location.href = waLink(phone, text); }, 1800);
    if (onSent) setTimeout(onSent, 400);
  };
  return (
    <a class={`btn wa${small ? ' small' : ''}`} href={off ? undefined : waHref(phone, text, ios)} target={ios ? undefined : '_blank'} rel="noopener"
      aria-disabled={off} title={noPhone ? 'Telefon numarası eksik ya da hatalı' : undefined} onClick={click}>
      <WaIcon /> {label}{noPhone && !disabled ? ' (numara yok)' : ''}
    </a>
  );
}

export function Tabs({ tabs, value, onChange }) {
  return (
    <div class="tabs" role="tablist">
      {tabs.map(([k, label]) => (
        <button key={k} role="tab" aria-selected={value === k} onClick={() => onChange(k)}>{label}</button>
      ))}
    </div>
  );
}

export function Sheet({ title, onClose, children }) {
  useEffect(() => {
    const f = (e) => e.key === 'Escape' && onClose();
    window.addEventListener('keydown', f);
    const o = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    return () => { window.removeEventListener('keydown', f); document.body.style.overflow = o; };
  }, []);
  return (
    <div class="sheet-back" onClick={(e) => e.target === e.currentTarget && onClose()}>
      <div class="sheet" role="dialog" aria-modal="true" aria-label={title}>
        <div class="grab" />
        <div class="spread" style="margin-bottom:4px">
          <h2 style="margin:0">{title}</h2>
          <button class="btn ghost small" onClick={onClose} aria-label="Kapat"><Icon name="x" /></button>
        </div>
        <div style="margin-top:14px">{children}</div>
      </div>
    </div>
  );
}

export function Field({ label, required, hint, error, children }) {
  return (
    <label class="field">
      <span>{label}{required && <span class="req"> *</span>}</span>
      {children}
      {error ? <div class="error">{error}</div> : hint ? <div class="hint">{hint}</div> : null}
    </label>
  );
}

export function Empty({ title, children, action }) {
  return (
    <div class="empty">
      <div class="title">{title}</div>
      {children && <div>{children}</div>}
      {action && <div style="margin-top:14px">{action}</div>}
    </div>
  );
}

const PERIOD_CHIP = { paid: 'ok', none: 'info', future: 'info', running: 'info', due: 'warn', late: 'bad' };
export function StatusChip({ status, label }) {
  return <span class={`chip ${PERIOD_CHIP[status] || 'info'}`}>{label}</span>;
}

export function Seg({ options, value, onChange, cls = '' }) {
  return (
    <div class={`seg ${cls}`}>
      {options.map(([k, label]) => (
        <button type="button" key={k} aria-pressed={value === k} onClick={() => onChange(k)}>{label}</button>
      ))}
    </div>
  );
}

export function useToast() {
  const [msg, setMsg] = useState(null);
  useEffect(() => { if (!msg) return; const t = setTimeout(() => setMsg(null), 2600); return () => clearTimeout(t); }, [msg]);
  return [msg, setMsg];
}

/** Hata yakalayan işlem yardımcısı: başarıda bildirim, hatada anlaşılır mesaj */
export function useAction() {
  const { toast } = useApp();
  const [busy, setBusy] = useState(false);
  const run = async (fn, okText) => {
    if (busy) return;
    setBusy(true);
    try { const r = await fn(); if (okText) toast(okText); return r ?? true; }
    catch (e) { toast(e.message || 'Bir hata oluştu.'); return false; }
    finally { setBusy(false); }
  };
  return [run, busy];
}

export async function copyText(text) {
  try { await navigator.clipboard.writeText(text); return true; } catch { return false; }
}

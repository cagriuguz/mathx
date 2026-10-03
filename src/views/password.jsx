// Öğrenci ve veli: kendi giriş şifresini değiştirir (önce eski şifre, sonra yeni şifre iki kez).
import { useState } from 'preact/hooks';
import { useApp, useAction, Sheet, Field } from '../ui.jsx';

export const MIN_PW = 6;

/** Saf kontrol: hata metni ya da null */
export function checkNewPassword(oldPw, newPw, again) {
  if (!oldPw) return 'Eski şifrenizi yazın.';
  if (newPw.length < MIN_PW) return `Yeni şifre en az ${MIN_PW} karakter olmalı.`;
  if (newPw === oldPw) return 'Yeni şifre eskisinden farklı olmalı.';
  if (newPw !== again) return 'Yeni şifre iki kez aynı yazılmalı.';
  return null;
}

export function PasswordSheet({ onClose }) {
  const { store, toast } = useApp();
  const [run, busy] = useAction();
  const [f, setF] = useState({ old: '', neu: '', again: '' });
  const [err, setErr] = useState('');
  const set = (k) => (e) => { const v = e.currentTarget.value; setF((o) => ({ ...o, [k]: v })); setErr(''); };
  const save = async () => {
    const bad = checkNewPassword(f.old, f.neu, f.again);
    if (bad) return setErr(bad);
    const ok = await run(async () => { await store.changeOwnPassword(f.old, f.neu); }, null);
    if (ok) { toast('Şifreniz değiştirildi. Bir sonraki girişte yeni şifrenizi kullanın.'); onClose(); }
  };
  return (
    <Sheet title="Şifre değiştir" onClose={onClose}>
      <form class="stack" onSubmit={(e) => { e.preventDefault(); save(); }}>
        <Field label="Eski şifre"><input class="input" type="password" autocomplete="current-password" value={f.old} onInput={set('old')} /></Field>
        <Field label="Yeni şifre" hint={`En az ${MIN_PW} karakter`}><input class="input" type="password" autocomplete="new-password" value={f.neu} onInput={set('neu')} /></Field>
        <Field label="Yeni şifre (tekrar)"><input class="input" type="password" autocomplete="new-password" value={f.again} onInput={set('again')} /></Field>
        {err && <div class="error" role="alert">{err}</div>}
        <button class="btn primary block" disabled={busy}>{busy ? 'Kaydediliyor…' : 'Şifreyi değiştir'}</button>
      </form>
    </Sheet>
  );
}

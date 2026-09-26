import { useState } from 'preact/hooks';
import { useApp, useAction, Sheet, Field, Seg, Icon } from '../../ui.jsx';
import { PLAN_TYPES } from '../../core/billing.js';
import { localNow } from '../../core/dates.js';

export function Settings({ onClose }) {
  const { store, settings, reload, logout, data } = useApp();
  const [run, busy] = useAction();
  const [name, setName] = useState(settings.teacher_name || '');
  const [phone, setPhone] = useState(settings.teacher_phone || '');
  const [days, setDays] = useState({ ...settings.remind_days });
  const [theme, setTheme] = useState(() => document.documentElement.dataset.theme || 'auto');

  const applyTheme = (t) => {
    setTheme(t);
    if (t === 'auto') { delete document.documentElement.dataset.theme; try { localStorage.removeItem('mathx.theme'); } catch {} }
    else { document.documentElement.dataset.theme = t; try { localStorage.setItem('mathx.theme', t); } catch {} }
  };

  const save = async () => {
    const clean = {};
    for (const k of Object.keys(PLAN_TYPES)) {
      const n = Number(days[k]);
      if (!(n >= 0 && n <= 60)) return run(async () => { throw new Error('Gün sayısı 0–60 arası olmalı.'); });
      clean[k] = n;
    }
    const ok = await run(async () => { await store.upsertSettings({ teacher_name: name.trim(), teacher_phone: phone.trim(), remind_days: clean }); await reload(); }, 'Ayarlar kaydedildi');
    if (ok) onClose();
  };

  const backup = () => {
    const blob = new Blob([JSON.stringify({ app: 'MathX', exported_at: new Date().toISOString(), data }, null, 2)], { type: 'application/json' });
    const a = document.createElement('a');
    a.href = URL.createObjectURL(blob);
    a.download = `MathX-yedek-${localNow().date}.json`;
    a.click();
    setTimeout(() => URL.revokeObjectURL(a.href), 2000);
  };

  return (
    <Sheet title="Ayarlar" onClose={onClose}>
      <div class="stack-lg">
        <div class="stack">
          <Field label="Adınız"><input class="input" value={name} onInput={(e) => setName(e.currentTarget.value)} /></Field>
          <Field label="Telefonunuz" hint="İsteğe bağlı"><input class="input" type="tel" value={phone} onInput={(e) => setPhone(e.currentTarget.value)} /></Field>
        </div>
        <div class="stack">
          <div class="section-title" style="font-size:18px">Gecikme uyarısı</div>
          <div class="hint">Son ödeme tarihinden kaç gün SONRA "gecikti" uyarısı verilsin?</div>
          <div class="grid2">
            {Object.entries(PLAN_TYPES).map(([k, label]) => (
              <Field key={k} label={label}>
                <input class="input" inputMode="numeric" value={days[k]} onInput={(e) => { const v = e.currentTarget.value; setDays((o) => ({ ...o, [k]: v })); }} />
              </Field>
            ))}
          </div>
        </div>
        <button class="btn primary block" disabled={busy} onClick={save}>Kaydet</button>
        <div class="stack">
          <div class="section-title" style="font-size:18px">Görünüm</div>
          <Seg options={[['auto', 'Otomatik'], ['light', 'Açık'], ['dark', 'Koyu']]} value={theme} onChange={applyTheme} />
        </div>
        <div class="stack">
          <div class="section-title" style="font-size:18px">Yedek</div>
          <div class="hint">{store.mode === 'demo' ? 'Deneme modundasınız: veriler yalnızca bu cihazda.' : 'Veriler çevrimiçi veritabanında; tüm cihazlar eşit.'} Yedek dosyası tüm kayıtları içerir.</div>
          <button class="btn" onClick={backup}>Yedeği indir (.json)</button>
          {store.mode === 'demo' && <button class="btn danger ghost" onClick={() => confirm('Deneme verileri sıfırlansın mı?') && store.resetDemo().then(reload)}>Deneme verilerini sıfırla</button>}
        </div>
        <button class="btn" onClick={logout}><Icon name="logout" /> Çıkış yap</button>
      </div>
    </Sheet>
  );
}

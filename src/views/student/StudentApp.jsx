// ÖĞRENCİ: yalnızca kendi ödevleri. Ödeme, ders ve başka öğrenci bilgisi bu hesaba HİÇ gönderilmez.
import { useState } from 'preact/hooks';
import { Shell } from '../../app.jsx';
import { useApp, useAction, Icon, Empty } from '../../ui.jsx';
import { fmtDate, fmtShort } from '../../core/dates.js';
import { HomeworkItems, ItemAnswerForm } from '../hwitems.jsx';
import { hwState, HW_CHIP } from '../../core/hwitems.js';
import { PasswordSheet } from '../password.jsx';

export function HomeworkCard({ h, readOnly }) {
  const { store, reload, now } = useApp();
  const [run, busy] = useAction();
  const late = !h.done && h.due_date < now.date;
  const [chipCls, chipLabel] = h.done ? HW_CHIP[hwState(h)] : ['bad', late ? 'Süresi geçti' : 'Yapılacak'];
  // Öğrenci her kalemi ayrı işaretler, onay verince bildirim gider; bir kez bildirilince geri alınamaz (veritabanı da izin vermez).
  // Otomatik moddaysa öğretmene ve veliye mesajı sunucu gönderir (öğrenci seçenek görmez).
  const send = (items) => run(async () => { await store.submitHomework(h.id, items); await reload(); store.waSend('done', h.id); }, 'Harika! Öğretmenine bildirildi.');
  return (
    <div class={`card card-pad hw${h.done ? ' done' : ''}`}>
      <div class="spread">
        <div class="small muted">Verildi {fmtShort(h.given_date)}</div>
        <span class={`chip ${chipCls}`}>{chipLabel}</span>
      </div>
      {readOnly || h.done ? <HomeworkItems h={h} who={readOnly ? 'teacher' : 'student'} /> : null}
      <div class="small" style="margin-bottom:10px">Son bitirme tarihi: <b>{fmtDate(h.due_date)}</b></div>
      {readOnly && !h.done && <div class="hint">Öğrenci ödevini bitirince her kitap için durumunu işaretleyecek; burada görünecek.</div>}
      {!readOnly && !h.done && <ItemAnswerForm h={h} busy={busy} onSend={send} />}
      {!readOnly && h.done && <div class="hint">Ödev durumun öğretmenine bildirildi.</div>}
    </div>
  );
}

export function StudentApp() {
  const { data, logout } = useApp();
  const [pwOpen, setPwOpen] = useState(false);
  const list = [...data.homework].sort((a, b) => Number(a.done) - Number(b.done) || a.due_date.localeCompare(b.due_date));
  const open = list.filter((h) => !h.done).length;
  const first = (data.me?.name || '').split(' ')[0];
  return (
    <Shell title={first ? `Merhaba ${first}` : 'Ödevlerim'} sub={open ? `${open} ödevin var` : 'Bütün ödevlerini bildirdin'}
      actions={<><button class="iconbtn" onClick={() => setPwOpen(true)} aria-label="Şifre değiştir"><Icon name="key" /></button><button class="iconbtn" onClick={logout} aria-label="Çıkış"><Icon name="logout" /></button></>}>
      <div class="stack" style="padding-bottom:20px">
        {list.length === 0 ? <div class="card"><Empty title="Henüz ödev yok" /></div> : list.map((h) => <HomeworkCard key={h.id} h={h} />)}
      </div>
      {pwOpen && <PasswordSheet onClose={() => setPwOpen(false)} />}
    </Shell>
  );
}

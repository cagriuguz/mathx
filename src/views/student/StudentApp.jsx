// ÖĞRENCİ: yalnızca kendi ödevleri. Ödeme, ders ve başka öğrenci bilgisi bu hesaba HİÇ gönderilmez.
import { Shell } from '../../app.jsx';
import { useApp, useAction, Icon, Empty } from '../../ui.jsx';
import { fmtDate, fmtShort } from '../../core/dates.js';

export function HomeworkCard({ h, readOnly }) {
  const { store, reload, now } = useApp();
  const [run, busy] = useAction();
  const late = !h.done && h.due_date < now.date;
  const toggle = () => run(async () => { await store.setHomeworkDone(h.id, !h.done); await reload(); },
    h.done ? 'İşaret kaldırıldı' : 'Harika! Öğretmenine ve velinize bildirildi.');
  return (
    <div class={`card card-pad hw${h.done ? ' done' : ''}`}>
      <div class="spread">
        <div class="small muted">Verildi {fmtShort(h.given_date)}</div>
        <span class={`chip ${h.done ? 'ok' : 'bad'}`}>{h.done ? 'Yapıldı' : late ? 'Süresi geçti' : 'Yapılacak'}</span>
      </div>
      <div class="hw-books">
        {h.items.map((i, k) => <div key={k} class="hw-book"><b>{i.book_name}</b><span>{i.pages}</span></div>)}
      </div>
      <div class="small" style="margin-bottom:10px">Son bitirme tarihi: <b>{fmtDate(h.due_date)}</b></div>
      {!readOnly && (
        <button class={`bigcheck${h.done ? ' done' : ''}`} disabled={busy} onClick={toggle} aria-pressed={h.done}>
          <Icon name={h.done ? 'check' : 'book'} /> {h.done ? 'Yaptım (geri almak için dokun)' : 'Ödevimi yaptım'}
        </button>
      )}
    </div>
  );
}

export function StudentApp() {
  const { data, logout } = useApp();
  const list = [...data.homework].sort((a, b) => Number(a.done) - Number(b.done) || a.due_date.localeCompare(b.due_date));
  const open = list.filter((h) => !h.done).length;
  const first = (data.me?.name || '').split(' ')[0];
  return (
    <Shell title={first ? `Merhaba ${first}` : 'Ödevlerim'} sub={open ? `${open} ödevin var` : 'Bütün ödevlerin tamam'}
      actions={<button class="iconbtn" onClick={logout} aria-label="Çıkış"><Icon name="logout" /></button>}>
      <div class="stack" style="padding-bottom:20px">
        {list.length === 0 ? <div class="card"><Empty title="Henüz ödev yok" /></div> : list.map((h) => <HomeworkCard key={h.id} h={h} />)}
      </div>
    </Shell>
  );
}

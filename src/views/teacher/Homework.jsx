import { useMemo, useState } from 'preact/hooks';
import { useApp, useAction, Tabs, Icon, Field, Empty, WaButton } from '../../ui.jsx';
import { msgHomeworkGiven, msgHomeworkGivenStudent, msgHomeworkDone } from '../../core/messages.js';
import { addDays, fmtDate, fmtShort } from '../../core/dates.js';

export function Homework() {
  const [tab, setTab] = useState('give');
  return (
    <>
      <Tabs tabs={[['give', 'Ödev ver'], ['track', 'Takip'], ['books', 'Kitaplar']]} value={tab} onChange={setTab} />
      {tab === 'give' && <Give goBooks={() => setTab('books')} />}
      {tab === 'track' && <Track />}
      {tab === 'books' && <Books />}
    </>
  );
}

function Give({ goBooks }) {
  const { data, store, reload, now, settings } = useApp();
  const [run, busy] = useAction();
  const students = data.students.filter((s) => s.active !== false).sort((a, b) => a.name.localeCompare(b.name, 'tr'));
  const books = data.books.filter((b) => b.active !== false).sort((a, b) => a.name.localeCompare(b.name, 'tr'));
  const [sid, setSid] = useState('');
  const [pages, setPages] = useState({});
  const [due, setDue] = useState(addDays(now.date, 7));
  const [saved, setSaved] = useState(null);
  const [err, setErr] = useState('');

  const items = books.filter((b) => (pages[b.id] || '').trim()).map((b) => ({ book_id: b.id, book_name: b.name, pages: pages[b.id].trim() }));
  const text = items.length ? msgHomeworkGiven(items, due) : '';
  const student = students.find((s) => s.id === sid);

  const save = async () => {
    if (!sid) return setErr('Öğrenci seçin.');
    if (!items.length) return setErr('En az bir kitabın altına sayfa yazın.');
    if (!due) return setErr('Son bitirme tarihini seçin.');
    setErr('');
    await run(async () => {
      const h = await store.insert('homework', { student_id: sid, given_date: now.date, due_date: due, items, note: '', done: false, done_at: null, sent_given: false, sent_done: false, seen_done: true });
      await reload();
      // Otomatik modda veliye ve öğrenciye kendiliğinden gider; olmazsa elle gönderme düğmeleri çıkar
      const auto = settings.wa_mode === 'auto';
      setSaved({ h, text, studentText: msgHomeworkGivenStudent(items, due), student, auto: auto ? 'sending' : null });
      if (auto) {
        const r = await store.waSend('given', h.id);
        setSaved((o) => o && { ...o, auto: r.ok ? 'sent' : 'failed', error: r.error });
        if (r.ok) reload();
      }
    }, settings.wa_mode === 'auto' ? null : 'Ödev kaydedildi');
  };
  const markSent = () => saved && store.update('homework', saved.h.id, { sent_given: true }).then(reload).catch(() => {});

  if (!books.length) {
    return <div class="card"><Empty title="Önce kitap ekleyin" action={<button class="btn primary" onClick={goBooks}><Icon name="plus" /> Kitap ekle</button>}>Ödev verirken kitapların altına sayfa numarası yazacaksınız.</Empty></div>;
  }
  if (saved) {
    return (
      <div class="card card-pad stack">
        <h2 class="section-title">Ödev kaydedildi</h2>
        <div class="small muted">Veliye giden mesaj</div>
        <div class="msg">{saved.text}</div>
        <div class="small muted">Öğrenciye giden mesaj</div>
        <div class="msg">{saved.studentText}</div>
        {saved.auto === 'sending' && <div class="hint">Veliye ve öğrenciye otomatik gönderiliyor…</div>}
        {saved.auto === 'sent' && <div class="chip ok" style="align-self:flex-start">Veliye ve öğrenciye otomatik gönderildi ✓</div>}
        {saved.auto === 'failed' && <div class="warn">Otomatik gönderilemedi: {(saved.error || 'bilinmeyen hata').replace(/\.$/, '')}. Aşağıdan elle gönderin.</div>}
        {(!saved.auto || saved.auto === 'failed') && (
          <>
            <div class="row wrap">
              <WaButton phone={saved.student.parent_phone} text={saved.text} label="Veliye gönder" onSent={markSent} />
              <WaButton phone={saved.student.phone} text={saved.studentText} label="Öğrenciye gönder" />
            </div>
            <div class="hint">WhatsApp hazır mesajla açılır; göndermek için WhatsApp'ta Gönder'e basın.</div>
          </>
        )}
        <button class="btn" onClick={() => { setSaved(null); setPages({}); setSid(''); }}>Yeni ödev ver</button>
      </div>
    );
  }

  return (
    <div class="stack">
      <div class="card card-pad stack">
        <Field label="Öğrenci" required>
          <select class="input" value={sid} onChange={(e) => setSid(e.currentTarget.value)}>
            <option value="">Seçin</option>
            {students.map((s) => <option key={s.id} value={s.id}>{s.name}</option>)}
          </select>
        </Field>
        <div class="field"><span>Kitaplar ve sayfalar</span></div>
        {books.map((b) => (
          <Field key={b.id} label={b.name}>
            <input class="input" value={pages[b.id] || ''} placeholder="Sayfa, ör. 12-20" inputMode="text"
              onInput={(e) => { const v = e.currentTarget.value; setPages((o) => ({ ...o, [b.id]: v })); }} />
          </Field>
        ))}
        <Field label="Son bitirme tarihi (tüm ödev için)" required>
          <input class="input" type="date" value={due} onInput={(e) => setDue(e.currentTarget.value)} />
        </Field>
      </div>
      <div class="card card-pad stack">
        <h2 class="section-title">Gidecek mesajlar</h2>
        {text ? (
          <>
            <div class="small muted">Veliye</div>
            <div class="msg">{text}</div>
            <div class="small muted">Öğrenciye</div>
            <div class="msg">{msgHomeworkGivenStudent(items, due)}</div>
          </>
        ) : <div class="muted">Kitapların altına sayfa yazdıkça mesaj burada oluşur.</div>}
        {err && <div class="error">{err}</div>}
        <button class="btn primary block" disabled={busy} onClick={save}>Kaydet ve gönder</button>
      </div>
    </div>
  );
}

function Track() {
  const { data, store, reload, now } = useApp();
  const [run] = useAction();
  const [who, setWho] = useState('');
  const [show, setShow] = useState('open');
  const byId = useMemo(() => new Map(data.students.map((s) => [s.id, s])), [data.students]);
  const list = data.homework
    .filter((h) => (!who || h.student_id === who) && byId.has(h.student_id))
    .filter((h) => (show === 'open' ? !h.done : show === 'done' ? h.done : true))
    .sort((a, b) => b.given_date.localeCompare(a.given_date));

  const del = (h) => confirm('Bu ödev silinsin mi?') && run(async () => { await store.remove('homework', h.id); await reload(); }, 'Ödev silindi');
  const sentDone = (h) => store.update('homework', h.id, { sent_done: true, seen_done: true }).then(reload).catch(() => {});

  return (
    <div class="stack">
      <div class="row">
        <select class="input grow" value={who} onChange={(e) => setWho(e.currentTarget.value)} aria-label="Öğrenci">
          <option value="">Tüm öğrenciler</option>
          {data.students.map((s) => <option key={s.id} value={s.id}>{s.name}</option>)}
        </select>
      </div>
      <Tabs tabs={[['open', 'Yapılmadı'], ['done', 'Yapıldı'], ['all', 'Tümü']]} value={show} onChange={setShow} />
      {list.length === 0 ? <div class="card"><Empty title="Ödev yok" /></div> : list.map((h) => {
        const s = byId.get(h.student_id);
        const late = !h.done && h.due_date < now.date;
        return (
          <div key={h.id} class={`card card-pad hw${h.done ? ' done' : ''}`}>
            <div class="spread">
              <div class="item-title">{s.name}</div>
              <span class={`chip ${h.done ? 'ok' : 'bad'}`}>{h.done ? 'Yapıldı' : late ? 'Süresi geçti' : 'Yapılmadı'}</span>
            </div>
            <div class="hw-books">
              {h.items.map((i, k) => <div key={k} class="hw-book"><b>{i.book_name}</b><span>{i.pages}</span></div>)}
            </div>
            <div class="spread small muted">
              <span>Verildi {fmtShort(h.given_date)} · Son gün {fmtDate(h.due_date)}</span>
              <span>{h.sent_given ? 'Veliye gönderildi ✓' : ''}</span>
            </div>
            <div class="row wrap" style="margin-top:10px">
              {h.done
                ? <WaButton small phone={s.parent_phone} text={msgHomeworkDone(s.name, h.items)} label={h.sent_done ? 'Tekrar gönder' : 'Yapıldı mesajı'} onSent={() => sentDone(h)} />
                : <WaButton small phone={s.parent_phone} text={msgHomeworkGiven(h.items, h.due_date)} label="Ödevi tekrar gönder" />}
              <button class="btn small ghost danger" onClick={() => del(h)}><Icon name="trash" /></button>
            </div>
          </div>
        );
      })}
    </div>
  );
}

function Books() {
  const { data, store, reload } = useApp();
  const [run, busy] = useAction();
  const [name, setName] = useState('');
  const books = [...data.books].sort((a, b) => a.name.localeCompare(b.name, 'tr'));
  const add = async (e) => {
    e.preventDefault();
    const n = name.trim().replace(/\s+/g, ' ');
    if (!n) return;
    if (data.books.some((b) => b.name.toLocaleLowerCase('tr') === n.toLocaleLowerCase('tr'))) return run(async () => { throw new Error('Bu kitap zaten ekli.'); });
    const ok = await run(async () => { await store.insert('books', { name: n, active: true }); await reload(); }, 'Kitap eklendi');
    if (ok) setName('');
  };
  const rename = (b) => { const n = prompt('Kitabın yeni adı:', b.name); if (n && n.trim()) run(async () => { await store.update('books', b.id, { name: n.trim() }); await reload(); }, 'Kaydedildi'); };
  const toggle = (b) => run(async () => { await store.update('books', b.id, { active: b.active === false }); await reload(); });
  const del = (b) => confirm(`"${b.name}" silinsin mi? Eski ödevlerdeki kitap adı korunur.`) && run(async () => { await store.remove('books', b.id); await reload(); }, 'Kitap silindi');
  return (
    <div class="stack">
      <form class="card card-pad row" onSubmit={add}>
        <input class="input grow" placeholder="Kitap adı, ör. Karekök 7" value={name} onInput={(e) => setName(e.currentTarget.value)} aria-label="Kitap adı" />
        <button class="btn primary" disabled={busy}><Icon name="plus" /> Ekle</button>
      </form>
      <div class="card">
        {books.length === 0 ? <Empty title="Kitap yok">Ödev verirken kullanacağınız kitapları ekleyin.</Empty> : (
          <ul class="list">
            {books.map((b) => (
              <li key={b.id} class="spread">
                <span class={b.active === false ? 'muted' : ''}>{b.name}{b.active === false ? ' (gizli)' : ''}</span>
                <span class="row">
                  <button class="btn small ghost" onClick={() => rename(b)} aria-label="Adını değiştir"><Icon name="edit" /></button>
                  <button class="btn small ghost" onClick={() => toggle(b)}>{b.active === false ? 'Göster' : 'Gizle'}</button>
                  <button class="btn small ghost danger" onClick={() => del(b)} aria-label="Sil"><Icon name="trash" /></button>
                </span>
              </li>
            ))}
          </ul>
        )}
      </div>
    </div>
  );
}

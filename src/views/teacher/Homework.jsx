import { useMemo, useState } from 'preact/hooks';
import { useApp, useAction, Tabs, Icon, Field, Empty, WaButton, Seg, StudentPicker } from '../../ui.jsx';
import { msgHomeworkGiven, msgHomeworkGivenStudent, msgHomeworkDone } from '../../core/messages.js';
import { WA_RECIPIENTS } from '../../core/wa.js';
import { addDays, fmtDate, fmtShort } from '../../core/dates.js';
import { HomeworkItems, TeacherItemEdit } from '../hwitems.jsx';
import { hwState, HW_CHIP } from '../../core/hwitems.js';
import { siblingsOf } from './Students.jsx';
import { studentBooks, unassignedBooks, hasBook, bookSuggestions, cleanBookName } from '../../core/books.js';

export function Homework() {
  const [tab, setTab] = useState('give');
  return (
    <>
      <Tabs tabs={[['give', 'Ödev ver'], ['track', 'Takip'], ['books', 'Kitaplar']]} value={tab} onChange={setTab} />
      {tab === 'give' && <Give />}
      {tab === 'track' && <Track />}
      {tab === 'books' && <Books />}
    </>
  );
}

function Give() {
  const { data, store, reload, now, settings } = useApp();
  const [run, busy] = useAction();
  const students = data.students.filter((s) => s.active !== false).sort((a, b) => a.name.localeCompare(b.name, 'tr'));
  const [sid, setSid] = useState('');
  // Yalnızca seçilen öğrencinin kendi kitapları (seviyesine göre ona atananlar)
  const books = studentBooks(data.books, sid, { onlyActive: true });
  const [pages, setPages] = useState({});
  const [due, setDue] = useState(addDays(now.date, 7));
  const [saved, setSaved] = useState(null);
  const [err, setErr] = useState('');
  const [to, setTo] = useState('both'); // otomatik modda kime gidecek: ikisine birden / yalnız veli / yalnız öğrenci
  const auto = settings.wa_mode === 'auto';

  const items = books.filter((b) => (pages[b.id] || '').trim()).map((b) => ({ book_id: b.id, book_name: b.name, pages: pages[b.id].trim() }));
  const student = students.find((s) => s.id === sid);
  // Kardeşi olan velinin mesajında hangi çocuğun ödevi olduğu adla yazılır
  const sibling = student ? siblingsOf(data, student).length > 0 : false;
  const parentText = (its, d) => msgHomeworkGiven(its, d, { studentName: student?.name, sibling });
  const text = items.length ? parentText(items, due) : '';

  const save = async () => {
    if (!sid) return setErr('Öğrenci seçin.');
    if (!items.length) return setErr('En az bir kitabın altına sayfa yazın.');
    if (!due) return setErr('Son bitirme tarihini seçin.');
    setErr('');
    await run(async () => {
      const row = { student_id: sid, given_date: now.date, due_date: due, items, note: '', done: false, done_at: null, sent_given: false, sent_done: false, seen_done: true };
      if (auto) row.wa_to = to;
      const h = await store.insert('homework', row);
      await reload();
      // Otomatik modda seçilen kişiye (ikisine birden / veli / öğrenci) kendiliğinden gider; olmazsa elle gönderme düğmeleri çıkar
      setSaved({ h, text, studentText: msgHomeworkGivenStudent(items, due), student, to: auto ? to : 'both', auto: auto ? 'sending' : null });
      if (auto) {
        const r = await store.waSend('given', h.id);
        setSaved((o) => o && { ...o, auto: r.ok ? 'sent' : 'failed', error: r.error });
        if (r.ok) reload();
      }
    }, auto ? null : 'Ödev kaydedildi');
  };
  const removeBook = (b) => {
    if (!confirm(`"${b.name}" kitabı ${student?.name || 'bu öğrenci'} için silinsin mi? Daha önce verilmiş ödevlerdeki kitap adı korunur.`)) return;
    run(async () => { await store.remove('books', b.id); setPages((o) => { const { [b.id]: _, ...rest } = o; return rest; }); await reload(); }, 'Kitap silindi');
  };
  const markSent = () => saved && store.update('homework', saved.h.id, { sent_given: true }).then(reload).catch(() => {});

  if (saved) {
    return (
      <div class="card card-pad stack">
        <h2 class="section-title">Ödev kaydedildi</h2>
        {saved.to !== 'student' && <><div class="small muted">Veliye giden mesaj</div><div class="msg">{saved.text}</div></>}
        {saved.to !== 'parent' && <><div class="small muted">Öğrenciye giden mesaj</div><div class="msg">{saved.studentText}</div></>}
        {saved.auto === 'sending' && <div class="hint">Otomatik gönderiliyor…</div>}
        {saved.auto === 'sent' && <div class="chip ok" style="align-self:flex-start">{WA_RECIPIENTS[saved.to]} otomatik gönderildi ✓</div>}
        {saved.auto === 'failed' && <div class="warn">Otomatik gönderilemedi: {(saved.error || 'bilinmeyen hata').replace(/\.$/, '')}. Aşağıdan elle gönderin.</div>}
        {(!saved.auto || saved.auto === 'failed') && (
          <>
            <div class="row wrap">
              {saved.to !== 'student' && <WaButton phone={saved.student.parent_phone} text={saved.text} label="Veliye gönder" onSent={markSent} />}
              {saved.to !== 'parent' && <WaButton phone={saved.student.phone} text={saved.studentText} label="Öğrenciye gönder" />}
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
        <StudentPicker label="Öğrenci *" students={students} value={sid} onChange={(id) => { setSid(id); setPages({}); setErr(''); }} />
        {!sid && <div class="hint">Öğrencinin adını yazın ya da listeden seçin; yalnızca ona atadığınız kitaplar çıkar.</div>}
        {sid && <div class="field"><span>{student?.name} için kitaplar ve sayfalar</span></div>}
        {sid && !books.length && <div class="muted">Bu öğrenciye henüz kitap atanmadı. Aşağıdan ekleyin.</div>}
        {books.map((b) => (
          <div key={b.id} class="field">
            <span>{b.name}</span>
            <div class="row">
              <input class="input grow" value={pages[b.id] || ''} placeholder="Sayfa, ör. 12-20" inputMode="text" aria-label={`${b.name} sayfaları`}
                onInput={(e) => { const v = e.currentTarget.value; setPages((o) => ({ ...o, [b.id]: v })); }} />
              <button type="button" class="btn small ghost danger" onClick={() => removeBook(b)} aria-label={`${b.name} kitabını bu öğrenciden sil`}><Icon name="trash" /></button>
            </div>
          </div>
        ))}
        {sid && <AddBook sid={sid} />}
        <Field label="Son bitirme tarihi (tüm ödev için)" required>
          <input class="input" type="date" value={due} onInput={(e) => setDue(e.currentTarget.value)} />
        </Field>
      </div>
      <div class="card card-pad stack">
        <h2 class="section-title">Gidecek mesajlar</h2>
        {auto && (
          <>
            <div class="small muted">Otomatik mesaj kime gitsin?</div>
            <Seg options={Object.entries(WA_RECIPIENTS)} value={to} onChange={setTo} />
          </>
        )}
        {text ? (
          <>
            {to !== 'student' && <><div class="small muted">Veliye</div><div class="msg">{text}</div></>}
            {to !== 'parent' && <><div class="small muted">Öğrenciye</div><div class="msg">{msgHomeworkGivenStudent(items, due)}</div></>}
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
      <StudentPicker students={data.students} value={who} onChange={setWho} allLabel="Tüm öğrenciler" />
      <Tabs tabs={[['open', 'Bildirilmedi'], ['done', 'Bildirildi'], ['all', 'Tümü']]} value={show} onChange={setShow} />
      {list.length === 0 ? <div class="card"><Empty title="Ödev yok" /></div> : list.map((h) => {
        const s = byId.get(h.student_id);
        const late = !h.done && h.due_date < now.date;
        const [chipCls, chipLabel] = h.done ? HW_CHIP[hwState(h)] : ['bad', late ? 'Süresi geçti' : 'Bildirilmedi'];
        return (
          <div key={h.id} class={`card card-pad hw${h.done ? ' done' : ''}`}>
            <div class="spread">
              <div class="item-title">{s.name}</div>
              <span class={`chip ${chipCls}`}>{chipLabel}</span>
            </div>
            <HomeworkItems h={h} renderEdit={(k) => <TeacherItemEdit key={`${h.id}-${k}-${h.items[k].status}-${h.items[k].teacher_note || ''}`} h={h} index={k} />} />
            <div class="spread small muted">
              <span>Verildi {fmtShort(h.given_date)} · Son gün {fmtDate(h.due_date)}</span>
              <span>{h.sent_given ? 'Veliye gönderildi ✓' : ''}</span>
            </div>
            <div class="row wrap" style="margin-top:10px">
              {h.done
                ? <WaButton small phone={s.parent_phone} text={msgHomeworkDone(s.name, h.items)} label={h.sent_done ? 'Tekrar gönder' : 'Durum mesajı'} onSent={() => sentDone(h)} />
                : <WaButton small phone={s.parent_phone} text={msgHomeworkGiven(h.items, h.due_date, { studentName: s.name, sibling: siblingsOf(data, s).length > 0 })} label="Ödevi tekrar gönder" />}
              <button class="btn small ghost danger" onClick={() => del(h)}><Icon name="trash" /></button>
            </div>
          </div>
        );
      })}
    </div>
  );
}

// Öğrenciye kitap ekleme (ödev ekranında ve Kitaplar sekmesinde aynı kutu)
function AddBook({ sid }) {
  const { data, store, reload } = useApp();
  const [run, busy] = useAction();
  const [name, setName] = useState('');
  const list = `kitap-oneri-${sid}`;
  const add = async (e) => {
    e.preventDefault();
    const n = cleanBookName(name);
    if (!n) return;
    if (hasBook(data.books, sid, n)) return run(async () => { throw new Error('Bu kitap bu öğrencide zaten var.'); });
    const ok = await run(async () => { await store.insert('books', { name: n, active: true, student_id: sid }); await reload(); }, 'Kitap öğrenciye eklendi');
    if (ok) setName('');
  };
  return (
    <form class="row" onSubmit={add}>
      <input class="input grow" list={list} placeholder="Yeni kitap adı" value={name} onInput={(e) => setName(e.currentTarget.value)} aria-label="Kitap adı" />
      <datalist id={list}>{bookSuggestions(data.books, sid).map((n) => <option key={n} value={n} />)}</datalist>
      <button class="btn" disabled={busy}><Icon name="plus" /> Ekle</button>
    </form>
  );
}

function Books() {
  const { data, store, reload } = useApp();
  const [run] = useAction();
  const [sid, setSid] = useState('');
  const students = data.students.filter((s) => s.active !== false).sort((a, b) => a.name.localeCompare(b.name, 'tr'));
  const books = studentBooks(data.books, sid);
  const old = unassignedBooks(data.books);
  const student = students.find((s) => s.id === sid);
  const rename = (b) => {
    const n = cleanBookName(prompt('Kitabın yeni adı:', b.name));
    if (!n || n === b.name) return;
    if (b.student_id && hasBook(data.books.filter((x) => x.id !== b.id), b.student_id, n)) return run(async () => { throw new Error('Bu kitap bu öğrencide zaten var.'); });
    run(async () => { await store.update('books', b.id, { name: n }); await reload(); }, 'Kaydedildi');
  };
  const toggle = (b) => run(async () => { await store.update('books', b.id, { active: b.active === false }); await reload(); });
  const del = (b) => confirm(`"${b.name}" silinsin mi? Eski ödevlerdeki kitap adı korunur.`) && run(async () => { await store.remove('books', b.id); await reload(); }, 'Kitap silindi');
  const assign = (b) => {
    if (!sid) return run(async () => { throw new Error('Önce yukarıdan öğrenci seçin.'); });
    if (hasBook(data.books, sid, b.name)) return run(async () => { throw new Error('Bu kitap bu öğrencide zaten var.'); });
    run(async () => { await store.insert('books', { name: b.name, active: true, student_id: sid }); await reload(); }, `${student.name} öğrencisine atandı`);
  };
  return (
    <div class="stack">
      <div class="card card-pad stack">
        <StudentPicker label="Öğrenci" students={students} value={sid} onChange={setSid} extra={(x) => ` (${studentBooks(data.books, x.id).length} kitap)`} />
        {sid ? <AddBook sid={sid} /> : <div class="hint">Her öğrencinin kitapları ayrıdır; ödev verirken yalnızca o öğrencinin kitapları görünür.</div>}
      </div>
      {sid && (
        <div class="card">
          {books.length === 0 ? <Empty title="Kitap yok">{student?.name} öğrencisine seviyesine uygun kitapları ekleyin.</Empty> : (
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
      )}
      {old.length > 0 && (
        <div class="card card-pad stack">
          <h2 class="section-title">Atanmamış eski kitaplar</h2>
          <div class="hint">Bunlar eski ortak listeden kaldı; ödev ekranında görünmez. Yukarıdan öğrenci seçip "Ata" deyin; işiniz bitince silebilirsiniz.</div>
          <ul class="list">
            {old.map((b) => (
              <li key={b.id} class="spread">
                <span>{b.name}</span>
                <span class="row">
                  <button class="btn small" onClick={() => assign(b)} disabled={!sid || hasBook(data.books, sid, b.name)}>{sid && hasBook(data.books, sid, b.name) ? 'Atandı ✓' : 'Ata'}</button>
                  <button class="btn small ghost danger" onClick={() => del(b)} aria-label="Sil"><Icon name="trash" /></button>
                </span>
              </li>
            ))}
          </ul>
        </div>
      )}
    </div>
  );
}

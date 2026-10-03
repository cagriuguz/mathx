// Ödev kalemi ekranları: durum etiketleri (herkes görür), öğrencinin kalem kalem cevap formu,
// öğretmenin durumu açıklamayla değiştirdiği küçük form.
import { useState } from 'preact/hooks';
import { useApp, useAction, Icon } from '../ui.jsx';
import { ITEM_STATUS, ITEM_STATUS_TEACHER, NOTE_MAX, itemStatus, missingAnswers, mergeAnswers, teacherOverride } from '../core/hwitems.js';

const STATUS_CHIP = { done: 'ok', partial: 'gold', none: 'bad' };

/** Bildirilmiş kalemin durumu: Yaptı / Eksik yaptı / Yapmadı + veli kontrolü + öğretmen açıklaması */
export function ItemChips({ h, item, who = 'teacher' }) {
  const st = itemStatus(h, item);
  if (!st) return null;
  const label = (who === 'student' ? ITEM_STATUS : ITEM_STATUS_TEACHER)[st];
  return (
    <div class="hw-state">
      <div class="row wrap">
        <span class={`chip ${STATUS_CHIP[st]}`}>{label}</span>
        {typeof item.parent_ok === 'boolean' && <span class={`chip ${item.parent_ok ? 'info' : 'bad'}`}>{item.parent_ok ? 'Veli kontrolüne uygun' : 'Veli kontrolüne uygun değil'}</span>}
      </div>
      {item.teacher_note && <div class="small muted">Öğretmen düzeltti: {item.teacher_note}</div>}
    </div>
  );
}

/** Ödevin kitap/sayfa satırları (+ bildirilmişse her satırın durumu) */
export function HomeworkItems({ h, who = 'teacher', renderEdit }) {
  return (
    <div class="hw-books">
      {h.items.map((i, k) => (
        <div key={k} class="hw-line">
          <div class="hw-book"><b>{i.book_name}</b><span>{i.pages}</span></div>
          {h.done && <ItemChips h={h} item={i} who={who} />}
          {h.done && renderEdit?.(k)}
        </div>
      ))}
    </div>
  );
}

/** ÖĞRENCİ: her kalem için Yaptım / Eksik yaptım / Yapmadım ve "veli kontrol edebilir mi" (Evet/Hayır). Hepsi cevaplanmadan gönderilemez. */
export function ItemAnswerForm({ h, onSend, busy }) {
  const [ans, setAns] = useState(() => h.items.map(() => ({})));
  const set = (k, patch) => setAns((a) => a.map((x, i) => (i === k ? { ...x, ...patch } : x)));
  const miss = missingAnswers(h.items, ans);
  const send = () => {
    if (!miss.complete) return;
    const lines = h.items.map((i, k) => `• ${i.book_name} (${i.pages}): ${ITEM_STATUS[ans[k].status]}; veli kontrol etmesi ${ans[k].parent_ok ? 'uygun' : 'uygun değil'}`).join('\n');
    if (!confirm(`Emin misin?\n\n${lines}\n\nGönderince bu seçimleri değiştiremezsin. Öğretmenine ve veline bildirilecek.`)) return;
    onSend(mergeAnswers(h.items, ans));
  };
  return (
    <div class="stack">
      {h.items.map((i, k) => (
        <div key={k} class="hw-item">
          <div class="hw-book"><b>{i.book_name}</b><span>{i.pages}</span></div>
          <div class="seg item-seg" role="group" aria-label={`${i.book_name} durumu`}>
            {Object.entries(ITEM_STATUS).map(([key, label]) => (
              <button type="button" key={key} aria-pressed={ans[k].status === key} onClick={() => set(k, { status: key })}>{label}</button>
            ))}
          </div>
          <div class="hw-q">Velimin kontrol etmesinde bir sakınca yoktur</div>
          <div class="seg item-seg" role="group" aria-label={`${i.book_name} veli kontrolü`}>
            <button type="button" aria-pressed={ans[k].parent_ok === true} onClick={() => set(k, { parent_ok: true })}>Evet</button>
            <button type="button" aria-pressed={ans[k].parent_ok === false} onClick={() => set(k, { parent_ok: false })}>Hayır</button>
          </div>
        </div>
      ))}
      <button class="bigcheck" disabled={busy || !miss.complete} onClick={send}>
        <Icon name="check" /> {miss.complete ? 'Ödev durumumu bildir' : 'Önce her kalem için seçim yap'}
      </button>
      {!miss.complete && <div class="hint">{miss.status ? `${miss.status} kalemde yaptım / eksik yaptım / yapmadım seçilmedi. ` : ''}{miss.parent ? `${miss.parent} kalemde veli sorusu cevaplanmadı.` : ''}</div>}
    </div>
  );
}

/** ÖĞRETMEN: bildirilmiş bir kalemin durumunu değiştirir; açıklama zorunlu */
export function TeacherItemEdit({ h, index }) {
  const { store, reload } = useApp();
  const [run, busy] = useAction();
  const [open, setOpen] = useState(false);
  const item = h.items[index];
  const [status, setStatus] = useState(itemStatus(h, item) || 'done');
  const [note, setNote] = useState('');
  const [err, setErr] = useState('');
  const save = async () => {
    let items;
    try { items = teacherOverride(h.items, index, status, note); } catch (e) { return setErr(e.message); }
    const ok = await run(async () => { await store.update('homework', h.id, { items }); await reload(); }, 'Durum değiştirildi');
    if (ok) { setOpen(false); setNote(''); setErr(''); }
  };
  if (!open) return <button type="button" class="btn small ghost" onClick={() => setOpen(true)}><Icon name="edit" /> Durumu değiştir</button>;
  return (
    <div class="reason-box">
      <div class="seg item-seg" role="group" aria-label="Yeni durum">
        {Object.entries(ITEM_STATUS_TEACHER).map(([key, label]) => (
          <button type="button" key={key} aria-pressed={status === key} onClick={() => { setStatus(key); setErr(''); }}>{label}</button>
        ))}
      </div>
      <div class="spread">
        <label class="small" for={`tn-${h.id}-${index}`} style="font-weight:600">Açıklama (zorunlu)</label>
        <span class="counter">{[...note].length}/{NOTE_MAX}</span>
      </div>
      <input id={`tn-${h.id}-${index}`} class={`input${err ? ' invalid' : ''}`} maxLength={NOTE_MAX} value={note}
        placeholder="Ör. Defterine baktım, 3 soru eksik" onInput={(e) => { setNote(e.currentTarget.value); setErr(''); }} />
      {err && <div class="error">{err}</div>}
      <div class="row">
        <button type="button" class="btn primary small" disabled={busy} onClick={save}>Kaydet</button>
        <button type="button" class="btn small ghost" onClick={() => { setOpen(false); setErr(''); }}>Vazgeç</button>
      </div>
    </div>
  );
}

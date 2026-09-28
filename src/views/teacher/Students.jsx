import { useMemo, useState } from 'preact/hooks';
import { useApp, useAction, Icon, Sheet, Field, Seg, Empty, WaButton, copyText, StatusChip } from '../../ui.jsx';
import { PLAN_TYPES, STATUS_LABEL, studentPeriods, studentSummary } from '../../core/billing.js';
import { scheduleAt } from '../../core/lessons.js';
import { TR_DAYS, TR_DAYS_SHORT, fmtDate, addDays } from '../../core/dates.js';
import { fmtTL, parseTL, fmtHours } from '../../core/money.js';
import { isValidPhone } from '../../core/messages.js';
import { cleanUsername, checkUsername, generatePasswordPair } from '../../store/common.js';
import { SITE_URL } from '../../config.js';
import { withConn } from '../../store/conn.js';
import { PeriodBody, ExtraLessonSheet } from '../shared.jsx';
import { TeacherVoiceNotes } from '../voice.jsx';
import { PaymentSheet } from './Money.jsx';

const FEE_LABEL = { weekly: 'Haftalık ücret (TL)', '4weekly': '4 haftalık ücret (TL)', monthly: 'Aylık ücret (TL)', oneoff: 'Paket tutarı (TL)' };
// Kendi veritabanını kullanan öğretmenin linkine bağlantı eklenir: veli/öğrenci o öğretmenin MathX'ine girer
const siteUrl = () => withConn(SITE_URL || (location.protocol.startsWith('http') ? location.origin + location.pathname : ''));

// Veli ve öğrenci birbirinin şifresini görmesin: her birine yalnızca kendi giriş bilgisi gider.
export function credentialsMessage(s, pw, who, kids = []) {
  const url = siteUrl();
  const adr = url ? `\nAdres: ${url}` : '';
  const all = kids.length > 1 ? ` (${kids.map((k) => k.name.split(' ')[0]).join(', ')} için tek giriş)` : '';
  return who === 'parent'
    ? `Sayın veli, MathX giriş bilgileriniz${all}:${adr}\nKullanıcı adı: ${s.parent_username}\nŞifre: ${pw}`
    : `Merhaba ${s.name.split(' ')[0]}, MathX giriş bilgilerin:${adr}\nKullanıcı adı: ${s.student_username}\nŞifre: ${pw}`;
}

// Şifreleri öğretmenin panelinde sakla (logins tablosu; veli ve öğrenci okuyamaz).
async function saveLogins(store, data, studentId, pwS, pwP) {
  const row = { student_pw: pwS, parent_pw: pwP, updated_at: new Date().toISOString() };
  const old = (data.logins || []).find((x) => x.student_id === studentId);
  try {
    if (old) await store.update('logins', old.id, row);
    else await store.insert('logins', { student_id: studentId, ...row });
  } catch (e) {
    // Saklanamasa da hesap açma/şifre yenileme bozulmasın (ör. güncelleme SQL'i henüz çalışmadıysa)
    console.warn('Şifreler saklanamadı:', e.message);
  }
}

// Kardeşler = aynı veli hesabını kullanan öğrenciler (öğrenci kaydında aynı veli kullanıcı adı)
export function siblingsOf(data, s) {
  return data.students.filter((x) => x.id !== s.id && s.parent_username && x.parent_username === s.parent_username)
    .sort((a, b) => a.name.localeCompare(b.name, 'tr'));
}
const firstName = (x) => x.name.split(' ')[0];

// Ortak veli şifresi değişince tüm kardeşlerin kaydında da güncellensin (öğrenci şifrelerine dokunmadan)
async function saveParentPw(store, data, kids, pwP) {
  for (const k of kids) {
    const l = (data.logins || []).find((x) => x.student_id === k.id);
    await saveLogins(store, data, k.id, l?.student_pw || '', pwP);
  }
}

export function scheduleText(slots) {
  if (!slots?.length) return 'Ders günü yok';
  return [...slots].sort((a, b) => a.dow - b.dow || a.time.localeCompare(b.time))
    .map((s) => `${TR_DAYS_SHORT[s.dow - 1]} ${s.time} (${fmtHours(Number(s.hours))})`).join(', ');
}

export function Students() {
  const { data, now, settings } = useApp();
  const [adding, setAdding] = useState(false);
  const [openId, setOpenId] = useState(null);
  const [showPassive, setShowPassive] = useState(false);
  const list = data.students.filter((s) => (showPassive ? s.active === false : s.active !== false)).sort((a, b) => a.name.localeCompare(b.name, 'tr'));
  const passiveCount = data.students.filter((s) => s.active === false).length;

  return (
    <div class="stack">
      <div class="row">
        <button class="btn primary grow" onClick={() => setAdding(true)}><Icon name="plus" /> Öğrenci ekle</button>
        {passiveCount > 0 && <button class="btn" onClick={() => setShowPassive(!showPassive)}>{showPassive ? 'Aktifler' : `Pasifler (${passiveCount})`}</button>}
      </div>
      <div class="card">
        {list.length === 0 ? <Empty title={showPassive ? 'Pasif öğrenci yok' : 'Henüz öğrenci yok'}>Öğrenci ekleyince ders takvimi ve ödemeler kendiliğinden oluşur.</Empty> : (
          <ul class="list">
            {list.map((s) => {
              const sum = studentSummary(studentPeriods(s, data, now.date, settings));
              const sch = scheduleAt(data.schedules.filter((x) => x.student_id === s.id), now.date);
              return (
                <li key={s.id}>
                  <button class="spread" style="width:100%;background:none;border:0;padding:0;text-align:left;cursor:pointer" onClick={() => setOpenId(s.id)}>
                    <div class="grow">
                      <div class="item-title">{s.name}</div>
                      <div class="item-sub">{scheduleText(sch?.slots)}</div>
                    </div>
                    {sum.late.length ? <span class="chip bad">Gecikti</span> : sum.due.length ? <span class="chip warn">Ödeme zamanı</span> : null}
                    <Icon name="chevron" />
                  </button>
                </li>
              );
            })}
          </ul>
        )}
      </div>
      {adding && <StudentForm onClose={() => setAdding(false)} />}
      {openId && <StudentDetail id={openId} onClose={() => setOpenId(null)} />}
    </div>
  );
}

export function SlotEditor({ slots, setSlots }) {
  const upd = (i, patch) => setSlots((o) => o.map((s, j) => (j === i ? { ...s, ...patch } : s)));
  return (
    <div class="stack">
      {slots.map((s, i) => (
        <div key={i} class="row">
          <select class="input" style="flex:1.3" value={s.dow} onChange={(e) => upd(i, { dow: Number(e.currentTarget.value) })} aria-label="Gün">
            {TR_DAYS.map((d, k) => <option key={k} value={k + 1}>{d}</option>)}
          </select>
          <input class="input" style="flex:1" type="time" value={s.time} onInput={(e) => upd(i, { time: e.currentTarget.value })} aria-label="Saat" />
          <select class="input" style="flex:1" value={s.hours} onChange={(e) => upd(i, { hours: Number(e.currentTarget.value) })} aria-label="Süre">
            {[1, 1.5, 2, 2.5, 3].map((h) => <option key={h} value={h}>{fmtHours(h)}</option>)}
          </select>
          <button type="button" class="btn small ghost" aria-label="Sil" onClick={() => setSlots(slots.filter((_, j) => j !== i))}><Icon name="x" /></button>
        </div>
      ))}
      <button type="button" class="btn small" onClick={() => setSlots([...slots, { dow: 1, time: '17:00', hours: 1 }])}><Icon name="plus" /> Ders günü ekle</button>
    </div>
  );
}

function validSlots(slots) {
  if (!slots.length) return 'En az bir ders günü ekleyin.';
  if (slots.some((s) => !/^\d\d:\d\d$/.test(s.time))) return 'Her ders gününe saat yazın.';
  const keys = slots.map((s) => `${s.dow}-${s.time}`);
  if (new Set(keys).size !== keys.length) return 'Aynı gün ve saat iki kez girilmiş.';
  return null;
}

function PlanFields({ plan, setPlan, errors }) {
  return (
    <>
      <Field label="Ödeme türü" required>
        <Seg cls="four" options={Object.entries(PLAN_TYPES)} value={plan.type} onChange={(type) => setPlan((o) => ({ ...o, type }))} />
      </Field>
      <div class="grid2">
        <Field label={FEE_LABEL[plan.type]} required error={errors.fee}>
          <input class="input" inputMode="decimal" value={plan.fee} onInput={(e) => { const v = e.currentTarget.value; setPlan((o) => ({ ...o, fee: v })); }} placeholder="Ör. 4.000" />
        </Field>
        {plan.type === 'oneoff' && (
          <Field label="Kaç derslik paket" required error={errors.hours}>
            <input class="input" inputMode="decimal" value={plan.hours} onInput={(e) => { const v = e.currentTarget.value; setPlan((o) => ({ ...o, hours: v })); }} placeholder="Ör. 8" />
          </Field>
        )}
      </div>
      {plan.type === 'oneoff' && (
        <Field label="Son ödeme tarihi" required error={errors.due_date}>
          <input class="input" type="date" value={plan.due_date} onInput={(e) => { const v = e.currentTarget.value; setPlan((o) => ({ ...o, due_date: v })); }} />
        </Field>
      )}
      <div class="hint">
        {plan.type === 'monthly' && 'Yapılmayan ders × (aylık ücret ÷ o ayın ders sayısı) tutardan düşülür. Gecikme uyarısı son tarihten 3 gün sonra.'}
        {plan.type === '4weekly' && 'Yapılmayan dersler 4 hafta sonunda tutardan düşülür. Gecikme uyarısı son tarihten 5 gün sonra.'}
        {plan.type === 'weekly' && 'Her hafta sonunda ödeme zamanı gelir; yapılmayan ders düşülür.'}
        {plan.type === 'oneoff' && 'Tek seferlik paket: tutar sabittir; kullanılan ders takip edilir.'}
      </div>
    </>
  );
}

function checkPlan(plan) {
  const e = {};
  const fee = parseTL(plan.fee);
  if (!(fee > 0)) e.fee = 'Geçerli bir tutar yazın.';
  if (plan.type === 'oneoff') {
    const h = Number(String(plan.hours).replace(',', '.'));
    if (!(h > 0)) e.hours = 'Ders sayısını yazın.';
    if (!plan.due_date) e.due_date = 'Son ödeme tarihini seçin.';
  }
  return e;
}
const planRow = (plan, student_id, valid_from) => ({
  student_id, valid_from, type: plan.type, fee: parseTL(plan.fee),
  hours: plan.type === 'oneoff' ? Number(String(plan.hours).replace(',', '.')) : null,
  due_date: plan.type === 'oneoff' ? plan.due_date : null,
});

function StudentForm({ onClose }) {
  const { data, store, reload, now } = useApp();
  const [run, busy] = useAction();
  const [f, setF] = useState({ name: '', phone: '', parent_name: '', parent_phone: '', start_date: now.date, note: '', consent: false, su: '', pu: '' });
  const [sibId, setSibId] = useState(null); // null = yeni veli hesabı; '' / id = kardeşiyle aynı veli
  const sib = sibId ? data.students.find((x) => x.id === sibId) : null;
  const sibPw = sib ? (data.logins || []).find((x) => x.student_id === sib.id)?.parent_pw || '' : '';
  const pickSib = (id) => {
    setSibId(id);
    const x = data.students.find((y) => y.id === id);
    // Veli adı/telefonu boşsa kardeşinkinden doldur (öğretmen değiştirebilir)
    if (x) setF((o) => ({ ...o, parent_name: o.parent_name || x.parent_name, parent_phone: o.parent_phone || x.parent_phone }));
  };
  const [slots, setSlots] = useState([{ dow: 2, time: '17:00', hours: 1 }]);
  const [plan, setPlan] = useState({ type: '4weekly', fee: '', hours: '', due_date: '' });
  const [pw, setPw] = useState(null);
  const [errors, setErrors] = useState({});
  const [done, setDone] = useState(null);
  const set = (k) => (e) => { const v = e.currentTarget.type === 'checkbox' ? e.currentTarget.checked : e.currentTarget.value; setF((o) => ({ ...o, [k]: v })); };

  const save = async () => {
    const e = { ...checkPlan(plan) };
    if (f.name.trim().length < 2) e.name = 'Ad soyad yazın.';
    if (!isValidPhone(f.phone)) e.phone = 'Geçerli bir cep telefonu yazın (05xx xxx xx xx).';
    if (f.parent_name.trim().length < 2) e.parent_name = 'Veli adını yazın.';
    if (!isValidPhone(f.parent_phone)) e.parent_phone = 'Geçerli bir cep telefonu yazın (05xx xxx xx xx).';
    if (!f.start_date) e.start_date = 'Başlangıç tarihini seçin.';
    const sErr = validSlots(slots); if (sErr) e.slots = sErr;
    const su = cleanUsername(f.su), pu = sibId !== null ? sib?.parent_username || '' : cleanUsername(f.pu);
    e.su = checkUsername(su) || undefined;
    if (sibId !== null) e.pu = sib ? undefined : 'Kardeşini seçin.';
    else e.pu = checkUsername(pu) || undefined;
    if (!e.su && !e.pu && su === pu) e.pu = 'Veli ve öğrenci kullanıcı adı farklı olmalı.';
    if (!pw) e.pw = 'Önce "Şifre oluştur" düğmesine basın.';
    Object.keys(e).forEach((k) => e[k] === undefined && delete e[k]);
    setErrors(e);
    if (Object.keys(e).length) return;

    await run(async () => {
      if (await store.accountExists(su)) throw new Error(`"${su}" kullanıcı adı zaten kullanılıyor.`);
      if (!sib && await store.accountExists(pu)) throw new Error(`"${pu}" kullanıcı adı zaten kullanılıyor.`);
      const s = await store.insert('students', {
        name: f.name.trim(), phone: f.phone.trim(), parent_name: f.parent_name.trim(), parent_phone: f.parent_phone.trim(),
        student_username: su, parent_username: pu, start_date: f.start_date, active: true, end_date: null, note: f.note.trim(), consent: f.consent,
      });
      try {
        await store.insert('schedules', { student_id: s.id, valid_from: f.start_date, slots });
        await store.insert('plans', planRow(plan, s.id, f.start_date));
        await store.createAccount({ username: su, password: pw[0], role: 'student', student_id: s.id });
        if (sib) {
          // Veli yeni hesap açılmaz: kardeşinin veli hesabı bu öğrenciyi de görür
          await saveLogins(store, data, s.id, pw[0], sibPw);
          await store.linkSibling(s.id, sib.id);
        } else {
          await store.createAccount({ username: pu, password: pw[1], role: 'parent', student_id: s.id });
          await saveLogins(store, data, s.id, pw[0], pw[1]);
        }
      } catch (x) {
        await store.deleteAccountsFor(s.id).catch(() => {});
        await store.remove('students', s.id).catch(() => {});
        throw x;
      }
      await reload();
      setDone({ student: s, pwS: pw[0], pwP: sib ? sibPw : pw[1], kids: sib ? [...siblingsOf(data, sib), sib, s] : [] });
    }, 'Öğrenci eklendi');
  };

  if (done) return <CredentialsSheet {...done} onClose={onClose} title="Öğrenci eklendi" later />;

  return (
    <Sheet title="Yeni öğrenci" onClose={onClose}>
      <div class="stack">
        <Field label="Öğrenci adı soyadı" required error={errors.name}><input class="input" value={f.name} onInput={set('name')} /></Field>
        <Field label="Öğrenci telefonu" required error={errors.phone}><input class="input" type="tel" inputMode="tel" value={f.phone} onInput={set('phone')} placeholder="05xx xxx xx xx" /></Field>
        <div class="grid2">
          <Field label="Veli adı soyadı" required error={errors.parent_name}><input class="input" value={f.parent_name} onInput={set('parent_name')} /></Field>
          <Field label="Veli telefonu" required error={errors.parent_phone}><input class="input" type="tel" inputMode="tel" value={f.parent_phone} onInput={set('parent_phone')} placeholder="05xx xxx xx xx" /></Field>
        </div>
        <Field label="Derslere başlama tarihi" required error={errors.start_date} hint="Ödeme dönemleri bu tarihten başlar.">
          <input class="input" type="date" value={f.start_date} onInput={set('start_date')} />
        </Field>
        <Field label="Haftalık ders programı" required error={errors.slots} hint="Ders tarihleri bu programdan otomatik hesaplanır.">
          <div />
        </Field>
        <SlotEditor slots={slots} setSlots={setSlots} />
        <PlanFields plan={plan} setPlan={setPlan} errors={errors} />

        <div class="section-head" style="margin-top:10px"><h3 class="section-title" style="font-size:18px">Giriş bilgileri</h3></div>
        <Field label="Veli hesabı" hint={sibId !== null ? 'Veli tek kullanıcı adı ve tek şifreyle iki (ya da daha çok) çocuğunu birden görür. Ders, ödeme ve ödevler yine ayrı tutulur.' : 'Bu öğrencinin kardeşine zaten ders veriyorsanız "Kardeşi kayıtlı"yı seçin.'}>
          <Seg options={[['new', 'Yeni veli hesabı'], ['sib', 'Kardeşi kayıtlı (aynı veli)']]} value={sibId === null ? 'new' : 'sib'}
            onChange={(k) => (k === 'new' ? setSibId(null) : setSibId(sibId || ''))} />
        </Field>
        {sibId !== null && (
          <Field label="Kardeşi" required error={errors.pu}>
            <select class="input" value={sibId} onChange={(e) => pickSib(e.currentTarget.value)}>
              <option value="">Seçin…</option>
              {[...data.students].sort((a, b) => a.name.localeCompare(b.name, 'tr')).map((x) => <option key={x.id} value={x.id}>{x.name}{x.active === false ? ' (pasif)' : ''} · veli: {x.parent_username}</option>)}
            </select>
          </Field>
        )}
        <div class={sibId !== null ? '' : 'grid2'}>
          <Field label="Öğrenci kullanıcı adı" required error={errors.su} hint={f.su && cleanUsername(f.su) !== f.su ? `Kaydedilecek: ${cleanUsername(f.su)}` : 'Harf, rakam, nokta'}>
            <input class="input" autocapitalize="none" value={f.su} onInput={set('su')} />
          </Field>
          {sibId === null && (
            <Field label="Veli kullanıcı adı" required error={errors.pu} hint={f.pu && cleanUsername(f.pu) !== f.pu ? `Kaydedilecek: ${cleanUsername(f.pu)}` : 'Harf, rakam, nokta'}>
              <input class="input" autocapitalize="none" value={f.pu} onInput={set('pu')} />
            </Field>
          )}
        </div>
        {pw ? (
          <div class="grid2">
            <div class="cred"><div><div class="small muted">Öğrenci şifresi</div><code>{pw[0]}</code></div></div>
            {sibId === null
              ? <div class="cred"><div><div class="small muted">Veli şifresi</div><code>{pw[1]}</code></div></div>
              : <div class="cred"><div><div class="small muted">Veli girişi</div><code>{sib ? `${sib.parent_username} (kardeşiyle aynı)` : '—'}</code></div></div>}
          </div>
        ) : null}
        <button type="button" class="btn" onClick={() => { setPw(generatePasswordPair()); setErrors({ ...errors, pw: undefined }); }}><Icon name="key" /> {pw ? 'Yeni şifre oluştur' : 'Şifre oluştur'}</button>
        {errors.pw && <div class="error">{errors.pw}</div>}

        <Field label="Not (isteğe bağlı)"><input class="input" value={f.note} onInput={set('note')} /></Field>
        <label class="check"><input type="checkbox" checked={f.consent} onChange={set('consent')} /> Veliden telefon numarasının ders bilgilendirmesi için kullanılmasına izin alındı (KVKK).</label>
        {Object.keys(errors).filter((k) => errors[k]).length > 0 && <div class="error">Eksik ya da hatalı alanlar var; kırmızı yazılara bakın.</div>}
        <button class="btn primary block" disabled={busy} onClick={save}>{busy ? 'Kaydediliyor…' : 'Öğrenciyi kaydet'}</button>
      </div>
    </Sheet>
  );
}

function CredentialsSheet({ student, pwS, pwP, onClose, title, onReset, busy, later, kids = [] }) {
  const known = !!(pwS || pwP);
  const others = kids.filter((k) => k.id !== student.id);
  const msgP = credentialsMessage(student, pwP, 'parent', kids);
  const msgS = credentialsMessage(student, pwS, 'student');
  return (
    <Sheet title={title} onClose={onClose}>
      <div class="stack">
        <p class="muted" style="margin:0">{known
          ? 'Şifreler yalnızca sizin panelinizde saklanır. Veli öğrencinin, öğrenci velinin şifresini göremez; her birine yalnızca kendi bilgisi gönderilir.'
          : 'Bu öğrencinin şifreleri, şifre saklama özelliğinden önce oluşturulduğu için kayıtlı değil. Aşağıdaki düğmeyle yeni şifre verin; yenileri burada saklanır ve gönderebilirsiniz.'}</p>
        {others.length > 0 && <p class="small" style="margin:0"><b>Kardeşler:</b> veli {others.map(firstName).join(', ')} ile aynı kullanıcı adı ve şifreyle girer; çocuklarını ekranın üstünden seçer. Veli zaten giriş yapıyorsa yeniden göndermeniz gerekmez.</p>}
        {later && <p class="small" style="margin:0">Şimdi göndermek zorunda değilsiniz. İstediğiniz gün: <b>Öğrenciler → {student.name} → Giriş bilgilerini gönder</b>.</p>}
        <div class="grid2">
          <div class="cred"><div><div class="small muted">Öğrenci · {student.student_username}</div><code>{pwS || '—'}</code></div></div>
          <div class="cred"><div><div class="small muted">Veli · {student.parent_username}</div><code>{pwP || '—'}</code></div></div>
        </div>
        {known && (<>
          <div class="msg">{msgP}</div>
          <div class="row wrap">
            <WaButton phone={student.parent_phone} text={msgP} label="Veliye gönder" />
            <button class="btn" onClick={() => copyText(msgP)}><Icon name="copy" /> Kopyala</button>
          </div>
          <div class="msg">{msgS}</div>
          <div class="row wrap">
            {student.phone && <WaButton phone={student.phone} text={msgS} label="Öğrenciye gönder" />}
            <button class="btn" onClick={() => copyText(msgS)}><Icon name="copy" /> Kopyala</button>
          </div>
        </>)}
        {!known && onReset && <button class="btn primary" disabled={busy} onClick={onReset}><Icon name="key" /> Yeni şifre oluştur ve göster</button>}
        <div><button class="btn ghost" onClick={onClose}>{later ? 'Sonra gönderirim' : 'Tamam'}</button></div>
      </div>
    </Sheet>
  );
}

function StudentDetail({ id, onClose }) {
  const { data, now, settings, store, reload } = useApp();
  const [run, busy] = useAction();
  const [mode, setMode] = useState(null); // edit | program | creds | pay:<key>
  const [creds, setCreds] = useState(null);
  const [paying, setPaying] = useState(null);
  const s = data.students.find((x) => x.id === id);
  const periods = useMemo(() => (s ? studentPeriods(s, data, now.date, settings) : []), [s, data, now.date, settings]);
  if (!s) return null;
  const sch = scheduleAt(data.schedules.filter((x) => x.student_id === s.id), now.date) || data.schedules.find((x) => x.student_id === s.id);
  const plans = data.plans.filter((p) => p.student_id === s.id).sort((a, b) => b.valid_from.localeCompare(a.valid_from));
  const plan = plans.find((p) => p.valid_from <= now.date) || plans[0];
  const shown = [...periods].filter((p) => p.status !== 'future').reverse();
  const hw = data.homework.filter((h) => h.student_id === s.id);
  const sibs = siblingsOf(data, s);
  const kids = sibs.length ? [...sibs, s] : [];

  const resetPw = () => {
    if (sibs.length && !confirm(`Veli şifresi ortak: yeni veli şifresi ${sibs.map(firstName).join(', ')} için de geçerli olur. Devam edilsin mi?`)) return;
    run(async () => {
      const [a, b] = generatePasswordPair();
      await store.setPassword({ username: s.student_username, password: a });
      await store.setPassword({ username: s.parent_username, password: b });
      await saveLogins(store, data, s.id, a, b);
      await saveParentPw(store, data, sibs, b);
      await reload();
      setCreds({ student: s, pwS: a, pwP: b, kids });
    }, 'Yeni şifreler oluşturuldu');
  };

  const showPw = () => {
    const l = (data.logins || []).find((x) => x.student_id === s.id);
    setCreds({ student: s, pwS: l?.student_pw || '', pwP: l?.parent_pw || '', title: 'Giriş bilgileri', kids });
  };

  const toggleActive = () => {
    if (s.active !== false) {
      const end = prompt('Son ders tarihi (YYYY-AA-GG). Bu tarihten sonra ders ve ödeme hesaplanmaz:', now.date);
      if (!end) return;
      if (!/^\d{4}-\d{2}-\d{2}$/.test(end)) return alert('Tarih YYYY-AA-GG biçiminde olmalı.');
      run(async () => { await store.update('students', s.id, { active: false, end_date: end }); await reload(); }, 'Öğrenci pasife alındı');
    } else {
      run(async () => { await store.update('students', s.id, { active: true, end_date: null }); await reload(); }, 'Öğrenci yeniden aktif');
    }
  };
  const del = () => {
    const sibNote = sibs.length ? ` Ortak veli hesabı silinmez; ${sibs.map(firstName).join(', ')} için çalışmaya devam eder.` : '';
    if (!confirm(`${s.name} ve tüm kayıtları (dersler, ödemeler, ödevler, giriş hesapları) kalıcı olarak silinsin mi? Bu geri alınamaz. Ayrılan öğrenci için "Pasife al" önerilir.${sibNote}`)) return;
    run(async () => { await store.deleteAccountsFor(s.id); await store.remove('students', s.id); onClose(); await reload(); }, 'Öğrenci silindi');
  };

  if (creds) return <CredentialsSheet title="Yeni şifreler" {...creds} onReset={resetPw} busy={busy} onClose={() => setCreds(null)} />;
  if (mode === 'edit') return <EditSheet s={s} onClose={() => setMode(null)} />;
  if (mode === 'sib') return <SiblingSheet s={s} onClose={() => setMode(null)} />;
  if (mode === 'unsib') return <UnlinkSheet s={s} sibs={sibs} onClose={() => setMode(null)} onDone={(c) => { setMode(null); setCreds(c); }} />;
  if (mode === 'extra') return <ExtraLessonSheet studentId={s.id} onClose={() => setMode(null)} />;
  if (mode === 'program') return <ProgramSheet s={s} sch={sch} plan={plan} onClose={() => setMode(null)} />;
  if (paying) return <PaymentSheet period={paying} onClose={() => setPaying(null)} />;

  return (
    <Sheet title={s.name} onClose={onClose}>
      <div class="stack-lg">
        <div class="card">
          <ul class="list">
            <li class="spread"><span class="muted">Öğrenci</span><a href={`tel:${s.phone}`}>{s.phone}</a></li>
            <li class="spread"><span class="muted">Veli</span><span class="right">{s.parent_name}<br /><a href={`tel:${s.parent_phone}`}>{s.parent_phone}</a></span></li>
            <li class="spread"><span class="muted">Program</span><span class="right">{scheduleText(sch?.slots)}</span></li>
            <li class="spread"><span class="muted">Ödeme</span><span class="right">{plan ? `${PLAN_TYPES[plan.type]} · ${fmtTL(plan.fee)}` : '—'}</span></li>
            <li class="spread"><span class="muted">Başlangıç</span><span>{fmtDate(s.start_date)}{s.active === false ? ` · bitiş ${fmtDate(s.end_date)}` : ''}</span></li>
            <li class="spread"><span class="muted">Kullanıcı adları</span><span class="right">Öğrenci: {s.student_username}<br />Veli: {s.parent_username}{sibs.length ? ' (ortak)' : ''}</span></li>
            {sibs.length > 0 && <li class="spread"><span class="muted">Kardeşler</span><span class="right">{sibs.map((x) => x.name).join(', ')}</span></li>}
            <li class="spread"><span class="muted">Ödevler</span><span>{hw.filter((h) => h.done).length} / {hw.length} yapıldı</span></li>
          </ul>
        </div>
        <button class="btn primary" onClick={showPw}><Icon name="key" /> Giriş bilgilerini gönder (veli / öğrenci)</button>
        <div class="row wrap">
          <button class="btn small" onClick={() => setMode('edit')}><Icon name="edit" /> Bilgileri düzenle</button>
          <button class="btn small" onClick={() => setMode('program')}><Icon name="calendar" /> Program / ücret değiştir</button>
          <button class="btn small" onClick={() => setMode('extra')}><Icon name="plus" /> Ek ders ekle</button>
          <button class="btn small" disabled={busy} onClick={resetPw}><Icon name="key" /> Şifreleri yenile</button>
          <button class="btn small" onClick={() => setMode('sib')}><Icon name="plus" /> Kardeş bağla (ortak veli)</button>
          {sibs.length > 0 && <button class="btn small ghost" onClick={() => setMode('unsib')}>Kardeşten ayır</button>}
        </div>

        <TeacherVoiceNotes s={s} />

        <section>
          <div class="section-head"><h3 class="section-title">Ödeme dönemleri</h3></div>
          <div class="card">
            {shown.length ? (
              <ul class="list">
                {shown.map((p) => (
                  <li key={p.key} class="stack">
                    <PeriodBody p={p} showName={false} />
                    {p.remaining > 0 && p.status !== 'future' && <div><button class="btn small" onClick={() => setPaying(p)}>Ödeme al</button></div>}
                  </li>
                ))}
              </ul>
            ) : <Empty title="Henüz dönem yok">Başlangıç tarihi geldiğinde ilk dönem açılır.</Empty>}
          </div>
        </section>

        <div class="row wrap">
          <button class="btn small" onClick={toggleActive}>{s.active === false ? 'Yeniden aktif et' : 'Pasife al (ayrıldı)'}</button>
          <button class="btn small danger ghost" onClick={del}><Icon name="trash" /> Sil</button>
        </div>
      </div>
    </Sheet>
  );
}

/** Kardeş bağla: bu öğrencinin velisi, seçilen kardeşin veli hesabıyla (tek kullanıcı adı + şifre) girer */
function SiblingSheet({ s, onClose }) {
  const { data, store, reload } = useApp();
  const [run, busy] = useAction();
  const [sibId, setSibId] = useState('');
  const mine = siblingsOf(data, s);
  const options = data.students.filter((x) => x.id !== s.id && !mine.some((m) => m.id === x.id)).sort((a, b) => a.name.localeCompare(b.name, 'tr'));
  const sib = data.students.find((x) => x.id === sibId);
  const save = () => run(async () => {
    await store.linkSibling(s.id, sib.id);
    await reload();
    onClose();
  }, 'Kardeş bağlandı');
  return (
    <Sheet title="Kardeş bağla" onClose={onClose}>
      <div class="stack">
        <p class="muted" style="margin:0">Veli tek kullanıcı adı ve tek şifreyle kardeşlerin hepsini görür; ekranın üstünden çocuğunu seçer. Ders, ödeme, muhasebe ve ödevler her öğrencide <b>ayrı</b> kalır.</p>
        <Field label={`${s.name} kimin kardeşi?`} required>
          <select class="input" value={sibId} onChange={(e) => setSibId(e.currentTarget.value)}>
            <option value="">Seçin…</option>
            {options.map((x) => <option key={x.id} value={x.id}>{x.name}{x.active === false ? ' (pasif)' : ''} · veli: {x.parent_username}</option>)}
          </select>
        </Field>
        {sib && (
          <div class="msg">
            {s.name} velisi artık <b>{sib.parent_username}</b> kullanıcı adı ve {sib.name} velisinin şifresiyle girer.
            {' '}{s.name} için açılmış ayrı veli kullanıcı adı (<b>{s.parent_username}</b>) kapatılır.
            {mine.length > 0 && ` ${mine.map(firstName).join(', ')} de bu ortak hesaba geçer.`}
          </div>
        )}
        <button class="btn primary block" disabled={busy || !sib} onClick={save}>{busy ? 'Bağlanıyor…' : 'Kardeş olarak bağla'}</button>
      </div>
    </Sheet>
  );
}

/** Kardeşten ayır: bu öğrenciye yeni, ayrı bir veli hesabı açılır; diğer kardeşler eski ortak hesapta kalır */
function UnlinkSheet({ s, sibs, onClose, onDone }) {
  const { data, store, reload } = useApp();
  const [run, busy] = useAction();
  const [u, setU] = useState('');
  const [err, setErr] = useState('');
  const save = async () => {
    const pu = cleanUsername(u);
    const e = checkUsername(pu);
    setErr(e || '');
    if (e) return;
    const [pwP] = generatePasswordPair();
    await run(async () => {
      if (await store.accountExists(pu)) throw new Error(`"${pu}" kullanıcı adı zaten kullanılıyor.`);
      await store.unlinkSibling(s.id, { username: pu, password: pwP });
      await store.update('students', s.id, { parent_username: pu });
      const l = (data.logins || []).find((x) => x.student_id === s.id);
      await saveLogins(store, data, s.id, l?.student_pw || '', pwP);
      await reload();
      onDone({ student: { ...s, parent_username: pu }, pwS: l?.student_pw || '', pwP, title: 'Yeni veli girişi' });
    }, 'Kardeşten ayrıldı');
  };
  return (
    <Sheet title="Kardeşten ayır" onClose={onClose}>
      <div class="stack">
        <p class="muted" style="margin:0">{s.name} için yeni ve ayrı bir veli hesabı açılır. {sibs.map(firstName).join(', ')} eski ortak hesapta ({s.parent_username}) kalır. Hiçbir ders, ödeme ya da ödev kaydı değişmez.</p>
        <Field label="Yeni veli kullanıcı adı" required error={err} hint={u && cleanUsername(u) !== u ? `Kaydedilecek: ${cleanUsername(u)}` : 'Harf, rakam, nokta'}>
          <input class="input" autocapitalize="none" value={u} onInput={(e) => setU(e.currentTarget.value)} />
        </Field>
        <button class="btn primary block" disabled={busy} onClick={save}>{busy ? 'Ayrılıyor…' : 'Ayır ve yeni şifre oluştur'}</button>
      </div>
    </Sheet>
  );
}

function EditSheet({ s, onClose }) {
  const { data, store, reload } = useApp();
  const [run, busy] = useAction();
  const [f, setF] = useState({ name: s.name, phone: s.phone, parent_name: s.parent_name, parent_phone: s.parent_phone, note: s.note || '', consent: !!s.consent, start_date: s.start_date });
  const byDate = (a, b) => a.valid_from.localeCompare(b.valid_from);
  const ownSch = data.schedules.filter((x) => x.student_id === s.id).sort(byDate);
  const ownPlans = data.plans.filter((x) => x.student_id === s.id).sort(byDate);
  const hasPay = data.payments.some((p) => p.student_id === s.id && !p.deleted_at);
  const [errors, setErrors] = useState({});
  const set = (k) => (e) => { const v = e.currentTarget.type === 'checkbox' ? e.currentTarget.checked : e.currentTarget.value; setF((o) => ({ ...o, [k]: v })); };
  const save = async () => {
    const e = {};
    if (f.name.trim().length < 2) e.name = 'Ad soyad yazın.';
    if (!isValidPhone(f.phone)) e.phone = 'Geçerli bir cep telefonu yazın.';
    if (f.parent_name.trim().length < 2) e.parent_name = 'Veli adını yazın.';
    if (!isValidPhone(f.parent_phone)) e.parent_phone = 'Geçerli bir cep telefonu yazın.';
    const moved = f.start_date !== s.start_date;
    if (moved) {
      // İlk program/ücret sürümü başlangıçla birlikte kayar; sonraki bir değişikliği geçemez
      const next = [ownSch[1], ownPlans[1]].filter(Boolean).map((x) => x.valid_from).sort()[0];
      if (!/^\d{4}-\d{2}-\d{2}$/.test(f.start_date || '')) e.start_date = 'Tarih seçin.';
      else if (next && f.start_date >= next) e.start_date = `${fmtDate(next)} tarihinde program/ücret değişikliği var; başlangıç bundan önce olmalı.`;
      else if (s.active === false && s.end_date && f.start_date > s.end_date) e.start_date = 'Son ders tarihinden sonra olamaz.';
    }
    setErrors(e);
    if (Object.keys(e).length) return;
    if (moved && hasPay && !confirm('Başlangıç tarihi değişince ödeme dönemlerinin tarihleri de kayar. Alınmış ödemeler sırasıyla (1. dönem, 2. dönem…) yerinde kalır. Devam edilsin mi?')) return;
    const ok = await run(async () => {
      await store.update('students', s.id, { ...f, name: f.name.trim(), parent_name: f.parent_name.trim() });
      if (moved) {
        if (ownSch[0] && ownSch[0].valid_from <= s.start_date) await store.update('schedules', ownSch[0].id, { valid_from: f.start_date });
        if (ownPlans[0] && ownPlans[0].valid_from <= s.start_date) await store.update('plans', ownPlans[0].id, { valid_from: f.start_date });
      }
      await reload();
    }, 'Kaydedildi');
    if (ok) onClose();
  };
  return (
    <Sheet title="Bilgileri düzenle" onClose={onClose}>
      <div class="stack">
        <Field label="Öğrenci adı soyadı" required error={errors.name}><input class="input" value={f.name} onInput={set('name')} /></Field>
        <Field label="Öğrenci telefonu" required error={errors.phone}><input class="input" type="tel" value={f.phone} onInput={set('phone')} /></Field>
        <Field label="Veli adı soyadı" required error={errors.parent_name}><input class="input" value={f.parent_name} onInput={set('parent_name')} /></Field>
        <Field label="Veli telefonu" required error={errors.parent_phone}><input class="input" type="tel" value={f.parent_phone} onInput={set('parent_phone')} /></Field>
        <Field label="Derslere başlama tarihi" required error={errors.start_date} hint="Değişirse ders takvimi ve ödeme dönemleri yeni tarihten hesaplanır.">
          <input class="input" type="date" value={f.start_date} onInput={set('start_date')} />
        </Field>
        <Field label="Not"><input class="input" value={f.note} onInput={set('note')} /></Field>
        <label class="check"><input type="checkbox" checked={f.consent} onChange={set('consent')} /> Veli izni alındı (KVKK)</label>
        <button class="btn primary block" disabled={busy} onClick={save}>Kaydet</button>
      </div>
    </Sheet>
  );
}

/** Program/ücret değişikliği: geçmiş dönemler bozulmasın diye YENİ SÜRÜM olarak, seçilen tarihten itibaren geçerli olur */
function ProgramSheet({ s, sch, plan, onClose }) {
  const { store, reload, now } = useApp();
  const [run, busy] = useAction();
  const [from, setFrom] = useState(now.date);
  const [slots, setSlots] = useState(sch?.slots?.map((x) => ({ ...x })) || []);
  const [p, setP] = useState(plan ? { type: plan.type, fee: String(plan.fee / 100).replace('.', ','), hours: plan.hours ? String(plan.hours) : '', due_date: plan.due_date || '' } : { type: '4weekly', fee: '', hours: '', due_date: '' });
  const [errors, setErrors] = useState({});
  const [changePlan, setChangePlan] = useState(false);
  const save = async () => {
    const e = changePlan ? checkPlan(p) : {};
    const sErr = validSlots(slots); if (sErr) e.slots = sErr;
    if (!from) e.from = 'Tarih seçin.';
    if (from < s.start_date) e.from = 'Başlangıç tarihinden önce olamaz.';
    setErrors(e);
    if (Object.keys(e).length) return;
    const ok = await run(async () => {
      const same = data => data && data.valid_from === from;
      if (same(sch)) await store.update('schedules', sch.id, { slots });
      else await store.insert('schedules', { student_id: s.id, valid_from: from, slots });
      if (changePlan) {
        if (same(plan)) await store.update('plans', plan.id, planRow(p, s.id, from));
        else await store.insert('plans', planRow(p, s.id, from));
      }
      await reload();
    }, 'Değişiklik kaydedildi');
    if (ok) onClose();
  };
  return (
    <Sheet title="Program ve ücret" onClose={onClose}>
      <div class="stack">
        <Field label="Geçerlilik tarihi" required error={errors.from} hint="Bu tarihten önceki dersler ve ödemeler değişmez.">
          <input class="input" type="date" value={from} onInput={(e) => setFrom(e.currentTarget.value)} />
        </Field>
        <Field label="Haftalık ders programı" required error={errors.slots}><div /></Field>
        <SlotEditor slots={slots} setSlots={setSlots} />
        <label class="check"><input type="checkbox" checked={changePlan} onChange={(e) => setChangePlan(e.currentTarget.checked)} /> Ödeme türünü / ücreti de değiştir</label>
        {changePlan && <PlanFields plan={p} setPlan={setP} errors={errors} />}
        {changePlan && <div class="hint">Süren dönem bu tarihte kapanır; o dönemin tutarı yapılan ders oranında hesaplanır, yeni dönem bu tarihte başlar.</div>}
        <button class="btn primary block" disabled={busy} onClick={save}>Kaydet</button>
      </div>
    </Sheet>
  );
}

export { StatusChip, STATUS_LABEL, addDays };

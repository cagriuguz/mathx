// DENEME MODU: veriler yalnızca bu cihazın tarayıcısında durur (senkron yok).
// Supabase ayarları girilince program otomatik olarak çevrimiçi moda geçer (bkz. store/index.js).
import { TABLES, ROLE_TABLES, DEFAULT_SETTINGS, uid } from './common.js';
import { addDays, localNow, dow } from '../core/dates.js';

const KEY = 'mathx.demo.v1';
const SESSION = 'mathx.demo.session';
const chan = typeof BroadcastChannel !== 'undefined' ? new BroadcastChannel('mathx-demo') : null;

async function hash(text) {
  const buf = await crypto.subtle.digest('SHA-256', new TextEncoder().encode('mathx:' + text));
  return [...new Uint8Array(buf)].map((b) => b.toString(16).padStart(2, '0')).join('');
}

function read() {
  try { return JSON.parse(localStorage.getItem(KEY)); } catch { return null; }
}
function write(db) {
  localStorage.setItem(KEY, JSON.stringify(db));
  chan?.postMessage('changed');
}

async function seed() {
  const today = localNow().date;
  const start = addDays(today, -40);
  const db = Object.fromEntries(TABLES.map((t) => [t, []]));
  db.settings = [{ ...DEFAULT_SETTINGS, teacher_name: 'Çağrı Uğuz', teacher_phone: '0532 000 00 00' }];
  db.accounts = [{ id: 'u-teacher', username: 'ogretmen', pw: await hash('deneme123'), role: 'teacher', student_id: null }];
  const kids = [
    { name: 'Deniz Aksoy', parent: 'Selin Aksoy', type: '4weekly', fee: 480000, slots: [[2, '17:00', 1], [5, '18:00', 1]] },
    { name: 'Ege Karaca', parent: 'Murat Karaca', type: 'monthly', fee: 600000, slots: [[3, '16:00', 1.5]] },
    { name: 'Zeynep Tunç', parent: 'Ayşe Tunç', type: 'weekly', fee: 150000, slots: [[6, '11:00', 1]] },
  ];
  for (const [i, k] of kids.entries()) {
    const sid = uid();
    const su = k.name.split(' ')[0].toLocaleLowerCase('tr').replace('ı', 'i').replace('ç', 'c').replace('ş', 's').replace('ü', 'u').replace('ğ', 'g').replace('ö', 'o');
    db.students.push({ id: sid, name: k.name, phone: `0532 000 00 0${i + 1}`, parent_name: k.parent, parent_phone: `0533 000 00 0${i + 1}`, student_username: su, parent_username: su + '.veli', start_date: start, active: true, end_date: null, note: '', consent: true, created_at: new Date().toISOString() });
    db.accounts.push({ id: uid(), username: su, pw: await hash('ogrenci123'), role: 'student', student_id: sid });
    db.accounts.push({ id: uid(), username: su + '.veli', pw: await hash('veli123'), role: 'parent', student_id: sid });
    db.schedules.push({ id: uid(), student_id: sid, valid_from: start, slots: k.slots.map(([d, t, h]) => ({ dow: d, time: t, hours: h })) });
    db.plans.push({ id: uid(), student_id: sid, valid_from: start, type: k.type, fee: k.fee, hours: null, due_date: null });
  }
  // İlk öğrencinin bir dersi yapılmadı
  const d0 = db.students[0];
  for (let n = 1; n < 20; n++) {
    const iso = addDays(today, -n);
    if (dow(iso) === 2) { db.marks.push({ id: uid(), student_id: d0.id, date: iso, time: '17:00', reason: 'Okul gezisi nedeniyle gelemedi', created_at: new Date().toISOString() }); break; }
  }
  const books = [['Karekök 7', 0], ['Limit Yayınları', 0], ['Bilfen Soru Bankası', 1], ['Palme Fasikül', 2]].map(([name, i]) => ({ id: uid(), name, active: true, student_id: db.students[i].id }));
  db.books = books;
  db.homework.push({ id: uid(), student_id: d0.id, given_date: addDays(today, -3), due_date: addDays(today, 2), items: [{ book_id: books[0].id, book_name: books[0].name, pages: '12-20' }, { book_id: books[1].id, book_name: books[1].name, pages: '45-48' }], note: '', done: false, done_at: null, sent_given: true, sent_done: false, seen_done: true });
  db.homework.push({ id: uid(), student_id: db.students[1].id, given_date: addDays(today, -6), due_date: addDays(today, -1), items: [{ book_id: books[2].id, book_name: books[2].name, pages: '30-34' }], note: '', done: true, done_at: new Date().toISOString(), sent_given: true, sent_done: false, seen_done: false });
  db.expenses.push({ id: uid(), name: 'Kira', category: 'Kira', amount: 750000, due_day: 5, start_month: today.slice(0, 7), end_month: null, active: true, note: '' });
  db.expenses.push({ id: uid(), name: 'İnternet', category: 'Faturalar', amount: 45000, due_day: 20, start_month: today.slice(0, 7), end_month: null, active: true, note: '' });
  write(db);
  return db;
}

export function createLocalStore() {
  let db = read();
  const listeners = new Set();
  chan?.addEventListener('message', () => { db = read(); listeners.forEach((f) => f()); });

  const session = () => { try { return JSON.parse(localStorage.getItem(SESSION)); } catch { return null; } };

  const store = {
    mode: 'demo',
    async init() {
      if (!db) db = await seed();
      return session();
    },
    async teacherExists() { return true; },
    async login(username, password) {
      const u = String(username).trim().toLowerCase();
      const acc = db.accounts.find((a) => a.username === u);
      if (!acc || acc.pw !== (await hash(password))) throw new Error('Kullanıcı adı ya da şifre hatalı.');
      const s = { user_id: acc.id, username: acc.username, role: acc.role, student_id: acc.student_id };
      localStorage.setItem(SESSION, JSON.stringify(s));
      return s;
    },
    async logout() { localStorage.removeItem(SESSION); },
    async load() {
      const s = session();
      if (!s) return null;
      const out = {};
      for (const t of TABLES) {
        let rows = ROLE_TABLES[s.role].includes(t) ? db[t] : [];
        if (s.role !== 'teacher') rows = rows.filter((r) => (t === 'students' ? r.id : r.student_id) === s.student_id);
        out[t] = structuredClone(rows);
      }
      if (s.role === 'student') out.me = { name: db.students.find((x) => x.id === s.student_id)?.name || '' };
      return out;
    },
    async insert(table, row) {
      const r = { id: uid(), ...row };
      db[table].push(r); write(db); return r;
    },
    async update(table, id, patch) {
      const r = db[table].find((x) => x.id === id);
      if (!r) throw new Error('Kayıt bulunamadı.');
      Object.assign(r, patch); write(db); return r;
    },
    async remove(table, id) {
      db[table] = db[table].filter((x) => x.id !== id); write(db);
    },
    async upsertSettings(patch) {
      db.settings[0] = { ...db.settings[0], ...patch }; write(db); return db.settings[0];
    },
    async createAccount({ username, password, role, student_id }) {
      if (db.accounts.some((a) => a.username === username)) throw new Error(`"${username}" kullanıcı adı zaten kullanılıyor.`);
      const acc = { id: uid(), username, pw: await hash(password), role, student_id };
      db.accounts.push(acc); write(db); return acc.id;
    },
    async setPassword({ username, password }) {
      const acc = db.accounts.find((a) => a.username === username);
      if (!acc) throw new Error('Hesap bulunamadı.');
      acc.pw = await hash(password); write(db);
    },
    async accountExists(username) { return db.accounts.some((a) => a.username === username); },
    async deleteAccountsFor(studentId) { db.accounts = db.accounts.filter((a) => a.student_id !== studentId); write(db); },
    async setHomeworkDone(id, done) {
      const s = session();
      const h = db.homework.find((x) => x.id === id);
      if (!h || (s.role !== 'teacher' && h.student_id !== s.student_id)) throw new Error('Bu ödeve erişiminiz yok.');
      if (s.role === 'parent') throw new Error('Ödevi yalnızca öğrenci işaretleyebilir.');
      if (s.role === 'student' && !done) throw new Error('Yapıldı olarak işaretlenen ödev geri alınamaz.');
      if (s.role === 'student' && h.done) return h; // ikinci basış tarihi değiştirmez
      Object.assign(h, { done, done_at: done ? new Date().toISOString() : null, seen_done: !done ? true : false, sent_done: false });
      write(db); return h;
    },
    // Deneme modunda gerçek mesaj gitmez; bilgiler yalnız bu cihazda (anahtar saklanmaz)
    async waSend() { return { ok: false, error: 'Deneme modunda otomatik mesaj gönderilmez.' }; },
    async waStatus() { const c = db.wa_demo || {}; return { business_phone: c.business_phone || '', phone_number_id: c.phone_number_id || '', has_token: !!c.has_token }; },
    async setWaConfig({ business_phone, phone_number_id, token }) {
      db.wa_demo = { business_phone, phone_number_id, has_token: !!token || !!db.wa_demo?.has_token }; write(db);
    },
    subscribe(fn) { listeners.add(fn); return () => listeners.delete(fn); },
    async resetDemo() { localStorage.removeItem(KEY); db = await seed(); },
  };
  return store;
}

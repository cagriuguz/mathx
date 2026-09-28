// DENEME MODU: veriler yalnızca bu cihazın tarayıcısında durur (senkron yok).
// Supabase ayarları girilince program otomatik olarak çevrimiçi moda geçer (bkz. store/index.js).
import { TABLES, ROLE_TABLES, DEFAULT_SETTINGS, uid } from './common.js';
import { MAX_PHOTOS } from '../core/photos.js';
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
  // Deneme modunda fotoğrafların kendisi yalnız bu oturumun belleğinde durur (tarayıcı deposu ~5 MB, sığmaz)
  const pics = new Map();
  chan?.addEventListener('message', () => { db = read(); listeners.forEach((f) => f()); });

  const session = () => { try { return JSON.parse(localStorage.getItem(SESSION)); } catch { return null; } };
  // Veli: kendi öğrencisi + bağlı kardeşleri (acc.links); öğrenci: yalnız kendisi
  const kidsOf = (acc) => [acc.student_id, ...(acc.role === 'parent' ? acc.links || [] : [])].filter(Boolean);
  const myIds = (s) => { const acc = db.accounts.find((a) => a.id === s.user_id); return acc ? kidsOf(acc) : [s.student_id]; };
  const parentsOf = (sid) => db.accounts.filter((a) => a.role === 'parent' && kidsOf(a).includes(sid));
  // Hesabın ilk öğrencisi silinir/ayrılırsa sıradaki kardeş ilk öğrenci olur; çocuğu kalmazsa false
  const dropKid = (acc, sid) => {
    acc.links = (acc.links || []).filter((x) => x !== sid);
    if (acc.student_id !== sid) return true;
    if (!acc.links.length) return false;
    acc.student_id = acc.links.shift();
    return true;
  };

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
      const ids = new Set(myIds(s));
      for (const t of TABLES) {
        let rows = ROLE_TABLES[s.role].includes(t) ? db[t] || [] : [];
        if (s.role !== 'teacher') rows = rows.filter((r) => ids.has(t === 'students' ? r.id : r.student_id));
        out[t] = structuredClone(t === 'voice_notes' ? rows.map(({ audio, ...r }) => r) : rows);
      }
      if (s.role === 'student') out.me = { name: db.students.find((x) => x.id === s.student_id)?.name || '' };
      return out;
    },
    async insert(table, row) {
      const r = { id: uid(), created_at: new Date().toISOString(), ...row };
      (db[table] ||= []).push(r); write(db);
      if (table === 'voice_notes') { const { audio, ...rest } = r; return rest; }
      return r;
    },
    async voiceAudio(id) {
      const v = (db.voice_notes || []).find((x) => x.id === id);
      const s = session();
      if (!v || (s.role !== 'teacher' && (s.role !== 'parent' || !myIds(s).includes(v.student_id)))) throw new Error('Bu nota erişiminiz yok.');
      return v.audio;
    },
    async markVoiceHeard(id) {
      const v = (db.voice_notes || []).find((x) => x.id === id);
      const s = session();
      if (!v || s.role !== 'parent' || !myIds(s).includes(v.student_id)) throw new Error('Bu nota erişiminiz yok.');
      if (!v.heard_at) { v.heard_at = new Date().toISOString(); write(db); }
    },
    // ── Ödev fotoğrafları (Supabase'teki kuralların aynısı)
    async addPhoto(h, { image, thumb }) {
      const s = session();
      const hw = db.homework.find((x) => x.id === h.id);
      if (!hw || (s.role !== 'teacher' && (s.role !== 'student' || hw.student_id !== s.student_id))) throw new Error('Bu ödeve erişiminiz yok.');
      if (s.role === 'student' && hw.done) throw new Error('Bu ödeve artık fotoğraf eklenemez (ödev "yapıldı" olarak işaretlenmiş).');
      const list = (db.homework_photos ||= []);
      if (list.filter((p) => p.homework_id === hw.id).length >= MAX_PHOTOS) throw new Error(`Bir ödeve en fazla ${MAX_PHOTOS} fotoğraf yüklenebilir`);
      const r = { id: uid(), homework_id: hw.id, student_id: hw.student_id, bytes: image.length, created_at: new Date().toISOString() };
      list.push(r); pics.set(r.id, { image, thumb }); write(db);
      return { ...r };
    },
    async removePhoto(id) {
      const s = session();
      const p = (db.homework_photos || []).find((x) => x.id === id);
      const hw = p && db.homework.find((x) => x.id === p.homework_id);
      if (!p) throw new Error('Fotoğraf bulunamadı.');
      if (s.role !== 'teacher' && (s.role !== 'student' || p.student_id !== s.student_id || hw?.done)) throw new Error('Bu fotoğraf silinemez (ödev "yapıldı" olarak işaretlenmiş).');
      db.homework_photos = db.homework_photos.filter((x) => x.id !== id); pics.delete(id); write(db);
    },
    photoAccess(p) {
      const s = session();
      if (!p || !s) return false;
      return s.role === 'teacher' || (s.role === 'student' ? p.student_id === s.student_id : myIds(s).includes(p.student_id));
    },
    async photoThumbs(homeworkId) {
      return (db.homework_photos || []).filter((p) => p.homework_id === homeworkId && store.photoAccess(p))
        .sort((a, b) => a.created_at.localeCompare(b.created_at))
        .map((p) => ({ id: p.id, created_at: p.created_at, thumb: pics.get(p.id)?.thumb || '' }));
    },
    async photoImage(id) {
      const p = (db.homework_photos || []).find((x) => x.id === id);
      if (!store.photoAccess(p)) throw new Error('Bu fotoğrafa erişiminiz yok.');
      const img = pics.get(id)?.image;
      if (!img) throw new Error('Deneme modunda fotoğraflar yalnız yüklendiği oturumda görünür.');
      return img;
    },
    async removePhotosBefore(iso) {
      const old = (db.homework_photos || []).filter((p) => p.created_at < iso);
      db.homework_photos = (db.homework_photos || []).filter((p) => p.created_at >= iso);
      old.forEach((p) => pics.delete(p.id)); write(db);
      return old.length;
    },
    async update(table, id, patch) {
      const r = db[table].find((x) => x.id === id);
      if (!r) throw new Error('Kayıt bulunamadı.');
      Object.assign(r, patch); write(db); return r;
    },
    async remove(table, id) {
      db[table] = (db[table] || []).filter((x) => x.id !== id);
      // Supabase'teki "on delete cascade" gibi: ödev/öğrenci silinince fotoğrafları da gider
      if (table === 'homework' || table === 'students') db.homework_photos = (db.homework_photos || []).filter((p) => (table === 'homework' ? p.homework_id : p.student_id) !== id);
      write(db);
    },
    async upsertSettings(patch) {
      db.settings[0] = { ...db.settings[0], ...patch }; write(db); return db.settings[0];
    },
    async createAccount({ username, password, role, student_id }) {
      if (db.accounts.some((a) => a.username === username)) throw new Error(`"${username}" kullanıcı adı zaten kullanılıyor.`);
      const acc = { id: uid(), username, pw: await hash(password), role, student_id, links: [] };
      db.accounts.push(acc); write(db); return acc.id;
    },
    async setPassword({ username, password }) {
      const acc = db.accounts.find((a) => a.username === username);
      if (!acc) throw new Error('Hesap bulunamadı.');
      acc.pw = await hash(password); write(db);
    },
    async accountExists(username) { return db.accounts.some((a) => a.username === username); },
    async deleteAccountsFor(studentId) {
      db.accounts = db.accounts.filter((a) => {
        if (a.role === 'student') return a.student_id !== studentId;
        if (a.role === 'parent' && kidsOf(a).includes(studentId)) return dropKid(a, studentId);
        return true;
      });
      write(db);
    },
    async linkSibling(studentId, siblingId) {
      if (studentId === siblingId) throw new Error('Öğrenci kendisiyle kardeş olamaz.');
      const target = parentsOf(siblingId)[0];
      if (!target) throw new Error('Kardeşin veli hesabı bulunamadı.');
      for (const old of parentsOf(studentId).filter((a) => a !== target)) {
        for (const k of kidsOf(old)) if (k !== target.student_id && !(target.links ||= []).includes(k)) target.links.push(k);
        db.accounts = db.accounts.filter((a) => a !== old);
      }
      if (studentId !== target.student_id && !(target.links ||= []).includes(studentId)) target.links.push(studentId);
      const pw = (db.logins || []).find((l) => l.student_id === siblingId)?.parent_pw || '';
      for (const k of kidsOf(target)) {
        const st = db.students.find((x) => x.id === k); if (st) st.parent_username = target.username;
        const l = (db.logins ||= []).find((x) => x.student_id === k);
        if (l) l.parent_pw = pw; else db.logins.push({ id: uid(), student_id: k, student_pw: '', parent_pw: pw });
      }
      write(db); return target.username;
    },
    async unlinkSibling(studentId, { username, password }) {
      const olds = parentsOf(studentId);
      if (olds.every((a) => kidsOf(a).length < 2)) throw new Error('Bu öğrencinin kardeşi yok; ayırmaya gerek yok.');
      await store.createAccount({ username, password, role: 'parent', student_id: studentId });
      for (const a of olds) dropKid(a, studentId);
      write(db);
    },
    async setHomeworkDone(id, done) {
      const s = session();
      const h = db.homework.find((x) => x.id === id);
      if (!h || (s.role !== 'teacher' && h.student_id !== s.student_id)) throw new Error('Bu ödeve erişiminiz yok.');
      if (s.role === 'parent') throw new Error('Ödevi yalnızca öğrenci işaretleyebilir.');
      if (s.role === 'student' && !done) throw new Error('Yapıldı olarak işaretlenen ödev geri alınamaz.');
      if (s.role === 'student' && h.done) return h; // ikinci basış tarihi değiştirmez
      if (s.role === 'student' && !(db.homework_photos || []).some((p) => p.homework_id === id)) throw new Error('Önce ödevinin fotoğrafını yükle (en az 1 fotoğraf)');
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

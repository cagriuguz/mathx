// ÇALIŞMA TAKİBİ: 1) güncelleme SQL'i bugünkü (yayındaki) veritabanının hiçbir kaydını değiştirmez, iki kez çalışır;
// 2) gerçek PostgreSQL'de yetkiler (öğrenci yalnız log_study ile yazar, başkasını göremez, veli yalnız okur);
// 3) çalışma günü / çalışmadı hesabı; 4) rastgele oturum: kapalı öğrenci asla uyarı üretmez, çalışan asla "çalışmadı" olmaz.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { execSync } from 'node:child_process';
import { PGlite } from '@electric-sql/pglite';
import { pgcrypto } from '@electric-sql/pglite/contrib/pgcrypto';
import { dayStatus, studyMissed, studyWeek, studyWaiting, msgStudyMissed, planOf, STUDY_HOUR } from '../src/core/calisma.js';
import { addDays, dow } from '../src/core/dates.js';

const NEW = readFileSync(new URL('../supabase/kurulum.sql', import.meta.url), 'utf8');
const MIG = readFileSync(new URL('../supabase/guncelleme-2026-11-06-calisma-takibi.sql', import.meta.url), 'utf8');
// Bu özellikten önceki kurulum (gerçek veritabanının bugünkü hali)
const OLD = execSync('git show f0b3a56:supabase/kurulum.sql', { cwd: new URL('..', import.meta.url).pathname }).toString();

const U = { t: '00000000-0000-0000-0000-00000000000a', pA: '00000000-0000-0000-0000-0000000000a1', sA: '00000000-0000-0000-0000-0000000000a2', pB: '00000000-0000-0000-0000-0000000000b1', sB: '00000000-0000-0000-0000-0000000000b2' };
const S = { A: '10000000-0000-0000-0000-00000000000a', B: '10000000-0000-0000-0000-00000000000b' };

async function setup(sql) {
  const db = new PGlite({ extensions: { pgcrypto } });
  await db.exec(`
    create role anon nologin; create role authenticated nologin;
    create schema auth; create schema extensions;
    create table auth.users (id uuid primary key, email text, encrypted_password text);
    create function auth.uid() returns uuid language sql stable as $$ select nullif(current_setting('request.jwt.claim.sub', true), '')::uuid $$;
    grant usage on schema auth to anon, authenticated;
    grant execute on function auth.uid() to anon, authenticated;
    create publication supabase_realtime;
  `);
  await db.exec(sql);
  await db.exec(`
    grant all on all tables in schema public to authenticated;
    grant execute on all functions in schema public to authenticated;
    insert into auth.users(id, email) values ('${U.t}','ogretmen@kullanici.mathx.app'),('${U.pA}','ayse.veli@kullanici.mathx.app'),('${U.sA}','ali@kullanici.mathx.app'),('${U.pB}','x@kullanici.mathx.app'),('${U.sB}','berk@kullanici.mathx.app');
    insert into public.students(id,name,phone,parent_name,parent_phone,start_date,student_username,parent_username) values
      ('${S.A}','Ali','05320000001','Ayşe Anne','05330000001','2026-09-01','ali','ayse.veli'),
      ('${S.B}','Berk','05320000002','Veli B','05330000002','2026-09-01','berk','veli.b');
    insert into public.profiles(user_id,username,role,student_id) values
      ('${U.t}','ogretmen','teacher',null),('${U.pA}','ayse.veli','parent','${S.A}'),('${U.sA}','ali','student','${S.A}'),('${U.pB}','veli.b','parent','${S.B}'),('${U.sB}','berk','student','${S.B}');
    insert into public.settings(id) values ('main');
    insert into public.homework(student_id,given_date,due_date,items,done) values ('${S.A}','2026-09-20','2026-09-27','[{"book_id":"b","book_name":"K","pages":"1"}]',false);
    insert into public.payments(student_id,period_key,amount,paid_date,method) values ('${S.A}','2026-09',1000,'2026-09-05','nakit');
  `);
  return db;
}
async function as(db, uid, fn) {
  await db.exec(`set role authenticated; select set_config('request.jwt.claim.sub', '${uid || ''}', false);`);
  try { return await fn(); } finally { await db.exec(`reset role; select set_config('request.jwt.claim.sub', '', false);`); }
}
const snapshot = async (db) => {
  const out = {};
  const tabs = (await db.query(`select tablename from pg_tables where schemaname = 'public' and tablename not like 'study\\_%' order by 1`)).rows;
  for (const { tablename: t } of tabs) out[t] = (await db.query(`select to_jsonb(x) j from public.${t} x`)).rows.map((r) => JSON.stringify(r.j)).sort();
  out.users = (await db.query(`select id::text, email from auth.users order by 1`)).rows.map((r) => `${r.id}|${r.email}`);
  return out;
};
const rejects = async (p) => { try { await p; return false; } catch { return true; } };

test('güncelleme SQL\'i mevcut verilere hiç dokunmaz, iki kez çalışır, tam kurulum da veri silmez; takip varsayılan KAPALI', async () => {
  const db = await setup(OLD);
  const before = await snapshot(db);
  await db.exec(MIG);
  await db.exec(MIG);
  assert.deepEqual(await snapshot(db), before, 'hiçbir eski tabloda satır değişmemeli');
  await db.exec(NEW);
  assert.deepEqual(await snapshot(db), before, 'tam kurulum dosyası da veri silmez');
  assert.equal((await db.query('select count(*)::int c from public.study_plans')).rows[0].c, 0, 'kimse için takip açılmaz');
  const d = (await db.query(`insert into public.study_plans(student_id) values ('${S.A}') returning enabled, days, start_date`)).rows[0];
  assert.equal(d.enabled, false); assert.deepEqual(d.days, []);
});

test('yetkiler: öğrenci yalnız log_study ile yazar, başkasını göremez; veli yalnız okur; takip kapalıyken yazılamaz', async () => {
  const db = await setup(NEW);
  // kapalı / plansız: öğrenci yazamaz
  await as(db, U.sA, async () => { assert.ok(await rejects(db.query(`select public.log_study('x')`)), 'plan yokken reddedilmeli'); });
  await as(db, U.t, async () => { await db.query(`insert into public.study_plans(student_id, enabled, days) values ('${S.A}', false, '{1,3,5}')`); });
  await as(db, U.sA, async () => { assert.ok(await rejects(db.query(`select public.log_study('x')`)), 'takip kapalıyken reddedilmeli'); });
  await as(db, U.t, async () => { await db.query(`update public.study_plans set enabled = true where student_id = '${S.A}'`); });
  // açık: bugünün tarihiyle yazılır, ikinci basış kayıt çoğaltmaz
  await as(db, U.sA, async () => { await db.query(`select public.log_study('limit çalıştım')`); await db.query(`select public.log_study('tekrar')`); });
  const logs = (await db.query(`select date::text, status, note from public.study_logs where student_id = '${S.A}'`)).rows;
  assert.equal(logs.length, 1); assert.equal(logs[0].status, 'done'); assert.equal(logs[0].note, 'tekrar');
  assert.equal(logs[0].date, (await db.query(`select ((now() at time zone 'Europe/Istanbul')::date)::text d`)).rows[0].d);
  // öğrenci doğrudan yazamaz / planını değiştiremez / uzun not kesilir
  await as(db, U.sA, async () => {
    assert.ok(await rejects(db.query(`insert into public.study_logs(student_id, date) values ('${S.A}', '2026-01-01')`)));
    assert.equal((await db.query(`update public.study_plans set enabled = false where student_id = '${S.A}' returning 1`)).rows.length, 0, 'öğrenci planı değiştiremez');
    assert.equal((await db.query(`delete from public.study_logs returning 1`)).rows.length, 0, 'öğrenci kaydı silemez');
    await db.query(`select public.log_study('${'x'.repeat(100)}')`);
  });
  assert.equal((await db.query(`select char_length(note) n from public.study_logs where student_id = '${S.A}'`)).rows[0].n, 60);
  // görünürlük: B öğrencisi ve velisi A'nınkini görmez; A velisi görür ama yazamaz
  await as(db, U.t, async () => { await db.query(`insert into public.study_plans(student_id, enabled, days) values ('${S.B}', true, '{2}')`); });
  await as(db, U.sB, async () => { assert.deepEqual((await db.query('select student_id::text s from public.study_plans')).rows.map((r) => r.s), [S.B]); assert.equal((await db.query('select * from public.study_logs')).rows.length, 0); });
  await as(db, U.pB, async () => { assert.equal((await db.query('select * from public.study_logs')).rows.length, 0); });
  await as(db, U.pA, async () => {
    assert.equal((await db.query('select * from public.study_logs')).rows.length, 1);
    assert.ok(await rejects(db.query(`insert into public.study_logs(student_id, date) values ('${S.A}', '2026-01-02')`)));
    assert.ok(await rejects(db.query(`select public.log_study('x')`)), 'veli log_study çağıramaz');
  });
  await as(db, null, async () => { assert.ok(await rejects(db.query('select * from public.study_plans')) || (await db.query('select * from public.study_plans')).rows.length === 0); });
  // öğretmen: excused/handled yazabilir, geçersiz durum reddedilir
  await as(db, U.t, async () => {
    await db.query(`insert into public.study_logs(student_id, date, status) values ('${S.B}', '2026-01-05', 'excused')`);
    assert.ok(await rejects(db.query(`insert into public.study_logs(student_id, date, status) values ('${S.B}', '2026-01-06', 'hile')`)));
    assert.ok(await rejects(db.query(`insert into public.study_plans(student_id, days) values ('${S.A}', '{8}')`)), 'aynı öğrenci için ikinci plan / geçersiz gün reddedilir');
  });
});

// ── saf hesap
const NOW = (date, time = '12:00') => ({ date, time });
const MON = '2026-11-02'; // Pazartesi
const mk = (extra = {}) => ({
  students: [{ id: 's1', name: 'Ali', active: true }, { id: 's2', name: 'Şule', active: true }],
  study_plans: [{ id: 'p1', student_id: 's1', enabled: true, days: [1, 3, 5], start_date: '2026-10-01' }],
  study_logs: [], ...extra,
});

test('gün durumu: çalışma günü değil, bekleniyor, çalışmadı, çalıştı, mazeret, başlangıç tarihi öncesi', () => {
  assert.equal(dow(MON), 1);
  const d = mk();
  assert.equal(dayStatus(d, 's1', addDays(MON, 1), NOW(addDays(MON, 1))), 'none', 'Salı çalışma günü değil');
  assert.equal(dayStatus(d, 's1', MON, NOW(MON, '15:00')), 'waiting');
  assert.equal(dayStatus(d, 's1', MON, NOW(MON, `${STUDY_HOUR}:00`)), 'missed', 'akşam saatinden sonra çalışmadı');
  assert.equal(dayStatus(d, 's1', MON, NOW(addDays(MON, 1), '08:00')), 'missed', 'ertesi sabah da çalışmadı');
  assert.equal(dayStatus(d, 's1', addDays(MON, 2), NOW(MON)), 'future');
  d.study_logs.push({ student_id: 's1', date: MON, status: 'done' });
  assert.equal(dayStatus(d, 's1', MON, NOW(addDays(MON, 3))), 'done');
  d.study_logs.push({ student_id: 's1', date: addDays(MON, 1), status: 'done' }); // çalışma günü olmayan günde de çalışabilir
  assert.equal(dayStatus(d, 's1', addDays(MON, 1), NOW(addDays(MON, 3))), 'done');
  d.study_logs.push({ student_id: 's1', date: addDays(MON, 2), status: 'excused' });
  assert.equal(dayStatus(d, 's1', addDays(MON, 2), NOW(addDays(MON, 3))), 'excused');
  assert.equal(dayStatus(mk({ study_plans: [{ ...mk().study_plans[0], start_date: '2026-11-04' }] }), 's1', MON, NOW('2026-11-06')), 'none', 'takip başlamadan önceki gün sayılmaz');
  assert.equal(dayStatus(d, 's2', MON, NOW(addDays(MON, 3))), 'none', 'planı olmayan öğrenci');
  assert.equal(dayStatus(mk({ study_plans: [{ ...mk().study_plans[0], enabled: false }] }), 's1', MON, NOW(addDays(MON, 3))), 'none', 'kapalı takip');
});

test('çalışmayanlar listesi: son 3 gün, ele alınan/mazeretli düşer, pasif ve kapalı öğrenci çıkmaz; mesaj metni', () => {
  const d = mk();
  const fri = addDays(MON, 4); // Cuma
  const now = NOW(fri, '22:00');
  assert.deepEqual(studyMissed(d, now).map((m) => m.date), [fri, addDays(MON, 2)], 'Cuma + Çarşamba; Pazartesi 3 günden eski ise çıkmaz');
  assert.deepEqual(studyMissed(d, NOW(addDays(MON, 3), '10:00')).map((m) => m.date), [addDays(MON, 2), MON]);
  d.study_logs.push({ student_id: 's1', date: fri, status: 'handled' }, { student_id: 's1', date: addDays(MON, 2), status: 'excused' });
  assert.deepEqual(studyMissed(d, now), []);
  assert.deepEqual(studyMissed(mk({ students: [{ id: 's1', name: 'Ali', active: false }] }), now), []);
  assert.deepEqual(studyWaiting(mk(), NOW(fri, '10:00')).map((s) => s.name), ['Ali']);
  assert.equal(msgStudyMissed('Ali', fri, fri), 'Sayın veli, Ali bugün planlanan matematik çalışmasını yapmadı. Çalışmasını tamamlamasına destek olursanız sevinirim.');
  assert.match(msgStudyMissed('Ali', MON, fri), /2 Kasım günü/);
});

test('hafta özeti: Pzt-Paz 7 gün, planlanan ve yapılan sayısı', () => {
  const d = mk();
  d.study_logs.push({ student_id: 's1', date: MON, status: 'done' });
  const w = studyWeek(d, 's1', NOW(addDays(MON, 4), '22:00'));
  assert.equal(w.days.length, 7);
  assert.deepEqual(w.days.map((x) => x.status), ['done', 'none', 'missed', 'none', 'missed', 'none', 'none']);
  assert.deepEqual([w.planned, w.done, w.due], [3, 1, 3]);
});

test('rastgele oturum: kapalı/planı yok öğrenci asla uyarı üretmez, çalışan asla "çalışmadı" olmaz, her uyarı gerçek bir çalışma günü', () => {
  let seed = 424242;
  const rnd = (n) => { seed = (seed * 1103515245 + 12345) & 0x7fffffff; return seed % n; };
  for (let round = 0; round < 400; round++) {
    const students = Array.from({ length: 6 }, (_, i) => ({ id: `s${i}`, name: `Öğr ${i}`, active: rnd(5) > 0 }));
    const study_plans = students.filter(() => rnd(3) > 0).map((s, i) => ({ id: `p${i}`, student_id: s.id, enabled: rnd(3) > 0, days: [1, 2, 3, 4, 5, 6, 7].filter(() => rnd(2) === 0), start_date: addDays(MON, -rnd(20)) }));
    const study_logs = [];
    for (let k = 0; k < 40; k++) study_logs.push({ student_id: `s${rnd(6)}`, date: addDays(MON, -rnd(25)), status: ['done', 'done', 'excused', 'handled'][rnd(4)] });
    const d = { students, study_plans, study_logs };
    const now = NOW(addDays(MON, rnd(20) - 5), `${String(rnd(24)).padStart(2, '0')}:00`);
    for (const m of studyMissed(d, now)) {
      const plan = planOf(d, m.student_id);
      assert.ok(plan, `round ${round}: planı açık değil ama uyarı var`);
      assert.ok(students.find((s) => s.id === m.student_id).active !== false, 'pasif öğrenci');
      assert.ok(plan.days.includes(dow(m.date)) && m.date >= plan.start_date && m.date <= now.date, 'çalışma günü değil');
      assert.ok(!study_logs.some((l) => l.student_id === m.student_id && l.date === m.date), 'kayıt varken uyarı');
    }
    for (const s of students) { const w = studyWeek(d, s.id, now); assert.ok(w.done <= 7 && w.days.length === 7); if (!planOf(d, s.id)) assert.ok(w.days.every((x) => x.status === 'none')); }
  }
});

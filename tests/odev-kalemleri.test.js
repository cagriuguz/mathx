// ÖDEV KALEMİ DURUMU, KULLANICI ADI/ŞİFRE DEĞİŞTİRME: gerçek PostgreSQL (PGlite) üzerinde
// 1) güncelleme SQL'i bugünkü (yayındaki) veritabanının hiçbir kaydını değiştirmez, iki kez çalışır, eski "yapıldı" ödevler yapıldı kalır,
// 2) rastgele öğrenci bildirimleri: kitap/sayfa asla değişmez, bildirilen ödevin her kalemi geçerli durum taşır, bildirim geri alınamaz,
// 3) kullanıcı adı değiştirme ve şifre kaydı temizleme doğru kişiyi etkiler.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { execSync } from 'node:child_process';
import { PGlite } from '@electric-sql/pglite';
import { pgcrypto } from '@electric-sql/pglite/contrib/pgcrypto';
import { hwState, itemStatus, missingAnswers, mergeAnswers, teacherOverride } from '../src/core/hwitems.js';

const NEW = readFileSync(new URL('../supabase/kurulum.sql', import.meta.url), 'utf8');
const MIG = readFileSync(new URL('../supabase/guncelleme-2026-10-03-odev-kalemleri.sql', import.meta.url), 'utf8');
// Bu güncellemeden önceki kurulum (gerçek veritabanının bugünkü hali)
const OLD = execSync('git show 91d3583:supabase/kurulum.sql', { cwd: new URL('..', import.meta.url).pathname }).toString();

const U = { t: '00000000-0000-0000-0000-00000000000a', pA: '00000000-0000-0000-0000-0000000000a1', sA: '00000000-0000-0000-0000-0000000000a2', pB: '00000000-0000-0000-0000-0000000000b1', sB: '00000000-0000-0000-0000-0000000000b2' };
const S = { A: '10000000-0000-0000-0000-00000000000a', B: '10000000-0000-0000-0000-00000000000b' };
const HW = { done: '20000000-0000-0000-0000-0000000000d1', open: '20000000-0000-0000-0000-0000000000a1', other: '20000000-0000-0000-0000-0000000000b1' };
const TABLES = ['profiles', 'students', 'schedules', 'plans', 'marks', 'payments', 'books', 'homework', 'expenses', 'expense_payments', 'settings', 'logins', 'voice_notes', 'extra_lessons', 'homework_photos'];
const IMG = 'data:image/jpeg;base64,' + 'A'.repeat(150);
const ITEMS = '[{"book_id":"b1","book_name":"Karekök 7","pages":"12-20"},{"book_id":"b2","book_name":"Limit","pages":"5"}]';

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
      ('${S.B}','Berk','05320000002','Ayşe Anne','05330000001','2026-09-01','berk','ayse.veli');
    insert into public.profiles(user_id,username,role,student_id) values
      ('${U.t}','ogretmen','teacher',null),('${U.pA}','ayse.veli','parent','${S.A}'),('${U.sA}','ali','student','${S.A}'),('${U.sB}','berk','student','${S.B}');
    insert into public.settings(id) values ('main');
    insert into public.logins(student_id,student_pw,parent_pw) values ('${S.A}','sa','va'),('${S.B}','sb','va');
    insert into public.homework(id,student_id,given_date,due_date,items,done,done_at,seen_done) values
      ('${HW.done}','${S.A}','2026-09-02','2026-09-09','${ITEMS}',true,now(),false),
      ('${HW.open}','${S.A}','2026-09-20','2026-09-27','${ITEMS}',false,null,true),
      ('${HW.other}','${S.B}','2026-09-20','2026-09-27','${ITEMS}',false,null,true);
  `);
  return db;
}
async function as(db, uid, fn) {
  await db.exec(`set role authenticated; select set_config('request.jwt.claim.sub', '${uid || ''}', false);`);
  try { return await fn(); } finally { await db.exec(`reset role; select set_config('request.jwt.claim.sub', '', false);`); }
}
const snapshot = async (db) => {
  const out = {};
  for (const t of TABLES) out[t] = (await db.query(`select (to_jsonb(x) - 'wa_to') j from public.${t} x order by 1::text`)).rows.map((r) => JSON.stringify(r.j)).sort();
  out.users = (await db.query(`select id::text, email from auth.users order by 1`)).rows.map((r) => `${r.id}|${r.email}`);
  return out;
};
const rejects = async (p) => { try { await p; return false; } catch { return true; } };
const jb = (v) => `'${JSON.stringify(v).replace(/'/g, "''")}'::jsonb`;

test('güncelleme SQL\'i mevcut verilere hiç dokunmaz, iki kez çalışır; eski yapıldı ödev yapıldı kalır', async () => {
  const db = await setup(OLD);
  await db.query(`insert into public.homework_photos(homework_id, student_id, image, thumb) values ('${HW.done}', '${S.A}', '${IMG}', '${IMG}')`);
  const before = await snapshot(db);
  await db.exec(MIG);
  await db.exec(MIG);
  assert.deepEqual(await snapshot(db), before, 'hiçbir tabloda satır değişmemeli (yeni sütun hariç)');
  await db.exec(NEW);
  assert.deepEqual(await snapshot(db), before, 'tam kurulum dosyası da veri silmez');
  const r = (await db.query(`select done, items from public.homework where id = '${HW.done}'`)).rows[0];
  assert.equal(r.done, true);
  assert.equal(hwState(r), 'done', 'eski yapıldı ödev yapıldı görünür');
  assert.deepEqual(r.items.map((i) => itemStatus(r, i)), ['done', 'done'], 'eski kalemler yaptı sayılır');
  // Eski sürüm telefonda açık kalmışsa: eski işlev fotoğrafsız da çalışır, ödev bildirilir
  await as(db, U.sA, async () => { await db.query(`select public.set_homework_done('${HW.open}', true)`); });
  assert.equal((await db.query(`select done from public.homework where id = '${HW.open}'`)).rows[0].done, true);
});

test('rastgele öğrenci bildirimleri: kitap/sayfa değişmez, geçersiz bildirim ödevi değiştirmez, bildirim kalıcı', async () => {
  const db = await setup(NEW);
  let seed = 12345;
  const rnd = (n) => { seed = (seed * 1103515245 + 12345) & 0x7fffffff; return seed % n; };
  const STAT = ['done', 'partial', 'none', 'bilmem', '', null, undefined];
  const PAR = [true, false, 'true', null, undefined, 1];
  const pickItem = () => ({ status: STAT[rnd(STAT.length)], parent_ok: PAR[rnd(PAR.length)], book_name: 'HİLE', pages: '999' });
  for (let round = 0; round < 60; round++) {
    await db.query(`update public.homework set done = false, done_at = null, items = '${ITEMS}'::jsonb where id = '${HW.open}'`);
    const n = [1, 2, 2, 3][rnd(4)];
    const payload = Array.from({ length: n }, pickItem);
    const valid = n === 2 && payload.every((i) => ['done', 'partial', 'none'].includes(i.status) && typeof i.parent_ok === 'boolean');
    let failed = false;
    await as(db, U.sA, async () => { try { await db.query(`select public.submit_homework('${HW.open}', ${jb(payload)})`); } catch { failed = true; } });
    const row = (await db.query(`select done, items from public.homework where id = '${HW.open}'`)).rows[0];
    assert.equal(failed, !valid, `tur ${round}: ${JSON.stringify(payload)}`);
    assert.deepEqual(row.items.map((i) => [i.book_name, i.pages]), [['Karekök 7', '12-20'], ['Limit', '5']], 'kitap/sayfa değişmez');
    assert.equal(row.done, valid);
    if (valid) {
      assert.ok(row.items.every((i, k) => i.status === payload[k].status && i.parent_ok === payload[k].parent_ok));
      await as(db, U.sA, async () => { await db.query(`select public.submit_homework('${HW.open}', ${jb([{ status: 'none', parent_ok: false }, { status: 'none', parent_ok: false }])})`); });
      assert.equal((await db.query(`select items->0->>'status' s from public.homework where id = '${HW.open}'`)).rows[0].s, payload[0].status, 'ikinci bildirim değiştiremez');
    } else assert.ok(row.items.every((i) => i.status === undefined), 'reddedilen bildirim hiçbir iz bırakmaz');
  }
  // Başka öğrencinin ödevine ve veli/oturumsuz hesaplarla bildirim yapılamaz
  const ok2 = jb([{ status: 'done', parent_ok: true }, { status: 'done', parent_ok: true }]);
  assert.equal(await as(db, U.sA, () => rejects(db.query(`select public.submit_homework('${HW.other}', ${ok2})`))), true);
  assert.equal(await as(db, U.pA, () => rejects(db.query(`select public.submit_homework('${HW.open}', ${ok2})`))), true, 'veli bildirim yapamaz');
  await db.exec(`set role anon`);
  assert.equal(await rejects(db.query(`select public.submit_homework('${HW.open}', ${ok2})`)), true, 'oturumsuz yapamaz');
  await db.exec(`reset role`);
});

test('öğretmen kalemi doğrudan değiştirebilir; öğrenci/veli değiştiremez', async () => {
  const db = await setup(NEW);
  const items = (await db.query(`select items from public.homework where id = '${HW.done}'`)).rows[0].items;
  const edited = teacherOverride(items, 1, 'partial', 'Defterine baktım, eksik');
  await as(db, U.t, async () => { await db.query(`update public.homework set items = ${jb(edited)} where id = '${HW.done}'`); });
  const row = (await db.query(`select items from public.homework where id = '${HW.done}'`)).rows[0];
  assert.deepEqual(row.items.map((i) => i.status), [undefined, 'partial']);
  assert.equal(row.items[1].teacher_note, 'Defterine baktım, eksik');
  for (const uid of [U.sA, U.pA]) {
    await as(db, uid, async () => { await db.query(`update public.homework set items = '[]'::jsonb where id = '${HW.done}'`); });
  }
  assert.equal((await db.query(`select jsonb_array_length(items) n from public.homework where id = '${HW.done}'`)).rows[0].n, 2, 'öğrenci/veli ödev satırını değiştiremez');
});

test('kullanıcı adı değiştirme ve şifre kaydı temizleme', async () => {
  const db = await setup(NEW);
  assert.equal(await as(db, U.sA, () => rejects(db.query(`select public.rename_account('ali', 'yeni.ad')`))), true, 'öğrenci yapamaz');
  assert.equal(await as(db, U.pA, () => rejects(db.query(`select public.rename_account('ayse.veli', 'yeni.ad')`))), true, 'veli yapamaz');
  await as(db, U.t, async () => {
    for (const bad of ['ab', 'Büyük.Harf', 'a b c', 'x'.repeat(31), '.nokta']) assert.equal(await rejects(db.query(`select public.rename_account('ali', '${bad}')`)), true, bad);
    assert.equal(await rejects(db.query(`select public.rename_account('ali', 'berk')`)), true, 'kullanılan ad');
    assert.equal(await rejects(db.query(`select public.rename_account('yok.kisi', 'yeni.ad')`)), true, 'olmayan hesap');
    assert.equal(await rejects(db.query(`select public.rename_account('ogretmen', 'baska.ad')`)), true, 'öğretmen hesabı bu yolla değişmez');
    await db.query(`select public.rename_account('ali', 'ali.yeni')`);
    await db.query(`select public.rename_account('ayse.veli', 'ayse.anne')`);
  });
  const g = async (q) => (await db.query(q)).rows;
  assert.equal((await g(`select username from public.profiles where user_id = '${U.sA}'`))[0].username, 'ali.yeni');
  assert.equal((await g(`select email from auth.users where id = '${U.sA}'`))[0].email, 'ali.yeni@kullanici.mathx.app', 'giriş e-postası da yenilenir');
  assert.equal((await g(`select student_username u from public.students where id = '${S.A}'`))[0].u, 'ali.yeni');
  assert.deepEqual((await g(`select parent_username u from public.students order by name`)).map((r) => r.u), ['ayse.anne', 'ayse.anne'], 'ortak veli adı tüm kardeşlerde değişir');
  assert.equal((await g(`select count(*)::int n from public.logins`))[0].n, 2, 'şifre kayıtları korunur');

  // Öğrenci şifresini değiştirince yalnız kendi şifre kaydı boşalır
  await as(db, U.sA, async () => { await db.query(`select public.password_changed()`); });
  assert.deepEqual((await g(`select student_id, student_pw sp, parent_pw pp from public.logins order by student_id`)).map((r) => [r.sp, r.pp]), [['', 'va'], ['sb', 'va']]);
  // Veli şifresini değiştirince ona bağlı öğrencilerin veli şifre kaydı boşalır (öğrenci şifreleri kalır)
  await db.exec(`insert into public.parent_links(user_id, student_id) values ('${U.pA}', '${S.B}')`);
  await as(db, U.pA, async () => { await db.query(`select public.password_changed()`); });
  assert.deepEqual((await g(`select student_pw sp, parent_pw pp from public.logins order by student_id`)).map((r) => [r.sp, r.pp]), [['', ''], ['sb', '']]);
});

test('ödev kalemi yardımcıları (saf işlevler)', () => {
  const items = [{ book_name: 'A', pages: '1' }, { book_name: 'B', pages: '2' }];
  assert.equal(missingAnswers(items, [{}, {}]).complete, false);
  assert.deepEqual(missingAnswers(items, [{ status: 'done' }, { status: 'none', parent_ok: true }]), { status: 0, parent: 1, complete: false });
  const ans = [{ status: 'done', parent_ok: true }, { status: 'partial', parent_ok: false }];
  assert.equal(missingAnswers(items, ans).complete, true);
  const merged = mergeAnswers(items, ans);
  assert.deepEqual(merged.map((i) => [i.book_name, i.status, i.parent_ok]), [['A', 'done', true], ['B', 'partial', false]]);
  assert.equal(hwState({ done: false, items: merged }), 'open');
  assert.equal(hwState({ done: true, items: merged }), 'partial');
  assert.equal(hwState({ done: true, items: merged.map((i) => ({ ...i, status: 'done' })) }), 'done');
  assert.equal(hwState({ done: true, items: merged.map((i) => ({ ...i, status: 'none' })) }), 'none');
  assert.throws(() => teacherOverride(merged, 0, 'none', '  '), /açıklama/i);
  assert.throws(() => teacherOverride(merged, 0, 'bilmem', 'x'), /Durum/);
  assert.throws(() => teacherOverride(merged, 0, 'none', 'x'.repeat(201)), /en fazla/);
  const t = teacherOverride(merged, 0, 'none', ' Yapmamış  ');
  assert.equal(t[0].status, 'none'); assert.equal(t[0].teacher_note, 'Yapmamış'); assert.equal(t[1].status, 'partial');
  assert.equal(merged[0].status, 'done', 'özgün dizi değişmez');
});

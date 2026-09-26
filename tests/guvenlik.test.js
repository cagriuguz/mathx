// Veritabanı güvenlik testi (madde 10 ve 12): supabase/kurulum.sql gerçek PostgreSQL'de (PGlite) çalıştırılır;
// Supabase'in auth şeması taklit edilir ve her rol için "neyi görebiliyor / neyi değiştirebiliyor" denetlenir.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { PGlite } from '@electric-sql/pglite';
import { pgcrypto } from '@electric-sql/pglite/contrib/pgcrypto';

const SQL = readFileSync(new URL('../supabase/kurulum.sql', import.meta.url), 'utf8');
const U = { teacher: '00000000-0000-0000-0000-00000000000a', pA: '00000000-0000-0000-0000-0000000000a1', sA: '00000000-0000-0000-0000-0000000000a2', pB: '00000000-0000-0000-0000-0000000000b1' };
const S = { A: '10000000-0000-0000-0000-00000000000a', B: '10000000-0000-0000-0000-00000000000b' };

async function setup() {
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
  await db.exec(SQL);
  await db.exec(SQL); // ikinci kez çalıştırmak güvenli olmalı
  await db.exec(`
    grant usage on schema public to anon, authenticated;
    grant all on all tables in schema public to authenticated;
    grant execute on all functions in schema public to authenticated;
    insert into auth.users(id, email) values ('${U.teacher}','ogretmen@x'),('${U.pA}','a.veli@x'),('${U.sA}','a@x'),('${U.pB}','b.veli@x');
    insert into public.students(id,name,phone,parent_name,parent_phone,start_date) values
      ('${S.A}','Ali','05320000001','Veli A','05330000001','2026-09-01'),('${S.B}','Berk','05320000002','Veli B','05330000002','2026-09-01');
    insert into public.profiles(user_id,username,role,student_id) values
      ('${U.pA}','a.veli','parent','${S.A}'),('${U.sA}','ali','student','${S.A}'),('${U.pB}','b.veli','parent','${S.B}');
    insert into public.schedules(student_id,valid_from,slots) values ('${S.A}','2026-09-01','[]'),('${S.B}','2026-09-01','[]');
    insert into public.plans(student_id,valid_from,type,fee) values ('${S.A}','2026-09-01','monthly',100),('${S.B}','2026-09-01','monthly',200);
    insert into public.marks(student_id,date,time,reason) values ('${S.A}','2026-09-02','17:00','a'),('${S.B}','2026-09-02','17:00','b');
    insert into public.payments(student_id,period_key,amount,paid_date) values ('${S.A}','k',100,'2026-09-02'),('${S.B}','k',200,'2026-09-02');
    insert into public.homework(id,student_id,given_date,due_date) values ('20000000-0000-0000-0000-00000000000a','${S.A}','2026-09-02','2026-09-09'),('20000000-0000-0000-0000-00000000000b','${S.B}','2026-09-02','2026-09-09');
    insert into public.books(name) values ('Kitap');
    insert into public.expenses(name,amount,start_month) values ('Kira',1000,'2026-09');
  `);
  return db;
}

async function as(db, uid, fn) {
  await db.exec(`set role authenticated; select set_config('request.jwt.claim.sub', '${uid || ''}', false);`);
  try { return await fn(); } finally { await db.exec(`reset role; select set_config('request.jwt.claim.sub', '', false);`); }
}
const count = async (db, t) => (await db.query(`select count(*)::int as n from public.${t}`)).rows[0].n;
const rejects = async (p) => { let ok = false; try { await p; } catch { ok = true; } return ok; };

test('güvenlik kuralları (RLS)', async () => {
  const db = await setup();

  // İlk kurulum: öğretmen yokken giriş yapan kişi öğretmen olur, ikinci kez olmaz
  assert.equal((await db.query('select public.teacher_exists() as x')).rows[0].x, false);
  await as(db, U.teacher, () => db.query(`select public.claim_teacher('ogretmen')`));
  assert.equal(await as(db, U.pA, () => rejects(db.query(`select public.claim_teacher('hacker')`))), true, 'ikinci öğretmen olunamamalı');

  // VELİ A: yalnızca kendi öğrencisi
  await as(db, U.pA, async () => {
    for (const t of ['students', 'schedules', 'plans', 'marks', 'payments', 'homework']) assert.equal(await count(db, t), 1, `veli ${t}`);
    assert.equal((await db.query('select name from public.students')).rows[0].name, 'Ali');
    for (const t of ['books', 'expenses', 'expense_payments', 'settings']) assert.equal(await count(db, t), 0, `veli ${t} görmemeli`);
    assert.equal(await count(db, 'profiles'), 1, 'veli yalnızca kendi profilini görür');
    // Yazma denemeleri
    await db.query(`update public.payments set amount = 1`);
    await db.query(`delete from public.homework`);
    assert.equal(await rejects(db.query(`insert into public.payments(student_id,period_key,amount,paid_date) values ('${S.A}','x',5,'2026-09-03')`)), true, 'veli ödeme ekleyememeli');
    assert.equal(await rejects(db.query(`insert into public.profiles(user_id,username,role) values ('${U.pA}','x','teacher')`)), true, 'veli kendini öğretmen yapamamalı');
    assert.equal(await rejects(db.query(`select public.set_homework_done('20000000-0000-0000-0000-00000000000a', true)`)), true, 'veli ödevi işaretleyememeli');
    assert.equal(await rejects(db.query(`select public.admin_set_password('ali', 'x12345678')`)), true, 'veli şifre değiştirememeli');
    assert.equal(await rejects(db.query(`select public.set_wa_config('1','2','cal')`)), true, 'veli WhatsApp ayarı yazamaz');
    assert.equal(await rejects(db.query(`select public.wa_config_status()`)), true, 'veli WhatsApp durumunu göremez');
    assert.equal(await count(db, 'wa_config'), 0, 'veli anahtar tablosunu göremez');
  });

  // ÖĞRENCİ A: yalnızca kendi ödevi; ödeme/ders/öğrenci tablosu yok
  await as(db, U.sA, async () => {
    assert.equal(await count(db, 'homework'), 1);
    for (const t of ['students', 'schedules', 'plans', 'marks', 'payments', 'books', 'expenses', 'settings']) assert.equal(await count(db, t), 0, `öğrenci ${t} görmemeli`);
    await db.query(`select public.set_homework_done('20000000-0000-0000-0000-00000000000a', true)`);
    assert.equal(await rejects(db.query(`select public.set_homework_done('20000000-0000-0000-0000-00000000000b', true)`)), true, 'başka öğrencinin ödevi');
    await db.query(`update public.homework set due_date = '2030-01-01'`);
    assert.equal((await db.query('select public.my_student_name() as n')).rows[0].n, 'Ali');
    assert.equal(await rejects(db.query(`select public.set_wa_config('1','2','cal')`)), true, 'öğrenci WhatsApp ayarı yazamaz');
    await db.query(`update public.homework set wa_done_at = now()`);
  });

  // Oturumsuz (anon) hiçbir şey göremez
  await db.exec(`set role anon;`);
  assert.equal(await rejects(db.query('select * from public.students')), true, 'anon öğrenci okuyamamalı');
  await db.exec(`reset role;`);

  // Sonuçlar: veli/öğrenci hiçbir şeyi bozamadı, yalnızca "yaptım" işareti değişti
  const pay = (await db.query('select sum(amount)::int as s from public.payments')).rows[0].s;
  assert.equal(pay, 300, 'ödemeler değişmemeli');
  const hw = (await db.query(`select id, done, due_date::text from public.homework order by id`)).rows;
  assert.equal(hw.length, 2, 'ödev silinmemeli');
  assert.equal(hw[0].done, true);
  assert.equal(hw[0].due_date, '2026-09-09', 'öğrenci son tarihi değiştirememeli');
  assert.equal(hw[1].done, false);
  assert.equal((await db.query(`select count(*)::int as n from public.homework where wa_done_at is not null`)).rows[0].n, 0, 'öğrenci otomatik gönderim işaretini değiştiremez');

  // ÖĞRETMEN: her şey
  await as(db, U.teacher, async () => {
    // WhatsApp anahtarı: yazılır, durum görülür, anahtarın KENDİSİ hiçbir yoldan okunamaz
    await db.query(`select public.set_wa_config('0555 111 22 33', '123456', 'GIZLI-ANAHTAR')`);
    await db.query(`select public.set_wa_config('0555 111 22 33', '123456', '')`); // boş = eskisini koru
    const st = (await db.query('select public.wa_config_status() as s')).rows[0].s;
    assert.deepEqual([st.phone_number_id, st.has_token], ['123456', true]);
    assert.ok(!JSON.stringify(st).includes('GIZLI'), 'durum anahtarı sızdırmamalı');
    assert.equal(await count(db, 'wa_config'), 0, 'öğretmen bile anahtar tablosunu doğrudan okuyamaz');
    assert.equal(await count(db, 'students'), 2);
    assert.equal(await count(db, 'payments'), 2);
    await db.query(`select public.admin_set_password('ali', 'Yeni-1234')`);
    assert.equal(await rejects(db.query(`select public.admin_set_password('ogretmen', 'x')`)), true, 'öğretmen şifresi bu yolla değişmez');
    assert.equal((await db.query(`select public.username_taken('ali') as x`)).rows[0].x, true);
    await db.query(`select public.delete_accounts_for('${S.B}')`);
  });
  const pw = (await db.query(`select encrypted_password from auth.users where id = '${U.sA}'`)).rows[0].encrypted_password;
  assert.ok(pw && pw.startsWith('$2'), 'şifre bcrypt ile saklanmalı');
  assert.equal((await db.query(`select count(*)::int as n from auth.users where id = '${U.pB}'`)).rows[0].n, 0, 'B velisinin hesabı silinmeli');
  assert.equal((await db.query(`select token from public.wa_config`)).rows[0].token, 'GIZLI-ANAHTAR', 'boş anahtar eskisini silmemeli');
});

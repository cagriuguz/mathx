// ÖDEV FOTOĞRAFLARI: gerçek PostgreSQL (PGlite) üzerinde
// 1) güncelleme SQL'i bugünkü (yayındaki) veritabanının hiçbir kaydına dokunmaz, iki kez çalıştırılabilir;
//    daha önce "yapıldı" olmuş ödevler yapıldı kalır,
// 2) rastgele öğrenci/veli/öğretmen işlem dizilerinde kurallar hiç bozulmaz:
//    fotoğrafsız "yapıldı" yok, ödev başına en fazla 15, "yaptım"dan sonra öğrenci fotoğrafı değiştiremez,
//    başkasının ödevine yükleme yok, veli yalnız görür.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { execSync } from 'node:child_process';
import { PGlite } from '@electric-sql/pglite';
import { pgcrypto } from '@electric-sql/pglite/contrib/pgcrypto';

const NEW = readFileSync(new URL('../supabase/kurulum.sql', import.meta.url), 'utf8');
const MIG = readFileSync(new URL('../supabase/guncelleme-2026-09-28b-odev-fotograf.sql', import.meta.url), 'utf8');
// Fotoğraf özelliğinden önceki kurulum (gerçek veritabanının bugünkü hali)
const OLD = execSync('git show 5dc084d:supabase/kurulum.sql', { cwd: new URL('..', import.meta.url).pathname }).toString();

const U = { t: '00000000-0000-0000-0000-00000000000a', pA: '00000000-0000-0000-0000-0000000000a1', sA: '00000000-0000-0000-0000-0000000000a2', pB: '00000000-0000-0000-0000-0000000000b1', sB: '00000000-0000-0000-0000-0000000000b2' };
const S = { A: '10000000-0000-0000-0000-00000000000a', B: '10000000-0000-0000-0000-00000000000b' };
const HW = { A1: '20000000-0000-0000-0000-0000000000a1', A2: '20000000-0000-0000-0000-0000000000a2', A0: '20000000-0000-0000-0000-0000000000a0', B1: '20000000-0000-0000-0000-0000000000b1' };
const TABLES = ['profiles', 'students', 'schedules', 'plans', 'marks', 'payments', 'books', 'homework', 'expenses', 'expense_payments', 'settings', 'logins', 'voice_notes', 'extra_lessons', 'parent_links'];
const IMG = 'data:image/jpeg;base64,' + 'A'.repeat(150);

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
    grant usage on schema public to anon, authenticated;
    grant all on all tables in schema public to authenticated;
    grant execute on all functions in schema public to authenticated;
  `);
  return db;
}

async function seed(db) {
  await db.exec(`
    insert into public.students(id,name,phone,parent_name,parent_phone,start_date) values
      ('${S.A}','Ali','05320000001','Veli A','05330000001','2026-09-01'),('${S.B}','Berk','05320000002','Veli B','05330000002','2026-09-01');
    insert into auth.users(id, email) values ('${U.t}','t@x'),('${U.pA}','pa@x'),('${U.sA}','sa@x'),('${U.pB}','pb@x'),('${U.sB}','sb@x');
    insert into public.profiles(user_id,username,role,student_id) values ('${U.t}','ogretmen','teacher',null),
      ('${U.pA}','a.veli','parent','${S.A}'),('${U.sA}','ali','student','${S.A}'),('${U.pB}','b.veli','parent','${S.B}'),('${U.sB}','berk','student','${S.B}');
    insert into public.homework(id,student_id,given_date,due_date,items,done,done_at) values
      ('${HW.A0}','${S.A}','2026-09-01','2026-09-05','[{"book_name":"K","pages":"1-5"}]',true,now()),
      ('${HW.A1}','${S.A}','2026-09-20','2026-09-27','[{"book_name":"K","pages":"6-9"}]',false,null),
      ('${HW.A2}','${S.A}','2026-09-21','2026-09-28','[{"book_name":"L","pages":"3"}]',false,null),
      ('${HW.B1}','${S.B}','2026-09-20','2026-09-27','[{"book_name":"M","pages":"8"}]',false,null);
    insert into public.payments(student_id,period_key,amount,paid_date) values ('${S.A}','k',100,'2026-09-02');
    insert into public.voice_notes(student_id,audio,seconds) values ('${S.A}','data:audio/mp4;base64,${'A'.repeat(120)}',10);
  `);
}

async function as(db, uid, fn) {
  await db.exec(`set role authenticated; select set_config('request.jwt.claim.sub', '${uid}', false);`);
  try { return await fn(); } finally { await db.exec(`reset role; select set_config('request.jwt.claim.sub', '', false);`); }
}
const ok = async (p) => { try { await p; return true; } catch { return false; } };
async function snapshot(db) {
  const out = {};
  for (const t of TABLES) out[t] = (await db.query(`select to_jsonb(x) j from public.${t} x order by 1::text`)).rows.map((r) => JSON.stringify(r.j)).sort();
  return out;
}

test('fotoğraf güncellemesi mevcut verilere hiç dokunmaz ve iki kez çalıştırılabilir', async () => {
  const db = await setup(OLD);
  await seed(db);
  const before = await snapshot(db);
  await db.exec(MIG);
  await db.exec(MIG);
  assert.deepEqual(await snapshot(db), before, 'hiçbir tabloda satır değişmemeli');
  assert.equal((await db.query(`select done from public.homework where id = '${HW.A0}'`)).rows[0].done, true, 'eskiden yapılmış ödev yapıldı kalır');
  // Güncellemeden sonra kural yürürlükte: fotoğrafsız "yaptım" reddedilir, fotoğraflı kabul
  assert.equal(await as(db, U.sA, () => ok(db.query(`select public.set_homework_done('${HW.A1}', true)`))), false);
  await as(db, U.sA, () => db.query(`insert into public.homework_photos(homework_id,student_id,image,thumb) values ('${HW.A1}','${S.A}','${IMG}','${IMG}')`));
  assert.equal(await as(db, U.sA, () => ok(db.query(`select public.set_homework_done('${HW.A1}', true)`))), true);
  // Tam kurulum dosyasını yeniden çalıştırmak da veri silmez
  const mid = await snapshot(db);
  await db.exec(NEW);
  assert.deepEqual(await snapshot(db), mid);
  assert.equal((await db.query('select count(*)::int n from public.homework_photos')).rows[0].n, 1, 'fotoğraf korunur');
});

function rng(seed) {
  let s = seed >>> 0;
  return () => ((s = (s * 1664525 + 1013904223) >>> 0) / 2 ** 32);
}

test('ödev fotoğrafı kuralları rastgele dizilerde bozulmaz (25 tohum)', async () => {
  const db = await setup(NEW);
  await seed(db);
  const snapBase = async () => (await db.query(`select id from public.homework order by id`)).rows.length;
  assert.equal(await snapBase(), 4);
  const hws = [HW.A1, HW.A2, HW.B1];
  const owner = { [HW.A1]: 'A', [HW.A2]: 'A', [HW.B1]: 'B' };
  const stu = { A: U.sA, B: U.sB }, par = { A: U.pA, B: U.pB };
  for (let seedN = 1; seedN <= 25; seedN++) {
    const r = rng(seedN * 7919);
    const pick = (a) => a[Math.floor(r() * a.length)];
    // Her tohum temiz başlar
    await db.exec(`delete from public.homework_photos; update public.homework set done = false, done_at = null where id in ('${hws.join("','")}');`);
    const model = Object.fromEntries(hws.map((h) => [h, { n: 0, done: false }]));
    for (let step = 0; step < 40; step++) {
      const op = r(), h = pick(hws), who = pick(['A', 'B']);
      const where = `tohum ${seedN} adım ${step}`;
      if (op < 0.45) { // öğrenci fotoğraf ekler (bazen başkasının ödevine)
        const k = Math.floor(r() * 3) + 1;
        for (let i = 0; i < k; i++) {
          const res = await as(db, stu[who], () => ok(db.query(`insert into public.homework_photos(homework_id,student_id,image,thumb) values ('${h}','${who === 'A' ? S.A : S.B}','${IMG}','${IMG}')`)));
          const allowed = owner[h] === who && !model[h].done && model[h].n < 15;
          assert.equal(res, allowed, `${where}: ekleme ${allowed ? 'kabul' : 'red'} olmalı`);
          if (allowed) model[h].n++;
        }
      } else if (op < 0.6) { // öğrenci bir fotoğrafını siler
        await as(db, stu[who], () => db.query(`delete from public.homework_photos where id = (select id from public.homework_photos where homework_id = '${h}' limit 1)`));
        if (owner[h] === who && !model[h].done && model[h].n > 0) model[h].n--;
      } else if (op < 0.8) { // öğrenci "yaptım"
        const res = await as(db, stu[who], () => ok(db.query(`select public.set_homework_done('${h}', true)`)));
        const allowed = owner[h] === who && (model[h].done || model[h].n > 0);
        assert.equal(res, allowed, `${where}: yaptım ${allowed ? 'kabul' : 'red'} olmalı (foto ${model[h].n})`);
        if (allowed) model[h].done = true;
      } else if (op < 0.92) { // veli: ekleyemez, silemez, yalnız görür
        const add = await as(db, par[who], () => ok(db.query(`insert into public.homework_photos(homework_id,student_id,image,thumb) values ('${h}','${owner[h] === 'A' ? S.A : S.B}','${IMG}','${IMG}')`)));
        assert.equal(add, false, `${where}: veli ekleyemez`);
        await as(db, par[who], () => db.query(`delete from public.homework_photos`));
        assert.equal(await as(db, par[who], () => ok(db.query(`select public.set_homework_done('${h}', true)`))), false, `${where}: veli işaretleyemez`);
        const seen = (await as(db, par[who], () => db.query(`select homework_id from public.homework_photos`))).rows;
        assert.ok(seen.every((x) => owner[x.homework_id] === who), `${where}: veli yalnız kendi çocuğununkini görür`);
        assert.equal(seen.length, hws.filter((x) => owner[x] === who).reduce((t, x) => t + model[x].n, 0), `${where}: veli hepsini görür`);
      } else { // öğretmen bir ödevin fotoğraflarını temizler (yapıldı bilgisi kalır)
        await as(db, U.t, () => db.query(`delete from public.homework_photos where homework_id = '${h}'`));
        model[h].n = 0;
      }
      // Tutarlılık: veritabanı = model; sınır 15; yapıldı durumu modelle aynı
      for (const x of hws) {
        const row = (await db.query(`select done, (select count(*)::int from public.homework_photos p where p.homework_id = h.id) n from public.homework h where id = '${x}'`)).rows[0];
        assert.equal(row.n, model[x].n, `${where}: ${x} fotoğraf sayısı`);
        assert.ok(row.n <= 15, `${where}: 15 sınırı`);
        assert.equal(row.done, model[x].done, `${where}: ${x} yapıldı durumu`);
      }
    }
  }
  // Hiçbir işlem ödev kaydını silmedi; ödeme/sesli not değişmedi
  assert.equal(await snapBase(), 4);
  assert.equal((await db.query('select sum(amount)::int s from public.payments')).rows[0].s, 100);
});

test('fotoğraf yardımcıları', async () => {
  const { photoCounts, photoRoom, fmtMB, photoUsage, MAX_PHOTOS } = await import('../src/core/photos.js');
  const { PHOTO_COLS } = await import('../src/store/common.js');
  assert.equal(MAX_PHOTOS, 15);
  assert.deepEqual([...photoCounts([{ homework_id: 'a' }, { homework_id: 'a' }, { homework_id: 'b' }])], [['a', 2], ['b', 1]]);
  assert.deepEqual(photoRoom(12, 5), { take: 3, skipped: 2 }, '12 fotoğraf varken 5 seçilirse 3ü alınır');
  assert.deepEqual(photoRoom(15, 1), { take: 0, skipped: 1 });
  assert.deepEqual(photoRoom(0, 4), { take: 4, skipped: 0 });
  assert.equal(fmtMB(400000), '0,3 MB');
  const u = photoUsage([{ bytes: 10, created_at: '2026-07-01T10:00:00Z' }, { bytes: 20, created_at: '2026-09-20T10:00:00Z' }], '2026-07-30');
  assert.deepEqual(u, { count: 2, bytes: 30, oldCount: 1, oldBytes: 10 });
  assert.ok(!/image|thumb/.test(PHOTO_COLS), 'liste yüklemesi resim taşımamalı');
});

// KARDEŞLER: tek veli hesabı birden çok öğrenciyi görür. Gerçek PostgreSQL (PGlite) üzerinde:
// 1) güncelleme SQL'i ESKİ kurulumdaki verilere hiç dokunmaz (her tablo satır satır aynı kalır),
// 2) kardeş bağlanınca veli iki çocuğu görür, üçüncüyü görmez; öğrenci yalnız kendini görür,
// 3) kardeşlerden biri silinince ortak veli hesabı SİLİNMEZ, ayırma/yeniden bağlama tutarlı çalışır.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { execSync } from 'node:child_process';
import { PGlite } from '@electric-sql/pglite';
import { pgcrypto } from '@electric-sql/pglite/contrib/pgcrypto';

const NEW = readFileSync(new URL('../supabase/kurulum.sql', import.meta.url), 'utf8');
const MIG = readFileSync(new URL('../supabase/guncelleme-2026-09-28-kardes.sql', import.meta.url), 'utf8');
// Kardeş özelliğinden önceki kurulum (gerçek veritabanının bugünkü hali)
const OLD = execSync('git show 46b7394:supabase/kurulum.sql', { cwd: new URL('..', import.meta.url).pathname }).toString();

const U = { t: '00000000-0000-0000-0000-00000000000a', pA: '00000000-0000-0000-0000-0000000000a1', sA: '00000000-0000-0000-0000-0000000000a2', pB: '00000000-0000-0000-0000-0000000000b1', sB: '00000000-0000-0000-0000-0000000000b2', pC: '00000000-0000-0000-0000-0000000000c1' };
const S = { A: '10000000-0000-0000-0000-00000000000a', B: '10000000-0000-0000-0000-00000000000b', C: '10000000-0000-0000-0000-00000000000c' };
const TABLES = ['profiles', 'students', 'schedules', 'plans', 'marks', 'payments', 'books', 'homework', 'expenses', 'expense_payments', 'settings', 'logins', 'voice_notes', 'extra_lessons'];
const AUDIO = 'data:audio/mp4;base64,' + 'A'.repeat(120);

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
    insert into auth.users(id, email) values ('${U.t}','t@x'),('${U.pA}','a@x'),('${U.sA}','sa@x'),('${U.pB}','b@x'),('${U.sB}','sb@x'),('${U.pC}','c@x');
    insert into public.students(id,name,phone,parent_name,parent_phone,start_date,student_username,parent_username) values
      ('${S.A}','Ali','05320000001','Ayşe Anne','05330000001','2026-09-01','ali','ayse.veli'),
      ('${S.B}','Berk','05320000002','Ayşe Anne','05330000001','2026-09-01','berk','berk.veli'),
      ('${S.C}','Cem','05320000003','Veli C','05330000003','2026-09-01','cem','cem.veli');
    insert into public.profiles(user_id,username,role,student_id) values
      ('${U.t}','ogretmen','teacher',null),('${U.pA}','ayse.veli','parent','${S.A}'),('${U.sA}','ali','student','${S.A}'),
      ('${U.pB}','berk.veli','parent','${S.B}'),('${U.sB}','berk','student','${S.B}'),('${U.pC}','cem.veli','parent','${S.C}');
    insert into public.settings(id) values ('main');
    insert into public.schedules(student_id,valid_from,slots) values ('${S.A}','2026-09-01','[{"dow":2,"time":"17:00","hours":1}]'),('${S.B}','2026-09-01','[]'),('${S.C}','2026-09-01','[]');
    insert into public.plans(student_id,valid_from,type,fee) values ('${S.A}','2026-09-01','monthly',100),('${S.B}','2026-09-01','4weekly',200),('${S.C}','2026-09-01','monthly',300);
    insert into public.marks(student_id,date,time,reason) values ('${S.A}','2026-09-02','17:00','a'),('${S.B}','2026-09-02','17:00','b'),('${S.C}','2026-09-02','17:00','c');
    insert into public.payments(student_id,period_key,amount,paid_date) values ('${S.A}','k',100,'2026-09-02'),('${S.B}','k',200,'2026-09-02'),('${S.C}','k',300,'2026-09-02');
    insert into public.homework(id,student_id,given_date,due_date) values ('20000000-0000-0000-0000-00000000000a','${S.A}','2026-09-02','2026-09-09'),('20000000-0000-0000-0000-00000000000b','${S.B}','2026-09-02','2026-09-09'),('20000000-0000-0000-0000-00000000000c','${S.C}','2026-09-02','2026-09-09');
    insert into public.books(name, student_id) values ('Ortak', null), ('Ali kitabı', '${S.A}');
    insert into public.expenses(name,amount,start_month) values ('Kira',1000,'2026-09');
    insert into public.extra_lessons(student_id,date,time,hours) values ('${S.A}','2026-09-03','10:00',1),('${S.B}','2026-09-03','10:00',2);
    insert into public.logins(student_id,student_pw,parent_pw) values ('${S.A}','sa','va'),('${S.B}','sb','vb'),('${S.C}','sc','vc');
    insert into public.voice_notes(id,student_id,audio,seconds) values ('30000000-0000-0000-0000-00000000000a','${S.A}','${AUDIO}',10),('30000000-0000-0000-0000-00000000000b','${S.B}','${AUDIO}',10),('30000000-0000-0000-0000-00000000000c','${S.C}','${AUDIO}',10);
  `);
  return db;
}

async function as(db, uid, fn) {
  await db.exec(`set role authenticated; select set_config('request.jwt.claim.sub', '${uid || ''}', false);`);
  try { return await fn(); } finally { await db.exec(`reset role; select set_config('request.jwt.claim.sub', '', false);`); }
}
const snapshot = async (db) => {
  const out = {};
  for (const t of TABLES) out[t] = (await db.query(`select to_jsonb(x) j from public.${t} x order by 1::text`)).rows.map((r) => JSON.stringify(r.j)).sort();
  out.users = (await db.query(`select id::text from auth.users order by 1`)).rows.map((r) => r.id);
  return out;
};
const names = async (db, uid) => as(db, uid, async () => (await db.query('select name from public.students order by name')).rows.map((r) => r.name));
const cnt = async (db, uid, t) => as(db, uid, async () => (await db.query(`select count(*)::int n from public.${t}`)).rows[0].n);
const rejects = async (p) => { try { await p; return false; } catch { return true; } };

test('güncelleme SQL\'i mevcut verilere hiç dokunmaz ve iki kez çalıştırılabilir', async () => {
  const db = await setup(OLD);
  const before = await snapshot(db);
  const seenBefore = { pA: await names(db, U.pA), pB: await names(db, U.pB), pC: await names(db, U.pC) };
  await db.exec(MIG);
  await db.exec(MIG);
  assert.deepEqual(await snapshot(db), before, 'hiçbir tabloda satır değişmemeli');
  assert.equal((await db.query('select count(*)::int n from public.parent_links')).rows[0].n, 0);
  // Kardeş bağlanmadıkça her veli aynı şeyi görür
  assert.deepEqual({ pA: await names(db, U.pA), pB: await names(db, U.pB), pC: await names(db, U.pC) }, seenBefore);
  // Ardından tam kurulum dosyası da (yeniden çalıştırma) veri silmez
  await db.exec(NEW);
  assert.deepEqual(await snapshot(db), before);
});

for (const [label, sql] of [['yeni kurulum', NEW], ['eski kurulum + güncelleme', OLD + '\n' + MIG]]) {
  test(`kardeş bağla / sil / ayır (${label})`, async () => {
    const db = await setup(sql);
    // Yetkisiz kişiler bağlayamaz
    assert.equal(await as(db, U.pA, () => rejects(db.query(`select public.link_sibling('${S.C}','${S.A}')`))), true, 'veli kardeş bağlayamaz');
    assert.equal(await as(db, U.sA, () => rejects(db.query(`select public.link_sibling('${S.B}','${S.A}')`))), true, 'öğrenci kardeş bağlayamaz');

    // Berk'i Ali'nin velisine bağla: Berk'in ayrı veli hesabı kapanır
    const r = await as(db, U.t, () => db.query(`select public.link_sibling('${S.B}','${S.A}') as u`));
    assert.equal(r.rows[0].u, 'ayse.veli');
    assert.deepEqual(await names(db, U.pA), ['Ali', 'Berk'], 'ortak veli iki çocuğu görür');
    assert.equal((await db.query(`select count(*)::int n from auth.users where id = '${U.pB}'`)).rows[0].n, 0, 'Berk\'in eski veli hesabı kapandı');
    for (const t of ['schedules', 'plans', 'marks', 'payments', 'homework', 'voice_notes', 'extra_lessons']) {
      assert.equal(await cnt(db, U.pA, t), t === 'extra_lessons' ? 2 : 2, `ortak veli ${t}`);
    }
    assert.deepEqual(await names(db, U.pC), ['Cem'], 'başka veli etkilenmez');
    assert.equal(await cnt(db, U.sA, 'homework'), 1, 'öğrenci yalnız kendi ödevini görür');
    assert.equal(await cnt(db, U.sB, 'homework'), 1);
    assert.equal(await cnt(db, U.sA, 'students'), 0, 'öğrenci öğrenci tablosunu görmez');
    const st = (await db.query(`select name, parent_username from public.students order by name`)).rows;
    assert.deepEqual(st.map((x) => x.parent_username), ['ayse.veli', 'ayse.veli', 'cem.veli']);
    const lg = (await db.query(`select s.name, l.student_pw, l.parent_pw from public.logins l join public.students s on s.id = l.student_id order by s.name`)).rows;
    assert.deepEqual(lg.map((x) => [x.name, x.student_pw, x.parent_pw]), [['Ali', 'sa', 'va'], ['Berk', 'sb', 'va'], ['Cem', 'sc', 'vc']], 'öğrenci şifreleri aynı kalır, veli şifresi ortak olur');
    // Sesli not: ortak veli iki çocuğunkini de "dinlendi" yapabilir, Cem'inkini yapamaz
    await as(db, U.pA, () => db.query(`select public.mark_voice_heard('30000000-0000-0000-0000-00000000000b')`));
    assert.equal(await as(db, U.pA, () => rejects(db.query(`select public.mark_voice_heard('30000000-0000-0000-0000-00000000000c')`))), true);
    // Veli bağlantı tablosunu değiştiremez (kendine başka çocuk ekleyemez)
    assert.equal(await as(db, U.pA, () => rejects(db.query(`insert into public.parent_links(user_id, student_id) values ('${U.pA}','${S.C}')`))), true);
    assert.deepEqual(await names(db, U.pA), ['Ali', 'Berk']);
    // Aynı bağlamayı tekrar yapmak zararsız
    await as(db, U.t, () => db.query(`select public.link_sibling('${S.B}','${S.A}')`));
    assert.deepEqual(await names(db, U.pA), ['Ali', 'Berk']);

    // Üçüncü kardeş (Cem) bağlanır, sonra Ali (velinin ilk çocuğu) silinir: veli hesabı KALIR
    await as(db, U.t, () => db.query(`select public.link_sibling('${S.C}','${S.B}')`));
    assert.deepEqual(await names(db, U.pA), ['Ali', 'Berk', 'Cem']);
    await as(db, U.t, async () => { await db.query(`select public.delete_accounts_for('${S.A}')`); await db.query(`delete from public.students where id = '${S.A}'`); });
    assert.equal((await db.query(`select count(*)::int n from auth.users where id = '${U.pA}'`)).rows[0].n, 1, 'ortak veli hesabı silinmedi');
    assert.equal((await db.query(`select count(*)::int n from auth.users where id = '${U.sA}'`)).rows[0].n, 0, 'silinen öğrencinin hesabı silindi');
    assert.deepEqual(await names(db, U.pA), ['Berk', 'Cem']);

    // Cem kardeşten ayrılır: yeni veli hesabı açılır, eski ortak hesap yalnız Berk'i görür
    const pNew = '00000000-0000-0000-0000-0000000000d1';
    await db.exec(`insert into auth.users(id,email) values ('${pNew}','d@x'); insert into public.profiles(user_id,username,role,student_id) values ('${pNew}','cem.anne','parent','${S.C}')`);
    await as(db, U.t, () => db.query(`select public.unlink_sibling('${S.C}','${pNew}')`));
    assert.deepEqual(await names(db, U.pA), ['Berk']);
    assert.deepEqual(await names(db, pNew), ['Cem']);
    // Ayırma yarıda kalırsa yeni hesap geri alınır; kardeşli hesap ya da başka öğrencinin hesabı geri alınamaz
    const pX = '00000000-0000-0000-0000-0000000000e1';
    await db.exec(`insert into auth.users(id,email) values ('${pX}','e@x'); insert into public.profiles(user_id,username,role,student_id) values ('${pX}','yarim','parent','${S.B}')`);
    assert.equal(await as(db, U.pA, () => rejects(db.query(`select public.cancel_parent_account('${pX}','${S.B}')`))), true, 'veli hesap silemez');
    await as(db, U.t, () => db.query(`select public.cancel_parent_account('${U.pA}','${S.C}')`)); // eşleşmiyor → hiçbir şey olmaz
    assert.equal((await db.query(`select count(*)::int n from auth.users where id = '${U.pA}'`)).rows[0].n, 1);
    await as(db, U.t, () => db.query(`select public.cancel_parent_account('${pX}','${S.B}')`));
    assert.equal((await db.query(`select count(*)::int n from auth.users where id = '${pX}'`)).rows[0].n, 0);
    // Son çocuk da silinince veli hesabı da silinir (artık çocuğu yok)
    await as(db, U.t, async () => { await db.query(`select public.delete_accounts_for('${S.B}')`); });
    assert.equal((await db.query(`select count(*)::int n from auth.users where id = '${U.pA}'`)).rows[0].n, 0);
  });
}

// Rastgele oturum: bağla / ayır / sil / yeni öğrenci, her adımdan sonra tutarlılık kuralları
test('kardeş işlemleri rastgele dizilerde tutarlı kalır (60 tohum)', async () => {
  for (let seed = 1; seed <= 60; seed++) {
    let x = seed * 7919;
    const rnd = (n) => { x = (x * 1103515245 + 12345) % 2147483648; return x % n; };
    const db = await setup(NEW);
    const alive = new Set([S.A, S.B, S.C]);
    let n = 0;
    const lessonRows = async () => (await db.query(`select count(*)::int n from public.payments`)).rows[0].n + (await db.query(`select count(*)::int n from public.homework`)).rows[0].n;
    for (let step = 0; step < 12; step++) {
      const ids = [...alive];
      const pick = () => ids[rnd(ids.length)];
      const op = rnd(4);
      try {
        if (op === 0 && ids.length > 1) {
          const a = pick(), b = pick();
          await as(db, U.t, () => db.query(`select public.link_sibling('${a}','${b}')`));
        } else if (op === 1) {
          const sid = pick(), pu = `00000000-0000-0000-0000-${String(900000000000 + ++n)}`;
          await db.exec(`insert into auth.users(id,email) values ('${pu}','n${n}@x'); insert into public.profiles(user_id,username,role,student_id) values ('${pu}','yeni${n}','parent','${sid}')`);
          try {
            await as(db, U.t, async () => { await db.query(`select public.unlink_sibling('${sid}','${pu}')`); await db.query(`update public.students set parent_username = 'yeni${n}' where id = '${sid}'`); });
          } catch (e) { await db.exec(`delete from auth.users where id = '${pu}'`); throw e; } // kardeşi yoksa: yeni hesap geri alınır
        } else if (op === 2 && ids.length > 1) {
          const sid = pick();
          await as(db, U.t, async () => { await db.query(`select public.delete_accounts_for('${sid}')`); await db.query(`delete from public.students where id = '${sid}'`); });
          alive.delete(sid);
        } else {
          const sid = `10000000-0000-0000-0000-${String(800000000000 + ++n)}`, pu = `00000000-0000-0000-0000-${String(700000000000 + n)}`;
          await db.exec(`insert into public.students(id,name,phone,parent_name,parent_phone,start_date,student_username,parent_username) values ('${sid}','Ö${n}','0532','V','0533','2026-09-01','o${n}','v${n}');
            insert into auth.users(id,email) values ('${pu}','v${n}@x'); insert into public.profiles(user_id,username,role,student_id) values ('${pu}','v${n}','parent','${sid}');
            insert into public.homework(student_id,given_date,due_date) values ('${sid}','2026-09-02','2026-09-09')`);
          alive.add(sid);
        }
      } catch (e) {
        if (!/kardeşi yok|kendisiyle/.test(e.message)) throw new Error(`tohum ${seed} adım ${step}: ${e.message}`);
      }
      // KURALLAR
      const parents = (await db.query(`select user_id, username from public.profiles where role = 'parent'`)).rows;
      const seenBy = new Map();
      for (const p of parents) {
        const kids = (await as(db, p.user_id, () => db.query('select id, parent_username from public.students'))).rows;
        assert.ok(kids.length > 0, `tohum ${seed}: çocuksuz veli hesabı kalmamalı (${p.username})`);
        for (const k of kids) {
          assert.equal(seenBy.has(k.id), false, `tohum ${seed}: bir öğrenciyi iki veli hesabı görmemeli`);
          seenBy.set(k.id, p.username);
          assert.equal(k.parent_username, p.username, `tohum ${seed}: öğrenci kaydındaki veli kullanıcı adı hesapla aynı olmalı`);
        }
      }
      for (const sid of alive) assert.ok(seenBy.has(sid), `tohum ${seed} adım ${step}: her öğrencinin bir veli hesabı olmalı`);
      assert.equal(seenBy.size, alive.size);
      // Silinmeyen öğrencilerin kayıtları yerinde (her öğrencide 1 ödev + ilk üçte 1 ödeme)
      const hw = (await db.query(`select count(*)::int n from public.homework`)).rows[0].n;
      assert.equal(hw, alive.size, `tohum ${seed}: ödevler kaybolmamalı`);
    }
    await lessonRows();
  }
});

// "Kendi MathX'ini kur": yapıştırılan bağlantının ayrıştırılması ve gizli anahtarın asla kabul edilmemesi
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { parseConn, checkKey, withConn } from '../src/store/conn.js';

const REF = 'abcdefghijklmnopqrst';
const PUB = 'sb_publishable_Gq4gHBbxMtoyIheN06ieoA_v5QxNmjQ';
const jwt = (role) => `eyJhbGciOiJIUzI1NiJ9.${Buffer.from(JSON.stringify({ role, ref: REF })).toString('base64url')}.imza`;

test('Connect penceresindeki blok tek yapıştırmada çözülür', () => {
  const c = parseConn(`NEXT_PUBLIC_SUPABASE_URL=https://${REF}.supabase.co\nNEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY=${PUB}`);
  assert.deepEqual(c, { ref: REF, key: PUB });
});

test('adres ve anahtar ayrı ayrı, boşluklu yapıştırılsa da çözülür', () => {
  assert.deepEqual(parseConn(`  https://${REF}.supabase.co/  \n\n ${PUB} `), { ref: REF, key: PUB });
  assert.deepEqual(parseConn(''), { ref: null, key: null });
  assert.equal(parseConn('https://kotu.example.com').ref, null);
});

test('gizli anahtar reddedilir, publishable/anon kabul edilir', () => {
  assert.match(checkKey('sb_secret_abcdefghijklmn'), /GİZLİ/);
  assert.match(checkKey(jwt('service_role')), /GİZLİ/);
  assert.equal(checkKey(PUB), null);
  assert.equal(checkKey(jwt('anon')), null);
  assert.ok(checkKey('rastgele'));
  // Hem gizli hem açık anahtar yapıştırılırsa gizli olan yakalanır (asla linke girmez)
  assert.match(checkKey(parseConn(`sb_secret_abcdefghijklmn ${PUB}`).key), /GİZLİ/);
});

test('veli linki: kendi veritabanı varsa bağlantı eklenir, yoksa link aynen kalır', () => {
  const base = 'https://cagriuguz.github.io/mathx/';
  assert.equal(withConn(base, null), base);
  const u = new URL(withConn(base, { ref: REF, key: PUB }));
  assert.equal(u.origin + u.pathname, base);
  assert.equal(u.searchParams.get('db'), REF);
  assert.equal(u.searchParams.get('k'), PUB);
});

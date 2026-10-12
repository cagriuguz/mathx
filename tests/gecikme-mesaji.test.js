// Süresi geçen ödev için veliye durum mesajları: metin doğru, girdi (ödev kalemleri) asla değişmez.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { msgHomeworkLate, msgHomeworkDone, LATE_KINDS } from '../src/core/messages.js';

const items = [
  { book_id: 'k1', book_name: 'ACİL 10. SINIF', pages: '8. tema' },
  { book_id: 'k2', book_name: 'Limit', pages: '45' },
];

test('yapmadı ve göndermedi mesajları öğrenci adı ve kitapları yazar', () => {
  const a = msgHomeworkLate('none', 'Aras', items);
  assert.equal(a, 'Sayın veli, Aras isimli öğrenciniz ACİL 10. SINIF 8. tema ve Limit 45 ödevini yapmamıştır. Bilginize.');
  const b = msgHomeworkLate('unsent', 'Aras', items);
  assert.match(b, /sisteme göndermemiştir/);
  assert.ok(!/\{\{/.test(a + b), 'doldurulmamış yer tutucu kalmamalı');
});

test('mesaj üretmek ödev kalemlerini değiştirmez', () => {
  const before = JSON.stringify(items);
  for (const k of Object.keys(LATE_KINDS)) msgHomeworkLate(k, 'Aras', items);
  msgHomeworkDone('Aras', items);
  assert.equal(JSON.stringify(items), before);
});

test('yaptı mesajı mevcut onaylı metni kullanır', () => {
  assert.match(msgHomeworkDone('Aras', items), /^Sayın veli, Aras isimli öğrenciniz ödev durumunu bildirdi: .*yaptı/);
});

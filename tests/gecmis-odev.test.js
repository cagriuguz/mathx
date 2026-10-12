import { test } from 'node:test';
import assert from 'node:assert/strict';
import { lateMark, makeLateNote, isPending, isPast } from '../src/core/latehw.js';
import { buildNotifications } from '../src/core/notify.js';

test('gecikme kaydı yazılır ve okunur; ödevin başka alanına dokunulmaz', () => {
  const h = { id: 'a', done: false, note: makeLateNote('none', '2026-10-12', true), items: [{ book_name: 'K', pages: '1-2' }] };
  assert.deepEqual(lateMark(h), { kind: 'none', date: '2026-10-12', sent: true });
  assert.equal(lateMark({ note: makeLateNote('seen', '2026-10-12', false) }).sent, false);
  assert.equal(lateMark({ note: '' }), null);
  assert.equal(lateMark({}), null);
  assert.equal(lateMark({ note: 'gecikme:bilinmeyen:2026-10-12:1' }), null);
});

test('ele alınan gecikmiş ödev Panel bildiriminden ve bekleyenlerden kalkar, geçmişe geçer', () => {
  const students = [{ id: 's1', name: 'Ali' }];
  const mk = (id, extra) => ({ id, student_id: 's1', done: false, due_date: '2026-10-01', note: '', items: [], ...extra });
  const data = { students, homework: [
    mk('acik'), mk('yapmadi', { note: makeLateNote('none', '2026-10-12', false) }),
    mk('gordum', { note: makeLateNote('seen', '2026-10-12', false) }), mk('yapti', { done: true, seen_done: true }),
  ] };
  const n = buildNotifications(data, [], '2026-10-12');
  assert.deepEqual(n.lateHw.map((h) => h.id), ['acik']);
  assert.deepEqual(data.homework.filter(isPending).map((h) => h.id), ['acik']);
  assert.deepEqual(data.homework.filter(isPast).map((h) => h.id), ['yapmadi', 'gordum', 'yapti']);
  // geri alınca (note boş) yeniden gecikmiş listesine döner
  data.homework[1].note = '';
  assert.deepEqual(buildNotifications(data, [], '2026-10-12').lateHw.map((h) => h.id), ['acik', 'yapmadi']);
});

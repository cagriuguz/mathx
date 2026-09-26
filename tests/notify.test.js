import { test } from 'node:test';
import assert from 'node:assert/strict';
import { buildNotifications } from '../src/core/notify.js';

test('bildirimler: yapılan, süresi geçen ödev, geciken ödeme', () => {
  const data = {
    students: [{ id: 's1', name: 'Ali' }],
    homework: [
      { id: 'a', student_id: 's1', done: true, seen_done: false, due_date: '2026-09-30' },  // yaptı, görülmedi
      { id: 'b', student_id: 's1', done: true, seen_done: true, due_date: '2026-09-20' },   // görüldü → yok
      { id: 'c', student_id: 's1', done: false, due_date: '2026-09-23' },                    // 3 gün geçti
      { id: 'd', student_id: 's1', done: false, due_date: '2026-09-26' },                    // son gün bugün → henüz değil
      { id: 'e', student_id: 'silinmis', done: false, due_date: '2026-09-01' },              // öğrencisi yok → yok
    ],
  };
  const periods = [{ key: 'p1', status: 'late', due: '2026-09-10', remaining: 100 }, { key: 'p2', status: 'due', due: '2026-09-25', remaining: 100 }, { key: 'p3', status: 'late', due: '2026-09-01', remaining: 0 }];
  const n = buildNotifications(data, periods, '2026-09-26');
  assert.deepEqual(n.doneHw.map((h) => h.id), ['a']);
  assert.deepEqual(n.lateHw.map((h) => [h.id, h.days_late]), [['c', 3]]);
  assert.deepEqual(n.latePay.map((p) => p.key), ['p1']);
  assert.equal(n.count, 3);
});

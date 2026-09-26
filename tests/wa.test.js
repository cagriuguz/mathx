// Otomatik WhatsApp kararları: kim, hangi şablon, ne zaman gönderilmez.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { planHomeworkMessage, templatePayload, explainMetaError, autoReady } from '../src/core/wa.js';
import { WA_TEMPLATES, fillTemplate, msgHomeworkGiven, msgHomeworkDone } from '../src/core/messages.js';

const items = [{ book_name: 'Karekök 7', pages: '12-20' }, { book_name: 'Limit', pages: '5' }];
const hw = { id: 'h1', student_id: 's1', items, due_date: '2026-10-03', done: false };
const student = { name: 'Ali Yılmaz', phone: '0532 111 22 33', parent_phone: '0533 444 55 66' };
const auto = { wa_mode: 'auto', teacher_phone: '0535 777 88 99' };
const teacher = { role: 'teacher' }, ali = { role: 'student', student_id: 's1' }, other = { role: 'student', student_id: 's2' };

test('ödev verildi → veli + öğrenci, metin elle gönderilenle birebir aynı', () => {
  const p = planHomeworkMessage({ kind: 'given', profile: teacher, homework: hw, student, settings: auto });
  assert.deepEqual(p.to, ['905334445566', '905321112233']);
  assert.equal(p.template.name, 'mathx_odev_verildi');
  assert.equal(fillTemplate(p.template.body, p.params), msgHomeworkGiven(items, '2026-10-03'));
});

test('ödev yapıldı → öğretmen + veli; yalnız kendi ödevi, yalnız bir kez', () => {
  const done = { ...hw, done: true };
  const p = planHomeworkMessage({ kind: 'done', profile: ali, homework: done, student, settings: auto });
  assert.deepEqual(p.to, ['905357778899', '905334445566']);
  assert.equal(fillTemplate(p.template.body, p.params), msgHomeworkDone('Ali Yılmaz', items));
  assert.equal(planHomeworkMessage({ kind: 'done', profile: other, homework: done, student, settings: auto }).status, 403);
  assert.equal(planHomeworkMessage({ kind: 'done', profile: ali, homework: hw, student, settings: auto }).skip, 'not-done');
  assert.equal(planHomeworkMessage({ kind: 'done', profile: ali, homework: { ...done, wa_done_at: 'x' }, student, settings: auto }).skip, 'already');
  assert.equal(planHomeworkMessage({ kind: 'given', profile: ali, homework: hw, student, settings: auto }).status, 403, 'öğrenci ödev mesajı tetikleyemez');
});

test('elle modunda ya da numarasız durumda gönderim yok', () => {
  assert.equal(planHomeworkMessage({ kind: 'given', profile: teacher, homework: hw, student, settings: { wa_mode: 'manual' } }).skip, 'manual');
  assert.equal(planHomeworkMessage({ kind: 'given', profile: teacher, homework: hw, student, settings: {} }).skip, 'manual', 'eski kurulum = elle');
  const p = planHomeworkMessage({ kind: 'done', profile: ali, homework: { ...hw, done: true }, student: { ...student, parent_phone: '' }, settings: { wa_mode: 'auto', teacher_phone: '' } });
  assert.equal(p.status, 422);
  const one = planHomeworkMessage({ kind: 'given', profile: teacher, homework: hw, student: { ...student, phone: student.parent_phone }, settings: auto });
  assert.equal(one.to.length, 1, 'aynı numaraya iki kez gitmez');
});

test('Meta şablon gövdesi ve Türkçe hata açıklamaları', () => {
  const b = templatePayload('905334445566', WA_TEMPLATES.done, ['Ali', 'Limit (5. sayfa) kitabındaki']);
  assert.equal(b.template.language.code, 'tr');
  assert.deepEqual(b.template.components[0].parameters.map((x) => x.text), ['Ali', 'Limit (5. sayfa) kitabındaki']);
  assert.match(explainMetaError({ code: 190 }), /anahtar/);
  assert.match(explainMetaError({ code: 132001 }), /şablon/);
  assert.equal(autoReady({ wa_mode: 'auto' }, { phone_number_id: '1', has_token: true }), true);
  assert.equal(autoReady({ wa_mode: 'auto' }, { phone_number_id: '1', has_token: false }), false);
  // Meta kuralı: değişken içinde satır sonu/sekme olamaz
  for (const t of Object.values(WA_TEMPLATES)) assert.ok(!/[\n\t]/.test(t.body));
});

// "Ödeme al ve yeni pakete geç" + panel uyarısı "Tamam, sil": hiçbir mevcut kayıt değişmez/silinmez.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { studentPeriods, canStartNewPackage, previewNewPackage } from '../src/core/billing.js';
import { studentWarnings, activeWarnings, warningKey } from '../src/core/review.js';

const ali = { id: 's1', name: 'Ali', start_date: '2026-09-01', active: true };
// 2026-09-01 Salı: Salı 17:00 + Cuma 18:00, 1'er saat; 4 haftalık 8000 TL
const sched = [{ id: 'h1', student_id: 's1', valid_from: '2026-09-01', slots: [{ dow: 2, time: '17:00', hours: 1 }, { dow: 5, time: '18:00', hours: 1 }] }];
const plan = { id: 'p1', student_id: 's1', valid_from: '2026-09-01', type: '4weekly', fee: 800000, hours: null, due_date: null };
const mk = (extra = {}) => ({ students: [ali], plans: [plan], schedules: sched, marks: [], payments: [], extra_lessons: [], homework: [], lesson_reviews: [], settings: [], ...extra });
const today = '2026-09-15'; // 2. haftanın ortası (dersler 1,4,8,11,15 Eyl; 15'i bugünkü ders)

const cur = (d, t = today) => studentPeriods(ali, d, t).find((p) => p.status === 'running');

test('yeni paket: eski dönem yapılan ders oranında kapanır, yeni 4 haftalık başlar, hiçbir şey silinmez', () => {
  const d = mk({ payments: [{ id: 'a', student_id: 's1', period_key: 'p1#1', amount: 100000, paid_date: '2026-09-08', method: 'nakit', note: 'ilk ara', deleted_at: null }] });
  const before = JSON.stringify(d);
  const p = cur(d);
  assert.ok(canStartNewPackage(p, today));
  const pv = previewNewPackage(ali, d, p, '2026-09-16', today);
  assert.ok(pv.ok, pv.error);
  assert.equal(pv.old.end, '2026-09-15');
  assert.equal(pv.old.amount, 500000); // 5 ders / 8 ders × 8000 TL (bugünkü ders eski pakette)
  assert.equal(pv.old.paid, 100000);   // önceki ödeme kaybolmadı
  assert.equal(pv.old.remaining, 400000);
  assert.equal(pv.next.type, '4weekly');
  assert.equal(pv.next.start, '2026-09-16');
  assert.equal(pv.next.amount, 800000);
  assert.equal(JSON.stringify(d), before, 'önizleme veriyi değiştirmemeli');
  // gerçek ekleme: yalnız plan satırı eklenir
  const d2 = { ...d, plans: [...d.plans, { ...pv.row, id: 'p2' }] };
  const per = studentPeriods(ali, d2, today);
  assert.equal(per.find((x) => x.key === 'p1#1').paid, 100000);
  assert.equal(per.filter((x) => x.plan_id === 'p2')[0].seq, 1);
  // geri alma: plan satırı çıkınca eski hâl birebir döner
  assert.deepEqual(studentPeriods(ali, { ...d2, plans: d2.plans.filter((x) => x.id !== 'p2') }, today), studentPeriods(ali, d, today));
});

test('yeni paket: kapanan eski dönemin kalanı tam ödenince 0 olur', () => {
  const d = mk({ payments: [{ id: 'a', student_id: 's1', period_key: 'p1#1', amount: 500000, paid_date: today, method: 'havale', note: '', deleted_at: null }] });
  const pv = previewNewPackage(ali, d, cur(d), '2026-09-16', today);
  assert.equal(pv.old.remaining, 0);
  assert.equal(pv.old.status, 'paid');
});

test('yeni paket: geçersiz durumlar reddedilir', () => {
  const d = mk();
  const p = cur(d);
  assert.equal(previewNewPackage(ali, d, p, '2026-09-01', today).ok, false);       // dönem başlangıcı
  assert.equal(previewNewPackage(ali, d, p, '2026-12-01', today).ok, false);       // dönem bitişinden sonra
  assert.equal(previewNewPackage(ali, d, p, '', today).ok, false);
  const dup = mk({ plans: [plan, { id: 'p9', student_id: 's1', valid_from: '2026-09-16', type: '4weekly', fee: 1, hours: null, due_date: null }] });
  assert.equal(previewNewPackage(ali, dup, cur(dup), '2026-09-16', today).ok, false); // aynı gün başka paket
  const oneoff = mk({ plans: [{ id: 'q', student_id: 's1', valid_from: '2026-09-01', type: 'oneoff', fee: 100000, hours: 8, due_date: '2026-10-10' }] });
  const po = studentPeriods(ali, oneoff, today)[0];
  assert.equal(canStartNewPackage(po, today), false);
});

test('rastgele: her tarih ve ödeme durumunda eski ödemeler korunur, önizleme veriyi değiştirmez', () => {
  let seed = 7; const rnd = () => (seed = (seed * 48271) % 2147483647) / 2147483647;
  for (let i = 0; i < 60; i++) {
    const pays = [];
    for (let k = 0; k < Math.floor(rnd() * 3); k++) pays.push({ id: 'x' + k, student_id: 's1', period_key: 'p1#1', amount: Math.round(rnd() * 300000), paid_date: today, method: 'nakit', note: '', deleted_at: null });
    const d = mk({ payments: pays });
    const before = JSON.stringify(d);
    const day = `2026-09-${String(16 + Math.floor(rnd() * 12)).padStart(2, '0')}`;
    const p = cur(d);
    const pv = previewNewPackage(ali, d, p, day, today);
    assert.equal(JSON.stringify(d), before);
    if (pv.ok) {
      assert.equal(pv.old.paid, pays.reduce((a, x) => a + x.amount, 0));
      assert.ok(pv.old.amount <= p.amount + 1);
      assert.ok(pv.next.start === day);
    }
  }
});

test('uyarı "Tamam, sil": yalnız o uyarı gizlenir, veri değişmez, yeni olayda yeniden çıkar', () => {
  const now = { date: '2026-09-19', time: '10:00' };
  // 15 ve 18 Eylül dersleri üst üste yapılmadı
  const marks = [{ id: 'm1', student_id: 's1', date: '2026-09-15', time: '17:00', reason: 'x' }, { id: 'm2', student_id: 's1', date: '2026-09-18', time: '18:00', reason: 'y' }];
  const d = mk({ marks });
  const ws = studentWarnings(d, now);
  assert.equal(ws.length, 1);
  assert.equal(ws[0].kind, 'devam');
  const key = warningKey(ws[0]);
  assert.equal(activeWarnings(d, now).length, 1);
  const d2 = { ...d, settings: [{ id: 'main', dismissed_warnings: [key] }] };
  assert.equal(activeWarnings(d2, now).length, 0);   // gizlendi
  assert.equal(studentWarnings(d2, now).length, 1);  // asıl hesap durur (Excel raporu vb.)
  // yeni olay: 22 Eylül dersi de yapılmadı → damga değişir, uyarı geri gelir
  const now2 = { date: '2026-09-23', time: '10:00' };
  const d3 = { ...d2, marks: [...marks, { id: 'm3', student_id: 's1', date: '2026-09-22', time: '17:00', reason: 'z' }] };
  assert.equal(activeWarnings(d3, now2).length, 1);
  assert.equal(activeWarnings({ ...d, settings: [] }, now).length, 1); // ayar satırı yoksa da çalışır
});

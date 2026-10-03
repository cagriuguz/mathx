// Ödev kalemi (kitap + sayfa) durumları. Her kalem items[] içinde kendi durumunu taşır:
//   status: 'done' | 'partial' | 'none'  (yaptım / eksik yaptım / yapmadım)
//   parent_ok: true | false              (velimin kontrol etmesinde sakınca yoktur: evet / hayır)
//   teacher_note: öğretmen durumu değiştirirse yazdığı açıklama
// Eski kayıtlarda bu alanlar yoktur: "yapıldı" işaretli ödevin kalemleri YAPILDI sayılır (veri değişmez).

export const ITEM_STATUS = { done: 'Yaptım', partial: 'Eksik yaptım', none: 'Yapmadım' };
export const ITEM_STATUS_TEACHER = { done: 'Yaptı', partial: 'Eksik yaptı', none: 'Yapmadı' };
export const NOTE_MAX = 200;

/** Kalemin geçerli durumu: seçilmemişse null (eski "yapıldı" ödevlerde 'done') */
export function itemStatus(h, item) {
  if (item?.status in ITEM_STATUS) return item.status;
  return h?.done ? 'done' : null;
}

/** Ödevin genel durumu: open (öğrenci henüz bildirmedi) | done | partial | none */
export function hwState(h) {
  if (!h.done) return 'open';
  const st = (h.items || []).map((i) => itemStatus(h, i));
  if (st.every((s) => s === 'done')) return 'done';
  if (st.every((s) => s === 'none')) return 'none';
  return 'partial';
}

export const HW_CHIP = {
  open: ['bad', 'Yapılacak'],
  done: ['ok', 'Yapıldı'],
  partial: ['gold', 'Eksik yapıldı'],
  none: ['bad', 'Yapılmadı'],
};

/** Öğrenci formu tamam mı? Her kalem için hem durum hem veli sorusu cevaplanmış olmalı. */
export function missingAnswers(items, answers) {
  let status = 0, parent = 0;
  items.forEach((_, k) => {
    if (!(answers[k]?.status in ITEM_STATUS)) status++;
    if (typeof answers[k]?.parent_ok !== 'boolean') parent++;
  });
  return { status, parent, complete: !status && !parent };
}

/** Öğrencinin cevaplarını ödevin kalemleriyle birleştirir (kitap/sayfa asla değişmez) */
export const mergeAnswers = (items, answers) =>
  items.map((i, k) => ({ ...i, status: answers[k].status, parent_ok: answers[k].parent_ok }));

/** Öğretmen bir kalemin durumunu değiştirir; açıklama ZORUNLU */
export function teacherOverride(items, index, status, note) {
  const text = String(note || '').replace(/\s+/g, ' ').trim();
  if (!(status in ITEM_STATUS)) throw new Error('Durum seçin.');
  if (!text) throw new Error('Durumu değiştirirken açıklama yazmalısınız.');
  if ([...text].length > NOTE_MAX) throw new Error(`Açıklama en fazla ${NOTE_MAX} karakter olabilir.`);
  return items.map((i, k) => (k === index ? { ...i, status, teacher_note: text } : i));
}

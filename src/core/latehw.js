// Gecikmiş ödevin öğretmen tarafından "ele alındı" kaydı.
// Veritabanında yeni sütun YOK: homework.note (eskiden hep boştu) içine `gecikme:<tür>:<tarih>:<gönderildi 0|1>` yazılır.
// Ödevin kitap/sayfa/done/items alanlarına dokunulmaz. Not boşaltılırsa ödev yeniden gecikmiş listesine döner.

export const LATE_MARK_LABEL = { none: 'Yapmadı', unsent: 'Göndermedi', seen: 'Gördüm' };
export const LATE_MARK_CHIP = { none: 'bad', unsent: 'bad', seen: 'gold' };
const PREFIX = 'gecikme:';

/** Ödevdeki gecikme kaydı: { kind, date, sent } ya da null */
export function lateMark(h) {
  const note = String(h?.note || '');
  if (!note.startsWith(PREFIX)) return null;
  const [kind, date, sent] = note.slice(PREFIX.length).split(':');
  if (!(kind in LATE_MARK_LABEL)) return null;
  return { kind, date: date || '', sent: sent === '1' };
}

export const makeLateNote = (kind, date, sent) => `${PREFIX}${kind}:${date}:${sent ? 1 : 0}`;

/** Öğretmenin Panel/Takip'te hâlâ ilgilenmesi gereken (bildirilmemiş ve ele alınmamış) ödev mi? */
export const isPending = (h) => !h.done && !lateMark(h);

/** Geçmiş ödev: öğrenci bildirmiş ya da öğretmen gecikmiş diye ele almış */
export const isPast = (h) => h.done || !!lateMark(h);

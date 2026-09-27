// Sesli not: saf yardımcılar (test edilebilir, tarayıcı gerektirmez).
import { localNow, fmtDate } from './dates.js';

export const MAX_CHARS = 3000000; // veritabanı sınırı (kurulum.sql ile aynı)

// iPhone kayıtları AAC (audio/mp4); onu her telefon çalar. Android Chrome destekliyorsa o da mp4 kaydeder.
const MIMES = ['audio/mp4;codecs=mp4a.40.2', 'audio/mp4', 'audio/aac', 'audio/webm;codecs=opus', 'audio/webm', 'audio/ogg;codecs=opus'];
export function pickMime(MR = globalThis.MediaRecorder) {
  if (!MR?.isTypeSupported) return '';
  return MIMES.find((m) => { try { return MR.isTypeSupported(m); } catch { return false; } }) || '';
}

export const fmtSec = (n) => `${Math.floor(n / 60)}:${String(Math.floor(n % 60)).padStart(2, '0')}`;

export function voiceWhen(createdAt) {
  const n = localNow(new Date(createdAt));
  return `${fmtDate(n.date)} · ${n.time}`;
}

export const voiceNoticeText = (name) =>
  `Sayın veli, ${name} hakkında MathX'e sesli bir not bıraktım. MathX'i açınca Ödevler sayfasının en üstünden dinleyebilirsiniz.`;


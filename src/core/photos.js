// Ödev fotoğrafları: saf yardımcılar + tarayıcıda küçültme.
// Telefonun 4-5 MB'lık fotoğrafı yüklenmeden önce ~250 KB'a küçültülür (defter yazısı okunur kalır).

export const MAX_PHOTOS = 15;
export const IMAGE_MAX_CHARS = 1500000; // veritabanı sınırı (kurulum.sql ile aynı)
export const THUMB_MAX_CHARS = 120000;

/** Ödev başına fotoğraf sayısı: Map(homework_id → sayı) */
export function photoCounts(photos) {
  const m = new Map();
  for (const p of photos || []) m.set(p.homework_id, (m.get(p.homework_id) || 0) + 1);
  return m;
}

/** Seçilen dosyalardan kaç tanesi yüklenebilir (kalan hak kadar) */
export function photoRoom(current, picked, max = MAX_PHOTOS) {
  const room = Math.max(0, max - current);
  return { take: Math.min(room, picked), skipped: Math.max(0, picked - room) };
}

export const fmtMB = (chars) => {
  const mb = (chars * 0.75) / 1e6; // base64 → gerçek bayt
  return `${mb < 10 ? mb.toFixed(1).replace('.', ',') : Math.round(mb)} MB`;
};

/** Fotoğraf alanı özeti (öğretmen Ayarlar'ı) */
export function photoUsage(photos, beforeIso) {
  const all = photos || [];
  const old = beforeIso ? all.filter((p) => (p.created_at || '') < beforeIso) : [];
  const sum = (a) => a.reduce((t, p) => t + (p.bytes || 0), 0);
  return { count: all.length, bytes: sum(all), oldCount: old.length, oldBytes: sum(old) };
}

// ── Tarayıcı: dosyayı açıp küçült (Node testlerinde çağrılmaz)
async function decode(file) {
  if (typeof createImageBitmap === 'function') {
    try { return await createImageBitmap(file, { imageOrientation: 'from-image' }); } catch { /* aşağıdaki yola düş */ }
  }
  const url = URL.createObjectURL(file);
  try {
    const img = new Image();
    img.decoding = 'async';
    img.src = url;
    await img.decode();
    return img;
  } catch {
    throw new Error('Bu fotoğraf açılamadı. Kameradan yeniden çekip tekrar deneyin.');
  } finally { setTimeout(() => URL.revokeObjectURL(url), 1000); }
}

function draw(src, maxSide, quality) {
  const w0 = src.width, h0 = src.height;
  const k = Math.min(1, maxSide / Math.max(w0, h0));
  const c = document.createElement('canvas');
  c.width = Math.max(1, Math.round(w0 * k));
  c.height = Math.max(1, Math.round(h0 * k));
  const g = c.getContext('2d');
  g.fillStyle = '#fff'; // şeffaf PNG siyah olmasın
  g.fillRect(0, 0, c.width, c.height);
  g.drawImage(src, 0, 0, c.width, c.height);
  return c.toDataURL('image/jpeg', quality);
}

/** File → { image, thumb } (JPEG data URL). Büyükse kaliteyi/boyutu düşürerek sınıra sığdırır. */
export async function shrinkPhoto(file) {
  if (file.type && !file.type.startsWith('image/')) throw new Error('Yalnızca fotoğraf yüklenebilir.');
  const src = await decode(file);
  let image = '';
  for (const [side, q] of [[1600, 0.72], [1400, 0.62], [1100, 0.55]]) {
    image = draw(src, side, q);
    if (image.length <= 700000) break;
  }
  const thumb = draw(src, 320, 0.6);
  src.close?.();
  if (image.length > IMAGE_MAX_CHARS) throw new Error('Fotoğraf çok büyük; tekrar çekip deneyin.');
  return { image, thumb };
}

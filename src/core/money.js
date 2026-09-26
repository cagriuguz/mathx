// Para: kuruş tam sayı. Gösterim "1.250 TL" / "1.250,50 TL".

export function fmtTL(kurus, { sign = false } = {}) {
  const neg = kurus < 0;
  const k = Math.abs(Math.round(kurus));
  const tl = Math.floor(k / 100), kr = k % 100;
  const body = tl.toLocaleString('tr-TR') + (kr ? ',' + String(kr).padStart(2, '0') : '');
  return (neg ? '−' : sign ? '+' : '') + body + ' TL';
}

/** "1.250", "1250,5", "1250.50" → kuruş */
export function parseTL(text) {
  let t = String(text ?? '').replace(/\s|TL|₺/gi, '');
  if (!t) return NaN;
  if (t.includes(',')) t = t.replace(/\./g, '').replace(',', '.');
  else if (/^\d{1,3}(\.\d{3})+$/.test(t)) t = t.replace(/\./g, '');
  const v = Number(t);
  return Number.isFinite(v) ? Math.round(v * 100) : NaN;
}

export const fmtHours = (h) => (Number.isInteger(h) ? String(h) : String(h).replace('.', ',')) + ' saat';

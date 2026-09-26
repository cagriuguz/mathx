// "Ana ekrana ekle" yardımcısı: telefonda tarayıcıdan açıldıysa simge eklemeyi önerir.
let deferred = null;
const subs = new Set();

export function initInstall() {
  if (typeof window === 'undefined') return;
  window.addEventListener('beforeinstallprompt', (e) => { e.preventDefault(); deferred = e; subs.forEach((f) => f()); });
  window.addEventListener('appinstalled', () => { deferred = null; subs.forEach((f) => f()); });
  if ('serviceWorker' in navigator && location.protocol === 'https:' && !window.Capacitor) navigator.serviceWorker.register('./sw.js').catch(() => {});
}

export const onInstallChange = (f) => { subs.add(f); return () => subs.delete(f); };
export const canPrompt = () => !!deferred;
export async function promptInstall() {
  if (!deferred) return false;
  deferred.prompt();
  const r = await deferred.userChoice.catch(() => null);
  deferred = null;
  return r?.outcome === 'accepted';
}

/** Hangi durumda ne gösterilecek: null (gösterme) | 'android' | 'ios-safari' | 'ios-other' */
export function installKind(ua = navigator.userAgent, standalone = matchMedia('(display-mode: standalone)').matches || navigator.standalone === true, native = !!window.Capacitor) {
  if (standalone || native) return null;
  const ios = /iPhone|iPad|iPod/.test(ua) || (/Macintosh/.test(ua) && typeof navigator !== 'undefined' && navigator.maxTouchPoints > 1);
  if (ios) return /CriOS|FxiOS|EdgiOS|FBAN|FBAV|Instagram|WhatsApp|GSA\//.test(ua) ? 'ios-other' : 'ios-safari';
  if (/Android/.test(ua)) return 'android';
  return null;
}

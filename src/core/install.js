// "Ana ekrana ekle" yardımcısı: telefonda tarayıcıdan açıldıysa simge eklemeyi önerir.
let deferred = null;
let installed = false;
const subs = new Set();

export function initInstall() {
  if (typeof window === 'undefined') return;
  window.addEventListener('beforeinstallprompt', (e) => { e.preventDefault(); deferred = e; subs.forEach((f) => f()); });
  window.addEventListener('appinstalled', () => { deferred = null; installed = true; subs.forEach((f) => f()); });
  if ('serviceWorker' in navigator && location.protocol === 'https:' && !window.Capacitor) navigator.serviceWorker.register('./sw.js').catch(() => {});
}

export const onInstallChange = (f) => { subs.add(f); return () => subs.delete(f); };
export const canPrompt = () => !!deferred;
export const wasInstalled = () => installed;
export async function promptInstall() {
  if (!deferred) return false;
  deferred.prompt();
  const r = await deferred.userChoice.catch(() => null);
  deferred = null;
  if (r?.outcome === 'accepted') installed = true;
  subs.forEach((f) => f());
  return r?.outcome === 'accepted';
}

/** Hangi durumda ne gösterilecek: null (gösterme) | 'android' | 'android-inapp' (Instagram/Facebook vb. içi tarayıcı) | 'ios-safari' | 'ios-other' */
export function installKind(ua = navigator.userAgent, standalone = matchMedia('(display-mode: standalone)').matches || navigator.standalone === true, native = !!window.Capacitor) {
  if (standalone || native) return null;
  const ios = /iPhone|iPad|iPod/.test(ua) || (/Macintosh/.test(ua) && typeof navigator !== 'undefined' && navigator.maxTouchPoints > 1);
  if (ios) return /CriOS|FxiOS|EdgiOS|FBAN|FBAV|Instagram|WhatsApp|GSA\//.test(ua) ? 'ios-other' : 'ios-safari';
  if (/Android/.test(ua)) return /; wv\)|FBAN|FBAV|FB_IAB|Instagram|Line\//.test(ua) ? 'android-inapp' : 'android';
  return null;
}

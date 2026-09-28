// Ödev fotoğrafları: öğrenci yükler (en fazla 15), öğretmen ve veli görür.
// Liste yüklenirken resimler inmez; küçük resimler kart açılınca, büyük resim dokununca iner.
import { useEffect, useRef, useState } from 'preact/hooks';
import { createPortal } from 'preact/compat';
import { useApp, Sheet, Icon } from '../ui.jsx';
import { MAX_PHOTOS, photoCounts, photoRoom, shrinkPhoto } from '../core/photos.js';

const thumbCache = new Map(); // id → küçük resim (değişmez; aynı oturumda tekrar indirilmez)

export function usePhotoCount(h) {
  const { data } = useApp();
  return photoCounts(data.homework_photos).get(h.id) || 0;
}

function useThumbs(h, count) {
  const { store } = useApp();
  const [items, setItems] = useState(null);
  const [err, setErr] = useState('');
  useEffect(() => {
    let live = true;
    if (!count) { setItems([]); return; }
    store.photoThumbs(h.id)
      .then((rows) => { rows.forEach((r) => r.thumb && thumbCache.set(r.id, r.thumb)); if (live) { setItems(rows); setErr(''); } })
      .catch((e) => live && setErr(e.message));
    return () => { live = false; };
  }, [h.id, count]);
  return [items, err];
}

function ThumbGrid({ items, onOpen, onDelete, busyId }) {
  return (
    <div class="photo-grid">
      {items.map((p, i) => (
        <div key={p.id} class="ph">
          <button type="button" class="ph-open" onClick={() => onOpen(i)} aria-label={`${i + 1}. fotoğrafı büyüt`}>
            {p.thumb ? <img src={p.thumb} alt="" loading="lazy" /> : <span class="small muted">{i + 1}</span>}
          </button>
          {onDelete && (
            <button type="button" class="ph-del" disabled={busyId === p.id} onClick={() => onDelete(p)} aria-label={`${i + 1}. fotoğrafı sil`}>
              <Icon name="x" size={16} />
            </button>
          )}
        </div>
      ))}
    </div>
  );
}

/** Tam ekran görüntüleyici: ‹ › ile gezinir, dokununca yakınlaşır */
function Viewer({ items, start, onClose }) {
  const { store } = useApp();
  const [i, setI] = useState(start);
  const [src, setSrc] = useState('');
  const [err, setErr] = useState('');
  const [zoom, setZoom] = useState(false);
  const touch = useRef(null);
  const n = items.length;
  const go = (d) => { setZoom(false); setI((x) => (x + d + n) % n); };
  useEffect(() => {
    let live = true;
    setSrc(''); setErr('');
    store.photoImage(items[i].id).then((s) => live && setSrc(s)).catch((e) => live && setErr(e.message));
    return () => { live = false; };
  }, [i]);
  useEffect(() => {
    const f = (e) => { if (e.key === 'Escape') onClose(); if (e.key === 'ArrowRight') go(1); if (e.key === 'ArrowLeft') go(-1); };
    window.addEventListener('keydown', f);
    const o = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    return () => { window.removeEventListener('keydown', f); document.body.style.overflow = o; };
  }, []);
  const tStart = (e) => { touch.current = zoom ? null : e.touches[0].clientX; };
  const tEnd = (e) => {
    if (touch.current == null) return;
    const dx = e.changedTouches[0].clientX - touch.current;
    if (Math.abs(dx) > 50 && n > 1) go(dx < 0 ? 1 : -1);
    touch.current = null;
  };
  // Alt sayfanın (Sheet) içinden açılsa da tam ekran olsun diye doğrudan sayfa gövdesine çizilir
  return createPortal((
    <div class="pv" role="dialog" aria-modal="true" aria-label="Ödev fotoğrafı">
      <div class="pv-bar">
        <span>{i + 1} / {n}</span>
        <span class="small">{zoom ? 'Küçültmek için dokunun' : 'Yakınlaştırmak için dokunun'}</span>
        <button type="button" class="pv-btn" onClick={onClose} aria-label="Kapat"><Icon name="x" /></button>
      </div>
      <div class={`pv-stage${zoom ? ' zoom' : ''}`} onTouchStart={tStart} onTouchEnd={tEnd}>
        {err ? <div class="pv-msg">{err}</div> : src ? <img src={src} alt={`Ödev fotoğrafı ${i + 1}`} onClick={() => setZoom((z) => !z)} />
          : (thumbCache.get(items[i].id) ? <img class="pv-blur" src={thumbCache.get(items[i].id)} alt="" /> : <div class="pv-msg">Yükleniyor…</div>)}
      </div>
      {n > 1 && (
        <div class="pv-nav">
          <button type="button" class="pv-btn" onClick={() => go(-1)} aria-label="Önceki"><Icon name="back" /></button>
          <button type="button" class="pv-btn" onClick={() => go(1)} aria-label="Sonraki"><Icon name="chevron" /></button>
        </div>
      )}
    </div>
  ), document.body);
}

/** Öğretmen / veli / (bitmiş ödevde) öğrenci: "Fotoğraflar (n)" düğmesi → küçük resimler → büyük resim */
export function PhotoGallery({ h, title, small }) {
  const count = usePhotoCount(h);
  const [open, setOpen] = useState(false);
  if (!count) return null;
  return (
    <>
      <button type="button" class={`btn${small ? ' small' : ''}`} onClick={() => setOpen(true)}>
        <Icon name="camera" /> Fotoğraflar ({count})
      </button>
      {open && <GallerySheet h={h} count={count} title={title} onClose={() => setOpen(false)} />}
    </>
  );
}

function GallerySheet({ h, count, title, onClose }) {
  const [items, err] = useThumbs(h, count);
  const [view, setView] = useState(null);
  return (
    <Sheet title={title || 'Ödev fotoğrafları'} onClose={onClose}>
      <div class="stack">
        <div class="hint">{count} fotoğraf · Büyütmek için dokunun</div>
        {err ? <div class="error">{err}</div> : !items ? <div class="muted">Yükleniyor…</div> : <ThumbGrid items={items} onOpen={setView} />}
      </div>
      {view != null && items?.length > 0 && <Viewer items={items} start={view} onClose={() => setView(null)} />}
    </Sheet>
  );
}

/** Öğrenci: henüz "yaptım" denmemiş ödeve fotoğraf ekler / yanlışı siler */
export function StudentPhotos({ h }) {
  const { store, reload, toast } = useApp();
  const count = usePhotoCount(h);
  const [items, err] = useThumbs(h, count);
  const [prog, setProg] = useState(null);
  const [delId, setDelId] = useState(null);
  const [view, setView] = useState(null);
  const input = useRef(null);
  const full = count >= MAX_PHOTOS;

  const pick = async (e) => {
    const files = [...(e.currentTarget.files || [])];
    e.currentTarget.value = '';
    if (!files.length) return;
    const { take, skipped } = photoRoom(count, files.length);
    if (!take) return toast(`En fazla ${MAX_PHOTOS} fotoğraf yükleyebilirsin.`);
    let ok = 0, fail = '';
    setProg({ done: 0, total: take });
    for (const f of files.slice(0, take)) {
      try { await store.addPhoto(h, await shrinkPhoto(f)); ok++; }
      catch (x) { fail = x.message || 'Fotoğraf yüklenemedi.'; if (/en fazla|yapıldı|erişim/i.test(fail)) break; }
      setProg({ done: ok, total: take });
    }
    setProg(null);
    await reload().catch(() => {});
    if (fail) toast(ok ? `${ok} fotoğraf yüklendi. Bazıları yüklenemedi: ${fail}` : fail);
    else toast(skipped ? `${ok} fotoğraf yüklendi. En fazla ${MAX_PHOTOS} olduğu için ${skipped} tanesi alınmadı.` : `${ok} fotoğraf yüklendi`);
  };

  const del = async (p) => {
    if (!confirm('Bu fotoğraf silinsin mi?')) return;
    setDelId(p.id);
    try { await store.removePhoto(p.id); thumbCache.delete(p.id); await reload(); toast('Fotoğraf silindi'); }
    catch (x) { toast(x.message || 'Fotoğraf silinemedi.'); }
    finally { setDelId(null); }
  };

  return (
    <div class="photo-box">
      <div class="spread">
        <b class="small">Ödevinin fotoğrafları</b>
        <span class={`chip ${count ? 'ok' : 'bad'}`}>{count} / {MAX_PHOTOS}</span>
      </div>
      {!count && <div class="hint">Ödevini bitirince defterinin ya da kitabının sayfalarının fotoğrafını çek. Fotoğraf yüklemeden "Ödevimi yaptım" diyemezsin.</div>}
      {err && <div class="error">{err}</div>}
      {count > 0 && items && <ThumbGrid items={items} onOpen={setView} onDelete={del} busyId={delId} />}
      {count > 0 && !items && !err && <div class="muted small">Fotoğraflar yükleniyor…</div>}
      <input ref={input} type="file" accept="image/*" multiple hidden onChange={pick} />
      <button type="button" class="btn block" disabled={!!prog || full} onClick={() => input.current?.click()}>
        <Icon name="camera" /> {prog ? `Yükleniyor… ${prog.done}/${prog.total}` : full ? `En fazla ${MAX_PHOTOS} fotoğraf` : count ? 'Fotoğraf ekle' : 'Fotoğraf çek / seç'}
      </button>
      {view != null && items?.length > 0 && <Viewer items={items} start={view} onClose={() => setView(null)} />}
    </div>
  );
}

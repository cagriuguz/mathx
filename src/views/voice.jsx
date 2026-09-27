// SESLİ NOT: öğretmen öğrenci hakkında veliye en fazla 90 saniyelik ses bırakır (isteğe bağlı).
// Kayıt telefonun kendi tarayıcısında yapılır (MediaRecorder); ses veritabanına base64 olarak yazılır.
// Liste yüklenirken ses inmez; "Dinle"ye basınca iner. Veli dinleyince öğretmen "Dinlendi" görür.
import { useEffect, useRef, useState } from 'preact/hooks';
import { useApp, useAction, Icon, WaButton } from '../ui.jsx';
import { VOICE_MAX_SEC } from '../store/common.js';
import { MAX_CHARS, pickMime, fmtSec, voiceWhen, voiceNoticeText } from '../core/voice.js';

const blobToDataUrl = (blob) => new Promise((res, rej) => {
  const r = new FileReader();
  r.onload = () => res(r.result);
  r.onerror = () => rej(new Error('Kayıt okunamadı.'));
  r.readAsDataURL(blob);
});

function micError(e) {
  if (e?.name === 'NotAllowedError' || e?.name === 'SecurityError')
    return 'Mikrofon izni verilmedi. Telefonun ayarlarından bu uygulamaya (ya da tarayıcıya) mikrofon izni verip tekrar deneyin.';
  if (e?.name === 'NotFoundError') return 'Mikrofon bulunamadı.';
  return 'Kayıt başlatılamadı. Sayfayı kapatıp yeniden açmayı deneyin.';
}

/** Kaydet → dinle → gönder. onSaved(note) kayıttan sonra çağrılır. */
function Recorder({ studentId, onSaved, onCancel }) {
  const { store, toast } = useApp();
  const [run, busy] = useAction();
  const [state, setState] = useState('idle'); // idle | rec | done
  const [sec, setSec] = useState(0);
  const [clip, setClip] = useState(null); // { blob, url, seconds, mime }
  const r = useRef({});

  const cleanup = () => {
    clearInterval(r.current.timer);
    r.current.stream?.getTracks().forEach((t) => t.stop());
    r.current.stream = null;
  };
  useEffect(() => () => { cleanup(); if (r.current.rec?.state === 'recording') r.current.rec.stop(); }, []);
  useEffect(() => () => clip && URL.revokeObjectURL(clip.url), [clip]);

  const stop = () => { if (r.current.rec?.state === 'recording') r.current.rec.stop(); };

  const start = async () => {
    if (!navigator.mediaDevices?.getUserMedia || !globalThis.MediaRecorder) return toast('Bu tarayıcı ses kaydını desteklemiyor. Telefonda Safari ya da Chrome ile açın.');
    let stream;
    try { stream = await navigator.mediaDevices.getUserMedia({ audio: { echoCancellation: true, noiseSuppression: true } }); }
    catch (e) { return toast(micError(e)); }
    const mime = pickMime();
    let rec;
    try { rec = new MediaRecorder(stream, { ...(mime ? { mimeType: mime } : {}), audioBitsPerSecond: 32000 }); }
    catch { rec = new MediaRecorder(stream); }
    const chunks = [];
    const t0 = Date.now();
    rec.ondataavailable = (e) => e.data?.size && chunks.push(e.data);
    rec.onstop = () => {
      const seconds = Math.min(VOICE_MAX_SEC, Math.max(1, Math.round((Date.now() - t0) / 1000)));
      cleanup();
      const type = (rec.mimeType || mime || 'audio/mp4').split(';')[0];
      const blob = new Blob(chunks, { type });
      if (!blob.size) { setState('idle'); return toast('Ses kaydedilemedi. Tekrar deneyin.'); }
      setClip({ blob, url: URL.createObjectURL(blob), seconds, mime: type });
      setState('done');
    };
    r.current = { stream, rec };
    rec.start(1000);
    setSec(0);
    setState('rec');
    r.current.timer = setInterval(() => {
      const s = Math.floor((Date.now() - t0) / 1000);
      setSec(s);
      if (s >= VOICE_MAX_SEC) stop();
    }, 250);
  };

  const again = () => { setClip(null); setState('idle'); };

  const save = () => run(async () => {
    const audio = await blobToDataUrl(clip.blob);
    if (audio.length > MAX_CHARS) throw new Error('Kayıt çok büyük oldu. Biraz daha kısa kaydedip tekrar deneyin.');
    const note = await store.insert('voice_notes', { student_id: studentId, audio, mime: clip.mime, seconds: clip.seconds });
    onSaved(note);
  }, 'Sesli not veliye gönderildi');

  if (state === 'rec') {
    const left = Math.max(0, VOICE_MAX_SEC - sec);
    return (
      <div class="card card-pad stack voice-rec">
        <div class="spread">
          <span class="voice-live"><span class="dot" /> Kaydediliyor · {fmtSec(sec)}</span>
          <span class="muted small">{fmtSec(left)} kaldı</span>
        </div>
        <div class="voice-bar"><div style={`width:${Math.min(100, (sec / VOICE_MAX_SEC) * 100)}%`} /></div>
        <button class="btn primary" onClick={stop}><Icon name="stop" /> Kaydı bitir</button>
      </div>
    );
  }
  if (state === 'done' && clip) {
    return (
      <div class="card card-pad stack">
        <div class="small muted">Göndermeden önce dinleyebilirsiniz ({fmtSec(clip.seconds)}).</div>
        <audio controls src={clip.url} preload="metadata" style="width:100%" />
        <div class="row wrap">
          <button class="btn primary" disabled={busy} onClick={save}><Icon name="check" /> {busy ? 'Gönderiliyor…' : 'Veliye gönder'}</button>
          <button class="btn" disabled={busy} onClick={again}>Sil, yeniden kaydet</button>
          <button class="btn ghost" disabled={busy} onClick={onCancel}>Vazgeç</button>
        </div>
      </div>
    );
  }
  return (
    <div class="card card-pad stack">
      <div class="small muted">"Kaydı başlat"a basın ve konuşun. En fazla 1,5 dakika; süre dolunca kayıt kendiliğinden biter.</div>
      <div class="row wrap">
        <button class="btn primary" onClick={start}><Icon name="mic" /> Kaydı başlat</button>
        <button class="btn ghost" onClick={onCancel}>Vazgeç</button>
      </div>
    </div>
  );
}

/** Tek bir notu çalar; ses ilk basışta iner. onPlay ilk çalmada bir kez çağrılır. */
export function VoicePlayer({ note, onPlay }) {
  const { store, toast } = useApp();
  const [url, setUrl] = useState(null);
  const [loading, setLoading] = useState(false);
  const played = useRef(false);
  useEffect(() => () => url && URL.revokeObjectURL(url), [url]);

  const load = async () => {
    setLoading(true);
    try {
      const data = await store.voiceAudio(note.id);
      const blob = await (await fetch(data)).blob();
      setUrl(URL.createObjectURL(blob));
    } catch (e) { toast(e.message || 'Ses yüklenemedi.'); }
    finally { setLoading(false); }
  };
  const first = () => { if (!played.current) { played.current = true; onPlay?.(); } };

  if (!url) return <button class="btn small" disabled={loading} onClick={load}><Icon name="play" /> {loading ? 'Yükleniyor…' : `Dinle (${fmtSec(note.seconds)})`}</button>;
  return <audio controls autoPlay src={url} onPlay={first} onError={() => toast('Bu telefon sesi açamadı. Başka bir tarayıcıyla deneyin.')} style="width:100%" />;
}

/** ÖĞRETMEN: öğrenci kartındaki "Veliye sesli not" bölümü */
export function TeacherVoiceNotes({ s }) {
  const { data, store, reload } = useApp();
  const [run] = useAction();
  const [recording, setRecording] = useState(false);
  const [sent, setSent] = useState(false);
  const notes = (data.voice_notes || []).filter((v) => v.student_id === s.id).sort((a, b) => String(b.created_at).localeCompare(String(a.created_at)));

  const del = (v) => {
    if (!confirm('Bu sesli not silinsin mi? Veli de artık dinleyemez.')) return;
    run(async () => { await store.remove('voice_notes', v.id); await reload(); }, 'Sesli not silindi');
  };

  return (
    <section>
      <div class="section-head"><h3 class="section-title">Veliye sesli not</h3></div>
      <div class="stack">
        {!recording && !sent && <div class="small muted">İsteğe bağlı. Öğrenci hakkındaki düşüncelerinizi en fazla 1,5 dakikalık bir sesle veliye iletin. Veli, MathX'te Ödevler sayfasının en üstünden dinler.</div>}
        {recording
          ? <Recorder studentId={s.id} onCancel={() => setRecording(false)} onSaved={async () => { setRecording(false); setSent(true); await reload(); }} />
          : sent
            ? (
              <div class="card card-pad stack">
                <div><Icon name="check" /> Sesli not veliye iletildi. Veli MathX'i açınca görecek.</div>
                <div class="small muted">İsterseniz veliye WhatsApp'tan da haber verin (zorunlu değil):</div>
                <div class="row wrap">
                  <WaButton small phone={s.parent_phone} text={voiceNoticeText(s.name)} label="Veliye haber ver" />
                  <button class="btn small ghost" onClick={() => setSent(false)}>Tamam</button>
                </div>
              </div>
            )
            : <div><button class="btn small" onClick={() => setRecording(true)}><Icon name="mic" /> Sesli not kaydet</button></div>}
        {notes.length > 0 && (
          <div class="card">
            <ul class="list">
              {notes.map((v) => (
                <li key={v.id} class="stack">
                  <div class="spread">
                    <span class="small">{voiceWhen(v.created_at)} · {fmtSec(v.seconds)}</span>
                    <span class={`chip ${v.heard_at ? 'ok' : 'info'}`}>{v.heard_at ? 'Veli dinledi' : 'Dinlenmedi'}</span>
                  </div>
                  <div class="row wrap" style="align-items:center">
                    <div style="flex:1;min-width:200px"><VoicePlayer note={v} /></div>
                    <button class="btn small danger ghost" onClick={() => del(v)} aria-label="Sesli notu sil"><Icon name="trash" /></button>
                  </div>
                </li>
              ))}
            </ul>
          </div>
        )}
      </div>
    </section>
  );
}

/** VELİ: Ödevler sayfasının üstünde öğretmenin sesli notları (yoksa hiç görünmez) */
export function ParentVoiceNotes() {
  const { data, store, reload } = useApp();
  const notes = [...(data.voice_notes || [])].sort((a, b) => String(b.created_at).localeCompare(String(a.created_at))).slice(0, 10);
  if (!notes.length) return null;
  const heard = (v) => { if (!v.heard_at) store.markVoiceHeard(v.id).then(() => reload()).catch(() => {}); };
  return (
    <div class="card">
      <div class="card-pad" style="padding-bottom:0"><h2 class="section-title"><Icon name="mic" /> Öğretmeninizden sesli not</h2></div>
      <ul class="list">
        {notes.map((v) => (
          <li key={v.id} class="stack">
            <div class="spread">
              <span class="small">{voiceWhen(v.created_at)}</span>
              {!v.heard_at && <span class="chip gold">Yeni</span>}
            </div>
            <VoicePlayer note={v} onPlay={() => heard(v)} />
          </li>
        ))}
      </ul>
    </div>
  );
}

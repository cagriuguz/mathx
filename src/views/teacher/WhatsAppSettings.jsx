// Ayarlar → WhatsApp mesajları: Elle / Otomatik (WhatsApp Business). Otomatik tanımlı değilse ya da
// çalışmazsa program her şeyi yapmaya devam eder; yalnızca mesajlar elle gönderilir.
import { useEffect, useState } from 'preact/hooks';
import { useApp, useAction, Sheet, Field, Seg, Icon } from '../../ui.jsx';
import { WA_TEMPLATES, isValidPhone } from '../../core/messages.js';
import { autoReady } from '../../core/wa.js';

export function WhatsAppSettings() {
  const { store, settings, reload, toast } = useApp();
  const [run, busy] = useAction();
  const [st, setSt] = useState(null);
  const [edit, setEdit] = useState(false);
  const [guide, setGuide] = useState(false);
  const [f, setF] = useState({ business_phone: '', phone_number_id: '', token: '' });
  const mode = settings.wa_mode === 'auto' ? 'auto' : 'manual';
  const ready = autoReady(settings, st);

  const refresh = () => store.waStatus().then((s) => { setSt(s); setF({ business_phone: s.business_phone, phone_number_id: s.phone_number_id, token: '' }); });
  useEffect(() => { refresh(); }, []);

  const setMode = (m) => run(async () => { await store.upsertSettings({ wa_mode: m }); await reload(); },
    m === 'auto' ? 'Otomatik mesaj seçildi' : 'Mesajlar elle gönderilecek');
  const save = async () => {
    if (!/^\d{6,}$/.test(f.phone_number_id.trim())) return run(async () => { throw new Error('Telefon numarası kimliği yalnız rakamlardan oluşur (Meta\'daki "Phone number ID").'); });
    if (!f.token.trim() && !st?.has_token) return run(async () => { throw new Error('Erişim anahtarını yapıştırın.'); });
    const ok = await run(async () => {
      await store.setWaConfig({ business_phone: f.business_phone.trim(), phone_number_id: f.phone_number_id.trim(), token: f.token.trim() });
      await refresh();
    }, 'WhatsApp Business bilgileri kaydedildi');
    if (ok) setEdit(false);
  };
  const test = () => run(async () => {
    const r = await store.waSend('test');
    if (!r.ok) throw new Error(r.error || 'Deneme mesajı gönderilemedi.');
    toast('Deneme mesajı telefonunuza gönderildi. WhatsApp\'a bakın.');
  });

  if (!st) return null;
  const showForm = edit || !(st.phone_number_id && st.has_token);
  return (
    <div class="stack">
      <div class="spread">
        <div class="section-title" style="font-size:18px">WhatsApp mesajları</div>
        <button class="qmark" onClick={() => setGuide(true)} aria-label="Nasıl yapılır?" title="Nasıl yapılır?">?</button>
      </div>
      <Seg options={[['manual', 'Elle'], ['auto', 'Otomatik (WhatsApp Business)']]} value={mode} onChange={(m) => m !== mode && setMode(m)} />
      {mode === 'manual' ? (
        <div class="hint">Mesaj hazır gelir, WhatsApp açılır, Gönder'e siz basarsınız. Ücretsizdir. Öğrenci "yaptım" deyince panelde bildirim görürsünüz.</div>
      ) : ready ? (
        <div class="hint">Açık ✓ Ödevi kaydettiğiniz an veliye ve öğrenciye, öğrenci "yaptım" dediği an size ve veliye mesaj kendiliğinden gider.</div>
      ) : (
        <div class="warn">
          <b>Otomatik mesaj için WhatsApp Business numaranızı girin ve hesabınızı açın.</b> Nasıl yapılacağı için <b>?</b> işaretine dokunun. Tanımlanana kadar mesajlar elle gönderilir; programın geri kalanı normal çalışır.
        </div>
      )}
      <button class="btn ghost small" style="align-self:flex-start" onClick={() => setGuide(true)}><Icon name="book" /> Nasıl yapılır? (adım adım)</button>
      {mode === 'auto' && (showForm ? (
        <div class="stack">
          <Field label="WhatsApp Business numaranız" hint="Mesajların gideceği hat, ör. 0555 123 45 67">
            <input class="input" type="tel" value={f.business_phone} onInput={(e) => { const v = e.currentTarget.value; setF((o) => ({ ...o, business_phone: v })); }} />
          </Field>
          <Field label="Telefon numarası kimliği (Phone number ID)" hint="Meta'da WhatsApp → API Kurulumu sayfasında yazan uzun sayı">
            <input class="input" inputMode="numeric" value={f.phone_number_id} onInput={(e) => { const v = e.currentTarget.value.replace(/\s/g, ''); setF((o) => ({ ...o, phone_number_id: v })); }} />
          </Field>
          <Field label="Erişim anahtarı (kalıcı)" hint={st.has_token ? 'Kayıtlı ✓ Değiştirmek istemiyorsanız boş bırakın.' : 'Meta\'da sistem kullanıcısı için oluşturduğunuz anahtar. Kaydedince bir daha gösterilmez.'}>
            <input class="input" type="password" autocomplete="off" value={f.token} onInput={(e) => { const v = e.currentTarget.value.trim(); setF((o) => ({ ...o, token: v })); }} />
          </Field>
          <div class="row wrap">
            <button class="btn primary" disabled={busy} onClick={save}>Kaydet</button>
            {edit && <button class="btn ghost" onClick={() => { setEdit(false); refresh(); }}>Vazgeç</button>}
          </div>
        </div>
      ) : (
        <div class="stack">
          <div class="small">Numara: <b>{st.business_phone || '—'}</b> · Kimlik: {st.phone_number_id} · Anahtar kayıtlı ✓</div>
          {!isValidPhone(settings.teacher_phone) && <div class="warn">Yukarıya kendi telefonunuzu yazın; "ödev yapıldı" mesajı ve deneme mesajı oraya gelir.</div>}
          <div class="row wrap">
            <button class="btn" disabled={busy} onClick={test}>Deneme mesajı gönder</button>
            <button class="btn ghost" onClick={() => setEdit(true)}>Bilgileri değiştir</button>
          </div>
        </div>
      ))}
      {guide && <WaGuide onClose={() => setGuide(false)} />}
    </div>
  );
}

function Copy({ text }) {
  const [ok, setOk] = useState(false);
  const copy = () => navigator.clipboard?.writeText(text).then(() => { setOk(true); setTimeout(() => setOk(false), 1500); }).catch(() => {});
  return <button class="btn small ghost" onClick={copy}>{ok ? 'Kopyalandı ✓' : 'Kopyala'}</button>;
}

function Tpl({ t, sample }) {
  return (
    <div class="card card-pad stack" style="box-shadow:none">
      <div class="spread"><span class="small">Şablon adı: <b>{t.name}</b></span><Copy text={t.name} /></div>
      <div class="msg">{t.body}</div>
      <div class="spread"><span class="small muted">Örnek değerler: {sample}</span><Copy text={t.body} /></div>
    </div>
  );
}

/** Kullanan öğretmen için adım adım kurulum rehberi (teknik bilgi gerektirmez) */
export function WaGuide({ onClose }) {
  return (
    <Sheet title="Otomatik WhatsApp nasıl açılır?" onClose={onClose}>
      <div class="stack guide">
        <p>Otomatik modda mesajları <b>siz göndermezsiniz</b>: ödevi kaydettiğiniz an veliye ve öğrenciye, öğrenci "yaptım" dediği an size ve veliye mesaj kendiliğinden gider. Bunun için Meta'nın (WhatsApp'ın sahibi) resmî <b>WhatsApp Business</b> servisini bir kez kurmanız gerekir. Kurulum yaklaşık 1 saat sürer.</p>

        <h3>Ne kadar tutar?</h3>
        <p>Meta mesaj başına ücret alır. Türkiye'de bilgilendirme mesajı yaklaşık <b>0,0009 $</b> (Ekim 2026). 20 öğrenci, haftada 3 ödev ile ayda yaklaşık 1.000 mesaj eder: <b>ayda yaklaşık 1 $</b>. Fiyatı Meta belirler ve değiştirebilir. Aracı firma (Twilio vb.) kullanmayın; kendi ücretlerini eklerler.</p>

        <h3>Gerekenler</h3>
        <ol>
          <li><b>Ayrı bir telefon hattı.</b> SMS alabilmeli. Faturasız ucuz bir hat yeter. Bu numara normal WhatsApp'ta <b>kayıtlı olmamalı</b>. Kendi şahsi numaranızı kullanmayın, yoksa kendi WhatsApp'ınızı kaybedersiniz. İkinci telefon gerekmez: hattı bir kez SMS kodunu almak için herhangi bir telefona takmanız yeter.</li>
          <li><b>Bir Facebook hesabı.</b> Meta hesabı bununla açılır. Veliler bu hesabı görmez.</li>
          <li><b>Banka/kredi kartı.</b> Mesaj ücretleri için Meta'ya tanımlanır.</li>
        </ol>

        <h3>Adımlar</h3>
        <ol>
          <li><b>İşletme hesabı:</b> <a href="https://business.facebook.com" target="_blank" rel="noopener">business.facebook.com</a> adresine Facebook hesabınızla girin. "İşletme portföyü oluştur" deyin ve adınızı yazın (ör. "Ayşe Yılmaz Matematik").</li>
          <li><b>Uygulama:</b> <a href="https://developers.facebook.com/apps" target="_blank" rel="noopener">developers.facebook.com/apps</a> → "Uygulama oluştur". Kullanım amacı olarak <b>"WhatsApp ile müşterilerinizle bağlantı kurun"</b> seçeneğini seçin. İşletme portföyü olarak 1. adımda açtığınızı seçin.</li>
          <li><b>Numarayı ekleyin:</b> Uygulamada WhatsApp → <b>API Kurulumu</b> → "Telefon numarası ekle". Görünen ad yazın; veliler mesajı bu adla görür (ör. "Ayşe Öğretmen Matematik"). Yeni hattınızın numarasını girin ve SMS ile gelen kodu yazın.</li>
          <li><b>Ödeme yöntemi:</b> İşletme ayarları → Hesaplar → WhatsApp hesapları → <b>Ödeme ayarları</b> → kartınızı ekleyin.</li>
          <li><b>Mesaj şablonları:</b> <a href="https://business.facebook.com/wa/manage/message-templates/" target="_blank" rel="noopener">WhatsApp Yöneticisi → Mesaj şablonları</a> → "Şablon oluştur". Kategori olarak <b>Yardımcı program (Utility)</b>, dil olarak <b>Türkçe</b> seçin. Aşağıdaki üç şablonu adı ve metni <b>birebir aynı</b> olacak şekilde girin. Onay genelde birkaç dakika, en fazla 24 saat sürer.
            <Tpl t={WA_TEMPLATES.given} sample="{{1}} = Karekök 7'den 12-20. sayfalar · {{2}} = 3 Ekim 2026" />
            <Tpl t={WA_TEMPLATES.givenStudent} sample="{{1}} = Karekök 7'den 12-20. sayfalar · {{2}} = 3 Ekim 2026" />
            <Tpl t={WA_TEMPLATES.done} sample="{{1}} = Ali Yılmaz · {{2}} = Karekök 7 (12-20. sayfalar) kitabındaki" />
          </li>
          <li><b>Kalıcı erişim anahtarı:</b> İşletme ayarları → Kullanıcılar → <b>Sistem kullanıcıları</b> → "Ekle" (rol: Yönetici). Sonra "Varlık ata" deyin: uygulamanıza ve WhatsApp hesabınıza <b>tam yetki</b> verin. "Belirteç oluştur" deyin: uygulamanızı seçin, süre olarak <b>"Asla sona ermez"</b> seçin, izin olarak <b>whatsapp_business_messaging</b> ve <b>whatsapp_business_management</b> işaretleyin. Çıkan uzun anahtarı kopyalayın. Bu anahtar bir şifre gibidir, kimseyle paylaşmayın.</li>
          <li><b>MathX'e tanıtın:</b> Ayarlar → WhatsApp mesajları → <b>Otomatik</b>. Numaranızı, "Phone number ID" değerini (API Kurulumu sayfasında yazar) ve anahtarı girin, Kaydet'e basın. Yukarıya kendi telefonunuzu da yazın. Ardından <b>"Deneme mesajı gönder"</b>e basın; telefonunuza İngilizce bir "Hello World" mesajı gelirse kurulum tamamdır.</li>
        </ol>

        <h3>Bilmeniz gerekenler</h3>
        <ul>
          <li>Velilerin bu numaraya yazdığı cevapları göremezsiniz. WhatsApp Yöneticisi'nde numaranın profil açıklamasına şunu yazın: "Bu numara otomatik bildirim içindir; lütfen öğretmeninize kendi numarasından yazın."</li>
          <li>Velilerden mesaj almak için izin alın (öğrenci kartındaki izin kutusu).</li>
          <li>Bir şey ters giderse (anahtar süresi dolarsa, şablon reddedilirse, kartta sorun olursa) program <b>durmaz</b>. Mesajlar yine elle gönderilir, hata nedeni Türkçe gösterilir.</li>
          <li>İstediğiniz an Ayarlar'dan <b>Elle</b> seçeneğine dönebilirsiniz; bilgileriniz silinmez.</li>
        </ul>
      </div>
    </Sheet>
  );
}

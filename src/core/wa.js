// Otomatik WhatsApp (WhatsApp Business / Meta Cloud API) kararları. Saf işlevler: sunucu işlevi
// (supabase/functions/wa-send) bunları kullanır, testler doğrudan dener. Tanımlı değilse ya da
// hata olursa program ELLE yönteme düşer; hiçbir iş otomatik gönderime bağımlı değildir.
import { WA_TEMPLATES, homeworkGivenParams, homeworkDoneParams, normalizePhone, isValidPhone } from './messages.js';

export const GRAPH_URL = 'https://graph.facebook.com/v23.0';

/** Otomatik gönderim açık ve kullanılabilir mi? */
export const autoReady = (settings, cfg) => settings?.wa_mode === 'auto' && !!cfg?.phone_number_id && !!cfg?.has_token;

/**
 * Hangi şablon kime gidecek?  Dönüş: { skip } | { error, status } | { template, params, to, flag, sentField }
 * given: öğretmen ödevi kaydedince → veli + öğrenci.  done: öğrenci "yaptım" deyince → öğretmen + veli.
 */
export function planHomeworkMessage({ kind, profile, homework: h, student: s, settings }) {
  if (!profile) return { error: 'Oturum yok', status: 401 };
  if (settings?.wa_mode !== 'auto') return { skip: 'manual' };
  if (!h || !s) return { error: 'Ödev bulunamadı', status: 404 };
  // Kitap/sayfa satırı yoksa şablon parametresi boş kalır; Meta reddeder, yarım cümle de gitmesin
  if (!(h.items || []).some((i) => String(i.pages || '').trim())) return { skip: 'no-items' };
  const teacher = profile.role === 'teacher';
  const own = profile.role === 'student' && profile.student_id === h.student_id;
  let plan;
  if (kind === 'given') {
    if (!teacher) return { error: 'Yetki yok', status: 403 };
    if (h.wa_given_at) return { skip: 'already' };
    plan = { template: WA_TEMPLATES.given, params: homeworkGivenParams(h.items, h.due_date), to: [s.parent_phone, s.phone], flag: 'wa_given_at', sentField: 'sent_given' };
  } else if (kind === 'done') {
    if (!teacher && !own) return { error: 'Yetki yok', status: 403 };
    if (!h.done) return { skip: 'not-done' };
    if (h.wa_done_at) return { skip: 'already' }; // geri alıp yeniden işaretlemek ikinci mesaj göndermez
    plan = { template: WA_TEMPLATES.done, params: homeworkDoneParams(s.name, h.items), to: [settings.teacher_phone, s.parent_phone], flag: 'wa_done_at', sentField: 'sent_done' };
  } else return { error: 'Bilinmeyen mesaj türü', status: 400 };
  plan.to = [...new Set(plan.to.filter(isValidPhone).map(normalizePhone))];
  if (!plan.to.length) return { error: 'Geçerli telefon numarası yok', status: 422 };
  return plan;
}

/** Meta Cloud API gövdesi (şablon mesajı) */
export const templatePayload = (to, template, params, lang = 'tr') => ({
  messaging_product: 'whatsapp',
  to,
  type: 'template',
  template: {
    name: template.name,
    language: { code: lang },
    components: params.length ? [{ type: 'body', parameters: params.map((text) => ({ type: 'text', text: String(text) })) }] : [],
  },
});

/** Meta'nın hata cevabını öğretmenin anlayacağı Türkçeye çevirir */
export function explainMetaError(err) {
  const code = err?.code, sub = err?.error_subcode;
  if (code === 190) return 'Erişim anahtarı geçersiz ya da süresi dolmuş. Ayarlar → WhatsApp bölümünden yeni anahtar girin.';
  if (code === 132001) return 'Mesaj şablonu Meta\'da bulunamadı ya da henüz onaylanmadı.';
  if (code === 131030) return 'Alıcı numarası deneme listesinde değil (Meta deneme numarası kullanılıyor).';
  if (code === 131042) return 'Meta hesabında ödeme yöntemi eksik ya da sorunlu.';
  if (code === 133010) return 'İşletme numarası henüz kaydedilmemiş.';
  if (code === 100 || sub === 33) return 'Telefon numarası kimliği hatalı.';
  return err?.message ? `Meta: ${err.message}` : 'WhatsApp gönderimi başarısız.';
}

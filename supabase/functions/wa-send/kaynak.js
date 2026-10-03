// Otomatik WhatsApp gönderici (Supabase Edge Function). Bu dosya KAYNAKTIR; yayınlanan tek dosya
// index.ts bundan üretilir:  node tools/wa_fonksiyon.mjs
// Erişim anahtarı yalnızca veritabanındaki wa_config tablosunda durur; hiçbir kullanıcıya gönderilmez.
import { createClient } from 'jsr:@supabase/supabase-js@2';
import { planHomeworkMessage, templatePayload, explainMetaError, GRAPH_URL } from '../../../src/core/wa.js';
import { normalizePhone, isValidPhone } from '../../../src/core/messages.js';

const CORS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
};
const json = (body, status = 200) => new Response(JSON.stringify(body), { status, headers: { ...CORS, 'Content-Type': 'application/json' } });

// Eski (service_role) ya da yeni (sb_secret_…) anahtar sistemi — hangisi varsa
function serviceKey() {
  const old = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY');
  if (old) return old;
  try { const all = JSON.parse(Deno.env.get('SUPABASE_SECRET_KEYS') || '{}'); return all.default || Object.values(all)[0]; } catch { return undefined; }
}

async function sendTemplate(cfg, to, template, params, lang) {
  const r = await fetch(`${GRAPH_URL}/${cfg.phone_number_id}/messages`, {
    method: 'POST',
    headers: { Authorization: `Bearer ${cfg.token}`, 'Content-Type': 'application/json' },
    body: JSON.stringify(templatePayload(to, template, params, lang)),
  });
  const out = await r.json().catch(() => ({}));
  return r.ok ? { ok: true, to } : { ok: false, to, error: explainMetaError(out.error) };
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: CORS });
  try {
    const admin = createClient(Deno.env.get('SUPABASE_URL'), serviceKey(), { auth: { persistSession: false } });
    const jwt = (req.headers.get('Authorization') || '').replace(/^Bearer\s+/i, '');
    const { data: u } = await admin.auth.getUser(jwt);
    if (!u?.user) return json({ ok: false, error: 'Oturum yok' }, 401);
    const { data: profile } = await admin.from('profiles').select('role, student_id').eq('user_id', u.user.id).maybeSingle();
    const { kind, homework_id } = await req.json();
    const { data: settings } = await admin.from('settings').select('*').eq('id', 'main').maybeSingle();
    const { data: cfg } = await admin.from('wa_config').select('*').eq('id', 'main').maybeSingle();
    const ready = cfg?.phone_number_id && cfg?.token;

    // Deneme mesajı: Meta'nın her hesapta hazır gelen "hello_world" şablonu öğretmenin kendi numarasına
    if (kind === 'test') {
      if (profile?.role !== 'teacher') return json({ ok: false, error: 'Yetki yok' }, 403);
      if (!ready) return json({ ok: false, error: 'Önce numara kimliği ve erişim anahtarını kaydedin.' });
      if (!isValidPhone(settings?.teacher_phone)) return json({ ok: false, error: 'Ayarlar\'da kendi telefonunuzu yazın; deneme mesajı oraya gelir.' });
      const r = await sendTemplate(cfg, normalizePhone(settings.teacher_phone), { name: 'hello_world' }, [], 'en_US');
      return json({ ok: r.ok, error: r.error });
    }

    const { data: homework } = await admin.from('homework').select('*').eq('id', homework_id).maybeSingle();
    const { data: student } = homework ? await admin.from('students').select('name, phone, parent_phone, parent_username').eq('id', homework.student_id).maybeSingle() : { data: null };
    // Kardeş: aynı veli hesabını kullanan başka öğrenci var mı (veli mesajına öğrenci adı yazılır)
    let siblings = 0;
    if (homework && student?.parent_username) {
      const { data: sibs } = await admin.from('students').select('id').eq('parent_username', student.parent_username).neq('id', homework.student_id);
      siblings = sibs?.length || 0;
    }
    const plan = planHomeworkMessage({ kind, profile, homework, student, settings, siblings });
    if (plan.skip) return json({ ok: false, skipped: plan.skip });
    if (plan.error) return json({ ok: false, error: plan.error }, plan.status || 400);
    if (!ready) return json({ ok: false, error: 'WhatsApp Business tanımlı değil; mesaj elle gönderilmeli.' });

    const results = await Promise.all(plan.sends.map((m) => sendTemplate(cfg, m.to, m.template, m.params)));
    const sent = results.filter((r) => r.ok).length;
    if (sent === results.length) {
      await admin.from('homework').update({ [plan.flag]: new Date().toISOString(), [plan.sentField]: true }).eq('id', homework.id);
    }
    return json({ ok: sent === results.length, sent, total: results.length, error: results.find((r) => !r.ok)?.error });
  } catch (e) {
    return json({ ok: false, error: String(e?.message || e) }, 500);
  }
});

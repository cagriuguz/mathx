// OTOMATİK ÜRETİLDİ — düzenlemeyin. Kaynak: kaynak.js (node tools/wa_fonksiyon.mjs)
import { createClient } from "jsr:@supabase/supabase-js@2";
//#region src/core/dates.js
const TR_MONTHS = [
	"Ocak",
	"Şubat",
	"Mart",
	"Nisan",
	"Mayıs",
	"Haziran",
	"Temmuz",
	"Ağustos",
	"Eylül",
	"Ekim",
	"Kasım",
	"Aralık"
];
const TR_DAYS = [
	"Pazartesi",
	"Salı",
	"Çarşamba",
	"Perşembe",
	"Cuma",
	"Cumartesi",
	"Pazar"
];
const DAY = 864e5;
function toDays(iso) {
	const [y, m, d] = iso.split("-").map(Number);
	return Math.round(Date.UTC(y, m - 1, d) / DAY);
}
/** 1 = Pazartesi … 7 = Pazar */
function dow(iso) {
	const w = (/* @__PURE__ */ new Date(toDays(iso) * DAY)).getUTCDay();
	return w === 0 ? 7 : w;
}
function fmtDate(iso, withDay = false) {
	if (!iso) return "";
	const [y, m, d] = iso.split("-").map(Number);
	const s = `${d} ${TR_MONTHS[m - 1]} ${y}`;
	return withDay ? `${s}, ${TR_DAYS[dow(iso) - 1]}` : s;
}
//#endregion
//#region src/core/messages.js
const BACK = "aıou";
const FRONT = "eiöü";
const VOICELESS = "fstkçşhp";
const ONES = [
	"",
	"bir",
	"iki",
	"üç",
	"dört",
	"beş",
	"altı",
	"yedi",
	"sekiz",
	"dokuz"
];
const TENS = [
	"",
	"on",
	"yirmi",
	"otuz",
	"kırk",
	"elli",
	"altmış",
	"yetmiş",
	"seksen",
	"doksan"
];
const LETTERS = {
	a: "a",
	b: "be",
	c: "ce",
	ç: "çe",
	d: "de",
	e: "e",
	f: "fe",
	g: "ge",
	ğ: "yumuşak ge",
	h: "he",
	ı: "ı",
	i: "i",
	j: "je",
	k: "ke",
	l: "le",
	m: "me",
	n: "ne",
	o: "o",
	ö: "ö",
	p: "pe",
	r: "re",
	s: "se",
	ş: "şe",
	t: "te",
	u: "u",
	ü: "ü",
	v: "ve",
	y: "ye",
	z: "ze",
	q: "kü",
	w: "ve",
	x: "iks"
};
function numberWord(n) {
	if (n === 0) return "sıfır";
	if (n % 10) return ONES[n % 10];
	if (n % 100) return TENS[n % 100 / 10];
	if (n % 1e3) return "yüz";
	if (n % 1e6) return "bin";
	if (n % 1e9) return "milyon";
	return "milyar";
}
/** Sözcüğün okunuşunun son parçası (sayı ve kısaltmalar okunduğu gibi) */
function spoken(word) {
	const w = String(word).trim();
	const num = w.match(/(\d+)\D*$/);
	if (num && /\d[.)'’"\s]*$/.test(w)) return numberWord(Number(num[1].slice(-12)));
	const lastToken = w.split(/\s+/).pop().replace(/[^A-Za-zÇĞİÖŞÜçğıöşü]/g, "");
	if (lastToken.length >= 2 && lastToken.length <= 5 && lastToken === lastToken.toLocaleUpperCase("tr") && /[A-ZÇĞİÖŞÜ]/.test(lastToken)) return LETTERS[lastToken.slice(-1).toLocaleLowerCase("tr")] || lastToken.toLocaleLowerCase("tr");
	return lastToken.toLocaleLowerCase("tr");
}
function suffix(word, kind) {
	const s = spoken(word);
	let v = "e";
	for (let i = s.length - 1; i >= 0; i--) {
		if (BACK.includes(s[i])) {
			v = "a";
			break;
		}
		if (FRONT.includes(s[i])) {
			v = "e";
			break;
		}
	}
	const c = VOICELESS.includes(s.slice(-1)) ? "t" : "d";
	return kind === "abl" ? `${c}${v}n` : `${c}${v}`;
}
const POSSESSIVE = /(sı|si|su|sü|kitabı|defteri|fasikülü|föyü|kitapçığı|testleri|soruları)$/;
const buffer = (name) => /\s/.test(name.trim()) && POSSESSIVE.test(name.trim().split(/\s+/).pop().toLocaleLowerCase("tr")) ? "n" : "";
/** Ayrılma hâli: Karekök 7'den, Limit'ten, Bilfen'den, Soru Bankası'ndan */
const ablative = (name) => {
	const n = buffer(name);
	return `${name}'${n}${n ? suffix(name, "abl").replace(/^t/, "d") : suffix(name, "abl")}`;
};
function pagesText(pages) {
	const p = String(pages).trim();
	return /[-–,\s]/.test(p) ? `${p}. sayfalar` : `${p}. sayfa`;
}
const WA_TEMPLATES = {
	given: {
		name: "mathx_odev_verildi",
		body: "Sayın veli, öğrencinizin {{1}} ödevi verilmiştir. Son bitirme tarihi: {{2}}."
	},
	done: {
		name: "mathx_odev_yapildi",
		body: "Sayın veli, {{1}} isimli öğrenciniz {{2}} ödevini yapmıştır."
	}
};
function homeworkGivenParams(items, dueDate) {
	return [items.filter((i) => String(i.pages || "").trim()).map((i) => `${ablative(i.book_name)} ${pagesText(i.pages)}`).join(", "), fmtDate(dueDate)];
}
function homeworkDoneParams(studentName, items) {
	const parts = items.filter((i) => String(i.pages || "").trim()).map((i) => `${i.book_name} (${pagesText(i.pages)})`);
	const word = parts.length > 1 ? "kitaplarındaki" : "kitabındaki";
	return [studentName, `${parts.join(", ")} ${word}`];
}
/** Türkiye numarası → 90XXXXXXXXXX */
function normalizePhone(phone) {
	let d = String(phone || "").replace(/\D/g, "");
	if (d.startsWith("00")) d = d.slice(2);
	if (d.startsWith("0")) d = "90" + d.slice(1);
	if (d.length === 10 && d.startsWith("5")) d = "90" + d;
	return d;
}
const isValidPhone = (phone) => /^905\d{9}$/.test(normalizePhone(phone));
//#endregion
//#region src/core/wa.js
const GRAPH_URL = "https://graph.facebook.com/v23.0";
/**
* Hangi şablon kime gidecek?  Dönüş: { skip } | { error, status } | { template, params, to, flag, sentField }
* given: öğretmen ödevi kaydedince → veli + öğrenci.  done: öğrenci "yaptım" deyince → öğretmen + veli.
*/
function planHomeworkMessage({ kind, profile, homework: h, student: s, settings }) {
	if (!profile) return {
		error: "Oturum yok",
		status: 401
	};
	if (settings?.wa_mode !== "auto") return { skip: "manual" };
	if (!h || !s) return {
		error: "Ödev bulunamadı",
		status: 404
	};
	const teacher = profile.role === "teacher";
	const own = profile.role === "student" && profile.student_id === h.student_id;
	let plan;
	if (kind === "given") {
		if (!teacher) return {
			error: "Yetki yok",
			status: 403
		};
		if (h.wa_given_at) return { skip: "already" };
		plan = {
			template: WA_TEMPLATES.given,
			params: homeworkGivenParams(h.items, h.due_date),
			to: [s.parent_phone, s.phone],
			flag: "wa_given_at",
			sentField: "sent_given"
		};
	} else if (kind === "done") {
		if (!teacher && !own) return {
			error: "Yetki yok",
			status: 403
		};
		if (!h.done) return { skip: "not-done" };
		if (h.wa_done_at) return { skip: "already" };
		plan = {
			template: WA_TEMPLATES.done,
			params: homeworkDoneParams(s.name, h.items),
			to: [settings.teacher_phone, s.parent_phone],
			flag: "wa_done_at",
			sentField: "sent_done"
		};
	} else return {
		error: "Bilinmeyen mesaj türü",
		status: 400
	};
	plan.to = [...new Set(plan.to.filter(isValidPhone).map(normalizePhone))];
	if (!plan.to.length) return {
		error: "Geçerli telefon numarası yok",
		status: 422
	};
	return plan;
}
/** Meta Cloud API gövdesi (şablon mesajı) */
const templatePayload = (to, template, params, lang = "tr") => ({
	messaging_product: "whatsapp",
	to,
	type: "template",
	template: {
		name: template.name,
		language: { code: lang },
		components: params.length ? [{
			type: "body",
			parameters: params.map((text) => ({
				type: "text",
				text: String(text)
			}))
		}] : []
	}
});
/** Meta'nın hata cevabını öğretmenin anlayacağı Türkçeye çevirir */
function explainMetaError(err) {
	const code = err?.code, sub = err?.error_subcode;
	if (code === 190) return "Erişim anahtarı geçersiz ya da süresi dolmuş. Ayarlar → WhatsApp bölümünden yeni anahtar girin.";
	if (code === 132001) return "Mesaj şablonu Meta'da bulunamadı ya da henüz onaylanmadı.";
	if (code === 131030) return "Alıcı numarası deneme listesinde değil (Meta deneme numarası kullanılıyor).";
	if (code === 131042) return "Meta hesabında ödeme yöntemi eksik ya da sorunlu.";
	if (code === 133010) return "İşletme numarası henüz kaydedilmemiş.";
	if (code === 100 || sub === 33) return "Telefon numarası kimliği hatalı.";
	return err?.message ? `Meta: ${err.message}` : "WhatsApp gönderimi başarısız.";
}
//#endregion
//#region supabase/functions/wa-send/kaynak.js
const CORS = {
	"Access-Control-Allow-Origin": "*",
	"Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
	"Access-Control-Allow-Methods": "POST, OPTIONS"
};
const json = (body, status = 200) => new Response(JSON.stringify(body), {
	status,
	headers: {
		...CORS,
		"Content-Type": "application/json"
	}
});
function serviceKey() {
	const old = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");
	if (old) return old;
	try {
		const all = JSON.parse(Deno.env.get("SUPABASE_SECRET_KEYS") || "{}");
		return all.default || Object.values(all)[0];
	} catch {
		return;
	}
}
async function sendTemplate(cfg, to, template, params, lang) {
	const r = await fetch(`${GRAPH_URL}/${cfg.phone_number_id}/messages`, {
		method: "POST",
		headers: {
			Authorization: `Bearer ${cfg.token}`,
			"Content-Type": "application/json"
		},
		body: JSON.stringify(templatePayload(to, template, params, lang))
	});
	const out = await r.json().catch(() => ({}));
	return r.ok ? {
		ok: true,
		to
	} : {
		ok: false,
		to,
		error: explainMetaError(out.error)
	};
}
Deno.serve(async (req) => {
	if (req.method === "OPTIONS") return new Response("ok", { headers: CORS });
	try {
		const admin = createClient(Deno.env.get("SUPABASE_URL"), serviceKey(), { auth: { persistSession: false } });
		const jwt = (req.headers.get("Authorization") || "").replace(/^Bearer\s+/i, "");
		const { data: u } = await admin.auth.getUser(jwt);
		if (!u?.user) return json({
			ok: false,
			error: "Oturum yok"
		}, 401);
		const { data: profile } = await admin.from("profiles").select("role, student_id").eq("user_id", u.user.id).maybeSingle();
		const { kind, homework_id } = await req.json();
		const { data: settings } = await admin.from("settings").select("*").eq("id", "main").maybeSingle();
		const { data: cfg } = await admin.from("wa_config").select("*").eq("id", "main").maybeSingle();
		const ready = cfg?.phone_number_id && cfg?.token;
		if (kind === "test") {
			if (profile?.role !== "teacher") return json({
				ok: false,
				error: "Yetki yok"
			}, 403);
			if (!ready) return json({
				ok: false,
				error: "Önce numara kimliği ve erişim anahtarını kaydedin."
			});
			if (!isValidPhone(settings?.teacher_phone)) return json({
				ok: false,
				error: "Ayarlar'da kendi telefonunuzu yazın; deneme mesajı oraya gelir."
			});
			const r = await sendTemplate(cfg, normalizePhone(settings.teacher_phone), { name: "hello_world" }, [], "en_US");
			return json({
				ok: r.ok,
				error: r.error
			});
		}
		const { data: homework } = await admin.from("homework").select("*").eq("id", homework_id).maybeSingle();
		const { data: student } = homework ? await admin.from("students").select("name, phone, parent_phone").eq("id", homework.student_id).maybeSingle() : { data: null };
		const plan = planHomeworkMessage({
			kind,
			profile,
			homework,
			student,
			settings
		});
		if (plan.skip) return json({
			ok: false,
			skipped: plan.skip
		});
		if (plan.error) return json({
			ok: false,
			error: plan.error
		}, plan.status || 400);
		if (!ready) return json({
			ok: false,
			error: "WhatsApp Business tanımlı değil; mesaj elle gönderilmeli."
		});
		const results = await Promise.all(plan.to.map((to) => sendTemplate(cfg, to, plan.template, plan.params)));
		const sent = results.filter((r) => r.ok).length;
		if (sent === results.length) await admin.from("homework").update({
			[plan.flag]: (/* @__PURE__ */ new Date()).toISOString(),
			[plan.sentField]: true
		}).eq("id", homework.id);
		return json({
			ok: sent === results.length,
			sent,
			total: results.length,
			error: results.find((r) => !r.ok)?.error
		});
	} catch (e) {
		return json({
			ok: false,
			error: String(e?.message || e)
		}, 500);
	}
});
//#endregion

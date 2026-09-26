// SAHTE SUPABASE + SAHTE META (yalnız bu bilgisayarda, test için). Gerçek hesaba/numaraya dokunmaz.
//   node tools/sahte_supabase.mjs            → http://localhost:54321  (Meta taklidi: /meta)
// Uygulamayı buna bağlamak:  VITE_SUPABASE_URL=http://localhost:54321 VITE_SUPABASE_ANON_KEY=yerel npx vite
// Neler gerçek: PostgreSQL (PGlite) + supabase/kurulum.sql + güncelleme SQL'leri + RLS kuralları + wa-send kaynak kodu.
// Neler taklit: giriş (GoTrue), tablo erişimi (PostgREST alt kümesi), canlı güncelleme (Realtime alt kümesi), Meta Graph API.
import http from 'node:http';
import crypto from 'node:crypto';
import { readFileSync, readdirSync } from 'node:fs';
import { registerHooks } from 'node:module';
import { PGlite } from '@electric-sql/pglite';
import { pgcrypto } from '@electric-sql/pglite/contrib/pgcrypto';

const PORT = Number(process.env.PORT || 54321);
const BASE = `http://localhost:${PORT}`;
const SERVICE_KEY = 'sahte-servis-anahtari';
const SECRET = crypto.randomBytes(32);
const ROOT = new URL('../', import.meta.url);

// ── Veritabanı ───────────────────────────────────────────────────────────
const db = new PGlite({ extensions: { pgcrypto } });
await db.exec(`
  create role anon nologin; create role authenticated nologin;
  create schema auth; create schema extensions;
  create table auth.users (id uuid primary key default gen_random_uuid(), email text unique, encrypted_password text, created_at timestamptz default now());
  create function auth.uid() returns uuid language sql stable as $$ select nullif(current_setting('request.jwt.claim.sub', true), '')::uuid $$;
  grant usage on schema auth to anon, authenticated;
  grant execute on function auth.uid() to anon, authenticated;
  create publication supabase_realtime;
  create extension if not exists pgcrypto schema extensions;
`);
await db.exec(readFileSync(new URL('supabase/kurulum.sql', ROOT), 'utf8'));
for (const f of readdirSync(new URL('supabase/', ROOT)).filter((f) => f.startsWith('guncelleme-')).sort()) {
  await db.exec(readFileSync(new URL(`supabase/${f}`, ROOT), 'utf8'));
}
await db.exec(`
  grant usage on schema public to anon, authenticated;
  grant all on all tables in schema public to anon, authenticated;
  grant execute on all functions in schema public to anon, authenticated;
`);

let queue = Promise.resolve();
const serial = (fn) => { const p = queue.then(fn, fn); queue = p.catch(() => {}); return p; };

// ── JWT ──────────────────────────────────────────────────────────────────
const b64 = (o) => Buffer.from(typeof o === 'string' ? o : JSON.stringify(o)).toString('base64url');
function sign(payload) {
  const h = b64({ alg: 'HS256', typ: 'JWT' }), p = b64(payload);
  return `${h}.${p}.${crypto.createHmac('sha256', SECRET).update(`${h}.${p}`).digest('base64url')}`;
}
function verify(tok) {
  const [h, p, s] = String(tok || '').split('.');
  if (!s || crypto.createHmac('sha256', SECRET).update(`${h}.${p}`).digest('base64url') !== s) return null;
  const c = JSON.parse(Buffer.from(p, 'base64url').toString());
  return c.exp * 1000 > Date.now() ? c : null;
}
const refreshTokens = new Map();
function session(user) {
  const now = Math.floor(Date.now() / 1000);
  const refresh = crypto.randomBytes(16).toString('hex');
  refreshTokens.set(refresh, user);
  const u = { id: user.id, aud: 'authenticated', role: 'authenticated', email: user.email, app_metadata: { provider: 'email' }, user_metadata: {}, created_at: user.created_at || new Date().toISOString() };
  return {
    access_token: sign({ sub: user.id, email: user.email, role: 'authenticated', aud: 'authenticated', iat: now, exp: now + 3600 }),
    token_type: 'bearer', expires_in: 3600, expires_at: now + 3600, refresh_token: refresh, user: u,
  };
}

// Kim soruyor? service → RLS'siz; kullanıcı → authenticated + kimliği; yoksa anon
function who(req) {
  const tok = (req.headers.authorization || '').replace(/^Bearer\s+/i, '');
  if (tok === SERVICE_KEY || req.headers.apikey === SERVICE_KEY && !tok) return { service: true };
  const c = verify(tok);
  return c ? { uid: c.sub } : { anon: true };
}
async function asUser(w, fn) {
  return serial(() => db.transaction(async (tx) => {
    if (!w.service) {
      await tx.query(`set local role ${w.uid ? 'authenticated' : 'anon'}`);
      await tx.query(`select set_config('request.jwt.claim.sub', $1, true)`, [w.uid || '']);
    }
    return fn(tx);
  }));
}

// ── Yardımcılar ──────────────────────────────────────────────────────────
const CORS = { 'Access-Control-Allow-Origin': '*', 'Access-Control-Allow-Headers': '*', 'Access-Control-Allow-Methods': 'GET,POST,PATCH,PUT,DELETE,OPTIONS', 'Access-Control-Expose-Headers': 'Content-Range' };
function send(res, status, body, extra = {}) {
  res.writeHead(status, { ...CORS, 'Content-Type': 'application/json', ...extra });
  res.end(body === undefined ? '' : JSON.stringify(body));
}
const readBody = (req) => new Promise((ok) => { let s = ''; req.on('data', (d) => (s += d)); req.on('end', () => ok(s ? JSON.parse(s) : {})); });
const ident = (s) => { if (!/^[a-z_][a-z0-9_]*$/.test(s)) throw Object.assign(new Error(`geçersiz ad: ${s}`), { code: 'PGRST100' }); return `"${s}"`; };
function pgError(res, e) {
  const status = e.code === '42501' ? 403 : e.code === '23505' ? 409 : e.code === 'PGRST116' ? 406 : 400;
  send(res, status, { code: e.code || 'XX000', message: e.message, details: e.detail || null, hint: e.hint || null });
}
const log = [];
const note = (s) => { log.push(`${new Date().toISOString().slice(11, 19)} ${s}`); if (process.env.AYRINTI) console.log(s); };

function filters(params) {
  const where = [], vals = [];
  for (const [k, v] of params) {
    if (['select', 'on_conflict', 'order', 'limit', 'offset', 'columns'].includes(k)) continue;
    const m = /^(eq|neq|gt|gte|lt|lte|is|in)\.(.*)$/s.exec(v);
    if (!m) throw Object.assign(new Error(`desteklenmeyen süzgeç ${k}=${v}`), { code: 'PGRST100' });
    const [, op, raw] = m, col = ident(k);
    if (op === 'is') { where.push(`${col} is ${raw === 'null' ? 'null' : raw === 'true' ? 'true' : 'false'}`); continue; }
    if (op === 'in') {
      const items = raw.replace(/^\(|\)$/g, '').split(',').map((x) => x.replace(/^"|"$/g, ''));
      where.push(`${col}::text = any($${vals.push(items)}::text[])`); continue;
    }
    const sym = { eq: '=', neq: '<>', gt: '>', gte: '>=', lt: '<', lte: '<=' }[op];
    where.push(`${col}::text ${sym} $${vals.push(raw)}::text`);
  }
  return { where: where.length ? `where ${where.join(' and ')}` : '', vals };
}
const selectList = (s) => (!s || s === '*' ? '*' : s.split(',').map(ident).join(','));
const pkCache = {};
async function pk(tx, table) {
  if (pkCache[table]) return pkCache[table];
  const r = await tx.query(`select a.attname from pg_index i join pg_attribute a on a.attrelid=i.indrelid and a.attnum=any(i.indkey) where i.indrelid=$1::regclass and i.indisprimary`, [`public.${table}`]);
  return (pkCache[table] = r.rows.map((x) => x.attname));
}

// ── Realtime (Phoenix v2 alt kümesi) ─────────────────────────────────────
const sockets = new Set();
function wsFrame(str) {
  const p = Buffer.from(str);
  const head = p.length < 126 ? Buffer.from([0x81, p.length]) : p.length < 65536 ? Buffer.from([0x81, 126, p.length >> 8, p.length & 255]) : (() => { const b = Buffer.alloc(10); b[0] = 0x81; b[1] = 127; b.writeBigUInt64BE(BigInt(p.length), 2); return b; })();
  return Buffer.concat([head, p]);
}
function wsAccept(req, socket) {
  const key = crypto.createHash('sha1').update(req.headers['sec-websocket-key'] + '258EAFA5-E914-47DA-95CA-C5AB0DC85B11').digest('base64');
  socket.write(`HTTP/1.1 101 Switching Protocols\r\nUpgrade: websocket\r\nConnection: Upgrade\r\nSec-WebSocket-Accept: ${key}\r\n\r\n`);
  const conn = { socket, bindings: [], send: (arr) => { try { socket.write(wsFrame(JSON.stringify(arr))); } catch {} } };
  sockets.add(conn);
  let buf = Buffer.alloc(0);
  socket.on('data', (d) => {
    buf = Buffer.concat([buf, d]);
    while (buf.length >= 2) {
      const op = buf[0] & 15; let len = buf[1] & 127, off = 2;
      if (len === 126) { if (buf.length < 4) return; len = buf.readUInt16BE(2); off = 4; }
      else if (len === 127) { if (buf.length < 10) return; len = Number(buf.readBigUInt64BE(2)); off = 10; }
      const masked = buf[1] & 128; const mask = masked ? buf.subarray(off, off + 4) : null; if (masked) off += 4;
      if (buf.length < off + len) return;
      const payload = Buffer.from(buf.subarray(off, off + len)); buf = buf.subarray(off + len);
      if (mask) for (let i = 0; i < payload.length; i++) payload[i] ^= mask[i % 4];
      if (op === 8) { sockets.delete(conn); socket.end(); return; }
      if (op === 9) { socket.write(Buffer.from([0x8a, 0])); continue; }
      if (op !== 1) continue;
      const [joinRef, ref, topic, event, pl] = JSON.parse(payload.toString());
      if (event === 'phx_join') {
        const pcs = (pl?.config?.postgres_changes || []).map((b, i) => ({ ...b, id: conn.bindings.length + i + 1 }));
        conn.bindings.push(...pcs.map((b) => ({ ...b, topic, joinRef })));
        conn.send([joinRef, ref, topic, 'phx_reply', { status: 'ok', response: { postgres_changes: pcs } }]);
        conn.send([joinRef, null, topic, 'system', { status: 'ok', message: 'Subscribed to PostgreSQL', extension: 'postgres_changes', channel: topic.replace(/^realtime:/, '') }]);
      } else if (event === 'phx_leave') {
        conn.bindings = conn.bindings.filter((b) => b.topic !== topic);
        conn.send([joinRef, ref, topic, 'phx_reply', { status: 'ok', response: {} }]);
      } else {
        conn.send([joinRef, ref, topic, 'phx_reply', { status: 'ok', response: {} }]); // heartbeat, access_token vb.
      }
    }
  });
  socket.on('close', () => sockets.delete(conn));
  socket.on('error', () => sockets.delete(conn));
}
// Not: gerçek Supabase canlı güncellemeyi RLS'e göre süzer; burada yalnız "bir şey değişti" sinyali gider,
// uygulama zaten her sinyalde veriyi RLS'li REST ile yeniden okur.
function broadcast(table, type) {
  for (const c of sockets) for (const b of c.bindings) {
    if (b.table && b.table !== table && table !== '*') continue;
    c.send([b.joinRef, null, b.topic, 'postgres_changes', { ids: [b.id], data: { type, schema: 'public', table: table === '*' ? b.table : table, commit_timestamp: new Date().toISOString(), columns: [], record: {}, old_record: {}, errors: null } }]);
  }
}

// ── Sahte Meta (WhatsApp Cloud API) ──────────────────────────────────────
export const meta = {
  approved: new Set(['hello_world', 'mathx_odev_verildi', 'mathx_odev_yapildi']),
  phoneNumberId: '100000000000001', token: 'EAAG-sahte-anahtar', messages: [],
};
async function handleMeta(req, res, path) {
  const body = await readBody(req);
  const id = path.split('/')[1];
  const auth = (req.headers.authorization || '').replace(/^Bearer\s+/i, '');
  const err = (code, message, status = 400) => send(res, status, { error: { message, type: 'OAuthException', code } });
  if (auth !== meta.token) return err(190, 'Invalid OAuth access token.', 401);
  if (id !== meta.phoneNumberId) return err(100, 'Unsupported post request. Object with ID does not exist');
  if (body.messaging_product !== 'whatsapp' || body.type !== 'template') return err(100, 'Invalid parameter');
  if (!/^90\d{10}$/.test(body.to)) return err(131026, 'Message undeliverable');
  if ((body.template?.components?.[0]?.parameters || []).some((x) => !String(x.text || '').trim())) return err(131008, 'Required parameter is missing');
  if (!meta.approved.has(body.template?.name)) return err(132001, 'Template name does not exist in the translation');
  meta.messages.push({ to: body.to, template: body.template.name, lang: body.template.language?.code, params: (body.template.components?.[0]?.parameters || []).map((p) => p.text), at: new Date().toISOString() });
  note(`META → ${body.to} ${body.template.name} ${JSON.stringify(meta.messages.at(-1).params)}`);
  send(res, 200, { messaging_product: 'whatsapp', contacts: [{ input: body.to, wa_id: body.to }], messages: [{ id: `wamid.SAHTE${meta.messages.length}` }] });
}

// ── wa-send Edge Function'ı Node'da aynen çalıştır ───────────────────────
registerHooks({ resolve: (spec, ctx, next) => next(spec.startsWith('jsr:@supabase/supabase-js') ? '@supabase/supabase-js' : spec, ctx) });
const realFetch = globalThis.fetch;
globalThis.fetch = (url, opts) => realFetch(String(url).replace(/^https:\/\/graph\.facebook\.com\/v[\d.]+/, `${BASE}/meta`), opts);
let waHandler = null;
globalThis.Deno = { env: { get: (k) => ({ SUPABASE_URL: BASE, SUPABASE_SERVICE_ROLE_KEY: SERVICE_KEY })[k] }, serve: (h) => { waHandler = h; } };
await import(new URL('supabase/functions/wa-send/kaynak.js', ROOT).href);

// ── HTTP ─────────────────────────────────────────────────────────────────
const server = http.createServer(async (req, res) => {
  if (req.method === 'OPTIONS') return send(res, 204);
  const u = new URL(req.url, BASE), path = u.pathname;
  try {
    // Test paneli: durum ve Meta'ya giden mesajlar
    if (path === '/_durum') return send(res, 200, { meta: meta.messages, log: log.slice(-200), users: (await serial(() => db.query('select u.email, p.role from auth.users u left join public.profiles p on p.user_id=u.id'))).rows });
    if (path === '/_meta_hata') { const b = await readBody(req); b.name ? (b.onay ? meta.approved.add(b.name) : meta.approved.delete(b.name)) : 0; return send(res, 200, [...meta.approved]); }
    if (path === '/_sql') { const b = await readBody(req); return send(res, 200, (await serial(() => db.query(b.sql, b.params || []))).rows); }
    if (path.startsWith('/meta/')) return handleMeta(req, res, path.slice(5));

    // ── Auth
    if (path === '/auth/v1/signup' && req.method === 'POST') {
      const { email, password } = await readBody(req);
      if (!password || password.length < 6) return send(res, 422, { code: 'weak_password', msg: 'Password should be at least 6 characters.' });
      const r = await serial(async () => {
        const ex = await db.query('select 1 from auth.users where email=$1', [email.toLowerCase()]);
        if (ex.rows.length) return null;
        return (await db.query(`insert into auth.users(email, encrypted_password) values ($1, extensions.crypt($2, extensions.gen_salt('bf'))) returning id, email, created_at`, [email.toLowerCase(), password])).rows[0];
      });
      if (!r) return send(res, 422, { code: 'user_already_exists', msg: 'User already registered' });
      note(`HESAP AÇILDI ${email}`);
      return send(res, 200, session(r));
    }
    if (path === '/auth/v1/token' && req.method === 'POST') {
      const b = await readBody(req);
      if (u.searchParams.get('grant_type') === 'refresh_token') {
        const user = refreshTokens.get(b.refresh_token);
        if (!user) return send(res, 400, { code: 'refresh_token_not_found', msg: 'Invalid Refresh Token: Refresh Token Not Found' });
        refreshTokens.delete(b.refresh_token);
        return send(res, 200, session(user));
      }
      const r = await serial(() => db.query(`select id, email, created_at from auth.users where email=$1 and encrypted_password = extensions.crypt($2, encrypted_password)`, [String(b.email).toLowerCase(), b.password]));
      if (!r.rows[0]) { note(`GİRİŞ REDDEDİLDİ ${b.email}`); return send(res, 400, { code: 'invalid_credentials', msg: 'Invalid login credentials' }); }
      note(`GİRİŞ ${b.email}`);
      return send(res, 200, session(r.rows[0]));
    }
    if (path === '/auth/v1/user') {
      const c = verify((req.headers.authorization || '').replace(/^Bearer\s+/i, ''));
      if (!c) return send(res, 401, { code: 'bad_jwt', msg: 'invalid JWT' });
      const r = await serial(() => db.query('select id, email, created_at from auth.users where id=$1', [c.sub]));
      if (!r.rows[0]) return send(res, 403, { code: 'user_not_found', msg: 'User from sub claim in JWT does not exist' });
      return send(res, 200, session(r.rows[0]).user);
    }
    if (path === '/auth/v1/logout') return send(res, 204);

    // ── Edge Function
    if (path === '/functions/v1/wa-send') {
      const body = await new Promise((ok) => { let s = ''; req.on('data', (d) => (s += d)); req.on('end', () => ok(s)); });
      const r = await waHandler(new Request(`${BASE}${path}`, { method: req.method, headers: Object.fromEntries(Object.entries(req.headers).filter(([, v]) => typeof v === 'string')), body: req.method === 'GET' ? undefined : body }));
      const text = await r.text();
      note(`wa-send ${body} → ${r.status} ${text}`);
      res.writeHead(r.status, { ...CORS, 'Content-Type': 'application/json' });
      return res.end(text);
    }

    // ── RPC
    const w = who(req);
    let m = /^\/rest\/v1\/rpc\/([a-z_0-9]+)$/.exec(path);
    if (m) {
      const args = req.method === 'GET' ? Object.fromEntries(u.searchParams) : await readBody(req);
      const names = Object.keys(args);
      const sql = `select to_json(public.${ident(m[1])}(${names.map((n, i) => `${ident(n)} => $${i + 1}`).join(', ')})) as v`;
      const r = await asUser(w, (tx) => tx.query(sql, names.map((n) => (args[n] !== null && typeof args[n] === 'object' ? JSON.stringify(args[n]) : args[n]))));
      if (['set_homework_done', 'delete_accounts_for', 'claim_teacher', 'admin_set_password', 'set_wa_config'].includes(m[1])) broadcast('*', 'UPDATE');
      note(`RPC ${m[1]} (${w.uid ? 'kullanıcı' : w.service ? 'servis' : 'anon'})`);
      return send(res, 200, r.rows[0].v);
    }

    // ── Tablolar
    m = /^\/rest\/v1\/([a-z_0-9]+)$/.exec(path);
    if (m) {
      const table = m[1], T = `public.${ident(table)}`;
      const prefer = req.headers.prefer || '';
      const wantObj = (req.headers.accept || '').includes('vnd.pgrst.object');
      const ret = prefer.includes('return=representation') || req.method === 'GET';
      const cols = selectList(u.searchParams.get('select'));
      const { where, vals } = filters(u.searchParams);
      let sql, params = vals;
      if (req.method === 'GET') {
        const order = u.searchParams.get('order');
        const ord = order ? `order by ${order.split(',').map((o) => { const [c, d] = o.split('.'); return `${ident(c)} ${d === 'desc' ? 'desc' : 'asc'}`; }).join(',')}` : '';
        sql = `with r as (select ${cols} from ${T} ${where} ${ord}) select coalesce(json_agg(r), '[]'::json) as j from r`;
      } else if (req.method === 'POST') {
        const body = await readBody(req);
        const rows = Array.isArray(body) ? body : [body];
        const keys = [...new Set(rows.flatMap(Object.keys))].map((k) => (ident(k), k));
        const upsert = prefer.includes('resolution=merge-duplicates');
        const conflict = u.searchParams.get('on_conflict')?.split(',') || (upsert ? await serial(() => pk(db, table)) : null);
        const ins = `insert into ${T} (${keys.map(ident).join(',')}) select ${keys.map(ident).join(',')} from json_populate_recordset(null::${T}, $1::json)`
          + (upsert ? ` on conflict (${conflict.map(ident).join(',')}) do update set ${keys.filter((k) => !conflict.includes(k)).map((k) => `${ident(k)} = excluded.${ident(k)}`).join(',') || `${ident(conflict[0])} = excluded.${ident(conflict[0])}`}` : '')
          + ' returning *';
        sql = `with r as (${ins}) select coalesce(json_agg(r), '[]'::json) as j from r`;
        params = [JSON.stringify(rows)];
      } else if (req.method === 'PATCH') {
        const body = await readBody(req);
        const keys = Object.keys(body);
        const set = keys.map((k) => `${ident(k)} = x.${ident(k)}`).join(',');
        sql = `with r as (update ${T} set ${set} from json_populate_record(null::${T}, $${vals.length + 1}::json) x ${where.replace(/"([a-z_0-9]+)"/g, `${T}."$1"`)} returning ${T}.*) select coalesce(json_agg(r), '[]'::json) as j from r`;
        params = [...vals, JSON.stringify(body)];
      } else if (req.method === 'DELETE') {
        sql = `with r as (delete from ${T} ${where} returning *) select coalesce(json_agg(r), '[]'::json) as j from r`;
      } else return send(res, 405, { message: 'yöntem yok' });

      const out = (await asUser(w, (tx) => tx.query(sql, params))).rows[0].j;
      if (req.method !== 'GET') { broadcast(table, { POST: 'INSERT', PATCH: 'UPDATE', DELETE: 'DELETE' }[req.method]); note(`${req.method} ${table} ${out.length} satır (${w.uid ? 'kullanıcı' : w.service ? 'servis' : 'anon'})`); }
      if (!ret) return send(res, req.method === 'POST' ? 201 : 204);
      if (wantObj) {
        if (out.length !== 1) return send(res, 406, { code: 'PGRST116', message: 'JSON object requested, multiple (or no) rows returned', details: `The result contains ${out.length} rows`, hint: null });
        return send(res, req.method === 'POST' ? 201 : 200, out[0]);
      }
      return send(res, req.method === 'POST' ? 201 : 200, out);
    }
    send(res, 404, { message: `bilinmeyen yol ${path}` });
  } catch (e) {
    note(`HATA ${req.method} ${path}: ${e.message}`);
    pgError(res, e);
  }
});
server.on('upgrade', (req, socket) => {
  if (req.url.startsWith('/realtime/v1/websocket')) wsAccept(req, socket); else socket.destroy();
});
server.listen(PORT, () => console.log(`Sahte Supabase hazır: ${BASE}  (Meta taklidi: ${BASE}/meta, durum: ${BASE}/_durum)`));

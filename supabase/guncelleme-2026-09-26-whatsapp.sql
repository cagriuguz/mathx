-- MathX güncellemesi 26 Eyl 2026: otomatik WhatsApp (yalnız EKLEME; mevcut veriye dokunmaz, tekrar çalıştırmak güvenli)

-- ───────────── Otomatik WhatsApp (WhatsApp Business) — yalnız EKLEME; eski kurulumda da güvenle çalışır
alter table public.settings add column if not exists wa_mode text default 'manual';   -- 'manual' | 'auto'
alter table public.homework add column if not exists wa_given_at timestamptz;          -- otomatik "ödev verildi" gitti
alter table public.homework add column if not exists wa_done_at timestamptz;           -- otomatik "ödev yapıldı" gitti
-- Erişim anahtarı: RLS açık ve HİÇ kural yok → hiçbir hesap okuyamaz/yazamaz; yalnız aşağıdaki işlevler
-- ve sunucu işlevi (service role) erişir. Öğretmen anahtarı bir kez yazar, bir daha göremez.
create table if not exists public.wa_config (
  id text primary key default 'main',
  business_phone text default '',
  phone_number_id text default '',
  token text default '',
  updated_at timestamptz default now()
);
alter table public.wa_config enable row level security;


-- Öğretmen WhatsApp Business bilgilerini kaydeder (boş anahtar = eskisini koru)
create or replace function public.set_wa_config(p_business_phone text, p_phone_number_id text, p_token text) returns void language plpgsql security definer set search_path = public as
$$ begin
  if not public.is_teacher() then raise exception 'Yetki yok'; end if;
  insert into public.wa_config(id, business_phone, phone_number_id, token, updated_at)
    values ('main', coalesce(p_business_phone, ''), coalesce(p_phone_number_id, ''), coalesce(p_token, ''), now())
  on conflict (id) do update set business_phone = excluded.business_phone, phone_number_id = excluded.phone_number_id,
    token = case when coalesce(p_token, '') = '' then public.wa_config.token else excluded.token end, updated_at = now();
end $$;

-- Öğretmen yalnız DURUMU görür (anahtarın kendisi asla dönmez)
create or replace function public.wa_config_status() returns json language plpgsql stable security definer set search_path = public as
$$ declare r public.wa_config; begin
  if not public.is_teacher() then raise exception 'Yetki yok'; end if;
  select * into r from public.wa_config where id = 'main';
  return json_build_object('business_phone', coalesce(r.business_phone, ''), 'phone_number_id', coalesce(r.phone_number_id, ''),
    'has_token', coalesce(r.token, '') <> '', 'updated_at', r.updated_at);
end $$;

revoke all on function public.set_wa_config(text, text, text) from anon;
revoke all on function public.wa_config_status() from anon;

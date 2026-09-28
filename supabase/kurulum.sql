-- MathX veritabanı kurulumu (Supabase → SQL Editor → bu dosyanın tamamını yapıştır → Run).
-- Tekrar çalıştırmak güvenlidir: var olan tabloları/verileri SİLMEZ.

create extension if not exists pgcrypto with schema extensions;

-- ───────────── Tablolar
create table if not exists public.profiles (
  user_id uuid primary key references auth.users(id) on delete cascade,
  username text unique not null,
  role text not null check (role in ('teacher','parent','student')),
  student_id uuid,
  created_at timestamptz default now()
);

create table if not exists public.students (
  id uuid primary key default gen_random_uuid(),
  name text not null check (char_length(name) between 2 and 80),
  phone text not null,
  parent_name text not null,
  parent_phone text not null,
  student_username text,
  parent_username text,
  start_date date not null,
  active boolean not null default true,
  end_date date,
  note text default '',
  consent boolean default false,
  created_at timestamptz default now()
);

create table if not exists public.schedules (
  id uuid primary key default gen_random_uuid(),
  student_id uuid not null references public.students(id) on delete cascade,
  valid_from date not null,
  slots jsonb not null default '[]'
);

create table if not exists public.plans (
  id uuid primary key default gen_random_uuid(),
  student_id uuid not null references public.students(id) on delete cascade,
  valid_from date not null,
  type text not null check (type in ('weekly','4weekly','monthly','oneoff')),
  fee bigint not null check (fee >= 0),
  hours numeric,
  due_date date
);

create table if not exists public.marks (
  id uuid primary key default gen_random_uuid(),
  student_id uuid not null references public.students(id) on delete cascade,
  date date not null,
  time text not null,
  reason text not null check (char_length(reason) between 1 and 50),
  created_at timestamptz default now(),
  unique (student_id, date, time)
);

create table if not exists public.payments (
  id uuid primary key default gen_random_uuid(),
  student_id uuid not null references public.students(id) on delete cascade,
  period_key text not null,
  amount bigint not null check (amount > 0),
  paid_date date not null,
  method text not null default 'nakit',
  note text default '',
  deleted_at timestamptz,
  created_at timestamptz default now()
);

create table if not exists public.books (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  active boolean not null default true
);
-- Kitaplar öğrenciye özel (boş = eski ortak listeden kalan, atanmamış kitap)
alter table public.books add column if not exists student_id uuid references public.students(id) on delete cascade;
create index if not exists books_student_idx on public.books(student_id);

create table if not exists public.homework (
  id uuid primary key default gen_random_uuid(),
  student_id uuid not null references public.students(id) on delete cascade,
  given_date date not null,
  due_date date not null,
  items jsonb not null default '[]',
  note text default '',
  done boolean not null default false,
  done_at timestamptz,
  sent_given boolean default false,
  sent_done boolean default false,
  seen_done boolean default true
);

create table if not exists public.expenses (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  category text default 'Diğer',
  amount bigint not null check (amount > 0),
  due_day int not null default 1 check (due_day between 1 and 31),
  start_month text not null,
  end_month text,
  active boolean not null default true,
  note text default '',
  deleted_at timestamptz
);

create table if not exists public.expense_payments (
  id uuid primary key default gen_random_uuid(),
  expense_id uuid not null references public.expenses(id) on delete cascade,
  month text not null,
  paid_date date not null,
  amount bigint not null,
  deleted_at timestamptz
);

create table if not exists public.settings (
  id text primary key default 'main',
  teacher_name text default '',
  teacher_phone text default '',
  remind_days jsonb default '{"weekly":3,"4weekly":5,"monthly":3,"oneoff":3}',
  cash_on_hand bigint default 0
);

-- ───────────── Otomatik WhatsApp (WhatsApp Business) — yalnız EKLEME; eski kurulumda da güvenle çalışır
alter table public.settings add column if not exists wa_mode text default 'manual';   -- 'manual' | 'auto'
alter table public.homework add column if not exists wa_given_at timestamptz;          -- otomatik "ödev verildi" gitti
alter table public.homework add column if not exists wa_done_at timestamptz;           -- otomatik "ödev yapıldı" gitti
-- Erişim anahtarı: RLS açık ve HİÇ kural yok → hiçbir hesap okuyamaz/yazamaz; yalnız aşağıdaki işlevler
-- ve sunucu işlevi (service role) erişir. Öğretmen anahtarı bir kez yazar, bir daha göremez.
-- Öğrenci/veli giriş şifreleri: yalnızca öğretmen görür (öğretmen unutulan şifreyi tekrar söyleyebilsin diye).
-- Veli ve öğrenci bu tabloyu HİÇ okuyamaz (RLS'de yalnız teacher_all kuralı var).
create table if not exists public.logins (
  id uuid primary key default gen_random_uuid(),
  student_id uuid not null unique references public.students(id) on delete cascade,
  student_pw text default '',
  parent_pw text default '',
  updated_at timestamptz default now()
);

-- Öğretmenin veliye bıraktığı SESLİ NOTLAR (isteğe bağlı, en fazla 90 sn). Ses base64 metin olarak durur;
-- liste yüklenirken ses gönderilmez, veli "Dinle"ye basınca iner. Veli yalnız kendi öğrencisininkini dinler.
create table if not exists public.voice_notes (
  id uuid primary key default gen_random_uuid(),
  student_id uuid not null references public.students(id) on delete cascade,
  audio text not null check (char_length(audio) between 100 and 3000000),
  mime text not null default 'audio/mp4',
  seconds int not null check (seconds between 1 and 90),
  created_at timestamptz default now(),
  heard_at timestamptz
);
create index if not exists voice_notes_student_idx on public.voice_notes(student_id);

-- Ödev fotoğrafları: öğrenci "yaptım" demeden önce en az 1, en fazla 15 fotoğraf yükler (öğretmen ve veli görür)
create table if not exists public.homework_photos (
  id uuid primary key default gen_random_uuid(),
  homework_id uuid not null references public.homework(id) on delete cascade,
  student_id uuid not null references public.students(id) on delete cascade,
  image text not null check (char_length(image) between 100 and 1500000),
  thumb text not null check (char_length(thumb) between 100 and 120000),
  bytes int not null default 0,
  created_at timestamptz default now()
);
create index if not exists homework_photos_hw_idx on public.homework_photos(homework_id);
create index if not exists homework_photos_student_idx on public.homework_photos(student_id);

-- Ekleme denetimi: ödev bu öğrencinin mi, en fazla 15 fotoğraf (aynı anda iki yükleme de sınırı aşamaz)
create or replace function public.homework_photo_check() returns trigger language plpgsql security definer set search_path = public as
$$ declare sid uuid; begin
  select student_id into sid from public.homework where id = new.homework_id for update;
  if sid is null or sid <> new.student_id then raise exception 'Fotoğraf bu ödeve ait değil'; end if;
  if (select count(*) from public.homework_photos where homework_id = new.homework_id) >= 15 then
    raise exception 'Bir ödeve en fazla 15 fotoğraf yüklenebilir'; end if;
  new.bytes := char_length(new.image);
  new.created_at := now();
  return new;
end $$;
drop trigger if exists homework_photo_check on public.homework_photos;
create trigger homework_photo_check before insert on public.homework_photos for each row execute function public.homework_photo_check();


create table if not exists public.extra_lessons (
  id uuid primary key default gen_random_uuid(),
  student_id uuid not null references public.students(id) on delete cascade,
  date date not null,
  time text not null,
  hours numeric not null default 1 check (hours > 0 and hours <= 12),
  note text default '' check (char_length(note) <= 50),
  created_at timestamptz default now()
);

-- KARDEŞLER: bir veli hesabı birden çok öğrenciyi görebilir (tek kullanıcı adı + tek şifre).
-- Velinin ilk öğrencisi profiles.student_id'de; kardeşleri burada. Öğrenci kayıtları (ders, ödeme, ödev) AYRI kalır.
create table if not exists public.parent_links (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  student_id uuid not null references public.students(id) on delete cascade,
  created_at timestamptz default now(),
  unique (user_id, student_id)
);
create index if not exists parent_links_student_idx on public.parent_links(student_id);

create table if not exists public.wa_config (
  id text primary key default 'main',
  business_phone text default '',
  phone_number_id text default '',
  token text default '',
  updated_at timestamptz default now()
);
alter table public.wa_config enable row level security;

-- ───────────── Yardımcı işlevler
create or replace function public.my_role() returns text language sql stable security definer set search_path = public as
$$ select role from public.profiles where user_id = auth.uid() $$;

create or replace function public.my_student_id() returns uuid language sql stable security definer set search_path = public as
$$ select student_id from public.profiles where user_id = auth.uid() $$;

-- Giriş yapan kişinin görebileceği öğrenciler: kendi öğrencisi + (veliyse) bağlı kardeşler
create or replace function public.my_student_ids() returns setof uuid language sql stable security definer set search_path = public as
$$ select student_id from public.profiles where user_id = auth.uid() and student_id is not null
   union
   select l.student_id from public.parent_links l join public.profiles p on p.user_id = l.user_id and p.role = 'parent'
   where l.user_id = auth.uid() $$;

create or replace function public.is_teacher() returns boolean language sql stable security definer set search_path = public as
$$ select coalesce((select role = 'teacher' from public.profiles where user_id = auth.uid()), false) $$;

create or replace function public.teacher_exists() returns boolean language sql stable security definer set search_path = public as
$$ select exists(select 1 from public.profiles where role = 'teacher') $$;

-- İlk kurulum: öğretmen yoksa, giriş yapan kişi öğretmen olur. Öğretmen varsa hiçbir şey yapmaz.
create or replace function public.claim_teacher(p_username text) returns boolean language plpgsql security definer set search_path = public as
$$ begin
  if auth.uid() is null then raise exception 'Giriş gerekli'; end if;
  if exists(select 1 from public.profiles where role = 'teacher') then raise exception 'Öğretmen hesabı zaten var'; end if;
  insert into public.profiles(user_id, username, role) values (auth.uid(), p_username, 'teacher');
  insert into public.settings(id) values ('main') on conflict do nothing;
  return true;
end $$;

create or replace function public.username_taken(p_username text) returns boolean language plpgsql security definer set search_path = public as
$$ begin
  if not public.is_teacher() then raise exception 'Yetki yok'; end if;
  return exists(select 1 from public.profiles where username = p_username)
      or exists(select 1 from auth.users where email = p_username || '@kullanici.mathx.app');
end $$;

create or replace function public.admin_set_password(p_username text, p_password text) returns void language plpgsql security definer set search_path = public, extensions as
$$ declare uid uuid; begin
  if not public.is_teacher() then raise exception 'Yetki yok'; end if;
  select user_id into uid from public.profiles where username = p_username and role <> 'teacher';
  if uid is null then raise exception 'Hesap bulunamadı'; end if;
  update auth.users set encrypted_password = extensions.crypt(p_password, extensions.gen_salt('bf')) where id = uid;
end $$;

-- Öğrenci silinirken hesapları: öğrenci hesabı silinir. Veli hesabı YALNIZCA başka çocuğu yoksa silinir;
-- kardeşi varsa veli hesabı kalır, yalnız bu öğrenci listesinden çıkar.
create or replace function public.delete_accounts_for(p_student uuid) returns void language plpgsql security definer set search_path = public as
$$ declare r record; nxt uuid; begin
  if not public.is_teacher() then raise exception 'Yetki yok'; end if;
  delete from auth.users where id in (select user_id from public.profiles where student_id = p_student and role = 'student');
  for r in select user_id from public.profiles where student_id = p_student and role = 'parent' loop
    select student_id into nxt from public.parent_links where user_id = r.user_id and student_id <> p_student order by created_at limit 1;
    if nxt is null then delete from auth.users where id = r.user_id;
    else
      update public.profiles set student_id = nxt where user_id = r.user_id;
      delete from public.parent_links where user_id = r.user_id and student_id = nxt;
    end if;
  end loop;
  delete from public.parent_links where student_id = p_student;
end $$;

-- Kardeş bağla: p_student'ın velisi artık p_sibling'in veli hesabıdır (aynı kullanıcı adı ve şifre).
-- p_student'ın ayrı veli hesabı varsa kapatılır; o hesabın başka çocukları varsa onlar da ortak hesaba geçer.
-- Öğrencilerin ders/ödeme/ödev kayıtlarına DOKUNULMAZ. Dönen değer: ortak veli kullanıcı adı.
create or replace function public.link_sibling(p_student uuid, p_sibling uuid) returns text language plpgsql security definer set search_path = public as
$$ declare target uuid; tname text; tprimary uuid; pw text; old uuid; begin
  if not public.is_teacher() then raise exception 'Yetki yok'; end if;
  if p_student = p_sibling then raise exception 'Öğrenci kendisiyle kardeş olamaz'; end if;
  if not exists(select 1 from public.students where id = p_student) or not exists(select 1 from public.students where id = p_sibling) then
    raise exception 'Öğrenci bulunamadı'; end if;
  select p.user_id, p.username, p.student_id into target, tname, tprimary from public.profiles p
   where p.role = 'parent' and (p.student_id = p_sibling or exists(select 1 from public.parent_links l where l.user_id = p.user_id and l.student_id = p_sibling))
   order by p.created_at limit 1;
  if target is null then raise exception 'Kardeşin veli hesabı bulunamadı'; end if;
  for old in select p.user_id from public.profiles p where p.role = 'parent' and p.user_id <> target
     and (p.student_id = p_student or exists(select 1 from public.parent_links l where l.user_id = p.user_id and l.student_id = p_student)) loop
    insert into public.parent_links(user_id, student_id)
      select target, x.sid from (select student_id sid from public.profiles where user_id = old
                                 union select student_id from public.parent_links where user_id = old) x
      where x.sid is not null and x.sid <> tprimary
      on conflict do nothing;
    delete from auth.users where id = old;
  end loop;
  if p_student <> tprimary then
    insert into public.parent_links(user_id, student_id) values (target, p_student) on conflict do nothing;
  end if;
  -- Ortak hesabın bütün çocuklarında veli kullanıcı adı ve (öğretmenin gördüğü) veli şifresi aynı olsun
  select parent_pw into pw from public.logins where student_id = p_sibling;
  update public.students set parent_username = tname
   where id = tprimary or id in (select student_id from public.parent_links where user_id = target);
  insert into public.logins(student_id, parent_pw)
    select s.id, coalesce(pw, '') from public.students s
     where s.id = tprimary or s.id in (select student_id from public.parent_links where user_id = target)
  on conflict (student_id) do update set parent_pw = excluded.parent_pw, updated_at = now();
  return tname;
end $$;

-- Kardeşten ayır: öğretmen önce p_student için YENİ veli hesabı açar (p_keep), sonra bu işlev
-- öğrenciyi eski ortak veli hesabından çıkarır. Eski hesap diğer çocuklarla çalışmaya devam eder.
create or replace function public.unlink_sibling(p_student uuid, p_keep uuid) returns void language plpgsql security definer set search_path = public as
$$ declare r record; nxt uuid; begin
  if not public.is_teacher() then raise exception 'Yetki yok'; end if;
  if not exists(select 1 from public.profiles where user_id = p_keep and role = 'parent' and student_id = p_student) then
    raise exception 'Yeni veli hesabı bulunamadı'; end if;
  delete from public.parent_links where student_id = p_student and user_id <> p_keep;
  for r in select user_id from public.profiles where role = 'parent' and student_id = p_student and user_id <> p_keep loop
    select student_id into nxt from public.parent_links where user_id = r.user_id order by created_at limit 1;
    if nxt is null then raise exception 'Bu öğrencinin kardeşi yok; ayırmaya gerek yok'; end if;
    update public.profiles set student_id = nxt where user_id = r.user_id;
    delete from public.parent_links where user_id = r.user_id and student_id = nxt;
  end loop;
end $$;

-- Kardeşten ayırma yarıda kalırsa (ör. internet koptu) yeni açılan veli hesabını geri al.
-- Yalnız: veli rolünde, bağlı kardeşi olmayan ve bu öğrenciye yeni açılmış hesap silinir.
create or replace function public.cancel_parent_account(p_user uuid, p_student uuid) returns void language plpgsql security definer set search_path = public as
$$ begin
  if not public.is_teacher() then raise exception 'Yetki yok'; end if;
  if exists(select 1 from public.parent_links where user_id = p_user) then raise exception 'Bu hesabın kardeşleri var; silinmez'; end if;
  delete from auth.users where id = p_user
    and exists(select 1 from public.profiles where user_id = p_user and role = 'parent' and student_id = p_student);
end $$;

-- Öğrenci yalnızca KENDİ ödevinin "yaptım" işaretini değiştirebilir; FOTOĞRAF YÜKLEMEDEN "yaptım" diyemez.
create or replace function public.set_homework_done(p_id uuid, p_done boolean) returns void language plpgsql security definer set search_path = public as
$$ begin
  if public.is_teacher() then null;
  elsif public.my_role() = 'student' and exists(select 1 from public.homework where id = p_id and student_id = public.my_student_id()) then
    -- Öğrenci "yaptım" dedikten sonra geri alamaz (kullanıcı kararı); ikinci basış da tarihi değiştirmez
    if not p_done then raise exception 'Yapıldı olarak işaretlenen ödev geri alınamaz'; end if;
    if exists(select 1 from public.homework where id = p_id and done) then return; end if;
    if not exists(select 1 from public.homework_photos where homework_id = p_id) then
      raise exception 'Önce ödevinin fotoğrafını yükle (en az 1 fotoğraf)'; end if;
  else raise exception 'Bu ödeve erişiminiz yok'; end if;
  update public.homework set done = p_done, done_at = case when p_done then now() else null end,
         seen_done = not p_done, sent_done = false where id = p_id;
end $$;

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

create or replace function public.my_student_name() returns text language sql stable security definer set search_path = public as
$$ select name from public.students where id = public.my_student_id() $$;

-- Veli sesli notu dinleyince "dinlendi" işareti (yalnız kendi öğrencisininki; başka alan değişmez)
create or replace function public.mark_voice_heard(p_id uuid) returns void language plpgsql security definer set search_path = public as
$$ begin
  if coalesce(public.my_role(), '') <> 'parent' or not exists(select 1 from public.voice_notes where id = p_id and student_id in (select public.my_student_ids())) then
    raise exception 'Bu nota erişiminiz yok'; end if;
  update public.voice_notes set heard_at = now() where id = p_id and heard_at is null;
end $$;

revoke all on function public.admin_set_password(text, text) from anon;
revoke all on function public.delete_accounts_for(uuid) from anon;
revoke all on function public.link_sibling(uuid, uuid) from anon;
revoke all on function public.unlink_sibling(uuid, uuid) from anon;
revoke all on function public.cancel_parent_account(uuid, uuid) from anon;
revoke all on function public.set_wa_config(text, text, text) from anon;
revoke all on function public.wa_config_status() from anon;
grant execute on function public.teacher_exists() to anon, authenticated;

-- ───────────── Satır güvenliği (RLS)
alter table public.profiles enable row level security;
alter table public.students enable row level security;
alter table public.schedules enable row level security;
alter table public.plans enable row level security;
alter table public.marks enable row level security;
alter table public.payments enable row level security;
alter table public.books enable row level security;
alter table public.homework enable row level security;
alter table public.expenses enable row level security;
alter table public.expense_payments enable row level security;
alter table public.settings enable row level security;
alter table public.logins enable row level security;
alter table public.voice_notes enable row level security;
alter table public.extra_lessons enable row level security;
alter table public.parent_links enable row level security;
alter table public.homework_photos enable row level security;

do $$ declare t text; begin
  -- Eski kuralları temizle (yeniden çalıştırmada çakışmasın)
  for t in select tablename from pg_tables where schemaname = 'public' and tablename in
    ('profiles','students','schedules','plans','marks','payments','books','homework','expenses','expense_payments','settings','logins','voice_notes','extra_lessons','parent_links','homework_photos') loop
    execute format('drop policy if exists teacher_all on public.%I', t);
    execute format('drop policy if exists parent_read on public.%I', t);
    execute format('drop policy if exists own_read on public.%I', t);
    execute format('create policy teacher_all on public.%I for all to authenticated using (public.is_teacher()) with check (public.is_teacher())', t);
  end loop;
end $$;

create policy own_read on public.profiles for select to authenticated using (user_id = auth.uid());
-- Veli: yalnızca kendi öğrencisi ve bağlı kardeşleri (öğrenci rolü bu tabloları HİÇ okuyamaz)
create policy parent_read on public.students  for select to authenticated using (public.my_role() = 'parent' and id in (select public.my_student_ids()));
create policy parent_read on public.schedules for select to authenticated using (public.my_role() = 'parent' and student_id in (select public.my_student_ids()));
create policy parent_read on public.plans     for select to authenticated using (public.my_role() = 'parent' and student_id in (select public.my_student_ids()));
create policy parent_read on public.marks     for select to authenticated using (public.my_role() = 'parent' and student_id in (select public.my_student_ids()));
create policy parent_read on public.payments  for select to authenticated using (public.my_role() = 'parent' and student_id in (select public.my_student_ids()));
create policy parent_read on public.voice_notes for select to authenticated using (public.my_role() = 'parent' and student_id in (select public.my_student_ids()));
create policy parent_read on public.extra_lessons for select to authenticated using (public.my_role() = 'parent' and student_id in (select public.my_student_ids()));
-- Ödev: veli kendi çocuklarınınkini, öğrenci yalnız kendisininkini okur
create policy parent_read on public.homework  for select to authenticated using (
  (public.my_role() = 'parent' and student_id in (select public.my_student_ids()))
  or (public.my_role() = 'student' and student_id = public.my_student_id()));
-- Ödev fotoğrafları
drop policy if exists student_add on public.homework_photos;
drop policy if exists student_del on public.homework_photos;
-- Veli kendi çocuklarınınkini, öğrenci yalnız kendisininkini görür
create policy parent_read on public.homework_photos for select to authenticated using (
  (public.my_role() = 'parent' and student_id in (select public.my_student_ids()))
  or (public.my_role() = 'student' and student_id = public.my_student_id()));
-- Öğrenci yalnız KENDİ ve henüz "yaptım" denmemiş ödevine ekler / ondan siler
create policy student_add on public.homework_photos for insert to authenticated with check (
  public.my_role() = 'student' and student_id = public.my_student_id()
  and exists(select 1 from public.homework h where h.id = homework_id and h.student_id = public.my_student_id() and not h.done));
create policy student_del on public.homework_photos for delete to authenticated using (
  public.my_role() = 'student' and student_id = public.my_student_id()
  and exists(select 1 from public.homework h where h.id = homework_id and not h.done));

-- ───────────── Anlık güncelleme (bir telefonda yapılan değişiklik diğerlerinde hemen görünür)
-- voice_notes ve homework_photos BİLEREK yok: ses satırları büyük; veli ekranı açılınca/öne gelince zaten yenilenir.
do $$ declare t text; begin
  foreach t in array array['students','schedules','plans','marks','payments','books','homework','expenses','expense_payments','settings','logins','extra_lessons'] loop
    begin execute format('alter publication supabase_realtime add table public.%I', t);
    exception when duplicate_object then null; end;
  end loop;
end $$;

-- ───────────── Erişim izinleri (yeni açılan Supabase projelerinde de kesin olsun; güvenliği yukarıdaki RLS sağlar)
grant usage on schema public to anon, authenticated;
grant select, insert, update, delete on all tables in schema public to authenticated;
grant execute on all functions in schema public to authenticated;
grant execute on function public.teacher_exists() to anon;

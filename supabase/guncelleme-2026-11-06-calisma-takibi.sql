-- ÇALIŞMA TAKİBİ (6 Kasım 2026) — YALNIZCA YENİ TABLO EKLER; mevcut hiçbir tabloya/satıra dokunmaz.
-- Öğrenci başına: takip açık/kapalı (varsayılan KAPALI) + haftada çalışacağı günler.
-- Öğrenci o günlerde "Çalıştım" der (log_study); çalışmadıysa öğretmen panelinde görünür, veliye mesaj gider.
-- Güvenle birden çok kez çalıştırılabilir (if not exists / or replace / drop policy if exists).

create table if not exists public.study_plans (
  id uuid primary key default gen_random_uuid(),
  student_id uuid not null unique references public.students(id) on delete cascade,
  enabled boolean not null default false,
  days smallint[] not null default '{}' check (days <@ array[1,2,3,4,5,6,7]::smallint[]),   -- 1=Pzt … 7=Paz
  start_date date not null default ((now() at time zone 'Europe/Istanbul')::date),          -- takip bu günden itibaren sayılır
  created_at timestamptz default now()
);

create table if not exists public.study_logs (
  id uuid primary key default gen_random_uuid(),
  student_id uuid not null references public.students(id) on delete cascade,
  date date not null,
  status text not null default 'done' check (status in ('done', 'excused', 'handled')),
  -- done: öğrenci "çalıştım" dedi · excused: öğretmen mazeretli saydı · handled: öğretmen veliye bildirdi / ele aldı
  note text default '' check (char_length(note) <= 60),
  created_at timestamptz default now(),
  unique (student_id, date)
);
create index if not exists study_logs_student_idx on public.study_logs(student_id, date);

alter table public.study_plans enable row level security;
alter table public.study_logs enable row level security;

do $$ declare t text; begin
  foreach t in array array['study_plans', 'study_logs'] loop
    execute format('drop policy if exists teacher_all on public.%I', t);
    execute format('drop policy if exists parent_read on public.%I', t);
    execute format('create policy teacher_all on public.%I for all to authenticated using (public.is_teacher()) with check (public.is_teacher())', t);
    -- Veli kendi çocuklarınınkini, öğrenci yalnız kendisininkini OKUR (yazamaz; yazmak için log_study işlevi var)
    execute format($f$create policy parent_read on public.%I for select to authenticated using (
      (public.my_role() = 'parent' and student_id in (select public.my_student_ids()))
      or (public.my_role() = 'student' and student_id = public.my_student_id()))$f$, t);
  end loop;
end $$;

-- Öğrenci "bugün çalıştım" der: tarih sunucuda (İstanbul saati) belirlenir, öğrenci başka gün/öğrenci için yazamaz.
create or replace function public.log_study(p_note text default '') returns void language plpgsql security definer set search_path = public as
$$
declare sid uuid := public.my_student_id(); d date := (now() at time zone 'Europe/Istanbul')::date;
begin
  if public.my_role() is distinct from 'student' or sid is null then raise exception 'Yetki yok'; end if;
  if not exists (select 1 from public.study_plans where student_id = sid and enabled) then raise exception 'Çalışma takibi açık değil'; end if;
  insert into public.study_logs (student_id, date, status, note) values (sid, d, 'done', left(coalesce(p_note, ''), 60))
  on conflict (student_id, date) do update set status = 'done', note = excluded.note;
end $$;
revoke all on function public.log_study(text) from anon;
grant execute on function public.log_study(text) to authenticated;

grant select, insert, update, delete on public.study_plans, public.study_logs to authenticated;

-- Anlık güncelleme (öğrenci "çalıştım" deyince öğretmenin ekranı yenilenir)
do $$ declare t text; begin
  foreach t in array array['study_plans', 'study_logs'] loop
    begin execute format('alter publication supabase_realtime add table public.%I', t);
    exception when duplicate_object then null; end;
  end loop;
end $$;

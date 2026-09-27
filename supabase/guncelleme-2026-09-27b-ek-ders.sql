-- EK DERS (programda olmayan, fazladan yapılan ders; ödeme paketini doldurur).
-- Supabase → SQL Editor'de bir kez çalıştırın (tekrar çalıştırmak zararsız).
-- Yalnız YENİ tablo ekler; mevcut hiçbir kayda dokunmaz.
create table if not exists public.extra_lessons (
  id uuid primary key default gen_random_uuid(),
  student_id uuid not null references public.students(id) on delete cascade,
  date date not null,
  time text not null,
  hours numeric not null default 1 check (hours > 0 and hours <= 12),
  note text default '' check (char_length(note) <= 50),
  created_at timestamptz default now()
);
create index if not exists extra_lessons_student_idx on public.extra_lessons(student_id);
alter table public.extra_lessons enable row level security;

drop policy if exists teacher_all on public.extra_lessons;
drop policy if exists parent_read on public.extra_lessons;
create policy teacher_all on public.extra_lessons for all to authenticated using (public.is_teacher()) with check (public.is_teacher());
create policy parent_read on public.extra_lessons for select to authenticated using (public.my_role() = 'parent' and student_id = public.my_student_id());

grant select, insert, update, delete on public.extra_lessons to authenticated;

do $$ begin
  alter publication supabase_realtime add table public.extra_lessons;
exception when duplicate_object then null; when undefined_object then null; end $$;

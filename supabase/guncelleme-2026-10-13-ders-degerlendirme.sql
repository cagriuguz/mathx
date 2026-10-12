-- DERS DEĞERLENDİRMESİ (her ders sonrası öğretmenin 1-5 puanları + not). YALNIZ ÖĞRETMEN görür.
-- Supabase → SQL Editor'de bir kez çalıştırın (tekrar çalıştırmak zararsız).
-- Yalnız YENİ tablo ekler; mevcut hiçbir kayda dokunmaz.
create table if not exists public.lesson_reviews (
  id uuid primary key default gen_random_uuid(),
  student_id uuid not null references public.students(id) on delete cascade,
  date date not null,
  time text not null,
  verim smallint check (verim between 1 and 5),
  calisma smallint check (calisma between 1 and 5),
  gidisat smallint check (gidisat between 1 and 5),
  dikkat smallint check (dikkat between 1 and 5),
  anlama smallint check (anlama between 1 and 5),
  konu text default '' check (char_length(konu) <= 60),
  note text default '' check (char_length(note) <= 200),
  veli_gorusme boolean not null default false,
  created_at timestamptz default now(),
  unique (student_id, date, time)
);
create index if not exists lesson_reviews_student_idx on public.lesson_reviews(student_id);
alter table public.lesson_reviews enable row level security;

drop policy if exists teacher_all on public.lesson_reviews;
create policy teacher_all on public.lesson_reviews for all to authenticated using (public.is_teacher()) with check (public.is_teacher());

grant select, insert, update, delete on public.lesson_reviews to authenticated;

do $$ begin
  alter publication supabase_realtime add table public.lesson_reviews;
exception when duplicate_object then null; when undefined_object then null; end $$;

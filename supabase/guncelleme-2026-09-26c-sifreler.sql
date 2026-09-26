-- Öğrenci/veli şifreleri öğretmen panelinde kalsın. Supabase → SQL Editor'de bir kez çalıştırın (tekrar çalıştırmak zararsız).
-- Veli ve öğrenci bu tabloyu HİÇ okuyamaz: yalnızca öğretmen kuralı (teacher_all) var.
create table if not exists public.logins (
  id uuid primary key default gen_random_uuid(),
  student_id uuid not null unique references public.students(id) on delete cascade,
  student_pw text default '',
  parent_pw text default '',
  updated_at timestamptz default now()
);
alter table public.logins enable row level security;
drop policy if exists teacher_all on public.logins;
create policy teacher_all on public.logins for all to authenticated using (public.is_teacher()) with check (public.is_teacher());
do $$ begin
  alter publication supabase_realtime add table public.logins;
exception when duplicate_object then null; end $$;

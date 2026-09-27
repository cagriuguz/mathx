-- Veliye SESLİ NOT. Supabase → SQL Editor'de bir kez çalıştırın (tekrar çalıştırmak zararsız).
-- Yalnız YENİ tablo ekler; mevcut hiçbir kayda dokunmaz.
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
alter table public.voice_notes enable row level security;

drop policy if exists teacher_all on public.voice_notes;
drop policy if exists parent_read on public.voice_notes;
create policy teacher_all on public.voice_notes for all to authenticated using (public.is_teacher()) with check (public.is_teacher());
create policy parent_read on public.voice_notes for select to authenticated using (public.my_role() = 'parent' and student_id = public.my_student_id());

create or replace function public.mark_voice_heard(p_id uuid) returns void language plpgsql security definer set search_path = public as
$$ begin
  if coalesce(public.my_role(), '') <> 'parent' or not exists(select 1 from public.voice_notes where id = p_id and student_id = public.my_student_id()) then
    raise exception 'Bu nota erişiminiz yok'; end if;
  update public.voice_notes set heard_at = now() where id = p_id and heard_at is null;
end $$;

grant select, insert, update, delete on public.voice_notes to authenticated;
grant execute on function public.mark_voice_heard(uuid) to authenticated;

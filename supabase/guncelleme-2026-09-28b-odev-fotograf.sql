-- ÖDEV FOTOĞRAFLARI. Supabase → SQL Editor'de bir kez çalıştırın (tekrar çalıştırmak zararsız).
-- Yalnız YENİ tablo ekler ve "yaptım" işlevini yeniler; mevcut hiçbir kayda dokunmaz.
-- Öğrenci ödevine en fazla 15 fotoğraf yükler; fotoğrafı olmayan ödev "yapıldı" yapılamaz.
-- Fotoğrafları öğretmen ve veli (kardeşler dahil) görür. "Yaptım" dendikten sonra öğrenci fotoğrafı silemez/ekleyemez.
begin;

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

alter table public.homework_photos enable row level security;
drop policy if exists teacher_all on public.homework_photos;
drop policy if exists parent_read on public.homework_photos;
drop policy if exists student_add on public.homework_photos;
drop policy if exists student_del on public.homework_photos;
create policy teacher_all on public.homework_photos for all to authenticated using (public.is_teacher()) with check (public.is_teacher());
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
grant select, insert, update, delete on public.homework_photos to authenticated;

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

commit;

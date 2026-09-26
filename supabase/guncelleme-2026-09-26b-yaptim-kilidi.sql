-- Öğrenci "Ödevimi yaptım" dedikten sonra geri alamaz. Supabase → SQL Editor'de bir kez çalıştırın (tekrar çalıştırmak zararsız).
create or replace function public.set_homework_done(p_id uuid, p_done boolean) returns void language plpgsql security definer set search_path = public as
$$ begin
  if public.is_teacher() then null;
  elsif public.my_role() = 'student' and exists(select 1 from public.homework where id = p_id and student_id = public.my_student_id()) then
    -- Öğrenci "yaptım" dedikten sonra geri alamaz (kullanıcı kararı); ikinci basış da tarihi değiştirmez
    if not p_done then raise exception 'Yapıldı olarak işaretlenen ödev geri alınamaz'; end if;
    if exists(select 1 from public.homework where id = p_id and done) then return; end if;
  else raise exception 'Bu ödeve erişiminiz yok'; end if;
  update public.homework set done = p_done, done_at = case when p_done then now() else null end,
         seen_done = not p_done, sent_done = false where id = p_id;
end $$;

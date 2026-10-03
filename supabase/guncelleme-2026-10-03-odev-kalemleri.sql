-- MathX güncellemesi (3 Ekim 2026): ödev kalemi başına durum, kullanıcı adı değiştirme, şifre değiştirme, WhatsApp alıcı seçimi.
-- YALNIZ EKLEME / İŞLEV DEĞİŞİMİ: hiçbir tabloda hiçbir kayıt silinmez ya da değişmez. Tekrar çalıştırmak güvenlidir.
-- Supabase → SQL Editor → bu dosyanın tamamını yapıştır → Run. SONRA siteyi yayınla.
begin;

-- 1) Ödev başına WhatsApp alıcısı (otomatik mod): both = veli + öğrenci | parent | student
alter table public.homework add column if not exists wa_to text default 'both';

-- 2) Öğrenci ödev durumunu KALEM KALEM bildirir. items[k] içine status (done/partial/none) ve parent_ok (true/false) yazılır;
--    kitap adı ve sayfalar asla değişmez. Bildirim geri alınamaz (kullanıcı kararı). Fotoğraf artık gerekmez.
create or replace function public.submit_homework(p_id uuid, p_items jsonb) returns void language plpgsql security definer set search_path = public as
$$ declare cur jsonb; n int; i int; merged jsonb := '[]'::jsonb; el jsonb; st text; pok text; begin
  if coalesce(public.my_role(), '') <> 'student'
     or not exists(select 1 from public.homework where id = p_id and student_id = public.my_student_id()) then
    raise exception 'Bu ödeve erişiminiz yok'; end if;
  select items into cur from public.homework where id = p_id and not done for update;
  if cur is null then return; end if; -- zaten bildirilmiş: ikinci basış hiçbir şeyi değiştirmez
  n := jsonb_array_length(cur);
  if jsonb_typeof(p_items) <> 'array' or jsonb_array_length(p_items) <> n then
    raise exception 'Her ödev kalemi için seçim yapılmalı'; end if;
  for i in 0..n - 1 loop
    el := p_items -> i;
    st := el ->> 'status'; pok := el ->> 'parent_ok';
    if coalesce(st, '') not in ('done', 'partial', 'none') then
      raise exception 'Her ödev kalemi için yaptım, eksik yaptım ya da yapmadım seçilmeli'; end if;
    if coalesce(pok, '') not in ('true', 'false') then
      raise exception 'Her ödev kalemi için velinin kontrol etmesi sorusu cevaplanmalı'; end if;
    merged := merged || jsonb_build_array((cur -> i) || jsonb_build_object('status', st, 'parent_ok', pok = 'true'));
  end loop;
  update public.homework set items = merged, done = true, done_at = now(), seen_done = false, sent_done = false where id = p_id;
end $$;

-- Eski sürüm telefonlarda açık kalmış olabilir: eski işlev fotoğraf şartı olmadan çalışır.
create or replace function public.set_homework_done(p_id uuid, p_done boolean) returns void language plpgsql security definer set search_path = public as
$$ begin
  if public.is_teacher() then null;
  elsif public.my_role() = 'student' and exists(select 1 from public.homework where id = p_id and student_id = public.my_student_id()) then
    if not p_done then raise exception 'Yapıldı olarak işaretlenen ödev geri alınamaz'; end if;
    if exists(select 1 from public.homework where id = p_id and done) then return; end if;
  else raise exception 'Bu ödeve erişiminiz yok'; end if;
  update public.homework set done = p_done, done_at = case when p_done then now() else null end,
         seen_done = not p_done, sent_done = false where id = p_id;
end $$;

-- 3) Fotoğraf yükleme özelliği kaldırıldı: öğrenci artık ekleyemez/silemez. Daha önce yüklenmiş fotoğraflara DOKUNULMAZ.
drop policy if exists student_add on public.homework_photos;
drop policy if exists student_del on public.homework_photos;

-- 4) Öğretmen bir öğrencinin ya da velinin KULLANICI ADINI değiştirir (şifre aynı kalır; giriş yeni adla yapılır)
create or replace function public.rename_account(p_old text, p_new text) returns void language plpgsql security definer set search_path = public as
$$ declare uid uuid; ne text; begin
  if not public.is_teacher() then raise exception 'Yetki yok'; end if;
  if p_new !~ '^[a-z0-9][a-z0-9._]{2,29}$' then raise exception 'Kullanıcı adı 3-30 karakter olmalı (harf, rakam, nokta, alt çizgi)'; end if;
  select user_id into uid from public.profiles where username = p_old and role <> 'teacher';
  if uid is null then raise exception 'Hesap bulunamadı'; end if;
  if p_new = p_old then return; end if;
  ne := p_new || '@kullanici.mathx.app';
  if exists(select 1 from public.profiles where username = p_new) or exists(select 1 from auth.users where email = ne) then
    raise exception 'Bu kullanıcı adı zaten kullanılıyor'; end if;
  update auth.users set email = ne where id = uid;
  if to_regclass('auth.identities') is not null then
    begin
      execute 'update auth.identities set identity_data = jsonb_set(identity_data, ''{email}'', to_jsonb($1::text)), provider_id = $1 where user_id = $2 and provider = ''email'''
        using ne, uid;
    exception when others then null; end;
  end if;
  update public.profiles set username = p_new where user_id = uid;
  update public.students set student_username = p_new where student_username = p_old;
  update public.students set parent_username = p_new where parent_username = p_old;
end $$;

-- 5) Veli/öğrenci kendi şifresini değiştirince öğretmenin panelindeki ESKİ şifre kaydı boşaltılır
--    (yanlış şifre göstermesin; öğretmen gerekirse yeni şifre oluşturur). Hesaplara dokunmaz.
create or replace function public.password_changed() returns void language plpgsql security definer set search_path = public as
$$ begin
  if public.my_role() = 'student' then
    update public.logins set student_pw = '', updated_at = now() where student_id = public.my_student_id();
  elsif public.my_role() = 'parent' then
    update public.logins set parent_pw = '', updated_at = now() where student_id in (select public.my_student_ids());
  end if;
end $$;

revoke all on function public.rename_account(text, text) from anon;
revoke all on function public.submit_homework(uuid, jsonb) from anon;
revoke all on function public.password_changed() from anon;
grant execute on function public.rename_account(text, text) to authenticated;
grant execute on function public.submit_homework(uuid, jsonb) to authenticated;
grant execute on function public.password_changed() to authenticated;

commit;

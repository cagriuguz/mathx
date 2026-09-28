-- KARDEŞLER (tek veli hesabı → birden çok öğrenci; tek kullanıcı adı + tek şifre).
-- Supabase → SQL Editor'de bir kez çalıştırın (tekrar çalıştırmak zararsız).
-- MEVCUT HİÇBİR KAYDA DOKUNMAZ: yalnız yeni tablo (parent_links) ve yeni işlevler ekler,
-- velilerin okuma kurallarını "tek öğrenci" yerine "öğrencisi + bağlı kardeşleri" olarak yeniler.
-- Kardeş bağlanmadıkça her veli bugün gördüğünün AYNISINI görür.
begin;

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


-- Giriş yapan kişinin görebileceği öğrenciler: kendi öğrencisi + (veliyse) bağlı kardeşler
create or replace function public.my_student_ids() returns setof uuid language sql stable security definer set search_path = public as
$$ select student_id from public.profiles where user_id = auth.uid() and student_id is not null
   union
   select l.student_id from public.parent_links l join public.profiles p on p.user_id = l.user_id and p.role = 'parent'
   where l.user_id = auth.uid() $$;


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


-- Veli sesli notu dinleyince "dinlendi" işareti (yalnız kendi öğrencisininki; başka alan değişmez)
create or replace function public.mark_voice_heard(p_id uuid) returns void language plpgsql security definer set search_path = public as
$$ begin
  if coalesce(public.my_role(), '') <> 'parent' or not exists(select 1 from public.voice_notes where id = p_id and student_id in (select public.my_student_ids())) then
    raise exception 'Bu nota erişiminiz yok'; end if;
  update public.voice_notes set heard_at = now() where id = p_id and heard_at is null;
end $$;


revoke all on function public.link_sibling(uuid, uuid) from anon;
revoke all on function public.unlink_sibling(uuid, uuid) from anon;
grant execute on function public.my_student_ids() to authenticated;
grant execute on function public.link_sibling(uuid, uuid) to authenticated;
grant execute on function public.unlink_sibling(uuid, uuid) to authenticated;
revoke all on function public.cancel_parent_account(uuid, uuid) from anon;
grant execute on function public.cancel_parent_account(uuid, uuid) to authenticated;

alter table public.parent_links enable row level security;
drop policy if exists teacher_all on public.parent_links;
create policy teacher_all on public.parent_links for all to authenticated using (public.is_teacher()) with check (public.is_teacher());
grant select, insert, update, delete on public.parent_links to authenticated;

drop policy if exists parent_read on public.students;
drop policy if exists parent_read on public.schedules;
drop policy if exists parent_read on public.plans;
drop policy if exists parent_read on public.marks;
drop policy if exists parent_read on public.payments;
drop policy if exists parent_read on public.voice_notes;
drop policy if exists parent_read on public.extra_lessons;
drop policy if exists parent_read on public.homework;
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

commit;

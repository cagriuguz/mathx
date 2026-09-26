-- Kitaplar öğrenciye özel olsun. Supabase → SQL Editor'de bir kez çalıştırın (tekrar çalıştırmak zararsız).
-- Mevcut kitaplar SİLİNMEZ: öğrencisi boş kalır ("atanmamış"), Ödevler → Kitaplar'dan istediğiniz öğrenciye atanır.
alter table public.books add column if not exists student_id uuid references public.students(id) on delete cascade;
create index if not exists books_student_idx on public.books(student_id);

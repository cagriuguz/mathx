// Kitaplar öğrenciye özeldir: her kitap satırı bir öğrenciye bağlıdır (student_id).
// student_id'si boş olanlar eski ortak listeden kalan "atanmamış" kitaplardır; ödev ekranında görünmez.

const key = (name) => String(name || '').trim().replace(/\s+/g, ' ').toLocaleLowerCase('tr');
const byName = (a, b) => a.name.localeCompare(b.name, 'tr');

export const cleanBookName = (name) => String(name || '').trim().replace(/\s+/g, ' ');

/** Öğrencinin kitapları (gizliler hariç istenirse), ada göre sıralı */
export function studentBooks(books, studentId, { onlyActive = false } = {}) {
  if (!studentId) return [];
  return books.filter((b) => b.student_id === studentId && (!onlyActive || b.active !== false)).sort(byName);
}

export function unassignedBooks(books) {
  return books.filter((b) => !b.student_id).sort(byName);
}

/** Aynı öğrencide aynı adlı kitap var mı (büyük/küçük harf ve boşluk farkı sayılmaz) */
export function hasBook(books, studentId, name) {
  const k = key(name);
  return books.some((b) => b.student_id === studentId && key(b.name) === k);
}

/** Yazarken öneri: başka öğrencilere verilmiş kitap adları (tekrarsız), bu öğrencide olmayanlar */
export function bookSuggestions(books, studentId) {
  const seen = new Map();
  for (const b of books) if (!seen.has(key(b.name))) seen.set(key(b.name), b.name);
  return [...seen.entries()].filter(([k]) => !books.some((b) => b.student_id === studentId && key(b.name) === k)).map(([, n]) => n).sort((a, b) => a.localeCompare(b, 'tr'));
}

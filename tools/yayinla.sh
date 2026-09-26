#!/bin/zsh
# MathX sitesini GitHub Pages'e yayınlar (iPhone ve bilgisayar için adres: https://cagriuguz.github.io/mathx/).
# İlk çalıştırmada depoyu oluşturur; sonraki çalıştırmalar yalnızca siteyi günceller.
set -e
cd "$(dirname "$0")/.."

echo "1/4 Testler…"
node --test tests/ 2>&1 | grep -E "ℹ (pass|fail)"

echo "2/4 Derleme…"
npx vite build >/dev/null
touch dist/.nojekyll

echo "3/4 Kaynak kod GitHub'a…"
if ! gh repo view cagriuguz/mathx >/dev/null 2>&1; then
  gh repo create cagriuguz/mathx --public --description "MathX: ders, ödev ve ödeme takibi" --source . --push
else
  git push -q origin HEAD:main 2>/dev/null || git push -q origin HEAD
fi

echo "4/4 Site yayını…"
TMP=$(mktemp -d)
cp -R dist/. "$TMP"
(cd "$TMP" && git init -q && git checkout -q -b gh-pages && git add -A \
  && git -c user.name="Çağrı Uğuz" -c user.email="cagriuguz@gmail.com" commit -qm "Site güncellemesi" \
  && git push -qf https://github.com/cagriuguz/mathx.git gh-pages)
rm -rf "$TMP"
gh api -X POST repos/cagriuguz/mathx/pages -f "source[branch]=gh-pages" -f "source[path]=/" >/dev/null 2>&1 || true

echo ""
echo "Tamam. Site 1-2 dakika içinde açılır: https://cagriuguz.github.io/mathx/"

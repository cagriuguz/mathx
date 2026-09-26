// supabase/functions/wa-send/kaynak.js + src/core/* → tek dosya index.ts (Supabase panelinde yapıştırılabilir).
import { build } from 'rolldown';
const at = (p) => new URL(p, import.meta.url).pathname;
await build({
  input: at('../supabase/functions/wa-send/kaynak.js'),
  external: [/^jsr:/, /^npm:/],
  output: {
    file: at('../supabase/functions/wa-send/index.ts'), format: 'esm',
    banner: '// OTOMATİK ÜRETİLDİ — düzenlemeyin. Kaynak: kaynak.js (node tools/wa_fonksiyon.mjs)',
  },
});
console.log('index.ts üretildi');

"""MathX logosunu (public/logo.svg ile aynı çizim) PNG olarak üretir: PWA, iPhone ve Android simgeleri."""
from pathlib import Path
from PIL import Image, ImageDraw

ROOT = Path(__file__).resolve().parent.parent
INK, BRASS, PAPER = (22, 35, 59), (201, 162, 102), (245, 246, 248)


def bezier(p0, p1, p2, n=400):
    return [((1 - t) ** 2 * p0[0] + 2 * (1 - t) * t * p1[0] + t * t * p2[0],
             (1 - t) ** 2 * p0[1] + 2 * (1 - t) * t * p1[1] + t * t * p2[1]) for t in (i / n for i in range(n + 1))]


def draw(size, rounded=True, pad=0.0):
    S = 4 * size  # yüksek çözünürlükte çiz, sonra küçült (yumuşak kenar)
    img = Image.new('RGBA', (S, S), (0, 0, 0, 0))
    d = ImageDraw.Draw(img)
    if rounded:
        d.rounded_rectangle((0, 0, S - 1, S - 1), radius=int(S * 116 / 512), fill=INK)
    else:
        d.rectangle((0, 0, S, S), fill=INK)
    k = S / 512 * (1 - 2 * pad)
    o = S * pad
    P = lambda x, y: (o + x * k, o + y * k)
    w = max(2, int(30 * k))
    for pts, col in (((150, 124), (362, 256), (150, 388)), BRASS), (((362, 124), (150, 256), (362, 388)), PAPER):
        # Eğri boyunca sık aralıklı daireler: kırıksız, uçları yuvarlak kalın çizgi
        for x, y in bezier(P(*pts[0]), P(*pts[1]), P(*pts[2]), n=3000):
            d.ellipse((x - w / 2, y - w / 2, x + w / 2, y + w / 2), fill=col)
    cx, cy = P(256, 256)
    r = 15 * k
    d.ellipse((cx - r, cy - r, cx + r, cy + r), fill=BRASS)
    return img.resize((size, size), Image.LANCZOS)


pub = ROOT / 'public'
draw(192).save(pub / 'icon-192.png')
draw(512).save(pub / 'icon-512.png')
draw(180, rounded=False).save(pub / 'apple-touch-icon.png')
# Android "maskable": tam dolu kare, logo güvenli bölgede (telefon kenarları kendi şekliyle kırpar)
draw(512, rounded=False, pad=0.12).save(pub / 'icon-maskable-512.png')

# iPhone açılış görselleri: simgeye dokununca beyaz ekran yerine lacivert zemin + parıltılı logo
IPHONES = [  # (nokta genişlik, yükseklik, piksel oranı)
    (440, 956, 3), (430, 932, 3), (428, 926, 3), (420, 912, 3), (414, 896, 3), (414, 896, 2), (402, 874, 3),
    (393, 852, 3), (390, 844, 3), (375, 812, 3), (414, 736, 3), (375, 667, 2),
]
from PIL import ImageFilter
spl = pub / 'splash'
spl.mkdir(exist_ok=True)
for old in spl.glob('*.png'):
    old.unlink()
tags = []
for w, h, r in IPHONES:
    W, H = w * r, h * r
    bg = Image.new('RGB', (W, H), (18, 29, 51))
    glow = Image.new('RGBA', (W, H), (0, 0, 0, 0))
    gd = ImageDraw.Draw(glow)
    R = int(W * 0.42)
    gd.ellipse((W // 2 - R, H // 2 - R - int(H * 0.04), W // 2 + R, H // 2 + R - int(H * 0.04)), fill=(201, 162, 102, 70))
    glow = glow.filter(ImageFilter.GaussianBlur(W * 0.12))
    bg.paste(glow, (0, 0), glow)
    size = int(W * 0.30)
    logo = draw(size)
    bg.paste(logo, ((W - size) // 2, (H - size) // 2 - int(H * 0.04)), logo)
    name = f'iphone-{W}x{H}.png'
    bg.save(spl / name, optimize=True)
    tags.append(f'    <link rel="apple-touch-startup-image" media="(device-width: {w}px) and (device-height: {h}px) and (-webkit-device-pixel-ratio: {r}) and (orientation: portrait)" href="./splash/{name}" />')

html = ROOT / 'index.html'
t = html.read_text()
a, b = '    <!-- iphone-acilis -->\n', '    <!-- /iphone-acilis -->\n'
block = a + '\n'.join(tags) + '\n' + b
t = t[:t.index(a)] + block + t[t.index(b) + len(b):] if a in t else t.replace('    <link rel="manifest"', block + '    <link rel="manifest"')
html.write_text(t)

res = ROOT / 'android/app/src/main/res'
if res.exists():
    for folder, px in {'mdpi': 48, 'hdpi': 72, 'xhdpi': 96, 'xxhdpi': 144, 'xxxhdpi': 192}.items():
        d = res / f'mipmap-{folder}'
        draw(px).save(d / 'ic_launcher.png')
        draw(px).save(d / 'ic_launcher_round.png')
        fg = int(px * 108 / 48)
        draw(fg, rounded=False, pad=0.0).save(d / 'ic_launcher_foreground.png')
    bg = res / 'values/ic_launcher_background.xml'
    bg.write_text('<?xml version="1.0" encoding="utf-8"?>\n<resources>\n    <color name="ic_launcher_background">#16233B</color>\n</resources>\n')
print('simgeler hazır')

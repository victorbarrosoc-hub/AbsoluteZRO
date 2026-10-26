"""
Ícones da Absolute ZRO com a marca flat (26/10/2026): anel com a centelha de 4 pontas por trás do traço, uma cor só.

Desenha a marca direto da geometria (a mesma de `vetor/vetorizar.py`), em 4× e reduzida, sem depender de arte em PNG.
Abaixo de 24 px fica só o anel, com traço reforçado; de 24 a 48 px o traço engrossa para não sumir.

    python3 scripts/marca/icones.py             # gera out/claro e out/escuro
    python3 scripts/marca/icones.py --instalar  # e copia para o HUB (app/, public/icons, public/brand)
    cd apps/hub-desktop && npm run icons -- ../../scripts/marca/out/claro   # app de computador

Precisa de Pillow e numpy.
"""
import os
import shutil
import sys

import numpy as np
from PIL import Image, ImageChops, ImageDraw, ImageFilter

AQUI = os.path.dirname(os.path.abspath(__file__))
RAIZ = os.path.abspath(os.path.join(AQUI, '../..'))
SS = 4  # superamostragem

TEMAS = {
    # corpo (topo, base) e cor da marca
    'claro': {'topo': (253, 253, 254), 'base': (235, 236, 240), 'marca': (29, 29, 31)},
    'escuro': {'topo': (30, 30, 33), 'base': (8, 8, 10), 'marca': (255, 255, 255)},
}


def bezier(p0, p1, p2, p3, n=40):
    t = np.linspace(0, 1, n)[:, None]
    return ((1 - t) ** 3) * p0 + 3 * ((1 - t) ** 2) * t * p1 + 3 * (1 - t) * t**2 * p2 + t**3 * p3


def centelha(cx, cy, h, w):
    """Mesmas curvas do SVG (desenho aprovado: meia-altura 12, meia-largura 25)."""
    a, b = h / 12, w / 25
    P = lambda x, y: np.array([cx + x * b, cy + y * a])
    segs = [
        (P(0, -12), P(1.2, -3), P(4, -1.2), P(25, 0)),
        (P(25, 0), P(4, 1.2), P(1.2, 3), P(0, 12)),
        (P(0, 12), P(-1.2, 3), P(-4, 1.2), P(-25, 0)),
        (P(-25, 0), P(-4, -1.2), P(-1.2, -3), P(0, -12)),
    ]
    return [tuple(pt) for s in segs for pt in bezier(*s)]


def marca(size, cor, diametro=0.5, traco=None, so_anel=None, deslocar=True):
    """Marca em RGBA transparente. `diametro`: diâmetro externo do anel em fração do quadro."""
    S = size * SS
    im = Image.new('RGBA', (S, S), (0, 0, 0, 0))
    d = ImageDraw.Draw(im)
    so_anel = size < 24 if so_anel is None else so_anel
    ro = S * diametro / 2
    # proporção aprovada: traço = 0,29 do raio do eixo; abaixo de 64 px o traço engrossa
    t = traco if traco is not None else (0.26 if size >= 64 else 0.30 if size >= 32 else 0.36) * ro
    r = ro - t / 2
    # centro óptico: o conjunto anel + centelha fica no meio do quadro
    cx = S / 2 - (0 if so_anel or not deslocar else r * 0.69 * 0.45)
    cy = S / 2
    if not so_anel:
        d.polygon(centelha(cx + r, cy, r * 0.333, r * 0.694), fill=cor)
    d.ellipse((cx - ro, cy - ro, cx + ro, cy + ro), outline=cor, width=int(round(t)))
    return im.resize((size, size), Image.LANCZOS)


def corpo(size, tema):
    T = TEMAS[tema]
    t = np.linspace(0, 1, size)[:, None, None]
    arr = np.array(T['topo']) * (1 - t) + np.array(T['base']) * t
    return Image.fromarray(np.broadcast_to(arr, (size, size, 3)).astype(np.uint8)).convert('RGBA')


def placa(size, tema, diametro=0.5, **kw):
    im = corpo(size, tema)
    im.alpha_composite(marca(size, TEMAS[tema]['marca'] + (255,), diametro, **kw))
    return im


def superelipse(size, n=5.0):
    S = size * SS
    y, x = np.mgrid[0:S, 0:S]
    u = np.abs((x + 0.5) / S * 2 - 1)
    v = np.abs((y + 0.5) / S * 2 - 1)
    return Image.fromarray(((u**n + v**n) <= 1).astype(np.uint8) * 255).resize((size, size), Image.LANCZOS)


def arredondado(size, raio):
    m = Image.new('L', (size * SS, size * SS), 0)
    ImageDraw.Draw(m).rounded_rectangle((0, 0, size * SS - 1, size * SS - 1), radius=int(size * SS * raio), fill=255)
    return m.resize((size, size), Image.LANCZOS)


def mac(tema):
    """Grid da Apple: 824 dentro de 1024, sombra suave e contorno de luz de 10%."""
    S = 824
    inner = placa(S, tema, 0.5)
    mask = superelipse(S)
    inner.putalpha(mask)
    canvas = Image.new('RGBA', (1024, 1024), (0, 0, 0, 0))
    shm = Image.new('L', (1024, 1024), 0)
    shm.paste(mask, (100, 112))
    sh = Image.new('RGBA', (1024, 1024), (0, 0, 0, 255))
    sh.putalpha(shm.point(lambda v: int(v * 0.4)).filter(ImageFilter.GaussianBlur(22)))
    canvas = Image.alpha_composite(canvas, sh)
    canvas.alpha_composite(inner, (100, 100))
    mo = Image.new('L', (1024, 1024), 0)
    mo.paste(mask, (100, 100))
    mi = Image.new('L', (1024, 1024), 0)
    mi.paste(superelipse(S - 4), (102, 102))
    borda = ImageChops.subtract(mo, mi).point(lambda v: int(v * (0.10 if tema == 'escuro' else 0.06)))
    luz = (255, 255, 255) if tema == 'escuro' else (0, 0, 0)
    return Image.alpha_composite(canvas, Image.merge('RGBA', (*Image.new('RGB', (1024, 1024), luz).split(), borda)))


def windows(tema):
    win = placa(1024, tema, 0.5)
    win.putalpha(arredondado(1024, 0.2))
    return win


def pequeno(size, tema, raio=0.22):
    im = placa(size, tema, 0.62 if size < 24 else 0.58)
    im.putalpha(arredondado(size, raio))
    return im


def gerar(tema):
    out = os.path.join(AQUI, 'out', tema)
    os.makedirs(out, exist_ok=True)
    cheio = placa(1024, tema, 0.5)
    cheio.convert('RGB').save(f'{out}/icon-1024.png')
    cheio.convert('RGB').resize((180, 180), Image.LANCZOS).save(f'{out}/apple-icon.png')
    for s in (192, 512):
        cheio.convert('RGB').resize((s, s), Image.LANCZOS).save(f'{out}/icon-{s}.png')
    placa(1024, tema, 0.38).convert('RGB').resize((512, 512), Image.LANCZOS).save(f'{out}/icon-maskable-512.png')
    mac(tema).save(f'{out}/mac-icon-1024.png')
    win = windows(tema)
    win.save(f'{out}/win-icon-1024.png')
    tamanhos = [16, 24, 32, 48, 64, 128, 256]
    imgs = [pequeno(s, tema, 0.2) if s <= 48 else win.resize((s, s), Image.LANCZOS) for s in tamanhos]
    imgs[-1].save(f'{out}/icon.ico', sizes=[(s, s) for s in tamanhos], append_images=imgs[:-1])
    fav = [pequeno(s, tema, 0.24) for s in (16, 32, 48)]
    fav[2].save(f'{out}/favicon.ico', sizes=[(16, 16), (32, 32), (48, 48)], append_images=fav[:2])
    pequeno(64, tema, 0.24).save(f'{out}/favicon-64.png')
    return out


def instalar(claro, escuro):
    web = os.path.join(RAIZ, 'apps/hub-web')
    copias = [
        (f'{claro}/icon-1024.png', 'app/icon.png', 512),
        (f'{claro}/apple-icon.png', 'app/apple-icon.png', None),
        # favicon: placa escura com a marca branca, legível na aba clara e na escura
        (f'{escuro}/favicon.ico', 'app/favicon.ico', None),
        (f'{claro}/icon-192.png', 'public/icons/icon-192.png', None),
        (f'{claro}/icon-512.png', 'public/icons/icon-512.png', None),
        (f'{claro}/icon-maskable-512.png', 'public/icons/icon-maskable-512.png', None),
        (f'{claro}/icon-1024.png', 'public/brand/app-icon-1024.png', None),
        (f'{escuro}/icon-1024.png', 'public/brand/app-icon-escuro-1024.png', None),
        (f'{claro}/mac-icon-1024.png', 'public/brand/app-icon-mac-1024.png', None),
        (f'{escuro}/mac-icon-1024.png', 'public/brand/app-icon-mac-escuro-1024.png', None),
        (f'{claro}/win-icon-1024.png', 'public/brand/app-icon-windows-1024.png', None),
        (f'{escuro}/win-icon-1024.png', 'public/brand/app-icon-windows-escuro-1024.png', None),
    ]
    for src, dst, size in copias:
        dst = os.path.join(web, dst)
        if size:
            Image.open(src).resize((size, size), Image.LANCZOS).save(dst)
        else:
            shutil.copyfile(src, dst)
        print('→', os.path.relpath(dst, RAIZ))


if __name__ == '__main__':
    claro, escuro = gerar('claro'), gerar('escuro')
    if '--instalar' in sys.argv:
        instalar(claro, escuro)
    print('ok')

# Tira o fundo chapado das fotos dos aparelhos (public/brand/produto-*.webp) e grava com transparência, para a foto
# assentar em qualquer fundo do site (cartão com degradê, tema escuro) sem o retângulo preto ou branco atrás.
# A máscara vem do molde (aparelhos-{claro,escuro}-verde.png), não da foto: as telas verdes e o corpo dos aparelhos
# ficam opacos mesmo quando a tela mostrada é escura; fora deles, sombra e reflexo viram meia-transparência (cor para
# alfa, como no GIMP). Os recortes são os mesmos de produtos.py.
# Uso: python3 transparente.py   (refaz todos os produto-*-{claro,escuro}.webp que ainda não têm transparência)
import glob, os
import numpy as np
from PIL import Image, ImageFilter
from scipy import ndimage

A = os.path.dirname(os.path.abspath(__file__))
BRAND = os.path.join(A, '..', '..', '..', 'apps', 'hub-web', 'public', 'brand')
RECORTE_HUB = (144, 10, 2544, 1510)
RECORTE_APP = (340, 150, 2300, 1340)


def alfa_do_molde(tema):
    t = np.asarray(Image.open(f'{A}/aparelhos-{tema}-verde.png').convert('RGB')).astype(np.float64)
    borda = np.concatenate([t[:4].reshape(-1, 3), t[-4:].reshape(-1, 3), t[:, :4].reshape(-1, 3), t[:, -4:].reshape(-1, 3)])
    b = np.median(borda, axis=0)
    escuro = b.mean() < 128
    if escuro:
        alfa = np.max(np.clip((t - b) / np.maximum(255 - b, 1), 0, 1), axis=2)
    else:
        alfa = np.max(np.clip((b - t) / np.maximum(b, 1), 0, 1), axis=2)
    alfa[alfa < 0.02] = 0
    verde = (t[..., 1] > 150) & (t[..., 1] - t[..., 0] > 60) & (t[..., 1] - t[..., 2] > 60)
    corpo = (alfa > (0.12 if escuro else 0.06)) | verde
    lab, n = ndimage.label(corpo)
    tam = ndimage.sum(corpo, lab, range(1, n + 1))
    corpo = ndimage.binary_fill_holes(np.isin(lab, np.argsort(tam)[::-1][:2] + 1))
    corpo = ndimage.binary_opening(corpo, iterations=2)
    macio = np.asarray(Image.fromarray((corpo * 255).astype(np.uint8)).filter(ImageFilter.GaussianBlur(1.2))) / 255.0
    return np.maximum(alfa, macio), macio, b


def aplicar(caminho, alfa_t, macio_t, b, recorte, tamanho):
    im = Image.open(caminho).convert('RGB')
    a = np.asarray(im).astype(np.float64)
    corta = lambda m: np.asarray(Image.fromarray((m * 255).astype(np.uint8)).crop(recorte).resize(tamanho, Image.LANCZOS)) / 255.0
    alfa, macio = corta(alfa_t), corta(macio_t)
    if alfa.shape != a.shape[:2]:
        raise SystemExit(f'{caminho}: tamanho {a.shape[:2]} não bate com o recorte {alfa.shape}')
    alfa[alfa < 0.02] = 0
    # tira o fundo misturado na sombra e no reflexo; dentro dos aparelhos a cor fica a original
    cor = np.where(alfa[..., None] > 0, b + (a - b) / np.maximum(alfa[..., None], 1e-6), 0)
    cor = np.where(macio[..., None] > 0.98, a, cor)
    rgba = np.dstack([np.clip(cor, 0, 255), alfa * 255]).astype(np.uint8)
    Image.fromarray(rgba, 'RGBA').save(caminho, quality=88, alpha_quality=90, method=6)
    print(os.path.basename(caminho))


for tema in ('claro', 'escuro'):
    alfa_t, macio_t, b = alfa_do_molde(tema)
    for f in sorted(glob.glob(os.path.join(BRAND, f'produto-*-{tema}.webp'))):
        if Image.open(f).mode == 'RGBA':
            print('já transparente', os.path.basename(f))
            continue
        hub = os.path.basename(f).startswith('produto-hub-')
        w, h = Image.open(f).size
        aplicar(f, alfa_t, macio_t, b, RECORTE_HUB if hub else RECORTE_APP, (w, h))

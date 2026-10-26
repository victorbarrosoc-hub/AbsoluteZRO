"""
Vetoriza as letras do wordmark oficial (ABSOLUTE ZR) a partir de `wordmark-original.png` (a arte oficial com o feixe de luz)
e monta a marca flat aprovada em 26/10/2026: anel com centelha de 4 pontas centrada na borda, por trás do traço
(só as pontas horizontais aparecem). Gera os SVG mestres em `apps/hub-web/public/brand/`.

    pip install potracer pillow numpy && python3 scripts/marca/vetor/vetorizar.py
"""
import os
import numpy as np
import potrace
from PIL import Image, ImageFilter

RAIZ = os.path.abspath(os.path.join(os.path.dirname(__file__), '../../..'))
FONTE = os.path.join(os.path.dirname(os.path.abspath(__file__)), 'wordmark-original.png')  # arte oficial (feixe), só fonte
SAIDA = os.path.join(RAIZ, 'apps/hub-web/public/brand')

# Geometria da marca (unidades do wordmark original, 1520×198). Proporções do símbolo aprovado (opção C):
# traço = 0,29 do raio; centelha com meia-altura 0,33 r (some dentro do traço) e meia-largura 0,69 r.
CX, CY, R, TRACO = 1318.0, 97.5, 49.0, 14.0
MEIA_ALTURA, MEIA_LARGURA = 16.3, 34.0
UP = 6


def centelha(cx: float, cy: float, h: float, w: float) -> str:
    """Estrela de 4 pontas (curvas côncavas). Na marca flat a meia-altura fica escondida pelo traço do anel."""
    a, b = h / 12, w / 25  # escala a partir do desenho aprovado (meia-altura 12, meia-largura 25)
    p = lambda x, y: f'{cx + x * b:.2f} {cy + y * a:.2f}'
    return (
        f'M{p(0, -12)}C{p(1.2, -3)} {p(4, -1.2)} {p(25, 0)}C{p(4, 1.2)} {p(1.2, 3)} {p(0, 12)}'
        f'C{p(-1.2, 3)} {p(-4, 1.2)} {p(-25, 0)}C{p(-4, -1.2)} {p(-1.2, -3)} {p(0, -12)}Z'
    )


def anel(cx: float, cy: float, r: float, t: float) -> str:
    """Anel como forma preenchida (evenodd), para funcionar em qualquer ferramenta, sem depender de stroke."""
    ro, ri = r + t / 2, r - t / 2
    c = lambda rr: f'M{cx - rr:.2f} {cy:.2f}a{rr:.2f} {rr:.2f} 0 1 0 {2 * rr:.2f} 0a{rr:.2f} {rr:.2f} 0 1 0 {-2 * rr:.2f} 0Z'
    return c(ro) + c(ri)


def letras() -> str:
    # Ampliar 6× e suavizar antes do limiar tira o serrilhado do PNG (198 px de altura) e deixa as retas limpas.
    img = Image.open(FONTE).convert('L')
    img = img.resize((img.width * UP, img.height * UP), Image.LANCZOS).filter(ImageFilter.GaussianBlur(UP * 0.9))
    L = np.asarray(img).astype(float)
    L[:, 1245 * UP :] = 0  # o O original (feixe de luz) sai; entra o anel desenhado
    bm = potrace.Bitmap(L <= 150)  # o potracer inverte: passa o fundo para traçar as letras
    path = bm.trace(turdsize=40, alphamax=0.75, opticurve=True, opttolerance=0.6)
    q = lambda pt: f'{pt.x / UP:.2f} {pt.y / UP:.2f}'
    out = []
    for curve in path:
        d = [f'M{q(curve.start_point)}']
        for seg in curve.segments:
            if seg.is_corner:
                d.append(f'L{q(seg.c)}L{q(seg.end_point)}')
            else:
                d.append(f'C{q(seg.c1)} {q(seg.c2)} {q(seg.end_point)}')
        out.append(''.join(d) + 'Z')
    return ''.join(out)


# Símbolo: quadro 100×100 com o anel um pouco à esquerda, para a centelha caber inteira.
S_CX, S_CY, S_R, S_T = 44.0, 50.0, 30.0, 8.6
SIMBOLO = {
    'viewBox': '0 0 100 100',
    'centelha': centelha(S_CX + S_R, S_CY, MEIA_ALTURA * S_R / R, MEIA_LARGURA * S_R / R),
    'anel': anel(S_CX, S_CY, S_R, S_T),
}


def wordmark() -> dict:
    x0, y0, x1, y1 = 70, 36, 1410, 160
    return {
        'viewBox': f'{x0} {y0} {x1 - x0} {y1 - y0}',
        'letras': letras(),
        'centelha': centelha(CX + R, CY, MEIA_ALTURA, MEIA_LARGURA),
        'anel': anel(CX, CY, R, TRACO),
    }


def svg(m: dict, cor: str = 'currentColor') -> str:
    letras = f'<path fill="{cor}" d="{m["letras"]}"/>' if 'letras' in m else ''
    return (
        f'<svg xmlns="http://www.w3.org/2000/svg" viewBox="{m["viewBox"]}" role="img" aria-label="Absolute ZRO">{letras}'
        f'<path fill="{cor}" d="{m["centelha"]}"/><path fill="{cor}" fill-rule="evenodd" d="{m["anel"]}"/></svg>\n'
    )


def modulo_ts(w: dict) -> str:
    q = lambda d: '{ ' + ', '.join(f"{k}: '{v}'" for k, v in d.items()) + ' }'
    return (
        '// Gerado por scripts/marca/vetor/vetorizar.py. Não edite à mão.\n'
        '// Marca flat Absolute ZRO (26/10/2026): anel com a centelha de 4 pontas por trás do traço.\n'
        f'export const ZRO_SIMBOLO = {q(SIMBOLO)} as const\n'
        f'export const ZRO_WORDMARK = {q(w)} as const\n'
    )


if __name__ == '__main__':
    w = wordmark()
    arquivos = {
        'absolute-zro-simbolo.svg': svg(SIMBOLO),
        'absolute-zro-simbolo-grafite.svg': svg(SIMBOLO, '#1d1d1f'),
        'absolute-zro-simbolo-branco.svg': svg(SIMBOLO, '#ffffff'),
        'absolute-zro.svg': svg(w),
        'absolute-zro-grafite.svg': svg(w, '#1d1d1f'),
        'absolute-zro-branco.svg': svg(w, '#ffffff'),
    }
    with open(os.path.join(RAIZ, 'packages/ui/src/marca.ts'), 'w') as f:
        f.write(modulo_ts(w))
    for nome, svg in arquivos.items():
        with open(os.path.join(SAIDA, nome), 'w') as f:
            f.write(svg)
        print(nome, len(svg), 'bytes')

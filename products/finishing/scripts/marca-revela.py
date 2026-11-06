# REVELAFILM · marca (titular, 04/11/2026): o símbolo é o quadro revelando (um fotograma de cantos arredondados:
# listras finas à esquerda, a imagem latente, que engrossam até o bloco cheio à direita, a imagem revelada) e a
# palavra REVELAFILM em Figtree, REVELA fina (Light) e FILM pesada (ExtraBold), lado a lado. A palavra sai em contorno da própria fonte (fontes/), então os SVG não dependem de fonte.
# Uso: python3 -I scripts/marca-revela.py  (precisa de fontTools). Depois: node scripts/icones-app.mjs e
# node scripts/marca-png.mjs para os PNG.
import pathlib
from fontTools.ttLib import TTFont
from fontTools.varLib.instancer import instantiateVariableFont
from fontTools.pens.svgPathPen import SVGPathPen
from fontTools.pens.transformPen import TransformPen
from fontTools.pens.boundsPen import BoundsPen

RAIZ = pathlib.Path(__file__).resolve().parent.parent
MARCA = RAIZ / 'marca'
FONTE = RAIZ / 'fontes/figtree-latin-wght-normal.woff2'

TINTA = {'escuro': '#ffffff', 'claro': '#111111'}
ESPACO = 60  # entreletra de 0,06 em, como no título


def contorno(texto, peso, x=0):
    f = instantiateVariableFont(TTFont(FONTE), {'wght': peso})
    gs, cmap, hmtx = f.getGlyphSet(), f.getBestCmap(), f['hmtx']
    pen, caixa = SVGPathPen(gs), BoundsPen(gs)
    for ch in texto:
        g = cmap[ord(ch)]
        for p in (pen, caixa):
            gs[g].draw(TransformPen(p, (1, 0, 0, -1, x, 0)))
        x += hmtx[g][0] + ESPACO
    return pen.getCommands(), caixa.bounds, x  # 1000 unidades por em, linha de base em y=0, versal com 700


fino, (fx0, _, fx1, _), fim = contorno('REVELA', 300)
grosso, (_, _, gx1, _), _ = contorno('FILM', 800, fim)
x0, x1, ALTO = fx0, gx1, 700  # a versal da Figtree tem 700


def gravar(nome, svg):
    (MARCA / nome).write_text(svg + '\n', encoding='utf8')
    print('marca/' + nome)


palavra = lambda cor, dx=0: (
    f'<g transform="translate({dx:g} 0)" fill="{cor}"><path d="{fino}"/><path d="{grosso}"/></g>'
)


def listras(n=8, faixa=70, w0=1.6, w1=12, k=1.35):
    ws = [w0 + (w1 - w0) * (i / (n - 1)) ** k for i in range(n)]
    vao = (faixa - sum(ws)) / (n - 1)
    out, x = [], 0
    for w in ws:
        out.append(f'<rect x="{x:.2f}" width="{w:.2f}" height="110"/>')
        x += w + vao
    return ''.join(out) + f'<rect x="{faixa}" width="{110 - faixa}" height="110"/>'


# o símbolo num quadro de 110 (cantos de 26)
def simbolo(cor, id_='q'):
    return f'<clipPath id="{id_}"><rect width="110" height="110" rx="26"/></clipPath><g clip-path="url(#{id_})" fill="{cor}">{listras()}</g>'


LADO, VAO = 1000, 300  # o símbolo tem 1,43 vez a altura da versal e fica centrado nela
for tema, cor in TINTA.items():
    sufixo = '' if tema == 'escuro' else '-claro'
    larg = LADO + VAO + (x1 - x0)
    s_ = LADO / 110
    gravar(
        f'revela-logo{sufixo}.svg',
        f'<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 -850 {larg:g} {LADO}" width="{larg / 25:.1f}" height="{LADO / 25:.1f}">'
        f'<title>REVELAFILM</title><g transform="translate(0 -850) scale({s_:.5f})">{simbolo(cor)}</g>'
        f'{palavra(cor, LADO + VAO - x0)}</svg>',
    )
    gravar(
        f'revela-palavra{sufixo}.svg',
        f'<svg xmlns="http://www.w3.org/2000/svg" viewBox="{x0:g} -700 {x1 - x0:g} {ALTO}" width="{(x1 - x0) / 25:.1f}" height="{ALTO / 25:.1f}">'
        f'<title>REVELAFILM</title>{palavra(cor)}</svg>',
    )
gravar('revela-simbolo.svg', f'<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 110 110" width="110" height="110"><title>REVELAFILM</title>{simbolo("#ffffff")}</svg>')
gravar('revela-simbolo-claro.svg', f'<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 110 110" width="110" height="110"><title>REVELAFILM</title>{simbolo("#111111")}</svg>')
gravar('revela-simbolo-mono.svg', f'<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 110 110" width="110" height="110"><title>REVELAFILM</title>{simbolo("currentColor")}</svg>')
# ícone do app: o símbolo creme no quadro escuro (o canto rx=186 e o fio da borda saem nos PNG, scripts/icones-app.mjs)
lado = 452
gravar(
    'revela-icone.svg',
    '<svg xmlns="http://www.w3.org/2000/svg" width="824" height="824" viewBox="100 100 824 824"><title>REVELAFILM</title>'
    '<defs><linearGradient id="fundo" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#1c1c1c"/>'
    '<stop offset="1" stop-color="#050505"/></linearGradient></defs>'
    '<rect x="100" y="100" width="824" height="824" rx="186" fill="url(#fundo)"/>'
    f'<g transform="translate({512 - lado / 2:g} {512 - lado / 2:g}) scale({lado / 110:.5f})">{simbolo("#ffffff", "i")}</g>'
    '<rect x="101" y="101" width="822" height="822" rx="185" fill="none" stroke="#FFFFFF" stroke-opacity=".08" stroke-width="2"/>'
    '</svg>',
)

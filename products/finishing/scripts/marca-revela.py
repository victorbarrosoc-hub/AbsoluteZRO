# REVELAFILM · marca (titular, 04/11/2026): o R em três peças (a bandeira inclinada com a barriga, o pé e a perna em
# diagonal; sem a haste de cima, como um quadro que corre) e a palavra REVELAFILM em Figtree, REVELA fina (Light) e
# FILM pesada (Black). A palavra sai em contorno da própria fonte (fontes/), então os SVG não dependem de fonte.
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

# o R num quadro de 112 × 110
R = (
    'M0 0H80C100 0 112 13 112 31C112 49 100 62 80 62H54L42 44H80C88 44 92 38 92 31C92 24 88 18 80 18H12Z'
    'M20 70H44V110H20Z'
    'M56 70H82L112 110H86Z'
)
R_L, R_A = 112, 110
TINTA = {'escuro': '#f1ebe1', 'claro': '#1d1d1f'}
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
grosso, (_, _, gx1, _), _ = contorno('FILM', 900, fim)
x0, x1, ALTO = fx0, gx1, 700  # a versal da Figtree tem 700


def gravar(nome, svg):
    (MARCA / nome).write_text(svg + '\n', encoding='utf8')
    print('marca/' + nome)


def r(cor, alto, x=0, y=0):
    s = alto / R_A
    return f'<path transform="translate({x:g} {y:g}) scale({s:.5f})" fill="{cor}" d="{R}"/>'


palavra = lambda cor, dx=0: (
    f'<g transform="translate({dx:g} 0)" fill="{cor}"><path d="{fino}"/><path d="{grosso}"/></g>'
)
lr = ALTO * R_L / R_A
vao = 260
for tema, cor in TINTA.items():
    sufixo = '' if tema == 'escuro' else '-claro'
    larg = lr + vao + (x1 - x0)
    gravar(
        f'revela-logo{sufixo}.svg',
        f'<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 -700 {larg:g} {ALTO}" width="{larg / 25:.1f}" height="{ALTO / 25:.1f}">'
        f'<title>REVELAFILM</title>{r(cor, ALTO, 0, -700)}{palavra(cor, lr + vao - x0)}</svg>',
    )
    gravar(
        f'revela-palavra{sufixo}.svg',
        f'<svg xmlns="http://www.w3.org/2000/svg" viewBox="{x0:g} -700 {x1 - x0:g} {ALTO}" width="{(x1 - x0) / 25:.1f}" height="{ALTO / 25:.1f}">'
        f'<title>REVELAFILM</title>{palavra(cor)}</svg>',
    )
gravar(
    'revela-simbolo.svg',
    f'<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 {R_L} {R_A}" width="{R_L}" height="{R_A}"><title>REVELAFILM</title>'
    f'<path fill="#f1ebe1" d="{R}"/></svg>',
)
gravar(
    'revela-simbolo-mono.svg',
    f'<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 {R_L} {R_A}" width="{R_L}" height="{R_A}"><title>REVELAFILM</title>'
    f'<path fill="currentColor" d="{R}"/></svg>',
)
# ícone do app: o R creme no quadro escuro (o canto rx=186 e o fio da borda saem nos PNG, scripts/icones-app.mjs)
lado = 440
s = lado / R_A
gravar(
    'revela-icone.svg',
    '<svg xmlns="http://www.w3.org/2000/svg" width="824" height="824" viewBox="100 100 824 824"><title>REVELAFILM</title>'
    '<defs><linearGradient id="fundo" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#2a2420"/>'
    '<stop offset="1" stop-color="#110f0d"/></linearGradient></defs>'
    '<rect x="100" y="100" width="824" height="824" rx="186" fill="url(#fundo)"/>'
    f'<path transform="translate({512 - R_L * s / 2 + 8:.1f} {512 - lado / 2:.1f}) scale({s:.5f})" fill="#f1ebe1" d="{R}"/>'
    '<rect x="101" y="101" width="822" height="822" rx="185" fill="none" stroke="#FFFFFF" stroke-opacity=".08" stroke-width="2"/>'
    '</svg>',
)

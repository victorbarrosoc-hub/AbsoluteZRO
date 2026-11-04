# REVELAFILM · marca (titular, 04/11/2026): só a palavra, sem símbolo. REVELAFILM em Figtree, REVELA fina (Light) e
# FILM pesada (ExtraBold), assinada "by ABSOLUTE ZRO". O ícone do app e o favicon usam o monograma RF no mesmo
# contraste. A palavra sai em contorno da própria fonte (fontes/), então os SVG não dependem de fonte.
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
grosso, (_, _, gx1, _), _ = contorno('FILM', 800, fim)
x0, x1, ALTO = fx0, gx1, 700  # a versal da Figtree tem 700


def gravar(nome, svg):
    (MARCA / nome).write_text(svg + '\n', encoding='utf8')
    print('marca/' + nome)


palavra = lambda cor, dx=0: (
    f'<g transform="translate({dx:g} 0)" fill="{cor}"><path d="{fino}"/><path d="{grosso}"/></g>'
)
for tema, cor in TINTA.items():
    sufixo = '' if tema == 'escuro' else '-claro'
    svg = (
        f'<svg xmlns="http://www.w3.org/2000/svg" viewBox="{x0:g} -700 {x1 - x0:g} {ALTO}" width="{(x1 - x0) / 25:.1f}" height="{ALTO / 25:.1f}">'
        f'<title>REVELAFILM</title>{palavra(cor)}</svg>'
    )
    gravar(f'revela-logo{sufixo}.svg', svg)
    gravar(f'revela-palavra{sufixo}.svg', svg)

# o monograma do ícone e do favicon: RF no mesmo contraste da palavra (R fino, F pesado)
rf, (mx0, _, _, _), mfim = contorno('R', 300)
ff, (_, _, mx1, _), _ = contorno('F', 900, mfim - 20)
w = mx1 - mx0
mono = lambda cor: f'<g fill="{cor}"><path d="{rf}"/><path d="{ff}"/></g>'
gravar(
    'revela-simbolo.svg',
    f'<svg xmlns="http://www.w3.org/2000/svg" viewBox="{mx0:g} -700 {w:g} 700" width="{w / 10:.0f}" height="70"><title>REVELAFILM</title>{mono("#f1ebe1")}</svg>',
)
gravar(
    'revela-simbolo-mono.svg',
    f'<svg xmlns="http://www.w3.org/2000/svg" viewBox="{mx0:g} -700 {w:g} 700" width="{w / 10:.0f}" height="70"><title>REVELAFILM</title>{mono("currentColor")}</svg>',
)
# ícone do app: RF creme no quadro escuro (o canto rx=186 e o fio da borda saem nos PNG, scripts/icones-app.mjs)
esc = 330 / 700
gravar(
    'revela-icone.svg',
    '<svg xmlns="http://www.w3.org/2000/svg" width="824" height="824" viewBox="100 100 824 824"><title>REVELAFILM</title>'
    '<defs><linearGradient id="fundo" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#24201c"/>'
    '<stop offset="1" stop-color="#0e0c0b"/></linearGradient></defs>'
    '<rect x="100" y="100" width="824" height="824" rx="186" fill="url(#fundo)"/>'
    f'<g transform="translate({512 - (mx0 + w / 2) * esc:.1f} {512 + 165:.1f}) scale({esc:.5f})">{mono("#f1ebe1")}</g>'
    '<rect x="101" y="101" width="822" height="822" rx="185" fill="none" stroke="#FFFFFF" stroke-opacity=".08" stroke-width="2"/>'
    '</svg>',
)

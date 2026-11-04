# Revela · marca (titular, 04/11/2026): o símbolo "cheio de densidade" (o quadro cortado pela curva característica:
# em cima a base densa, embaixo a imagem revelada) e a palavra "revela." em Figtree Black, com o ponto final.
# A palavra sai em contorno da própria fonte (fontes/), então os SVG não dependem de fonte instalada.
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

# o símbolo num quadro de 160: base em cima, revelado embaixo (a curva sobe do pé ao ombro)
CURVA = 'M0 160L0 132C56 132 62 116 80 92C100 62 108 30 160 26L160 160Z'
CORES = {
    'escuro': {'base': '#2a2622', 'tinta': '#f1ebe1'},  # sobre fundo escuro e foto
    'claro': {'base': '#d8d2c8', 'tinta': '#1d1d1f'},  # sobre fundo claro
}


def palavra():
    f = instantiateVariableFont(TTFont(RAIZ / 'fontes/figtree-latin-wght-normal.woff2'), {'wght': 900})
    gs, cmap, hmtx = f.getGlyphSet(), f.getBestCmap(), f['hmtx']
    pen, caixa, x, texto = SVGPathPen(gs), BoundsPen(gs), 0, 'revela.'
    for i, ch in enumerate(texto):
        g = cmap[ord(ch)]
        for p in (pen, caixa):
            gs[g].draw(TransformPen(p, (1, 0, 0, -1, x, 0)))
        x += hmtx[g][0] + (-35 if i < len(texto) - 1 else 0)  # aperto de -0,035 em
    return pen.getCommands(), caixa.bounds  # unidades de 1000 por em, linha de base em y=0


def simbolo(cor, lado, x=0, y=0, id_='q'):
    s = lado / 160
    return (
        f'<g transform="translate({x:g} {y:g}) scale({s:.5f})"><clipPath id="{id_}"><rect width="160" height="160" rx="34"/>'
        f'</clipPath><g clip-path="url(#{id_})"><rect width="160" height="160" fill="{cor["base"]}"/>'
        f'<path d="{CURVA}" fill="{cor["tinta"]}"/></g></g>'
    )


def gravar(nome, svg):
    (MARCA / nome).write_text(svg + '\n', encoding='utf8')
    print('marca/' + nome)


d, (x0, y0, x1, y1) = palavra()
alto, vao = 715, 190  # o símbolo vai da linha de base ao topo do "l"; o vão é ~ uma haste e meia
larg = alto + vao + (x1 - x0)
for tema, cor in CORES.items():
    sufixo = '' if tema == 'escuro' else '-claro'
    gravar(
        f'revela-logo{sufixo}.svg',
        f'<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 -700 {larg:g} {alto:g}" width="{larg / 25:.1f}" height="{alto / 25:.1f}">'
        f'<title>revela.</title>{simbolo(cor, alto, 0, -700)}'
        f'<path transform="translate({alto + vao - x0:g} 0)" fill="{cor["tinta"]}" d="{d}"/></svg>',
    )
    gravar(
        f'revela-palavra{sufixo}.svg',
        f'<svg xmlns="http://www.w3.org/2000/svg" viewBox="{x0:g} {y0:g} {x1 - x0:g} {y1 - y0:g}" width="{(x1 - x0) / 25:.1f}" height="{(y1 - y0) / 25:.1f}">'
        f'<title>revela.</title><path fill="{cor["tinta"]}" d="{d}"/></svg>',
    )
gravar(
    'revela-simbolo.svg',
    f'<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 160 160" width="160" height="160"><title>Revela</title>{simbolo(CORES["escuro"], 160)}</svg>',
)
# uma cor só (máscara, carimbo, gravação): a base vira um véu de 22%
gravar(
    'revela-simbolo-mono.svg',
    f'<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 160 160" width="160" height="160"><title>Revela</title>'
    f'<clipPath id="q"><rect width="160" height="160" rx="34"/></clipPath><g clip-path="url(#q)" fill="currentColor">'
    f'<rect width="160" height="160" opacity=".22"/><path d="{CURVA}"/></g></svg>',
)
# ícone do app: o símbolo inteiro, base com um degradê leve de cima para baixo (o canto rx=186 e o fio da borda são
# tirados por scripts/icones-app.mjs nos PNG)
gravar(
    'revela-icone.svg',
    '<svg xmlns="http://www.w3.org/2000/svg" width="824" height="824" viewBox="100 100 824 824"><title>Revela</title>'
    '<defs><linearGradient id="fundo" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#322c27"/>'
    '<stop offset="1" stop-color="#1c1916"/></linearGradient>'
    '<clipPath id="quadro"><rect x="100" y="100" width="824" height="824" rx="186"/></clipPath></defs>'
    '<rect x="100" y="100" width="824" height="824" rx="186" fill="url(#fundo)"/>'
    f'<g clip-path="url(#quadro)"><path transform="translate(100 100) scale(5.15)" d="{CURVA}" fill="#f1ebe1"/></g>'
    '<rect x="101" y="101" width="822" height="822" rx="185" fill="none" stroke="#FFFFFF" stroke-opacity=".08" stroke-width="2"/>'
    '</svg>',
)

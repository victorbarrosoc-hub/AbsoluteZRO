# Contornos do nome (ΛEON) e da frase em Montserrat SemiBold (SIL Open Font License 1.1) → src/letras.js.
# A fonte não entra no repositório; só os contornos das letras usadas, em altura de maiúscula 100 (linha de base y=100).
#   pip install fonttools && python3 scripts/letras.py /caminho/Montserrat-SemiBold.ttf
import json, sys
from fontTools.ttLib import TTFont
from fontTools.pens.svgPathPen import SVGPathPen
from fontTools.pens.transformPen import TransformPen

fonte = TTFont(sys.argv[1])
cap = fonte['OS/2'].sCapHeight
k = 100 / cap
glifos = fonte.getGlyphSet()
cmap = fonte.getBestCmap()
letras = {}
for ch in sorted(set('ΛEON' + 'TIME IS YOURS.')):
    nome = cmap[ord(ch)]
    g = glifos[nome]
    pen = SVGPathPen(glifos, ntos=lambda v: ('%.2f' % v).rstrip('0').rstrip('.'))
    g.draw(TransformPen(pen, (k, 0, 0, -k, 0, 100)))
    letras[ch] = {'w': round(g.width * k, 2), 'd': pen.getCommands()}
with open('src/letras.js', 'w', encoding='utf-8') as f:
    f.write('// Gerado por scripts/letras.py: contornos de Montserrat SemiBold (SIL Open Font License 1.1, Julieta Ulanovsky e\n')
    f.write('// colaboradores), só as letras do nome e da frase. Altura de maiúscula 100, linha de base em y = 100.\n')
    f.write('export const LETRAS = ' + json.dumps(letras, ensure_ascii=False, indent=1) + '\n')
print('ok', ''.join(letras))

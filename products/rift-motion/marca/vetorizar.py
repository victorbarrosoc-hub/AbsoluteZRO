#!/usr/bin/env python3
"""Rift Motion · marca em vetor. A geometria mora só aqui: rode `python3 vetorizar.py` e os SVG saem nesta pasta.

Redesenho em vetor da arte aprovada pelo titular (01/11/2026): letras largas, pontas em diagonal, o FT ligado pela
barra de cima e a fenda (o "rift") que corta o I e a perna do R. Uma cor só por versão (claro no escuro, grafite no
claro); o ícone do app leva a luz laranja.

Grade: altura das letras H = 100. Barras horizontais com 22, hastes com 28, todas as diagonais com a mesma inclinação
(K = 1,3 de avanço por 1 de altura), como na arte. A fenda tem 3,2 de largura (some abaixo de ~20 px: o ícone e o
favicon usam a versão sem fenda no I, que não existe no R).
"""
from math import hypot
from pathlib import Path

AQUI = Path(__file__).parent
H = 100.0
SH = 22.0  # barra horizontal
SV = 28.0  # haste
K = 1.3  # inclinação das diagonais (dx por dy)
FENDA = 3.2

CORES = {
    'claro': '#F5F5F7',  # no fundo escuro
    'grafite': '#1D1D1F',  # no fundo claro
    'laranja': '#EA6426',
    'areia': '#E1CDBC',
    'lilas': '#9A9CD0',
    'grafite-escuro': '#29272A',
    'preto': '#0B0B0C',
}

f = lambda n: f'{n:.2f}'.rstrip('0').rstrip('.')


def poly(*pts):
    return 'M' + ' L'.join(f'{f(x)} {f(y)}' for x, y in pts) + ' Z'


# ─── R ───────────────────────────────────────────────────────────────────────────────────────────────
XR = 124.0  # centro do bojo
RB = 31.5  # raio de fora do bojo (bojo com 63 de altura: barra, miolo, barra)
RI = RB - SH  # raio do miolo
YM = 2 * RB - SH  # topo da barra do meio (41)
CANTO = 27.0  # canto arredondado entre a barra do meio e a haste (quase a largura da haste, como na arte)
FILETE = 6.0  # arredondado pequeno entre a barra do meio (embaixo) e a haste
MIOLO_RECUO = 7.5  # o miolo do bojo termina antes: o lado direito do bojo é mais grosso que as barras
W_PERNA = 24 * hypot(1, K)  # largura horizontal da perna (24 na perpendicular)


def r_partes(x0=0.0):
    """Os pedaços do R (preenchidos, mesma direção: a união sai certa com nonzero). Devolve (caminhos, largura)."""
    # contorno: a ponta de cima corta na diagonal (de x0 no alto até x0 + SH·K embaixo da barra), o bojo dá a volta
    # com o lado direito mais grosso que as barras (o miolo fica à esquerda do centro), volta pela barra do meio, faz o
    # arredondado pequeno na haste e sobe com o canto grande até a barra
    xi = x0 + XR - MIOLO_RECUO
    bojo = (
        f'M{f(x0)} 0 L{f(x0 + XR)} 0 A{f(RB)} {f(RB)} 0 0 1 {f(x0 + XR)} {f(2 * RB)} '
        f'L{f(x0 + SV + FILETE)} {f(2 * RB)} A{f(FILETE)} {f(FILETE)} 0 0 0 {f(x0 + SV)} {f(2 * RB + FILETE)} '
        f'L{f(x0 + SV)} {f(H)} L{f(x0)} {f(H)} L{f(x0)} {f(YM + CANTO)} '
        f'A{f(CANTO)} {f(CANTO)} 0 0 1 {f(x0 + CANTO)} {f(YM)} L{f(xi)} {f(YM)} '
        f'A{f(RI)} {f(RI)} 0 0 0 {f(xi)} {f(SH)} L{f(x0 + SH * K)} {f(SH)} Z'
    )
    # a borda direita da perna sai do fim do bojo (XR + 4 no y = 63) e desce na inclinação K
    dir_meio = x0 + XR + 4
    dir_topo = dir_meio - (2 * RB - YM) * K
    dir_base = dir_meio + (H - 2 * RB) * K
    perna = poly((dir_topo - W_PERNA, YM), (dir_topo, YM), (dir_base, H), (dir_base - W_PERNA, H))
    largura = dir_base - x0
    # a fenda do R: a borda esquerda da perna atravessando a barra do meio
    fenda = poly((dir_topo - W_PERNA - FENDA / 2, YM), (dir_topo - W_PERNA + FENDA / 2, YM), (dir_topo - W_PERNA + FENDA / 2 + (2 * RB - YM) * K, 2 * RB), (dir_topo - W_PERNA - FENDA / 2 + (2 * RB - YM) * K, 2 * RB))
    return [bojo, perna], fenda, largura


# ─── RIFT ────────────────────────────────────────────────────────────────────────────────────────────
ESPACO = 16.0


def rift(com_fendas=True):
    partes, fenda_r, wr = r_partes(0)
    xi = wr + ESPACO
    i = poly((xi, 0), (xi + SV, 0), (xi + SV, H), (xi, H))
    xf = xi + SV + 32.0
    xt = xf + 139.0  # haste do T
    fim = xt + SV + 57.0  # a barra de cima do F e do T é uma só (a ligadura da arte)
    topo = poly((xf, 0), (fim, 0), (fim, SH), (xf, SH))
    haste_f = poly((xf, 0), (xf + SV, 0), (xf + SV, H), (xf, H))
    meio_f = poly((xf, 42), (xf + 94, 42), (xf + 94, 42 + SH), (xf, 42 + SH))
    haste_t = poly((xt, 0), (xt + SV, 0), (xt + SV, H), (xt, H))
    caminhos = partes + [i, topo, haste_f, meio_f, haste_t]
    # a fenda do I: uma curva em S que atravessa a haste na diagonal (o rasgo do nome)
    cx = xi + SV / 2
    fenda_i = f'M{f(cx - 22)} 84 C{f(cx - 8)} 76, {f(cx + 4)} 30, {f(cx + 24)} 14'
    return caminhos, (fenda_r, fenda_i) if com_fendas else (), fim


# ─── MOTION (traço fino, bem espaçado, da largura do RIFT) ──────────────────────────────────────────────
def motion(largura, y0=124.0, altura=20.0, traco=2.6):
    letras = 'MOTION'
    w = {'M': 19, 'O': 21, 'T': 17, 'I': 0, 'N': 17}
    total = sum(w[c] for c in letras)
    vao = (largura - total) / (len(letras) - 1)
    x = 0.0
    y1 = y0 + altura
    d = []
    for c in letras:
        lw = w[c]
        if c == 'M':
            d.append(f'M{f(x)} {f(y1)} L{f(x)} {f(y0)} L{f(x + lw / 2)} {f(y0 + altura * 0.62)} L{f(x + lw)} {f(y0)} L{f(x + lw)} {f(y1)}')
        elif c == 'O':
            rx, ry = lw / 2, altura / 2
            d.append(f'M{f(x)} {f(y0 + ry)} A{f(rx)} {f(ry)} 0 1 0 {f(x + lw)} {f(y0 + ry)} A{f(rx)} {f(ry)} 0 1 0 {f(x)} {f(y0 + ry)}')
        elif c == 'T':
            d.append(f'M{f(x)} {f(y0)} L{f(x + lw)} {f(y0)} M{f(x + lw / 2)} {f(y0)} L{f(x + lw / 2)} {f(y1)}')
        elif c == 'I':
            d.append(f'M{f(x)} {f(y0)} L{f(x)} {f(y1)}')
        elif c == 'N':
            d.append(f'M{f(x)} {f(y1)} L{f(x)} {f(y0)} L{f(x + lw)} {f(y1)} L{f(x + lw)} {f(y0)}')
        x += lw + vao
    return ' '.join(d), traco, y1


# ─── SVG ─────────────────────────────────────────────────────────────────────────────────────────────
def mascara(id_, w, h, fendas):
    if not fendas:
        return '', ''
    fr, fi = fendas
    m = (
        f'<mask id="{id_}" maskUnits="userSpaceOnUse" x="-10" y="-10" width="{f(w + 20)}" height="{f(h + 20)}">'
        f'<rect x="-10" y="-10" width="{f(w + 20)}" height="{f(h + 20)}" fill="#fff"/>'
        f'<path d="{fr}" fill="#000"/><path d="{fi}" fill="none" stroke="#000" stroke-width="{f(FENDA)}" stroke-linecap="round"/></mask>'
    )
    return m, f' mask="url(#{id_})"'


def svg_logo(cor, com_motion=True, titulo='Rift Motion'):
    caminhos, fendas, w = rift()
    h = H
    corpo = ''
    if com_motion:
        d, traco, h = motion(w)
        h += traco
        corpo = f'<path d="{d}" fill="none" stroke="{cor}" stroke-width="{f(traco)}" stroke-linejoin="round" stroke-linecap="round"/>'
    m, uso = mascara('fenda', w, H, fendas)
    return (
        f'<svg xmlns="http://www.w3.org/2000/svg" viewBox="-2 -2 {f(w + 4)} {f(h + 4)}" role="img" aria-label="{titulo}">'
        f'<defs>{m}</defs><g fill="{cor}"{uso}>' + ''.join(f'<path d="{c}"/>' for c in caminhos) + f'</g>{corpo}</svg>\n'
    )


def svg_r(cor, titulo='Rift Motion'):
    partes, fenda_r, w = r_partes(0)
    m, uso = mascara('fenda', w, H, (fenda_r, 'M0 0'))
    return (
        f'<svg xmlns="http://www.w3.org/2000/svg" viewBox="-2 -2 {f(w + 4)} {f(H + 4)}" role="img" aria-label="{titulo}">'
        f'<defs>{m}</defs><g fill="{cor}"{uso}>' + ''.join(f'<path d="{c}"/>' for c in partes) + '</g></svg>\n'
    )


def svg_icone(escuro=True):
    """Ícone do app: o R claro no quadrado escuro, com a luz laranja vindo de baixo à esquerda (a arte)."""
    partes, fenda_r, w = r_partes(0)
    lado = 1024
    k = 640 / w  # o R ocupa ~62% da largura (78% do quadrado)
    ox = (lado - w * k) / 2 + 8
    oy = (lado - H * k) / 2 + 16
    fundo = ('#1A1A1D', '#0B0B0C') if escuro else ('#FFFFFF', '#ECE8E3')
    tinta = ('#F5F5F7', '#E8DCD0') if escuro else ('#2A2A2D', '#1D1D1F')
    return f'''<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 {lado} {lado}" role="img" aria-label="Rift Motion">
<defs>
<linearGradient id="fundo" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="{fundo[0]}"/><stop offset="1" stop-color="{fundo[1]}"/></linearGradient>
<radialGradient id="luz" cx="0.18" cy="0.92" r="0.6"><stop offset="0" stop-color="#EA6426" stop-opacity="{0.5 if escuro else 0.28}"/><stop offset="0.45" stop-color="#EA6426" stop-opacity="{0.12 if escuro else 0.06}"/><stop offset="1" stop-color="#EA6426" stop-opacity="0"/></radialGradient>
<linearGradient id="tinta" x1="0.85" y1="0" x2="0.1" y2="1"><stop offset="0" stop-color="{tinta[0]}"/><stop offset="0.6" stop-color="{tinta[1]}"/><stop offset="0.85" stop-color="#F08A55"/><stop offset="1" stop-color="#EA6426"/></linearGradient>
<mask id="fenda" maskUnits="userSpaceOnUse" x="-10" y="-10" width="{f(w + 20)}" height="{f(H + 20)}"><rect x="-10" y="-10" width="{f(w + 20)}" height="{f(H + 20)}" fill="#fff"/><path d="{fenda_r}" fill="#000"/></mask>
</defs>
<rect x="100" y="100" width="824" height="824" rx="190" fill="url(#fundo)"/>
<rect x="100" y="100" width="824" height="824" rx="190" fill="url(#luz)"/>
<rect x="100.5" y="100.5" width="823" height="823" rx="189.5" fill="none" stroke="{'#FFFFFF' if escuro else '#000000'}" stroke-opacity="{0.08 if escuro else 0.06}"/>
<g transform="translate({f(ox)} {f(oy)}) scale({k:.4f})" fill="url(#tinta)" mask="url(#fenda)">{''.join(f'<path d="{c}"/>' for c in partes)}</g>
</svg>
'''


def favicon():
    partes, _, w = r_partes(0)
    k = 48 / w
    return (
        f'<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 64 64"><rect width="64" height="64" rx="14" fill="#141416"/>'
        f'<g transform="translate({f((64 - w * k) / 2 + 1)} {f((64 - H * k) / 2)}) scale({k:.4f})" fill="#F5F5F7">'
        + ''.join(f'<path d="{c}"/>' for c in partes)
        + '</g></svg>\n'
    )


SAIDAS = {
    'rift-motion-claro.svg': lambda: svg_logo(CORES['claro']),
    'rift-motion-grafite.svg': lambda: svg_logo(CORES['grafite']),
    'rift-claro.svg': lambda: svg_logo(CORES['claro'], com_motion=False, titulo='Rift'),
    'rift-grafite.svg': lambda: svg_logo(CORES['grafite'], com_motion=False, titulo='Rift'),
    'rift-r-claro.svg': lambda: svg_r(CORES['claro']),
    'rift-r-grafite.svg': lambda: svg_r(CORES['grafite']),
    'rift-icone.svg': lambda: svg_icone(True),
    'rift-icone-claro.svg': lambda: svg_icone(False),
    'favicon.svg': favicon,
}

if __name__ == '__main__':
    for nome, gerar in SAIDAS.items():
        (AQUI / nome).write_text(gerar())
        print(nome)

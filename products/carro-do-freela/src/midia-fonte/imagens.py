#!/usr/bin/env python3
"""As fotos geradas, refeitas DOS ORIGINAIS (26/out).

Cada foto vira uma escada de larguras em src/midia/, `nome@<largura>.webp`,
e a tela escolhe o degrau pela largura dela × a densidade (qual() no
template). Nada sai de arquivo já comprimido quando existe o original:

  · fotos de cabeçalho, capas e brechó: o PNG sem perda do Higgsfield
    (fontes.json diz qual job é qual; baixar do histórico não custa crédito)
  · objetos 3D: o original da ampliação a 4K não está mais no histórico, então
    a fonte é o @hd que já estava no site — o degrau de cima é ESSE ARQUIVO,
    byte a byte (re-codificar só perderia), e os menores saem dele
  · quadros parados dos vídeos: do master sem perda (render.py), com a mesma
    nitidez leve do vídeo, para o quadro casar com o primeiro do vídeo

  python3 imagens.py <pasta dos PNG originais> <pasta dos masters>
"""
import json, os, sys, subprocess, io
from PIL import Image

AQUI = os.path.dirname(os.path.abspath(__file__))
MIDIA = os.path.join(AQUI, '..', 'midia')
Q = 95                      # qualidade WebP: nunca abaixo de 90 (pedido do Victor, 26/out)
DEGRAUS = [640, 1280, 1920]  # + a largura cheia do original

def escada(largura_cheia, degraus=DEGRAUS):
    return [w for w in degraus if w < largura_cheia - 64] + [largura_cheia]

def salvar(im, nome, w):
    if im.width != w:
        im = im.resize((w, round(im.height * w / im.width)), Image.LANCZOS)
    args = dict(quality=Q, method=6)
    if im.mode == 'RGBA': args.update(alpha_quality=100, exact=False)
    im.save(os.path.join(MIDIA, f'{nome}@{w}.webp'), 'WEBP', **args)

def limpar(nome):
    for f in os.listdir(MIDIA):
        if f.startswith(nome + '.') or f.startswith(nome + '@'):
            if f.endswith('.webp'): os.remove(os.path.join(MIDIA, f))

def main(pngs, masters):
    fontes = json.load(open(os.path.join(AQUI, 'fontes.json')))
    # 1. fotos com original sem perda
    for nome, job in fontes['fotos'].items():
        im = Image.open(os.path.join(pngs, job[:8] + '.png')).convert('RGB')
        limpar(nome)
        for w in escada(im.width): salvar(im, nome, w)
        print(nome, im.size, escada(im.width))
    # 2. objetos 3D: o degrau de cima é o arquivo que já estava no ar
    for nome in fontes['objetos']:
        hd = os.path.join(MIDIA, nome + '@hd.webp')
        if not os.path.exists(hd):   # já convertido: a fonte é o degrau de cima, que é o @hd de antes
            hd = max((f for f in os.listdir(MIDIA) if f.startswith(nome + '@')), key=lambda f: int(f.split('@')[1].split('.')[0]))
            hd = os.path.join(MIDIA, hd)
        bruto = open(hd, 'rb').read(); im = Image.open(io.BytesIO(bruto)); im.load()
        limpar(nome)
        topo = im.width
        for w in escada(topo, [480, 960, 1440]):
            if w == topo: open(os.path.join(MIDIA, f'{nome}@{w}.webp'), 'wb').write(bruto)
            else: salvar(im.convert('RGBA'), nome, w)
        print(nome, im.size, escada(topo, [480, 960, 1440]))
    # 3. quadros parados: do master, com a nitidez do vídeo
    for nome, (master, quadro) in fontes['quadros'].items():
        png = subprocess.run(['ffmpeg', '-v', 'error', '-i', os.path.join(masters, master),
                              '-vf', f'select=eq(n\\,{quadro}),unsharp=5:5:0.45', '-frames:v', '1',
                              '-f', 'image2pipe', '-vcodec', 'png', '-'], capture_output=True, check=True).stdout
        im = Image.open(io.BytesIO(png)).convert('RGB')
        limpar(nome)
        for w in escada(im.width, [1280]): salvar(im, nome, w)
        print(nome, im.size, escada(im.width, [1280]))

if __name__ == '__main__':
    main(sys.argv[1], sys.argv[2])

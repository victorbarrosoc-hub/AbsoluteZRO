from PIL import Image, ImageFilter, ImageDraw, ImageChops
import numpy as np, os
AQUI=os.path.dirname(os.path.abspath(__file__))
src=Image.open(os.path.join(AQUI,'anel-fonte.png')).convert('RGB')
CX,CY,D=991,963,1167
DX=0.012

def ring_square(frac, size):
    full=D/frac; cx=CX+DX*full; cy=CY
    pad=Image.new('RGB',(4096,4096),(0,0,0)); pad.paste(src,(1024,1024))
    b=(int(cx-full/2)+1024,int(cy-full/2)+1024,int(cx+full/2)+1024,int(cy+full/2)+1024)
    return pad.crop(b).resize((size,size),Image.LANCZOS)

def body(size, top, bottom):
    t=np.linspace(0,1,size)[:,None,None]
    return np.broadcast_to(np.array(top)*(1-t)+np.array(bottom)*t,(size,size,3)).copy()

def compose(frac, size, top=(18,21,30), bottom=(3,3,6)):
    bg=body(size,top,bottom)
    y,x=(np.mgrid[0:size,0:size]+0.5)/size
    cx=0.5-DX; r=np.sqrt((x-cx)**2+(y-0.5)**2); R=frac/2
    # eclipse: disco interno mais escuro; halo azul frio por fora do aro
    inside=np.clip((R-r)/0.02,0,1)
    bg=bg*(1-0.75*inside[...,None])
    halo=np.exp(-((r-R)/0.09)**2)*(r>R*0.98)
    bg=bg+np.array([20,55,140])[None,None,:]*0.55*halo[...,None]
    ring=np.asarray(ring_square(frac,size)).astype(np.float32)
    out=255-(255-np.clip(bg,0,255))*(255-ring)/255
    return Image.fromarray(np.clip(out,0,255).astype(np.uint8))

def superellipse(size,n=5.0,ss=4):
    S=size*ss; y,x=np.mgrid[0:S,0:S]; u=np.abs((x+0.5)/S*2-1); v=np.abs((y+0.5)/S*2-1)
    return Image.fromarray(((u**n+v**n)<=1).astype(np.uint8)*255).resize((size,size),Image.LANCZOS)

def small(size, rounded=0.22, squircle=False):
    """16–48 px: anel desenhado com traço proporcionalmente mais grosso para não sumir."""
    S=512; im=compose(0.70,S).convert('RGBA'); d=ImageDraw.Draw(im)
    R=S*0.35; cx=S*(0.5-DX); cy=S/2; w=max(S/size*1.1,10)
    for k,(col,ww) in enumerate((((40,110,255,120),w*2.6),((120,180,255,255),w),((235,245,255,255),w*0.45))):
        g=Image.new('RGBA',(S,S),(0,0,0,0)); ImageDraw.Draw(g).ellipse((cx-R,cy-R,cx+R,cy+R),outline=col,width=int(ww))
        if k==0: g=g.filter(ImageFilter.GaussianBlur(ww/2))
        im=Image.alpha_composite(im,g)
    f=Image.new('RGBA',(S,S),(0,0,0,0)); fx=cx+R; ImageDraw.Draw(f).ellipse((fx-w*1.8,cy-w*1.8,fx+w*1.8,cy+w*1.8),fill=(255,255,255,255))
    im=Image.alpha_composite(im,f.filter(ImageFilter.GaussianBlur(w*0.6)))
    if squircle: m=superellipse(S)
    else:
        m=Image.new('L',(S*4,S*4),0); ImageDraw.Draw(m).rounded_rectangle((0,0,S*4-1,S*4-1),radius=int(S*4*rounded),fill=255); m=m.resize((S,S),Image.LANCZOS)
    im.putalpha(m)
    return im.resize((size,size),Image.LANCZOS)

if __name__=='__main__':
    import os; os.chdir(AQUI); os.makedirs('out',exist_ok=True)
    fb=compose(0.60,1024,(10,12,18),(2,2,4)); fb.save('out/icon-1024.png')
    fb.resize((180,180),Image.LANCZOS).save('out/apple-icon.png')
    for s in (192,512): fb.resize((s,s),Image.LANCZOS).save(f'out/icon-{s}.png')
    compose(0.48,1024,(10,12,18),(2,2,4)).resize((512,512),Image.LANCZOS).save('out/icon-maskable-512.png')
    # macOS (grid da Apple: 824 dentro de 1024, sombra suave, contorno de luz 10%)
    S=824; inner=compose(0.66,S).convert('RGBA'); mask=superellipse(S); inner.putalpha(mask)
    canvas=Image.new('RGBA',(1024,1024),(0,0,0,0))
    shm=Image.new('L',(1024,1024),0); shm.paste(mask,(100,112))
    sh=Image.new('RGBA',(1024,1024),(0,0,0,255)); sh.putalpha(shm.point(lambda v:int(v*0.5)).filter(ImageFilter.GaussianBlur(22)))
    canvas=Image.alpha_composite(canvas,sh); canvas.alpha_composite(inner,(100,100))
    mo=Image.new('L',(1024,1024),0); mo.paste(mask,(100,100)); mi=Image.new('L',(1024,1024),0); mi.paste(superellipse(S-4),(102,102))
    e=ImageChops.subtract(mo,mi).point(lambda v:int(v*0.10))
    canvas=Image.alpha_composite(canvas,Image.merge('RGBA',(*Image.new('RGB',(1024,1024),(255,255,255)).split(),e)))
    canvas.save('out/mac-icon-1024.png')
    # Windows
    W=1024; win=compose(0.64,W).convert('RGBA')
    rm=Image.new('L',(W*4,W*4),0); ImageDraw.Draw(rm).rounded_rectangle((0,0,W*4-1,W*4-1),radius=int(W*4*0.2),fill=255)
    win.putalpha(rm.resize((W,W),Image.LANCZOS)); win.save('out/win-icon-1024.png')
    sizes=[16,24,32,48,64,128,256]
    imgs=[small(s) if s<=48 else win.resize((s,s),Image.LANCZOS) for s in sizes]
    imgs[-1].save('out/icon.ico',sizes=[(s,s) for s in sizes],append_images=imgs[:-1])
    # favicon
    fav=[small(s,rounded=0.24) for s in (16,32,48)]
    fav[2].save('out/favicon.ico',sizes=[(16,16),(32,32),(48,48)],append_images=fav[:2])
    small(64,rounded=0.24).save('out/favicon-64.png')
    print('ok')


# ───── Versão clara (tema padrão do site desde 25/10/2026) ─────
src_claro = Image.open(os.path.join(AQUI, 'anel-claro-fonte.png')).convert('RGB')
CXc, CYc, Dc = 1000, 980, 1146
BG_CLARO = (247, 248, 251)


def ring_claro(frac, size):
    full = Dc / frac
    cx = CXc + DX * full
    pad = Image.new('RGB', (4096, 4096), BG_CLARO)
    pad.paste(src_claro, (1024, 1024))
    b = (int(cx - full / 2) + 1024, int(CYc - full / 2) + 1024, int(cx + full / 2) + 1024, int(CYc + full / 2) + 1024)
    return pad.crop(b).resize((size, size), Image.LANCZOS)


def compose_claro(frac, size, top=(253, 253, 254), bottom=(232, 236, 243)):
    """Anel sobre papel claro: multiplica o anel (fundo quase branco) pelo degradê do corpo."""
    bg = body(size, top, bottom) / 255.0
    ring = np.asarray(ring_claro(frac, size)).astype(np.float32) / 255.0
    ring = np.clip(ring / (np.array(BG_CLARO) / 255.0), 0, 1)  # fundo do anel vira branco puro
    return Image.fromarray(np.clip(bg * ring * 255, 0, 255).astype(np.uint8))


def small_claro(size, rounded=0.22, squircle=False):
    S = 512
    im = compose_claro(0.70, S).convert('RGBA')
    R = S * 0.35
    cx = S * (0.5 - DX)
    cy = S / 2
    w = max(S / size * 1.1, 10)
    for k, (col, ww) in enumerate((((40, 110, 255, 90), w * 2.6), ((10, 90, 255, 255), w), ((90, 170, 255, 255), w * 0.45))):
        g = Image.new('RGBA', (S, S), (0, 0, 0, 0))
        ImageDraw.Draw(g).ellipse((cx - R, cy - R, cx + R, cy + R), outline=col, width=int(ww))
        if k == 0:
            g = g.filter(ImageFilter.GaussianBlur(ww / 2))
        im = Image.alpha_composite(im, g)
    f = Image.new('RGBA', (S, S), (0, 0, 0, 0))
    fx = cx + R
    ImageDraw.Draw(f).ellipse((fx - w * 1.8, cy - w * 1.8, fx + w * 1.8, cy + w * 1.8), fill=(150, 210, 255, 255))
    im = Image.alpha_composite(im, f.filter(ImageFilter.GaussianBlur(w * 0.6)))
    if squircle:
        m = superellipse(S)
    else:
        m = Image.new('L', (S * 4, S * 4), 0)
        ImageDraw.Draw(m).rounded_rectangle((0, 0, S * 4 - 1, S * 4 - 1), radius=int(S * 4 * rounded), fill=255)
        m = m.resize((S, S), Image.LANCZOS)
    im.putalpha(m)
    return im.resize((size, size), Image.LANCZOS)


def gerar_claro():
    os.makedirs('out/claro', exist_ok=True)
    fb = compose_claro(0.60, 1024)
    fb.save('out/claro/icon-1024.png')
    fb.resize((180, 180), Image.LANCZOS).save('out/claro/apple-icon.png')
    for s in (192, 512):
        fb.resize((s, s), Image.LANCZOS).save(f'out/claro/icon-{s}.png')
    compose_claro(0.48, 1024).resize((512, 512), Image.LANCZOS).save('out/claro/icon-maskable-512.png')
    S = 824
    inner = compose_claro(0.66, S).convert('RGBA')
    mask = superellipse(S)
    inner.putalpha(mask)
    canvas = Image.new('RGBA', (1024, 1024), (0, 0, 0, 0))
    shm = Image.new('L', (1024, 1024), 0)
    shm.paste(mask, (100, 112))
    sh = Image.new('RGBA', (1024, 1024), (0, 0, 0, 255))
    sh.putalpha(shm.point(lambda v: int(v * 0.32)).filter(ImageFilter.GaussianBlur(22)))
    canvas = Image.alpha_composite(canvas, sh)
    canvas.alpha_composite(inner, (100, 100))
    mo = Image.new('L', (1024, 1024), 0)
    mo.paste(mask, (100, 100))
    mi = Image.new('L', (1024, 1024), 0)
    mi.paste(superellipse(S - 4), (102, 102))
    e = ImageChops.subtract(mo, mi).point(lambda v: int(v * 0.10))
    canvas = Image.alpha_composite(canvas, Image.merge('RGBA', (*Image.new('RGB', (1024, 1024), (0, 0, 0)).split(), e)))
    canvas.save('out/claro/mac-icon-1024.png')
    W = 1024
    win = compose_claro(0.64, W).convert('RGBA')
    rm = Image.new('L', (W * 4, W * 4), 0)
    ImageDraw.Draw(rm).rounded_rectangle((0, 0, W * 4 - 1, W * 4 - 1), radius=int(W * 4 * 0.2), fill=255)
    win.putalpha(rm.resize((W, W), Image.LANCZOS))
    win.save('out/claro/win-icon-1024.png')
    sizes = [16, 24, 32, 48, 64, 128, 256]
    imgs = [small_claro(s) if s <= 48 else win.resize((s, s), Image.LANCZOS) for s in sizes]
    imgs[-1].save('out/claro/icon.ico', sizes=[(s, s) for s in sizes], append_images=imgs[:-1])
    fav = [small_claro(s, rounded=0.24) for s in (16, 32, 48)]
    fav[2].save('out/claro/favicon.ico', sizes=[(16, 16), (32, 32), (48, 48)], append_images=fav[:2])


if __name__ == '__main__':
    gerar_claro()
    print('claro ok')

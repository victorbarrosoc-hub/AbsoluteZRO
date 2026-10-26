# Mockups dos apps para o site (Padrão Apple, 25/10/2026): capturas reais (Playwright, 1440x916 e 390x860 @2x,
# tema claro e escuro) num MacBook + iPhone de tela verde. Uso: python3 produtos.py <pasta-das-capturas>
# Nomes esperados na pasta: hub-{mac,iph}-{light,dark}.png, sobedesce-..., synquei-app-..., nossom-..., tpeasy-home-mac-light.png,
# tpeasy-doc-iph-..., carro-mac-..., carro-iph-light.png, aeon-..., revela-.... O verde vira cinza fora das telas (despill).
# Só alguns apps: python3 produtos.py <pasta> hub
import os, subprocess, sys
import numpy as np
from PIL import Image
from scipy import ndimage
A=os.path.dirname(os.path.abspath(__file__))
OUT=os.path.join(A,'..','..','..','apps','hub-web','public','brand')
CAP=sys.argv[1]
SO=set(sys.argv[2:])  # opcional: só estes apps (ex.: hub)
TMP=os.path.join(CAP,'comp'); os.makedirs(TMP,exist_ok=True)
M={
 'hub':lambda s:(f'{CAP}/hub-mac-{s}.png',f'{CAP}/hub-iph-{s}.png'),
 'sobedesce':lambda s:(f'{CAP}/sobedesce-mac-{s}.png',f'{CAP}/sobedesce-iph-{s}.png'),
 'synquei':lambda s:(f'{CAP}/synquei-app-mac-{s}.png',f'{CAP}/synquei-app-iph-{s}.png'),
 'nossom':lambda s:(f'{CAP}/nossom-mac-{s}.png',f'{CAP}/nossom-iph-{s}.png'),
 'tpeasy':lambda s:(CAP+'/tpeasy-home-mac-light.png',f'{CAP}/tpeasy-doc-iph-{s}.png'),
 'carro-do-freela':lambda s:(f'{CAP}/carro-mac-{s}.png',CAP+'/carro-iph-light.png'),
 # AEON e Revela: o site no ar (aeon-/revela-{mac,iph}-{light,dark}.png), 26/10/2026
 'ai-edit':lambda s:(f'{CAP}/aeon-mac-{s}.png',f'{CAP}/aeon-iph-{s}.png'),
 'finishing':lambda s:(f'{CAP}/revela-mac-{s}.png',f'{CAP}/revela-iph-{s}.png'),
}
for tema,s in [('claro','light'),('escuro','dark')]:
  t=np.asarray(Image.open(f'{A}/aparelhos-{tema}-verde.png').convert('RGB')).astype(int)
  g=(t[...,1]>150)&(t[...,1]-t[...,0]>60)&(t[...,1]-t[...,2]>60)
  lab,n=ndimage.label(g); sz=ndimage.sum(g,lab,range(1,n+1)); keep=np.argsort(sz)[::-1][:2]+1
  screen=ndimage.binary_erosion(np.isin(lab,keep),iterations=6)
  for app,f in M.items():
    if SO and app not in SO: continue
    mac,iph=f(s); tmp=f'{TMP}/{app}-{tema}.png'
    subprocess.run(['python3',f'{A}/compor.py',f'{A}/aparelhos-{tema}-verde.png',mac,iph,tmp],check=True,capture_output=True)
    a=np.asarray(Image.open(tmp).convert('RGB')).astype(int)
    lim=np.maximum(a[...,0],a[...,2])+(6 if tema=='claro' else 1)
    a[...,1]=np.where(screen,a[...,1],np.minimum(a[...,1],lim))
    im=Image.fromarray(a.clip(0,255).astype(np.uint8))
    if app=='hub':
      im=im.crop((144,10,2544,1510)); im.save(f'{OUT}/produto-hub-{tema}.webp',quality=85,method=6)
    else:
      im=im.crop((340,150,2300,1340)); im=im.resize((1600,round(1600*im.height/im.width)),Image.LANCZOS)
      im.save(f'{OUT}/produto-{app}-{tema}.webp',quality=85,method=6)
    print(app,tema,im.size)

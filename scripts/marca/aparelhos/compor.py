from PIL import Image, ImageFilter
import numpy as np, sys
from scipy import ndimage
dev=Image.open(sys.argv[1]).convert('RGB'); a=np.asarray(dev).astype(int)
g=(a[...,1]>150)&(a[...,1]-a[...,0]>60)&(a[...,1]-a[...,2]>60)
lab,n=ndimage.label(g); sizes=ndimage.sum(g,lab,range(1,n+1)); order=np.argsort(sizes)[::-1][:2]+1
comps=[]
for k in order:
    ys,xs=np.where(lab==k); comps.append((xs.min(),ys.min(),xs.max(),ys.max(),k))
comps.sort(key=lambda c:(c[2]-c[0])*(c[3]-c[1]),reverse=True)
print(comps)
out=dev.copy()
for (x0,y0,x1,y1,k),shot in zip(comps,[sys.argv[2],sys.argv[3]]):
    w,h=x1-x0+1,y1-y0+1
    s=Image.open(shot).convert('RGB')
    sc=max(w/s.width,h/s.height); s=s.resize((int(s.width*sc)+1,int(s.height*sc)+1),Image.LANCZOS).crop((0,0,w,h))
    m=ndimage.binary_dilation(lab[y0:y1+1,x0:x1+1]==k,iterations=3)
    mk=Image.fromarray((m*255).astype(np.uint8)).filter(ImageFilter.GaussianBlur(0.8))
    out.paste(s,(x0,y0),mk)
out.save(sys.argv[4]); out.resize((1344,int(1344*out.height/out.width)),Image.LANCZOS).save(sys.argv[4].replace('.png','-prev.jpg'),quality=88)

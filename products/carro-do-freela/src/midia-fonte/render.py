# Remonta os vídeos da casa a partir dos originais do Kling, quadro a quadro,
# segundo receita.json (26/out). A receita foi CASADA contra o vídeo que estava
# no ar: cada quadro dele achado no original (um quadro, a média de dois na
# rampa de 2x, ou o flash — o quadro clareado com branco a 50/90/45%). Conferido:
# ~40 dB por quadro contra o arquivo antigo, nenhum fora do lugar.
# Saída: master sem perda (FFV1, RGB) — os encodes de entrega saem dele.
#
#   python3 render.py <pasta com <job>.mp4 do Kling> <pasta de saída>
import json, subprocess, numpy as np, sys, os
O=sys.argv[1]; DST=sys.argv[2]; W,H=1912,1080
rec=json.load(open(os.path.join(os.path.dirname(os.path.abspath(__file__)),'receita.json')))
cache={}
def clip(k):
    if k not in cache:
        r=subprocess.run(['ffmpeg','-v','error','-i',f'{O}/{k}.mp4','-f','rawvideo','-pix_fmt','rgb24','-'],capture_output=True,check=True).stdout
        cache[k]=np.frombuffer(r,np.uint8).reshape(-1,H,W,3)
    return cache[k]
for nome,saida in [('home-laco@hd.mp4','master-laco.mkv'),('login@hd.mp4','master-login.mkv')]:
    enc=subprocess.Popen(['ffmpeg','-v','error','-y','-f','rawvideo','-pix_fmt','rgb24','-s',f'{W}x{H}','-r','24','-i','-',
        '-c:v','ffv1','-level','3','-pix_fmt','bgr0',os.path.join(DST,saida)],stdin=subprocess.PIPE)
    for op in rec[nome]:
        c=clip(op['src'])
        if op['tipo']=='um': fr=c[op['f'][0]]
        elif op['tipo']=='media': fr=((c[op['f'][0]].astype(np.uint16)+c[op['f'][1]])+1)//2
        elif op['tipo']=='flash':
            a=op['a']; fr=np.clip(c[op['f']].astype(np.float32)*(1-a)+255*a+.5,0,255)
        enc.stdin.write(np.ascontiguousarray(fr,dtype=np.uint8).tobytes())
    enc.stdin.close(); enc.wait(); print(saida,len(rec[nome]),'quadros')

import json, sys, collections
rows=[json.loads(l) for l in open(sys.argv[1])]
seen={}
for r in rows: seen[(r['engine'],r['scenario'])]=r
engines=list(dict.fromkeys(r['engine'] for r in rows)); scen=list(dict.fromkeys(r['scenario'] for r in rows))
for metric in ['si_sdr','pesq_wb','estoi','OVRL','SIG','BAK']:
    print(f'\n## {metric}'); print('scenario'.ljust(22)+''.join(e.rjust(10) for e in engines))
    for s in scen:
        print(s.ljust(22)+''.join((f"{seen[(e,s)][metric]:10.2f}" if (e,s) in seen else ' '*10) for e in engines))
    avg=[ [seen[(e,s)][metric] for s in scen if (e,s) in seen and s!='clean'] for e in engines]
    print('MEAN(noisy)'.ljust(22)+''.join((f"{sum(a)/len(a):10.2f}" if a else ' '*10) for a in avg))
rt=[(e, sum(seen[(e,s)]['seconds'] for s in scen if (e,s) in seen)/max(1,sum(seen[(e,s)]['audio_s'] for s in scen if (e,s) in seen))) for e in engines]
print('\nCPU s per audio s:', ', '.join(f'{e}={v:.2f}' for e,v in rt))

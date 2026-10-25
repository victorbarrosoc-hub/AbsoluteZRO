# Quadros-chave da volta do carro na abertura (19/out · 5): a curva
# cubic-bezier(.42,0,.2,1) resolvida por bisseção, amostrada em 61 pontos,
# mais um quadro-chave EXATO onde a viagem passa de 180° (a troca de tampa).
# O carro anda de 42° a 402° (uma volta, saindo de onde ele estaciona);
# as tampas giram a VIAGEM (0..360) presas em 0..180 cada uma.
P1, P2 = (.42, 0), (.2, 1)
def bez(u, a, b): return 3*(1-u)**2*u*a + 3*(1-u)*u**2*b + u**3
def resolve(x):
    lo, hi = 0.0, 1.0
    for _ in range(80):
        m = (lo+hi)/2
        if bez(m, P1[0], P2[0]) < x: lo = m
        else: hi = m
    return bez((lo+hi)/2, P1[1], P2[1])
def x_de_y(y):
    lo, hi = 0.0, 1.0
    for _ in range(80):
        m = (lo+hi)/2
        if bez(m, P1[1], P2[1]) < y: lo = m
        else: hi = m
    u = (lo+hi)/2
    return bez(u, P1[0], P2[0])
pts = {round(i/60, 6): resolve(i/60) for i in range(61)}
pts[round(x_de_y(.5), 6)] = .5
xs = sorted(pts)
fmt = lambda v: ("%.3f" % v).rstrip("0").rstrip(".")
def kf(nome, f):
    linhas, linha = [], []
    for x in xs:
        linha.append("%s%%{transform:rotate(%sdeg)}" % (fmt(x*100), fmt(f(pts[x]*360))))
        if len(linha) == 3: linhas.append("".join(linha)); linha = []
    if linha: linhas.append("".join(linha))
    return "@keyframes %s{\n  " % nome + "\n  ".join(linhas) + " }"
print(kf("sptampa1", lambda v: min(v, 180)))
print(kf("sptampa2", lambda v: max(0, min(v-180, 180))))
print(kf("sporb", lambda v: 42+v))

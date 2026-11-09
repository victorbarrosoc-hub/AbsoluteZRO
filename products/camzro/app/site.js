// CAMZRO · a página inicial: o motion. As seções entram com a rolagem (IntersectionObserver põe .in) e as demonstrações
// andam por fases (data-* no elemento; o CSS anima). Cada demonstração só roda enquanto está na tela. Com "reduzir
// movimento", nada anda: cada uma mostra o quadro que conta a história. Sem animação por quadro: só o timecode do set
// muda de texto, 24 vezes por segundo, e só com a seção visível.
const reduzir = matchMedia('(prefers-reduced-motion: reduce)').matches
document.documentElement.classList.add('js')

// ───────── claro × escuro: a escolha do topo é a mesma do app (camzro.ajustes.v1 › tema); claro é o padrão ─────────
const CHAVE = 'camzro.ajustes.v1'
const lerAjustes = () => {
  try {
    const a = JSON.parse(localStorage.getItem(CHAVE) || 'null')
    return a && typeof a === 'object' ? a : {}
  } catch {
    return {}
  }
}
const aplicarTema = (t) => {
  document.documentElement.dataset.tema = t
  const meta = document.querySelector('meta[name="theme-color"]')
  if (meta) meta.content = t === 'escuro' ? '#000000' : '#fbfbfd'
}
aplicarTema(lerAjustes().tema === 'escuro' ? 'escuro' : 'claro')
document.getElementById('s-tema')?.addEventListener('click', () => {
  const t = document.documentElement.dataset.tema === 'escuro' ? 'claro' : 'escuro'
  aplicarTema(t)
  try {
    localStorage.setItem(CHAVE, JSON.stringify({ ...lerAjustes(), tema: t }))
  } catch {
    // sem armazenamento: vale só nesta aba
  }
})

// ───────── entrar com a rolagem ─────────
const revelar = new IntersectionObserver(
  (entradas) => {
    for (const e of entradas) {
      if (!e.isIntersecting) continue
      e.target.classList.add('in')
      revelar.unobserve(e.target)
    }
  },
  { rootMargin: '0px 0px -10% 0px' },
)
for (const el of document.querySelectorAll('.revela')) revelar.observe(el)

/**
 * Uma demonstração em fases: `fases` = [[valor, ms], …]; `aplicar(valor)` escreve no elemento. Anda só com o elemento na
 * tela; parada (reduzir movimento), fica no `quadro`. Devolve `ir(i)`, para a pessoa escolher uma fase à mão.
 */
function demonstracao(el, fases, aplicar, quadro) {
  if (!el) return () => {}
  if (reduzir) {
    aplicar(quadro)
    return (i) => aplicar(fases[i][0])
  }
  let i = 0
  let tempo = null
  const seguir = () => {
    aplicar(fases[i][0])
    tempo = setTimeout(() => {
      i = (i + 1) % fases.length
      seguir()
    }, fases[i][1])
  }
  const parar = () => {
    clearTimeout(tempo)
    tempo = null
  }
  new IntersectionObserver(([e]) => {
    if (e.isIntersecting && !tempo) seguir()
    else if (!e.isIntersecting && tempo) parar()
  }).observe(el)
  return (n) => {
    parar()
    i = n
    seguir()
  }
}

// o monitor: o app de verdade trocando de ferramenta (a legenda escolhe à mão)
const mon = document.getElementById('demo-mon')
const irMon = demonstracao(
  mon,
  [
    [0, 3200],
    [1, 3000],
    [2, 3000],
    [3, 3000],
  ],
  (f) => {
    mon.dataset.fase = String(f)
    for (const b of mon.querySelectorAll('[data-ir]')) b.setAttribute('aria-pressed', String(Number(b.dataset.ir) === f))
  },
  0,
)
mon?.addEventListener('click', (e) => {
  const b = e.target.closest('[data-ir]')
  if (b) irMon(Number(b.dataset.ir))
})

// exposição: a luz muda, 180° fica, o ISO acompanha (os valores seguem a conta do app: 1 stop = 2× o ISO)
const exp = document.getElementById('demo-exp')
const LUZ = [
  ['Sol', 100, 'Sol. ISO no mínimo.'],
  ['Nuvem', 400, 'Fechou o tempo: 2 stops no ISO.'],
  ['Sombra', 1600, 'Na sombra: mais 2 stops.'],
  ['Interior', 3200, 'Dentro: o ISO sobe; o ângulo não.'],
]
demonstracao(
  exp,
  [
    [0, 2600],
    [1, 2600],
    [2, 2600],
    [3, 3000],
  ],
  (f) => {
    exp.dataset.luz = String(f)
    document.getElementById('exp-iso').textContent = String(LUZ[f][1])
    document.getElementById('exp-luz').textContent = LUZ[f][0]
    document.getElementById('exp-dica').textContent = LUZ[f][2]
  },
  2,
)

// à prova de queda: os fragmentos vão para o disco, o app cai, o take volta
const qd = document.getElementById('demo-queda')
const ESTADO = ['gravando · 00:00:11:16', 'sem resposta', 'na volta']
demonstracao(
  qd,
  [
    [0, 5600],
    [1, 2000],
    [2, 3600],
  ],
  (f) => {
    qd.dataset.fase = String(f)
    document.getElementById('qd-estado').textContent = ESTADO[f]
  },
  2,
)

// o relógio do set: a hora do dia de verdade, em 24 fps, igual nas três câmeras
const tcs = document.getElementById('demo-tc')
if (tcs) {
  const campos = tcs.querySelectorAll('.tc')
  const dois = (n) => String(n).padStart(2, '0')
  const escrever = () => {
    const d = new Date()
    const q = Math.floor(d.getMilliseconds() / (1000 / 24))
    const t = `${dois(d.getHours())}:${dois(d.getMinutes())}:${dois(d.getSeconds())}:${dois(q)}`
    for (const c of campos) c.textContent = t
  }
  escrever()
  if (!reduzir) {
    let relogio = null
    new IntersectionObserver(([e]) => {
      if (e.isIntersecting && !relogio) relogio = setInterval(escrever, 1000 / 24)
      else if (!e.isIntersecting && relogio) {
        clearInterval(relogio)
        relogio = null
      }
    }).observe(tcs)
  }
}

// o ecossistema: o clipe anda do Maestro ao DaVinci
const fluxo = document.getElementById('demo-fluxo')
demonstracao(
  fluxo,
  [
    [0, 2200],
    [1, 2200],
    [2, 2200],
    [3, 2200],
    [4, 3000],
  ],
  (f) => {
    fluxo.dataset.fase = String(f)
  },
  1,
)

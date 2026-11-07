// RADION · a página inicial: o motion. As seções entram com a rolagem (IntersectionObserver põe .in), os números contam
// uma vez e as demonstrações andam por fases (data-* no elemento; o CSS anima). Cada demonstração só roda enquanto está
// na tela. Com "reduzir movimento", nada anda: cada uma mostra o quadro que conta a história.
const reduzir = matchMedia('(prefers-reduced-motion: reduce)').matches
document.documentElement.classList.add('js')

// ───────── claro × escuro: a escolha do topo vale aqui e no app (rd_tema); sem escolha, o sistema ─────────
const ler = () => {
  try {
    return localStorage.getItem('rd_tema')
  } catch {
    return null
  }
}
const aplicarTema = (t) => {
  document.documentElement.dataset.tema = t
  for (const m of document.querySelectorAll('meta[name="theme-color"]')) m.content = t === 'escuro' ? '#000000' : '#ffffff'
}
aplicarTema(ler() === 'escuro' || ler() === 'claro' ? ler() : matchMedia('(prefers-color-scheme: dark)').matches ? 'escuro' : 'claro')
document.getElementById('s-tema')?.addEventListener('click', () => {
  const t = document.documentElement.dataset.tema === 'escuro' ? 'claro' : 'escuro'
  aplicarTema(t)
  try {
    localStorage.setItem('rd_tema', t)
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
for (const el of document.querySelectorAll('.revela')) {
  // quem divide a linha com irmãos entra um pouco depois do anterior
  const irmaos = [...el.parentElement.children].filter((x) => x.classList.contains('revela'))
  el.style.setProperty('--atraso', `${Math.min(irmaos.indexOf(el), 5) * 60}ms`)
  revelar.observe(el)
}

// ───────── os números contam até o valor (o valor final já está no HTML) ─────────
const contar = new IntersectionObserver((entradas) => {
  for (const e of entradas) {
    if (!e.isIntersecting) continue
    contar.unobserve(e.target)
    const fim = Number(e.target.dataset.conta)
    if (reduzir || !fim) continue
    const t0 = performance.now()
    const passo = (t) => {
      const x = Math.min(1, (t - t0) / 1400)
      e.target.textContent = String(Math.round(fim * (1 - Math.pow(1 - x, 3))))
      if (x < 1) requestAnimationFrame(passo)
    }
    requestAnimationFrame(passo)
  }
})
for (const el of document.querySelectorAll('[data-conta]')) contar.observe(el)

/**
 * Uma demonstração em fases: `fases` = [[valor, ms], …]; `aplicar(valor)` escreve no elemento. Anda só com o elemento na
 * tela; parada (reduzir movimento), fica no `quadro`.
 */
function demonstracao(el, fases, aplicar, quadro) {
  if (!el) return
  if (reduzir) return aplicar(quadro)
  let i = 0
  let tempo = null
  const seguir = () => {
    aplicar(fases[i][0])
    tempo = setTimeout(() => {
      i = (i + 1) % fases.length
      seguir()
    }, fases[i][1])
  }
  new IntersectionObserver(([e]) => {
    if (e.isIntersecting && !tempo) seguir()
    else if (!e.isIntersecting && tempo) {
      clearTimeout(tempo)
      tempo = null
    }
  }).observe(el)
}

// o celular do herói: Rui chama a Câmera, você responde, a Direção fala com todos, Gravando cala o set
const cel = document.getElementById('demo-cel')
let flash = null
demonstracao(
  cel,
  [
    [0, 1200],
    [1, 2600],
    [2, 2800],
    [3, 2600],
    [4, 3200],
  ],
  (f) => {
    cel.dataset.fase = String(f)
    const falando = f === 2
    document.getElementById('demo-rotulo').textContent = falando ? 'Falando para' : 'Falar para'
    document.getElementById('demo-dica').textContent = falando ? '1 ouvindo' : f === 4 ? 'Gravando' : 'Segure para falar'
    clearTimeout(flash)
    cel.dataset.aviso = f === 4 && !reduzir ? '1' : ''
    if (f === 4 && !reduzir) flash = setTimeout(() => (cel.dataset.aviso = ''), 900)
  },
  2,
)

// os grupos do set: cada setor fala com o seu; a Direção, no Geral, com todos
const set = document.getElementById('demo-set')
const LEGENDA = { camera: 'A Câmera fala só com a Câmera.', som: 'O Som fala só com o Som.', geral: 'A Direção fala com todos no Geral.', luz: 'A Luz fala só com a Luz.' }
demonstracao(
  set,
  [
    ['camera', 2600],
    ['som', 2600],
    ['geral', 3000],
    ['luz', 2600],
  ],
  (f) => {
    set.dataset.fala = f
    document.getElementById('demo-set-legenda').textContent = LEGENDA[f]
  },
  'geral',
)

// Gravando: um toque cala o set; o Corta devolve
const grav = document.getElementById('demo-grav')
demonstracao(
  grav,
  [
    ['0', 2200],
    ['1', 3200],
  ],
  (f) => {
    grav.dataset.grav = f
    grav.querySelector('.s-grav-btn').textContent = f === '1' ? 'Gravando · cortar' : 'Gravando'
  },
  '1',
)

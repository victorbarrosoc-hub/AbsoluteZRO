// "Edite além do tempo.": a montagem feita no AEON com takes de câmera de verdade (scripts/montagem.mjs). O vídeo é o
// render do app; marca/home/cenas/montagem.json traz os clipes (take, curva) e a velocidade de cada quadro, então a linha
// embaixo do vídeo mostra a curva de cada take, a cabeça anda com o vídeo e o número é o do quadro na tela. Nada é
// inventado aqui: se o JSON não chega, fica só o vídeo. Toca só enquanto aparece; com "reduzir movimento" (ou economia
// de dados) não toca sozinho e o botão fica para quem quiser.

const $ = (s, r = document) => r.querySelector(s)
const sec = $('#montagem')
if (sec) iniciar()

function iniciar() {
  const video = $('#montagemVideo')
  const linha = $('#montagemLinha')
  const cabeca = $('#montagemCabeca')
  const leitura = $('#montagemVel')
  const botao = $('#montagemPlay')
  const parado = matchMedia('(prefers-reduced-motion: reduce)').matches || navigator.connection?.saveData
  let dados = null
  let segmentos = []
  let quer = !parado // a pessoa (ou o padrão) quer que toque
  let emTela = false
  let quadro = 0

  async function carregar() {
    if (dados) return
    try {
      dados = await (await fetch('marca/home/cenas/montagem.json')).json()
    } catch {
      return
    }
    // um pedaço por take, do tamanho que ele ocupa na saída, com a velocidade dele desenhada (log, 10% a 800%)
    const NS = 'http://www.w3.org/2000/svg'
    const y = (v) => (1 - (Math.log2(v / 100) + Math.log2(10)) / (Math.log2(8) + Math.log2(10))) * 100
    segmentos = dados.clipes.map((c) => {
      const d = document.createElement('div')
      d.className = 'montagem-clipe'
      d.style.flexGrow = String(c.fim - c.ini)
      d.dataset.take = c.take
      const k0 = Math.round(c.ini * dados.fps)
      const k1 = Math.round(c.fim * dados.fps)
      const pts = []
      for (let k = k0; k < k1; k++) pts.push(`${(((k - k0 + 0.5) / (k1 - k0)) * 100).toFixed(2)} ${y(dados.vel[k]).toFixed(2)}`)
      const svg = document.createElementNS(NS, 'svg')
      svg.setAttribute('viewBox', '0 0 100 100')
      svg.setAttribute('preserveAspectRatio', 'none')
      svg.innerHTML = `<line class="montagem-cem" x1="0" x2="100" y1="${y(100).toFixed(2)}" y2="${y(100).toFixed(2)}"/><path d="M${pts.join('L')}"/>`
      const nome = document.createElement('span')
      nome.textContent = c.curva
      d.append(svg, nome)
      return { el: d, ...c }
    })
    linha.prepend(...segmentos.map((s) => s.el))
    mostrar()
  }

  function mostrar() {
    if (!dados) return
    // sem vídeo carregado, o pôster: o quadro da crista da onda
    const t = video.src ? video.currentTime : dados.poster
    const k = Math.min(dados.vel.length - 1, Math.max(0, Math.floor(t * dados.fps)))
    const v = dados.vel[k]
    leitura.textContent = `${v}%`
    leitura.dataset.faixa = v > 102 ? 'rapido' : v < 98 ? 'lento' : 'normal'
    cabeca.style.left = `${Math.min(100, (t / dados.duracao) * 100).toFixed(3)}%`
    for (const s of segmentos) s.el.classList.toggle('agora', t >= s.ini && t < s.fim)
  }

  function laco() {
    mostrar()
    quadro = requestAnimationFrame(laco)
  }

  function atualizar() {
    const tocar = quer && emTela
    botao.setAttribute('aria-label', quer ? 'Pausar' : 'Tocar')
    botao.classList.toggle('pausado', !quer)
    cancelAnimationFrame(quadro)
    if (tocar) {
      if (!video.src) video.src = video.dataset.src
      video.play().catch(() => {})
      quadro = requestAnimationFrame(laco)
    } else {
      video.pause()
      mostrar()
    }
  }

  botao.addEventListener('click', () => {
    quer = !quer
    if (quer) carregar()
    atualizar()
  })
  video.addEventListener('playing', () => sec.classList.add('tocando'), { once: true })
  video.addEventListener('seeked', mostrar)
  // o JSON (2 KB) vem um pouco antes de aparecer; o vídeo só quando aparece e se for tocar
  new IntersectionObserver(
    (es) => {
      if (es[0].isIntersecting) carregar()
    },
    { rootMargin: '400px 0px' },
  ).observe(sec)
  new IntersectionObserver(
    (es) => {
      emTela = es[0].isIntersecting
      atualizar()
    },
    { threshold: 0.35 },
  ).observe(sec)
  atualizar()
}

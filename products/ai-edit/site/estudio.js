// O "Teste ao vivo" do site: o AEON na própria página. Velocidade: a curva sobre um take de câmera de verdade em 50 ou
// 60 qps (onda, cavalo, pelicano ou flores; marca/home/cenas: a câmera lenta usa quadros reais, sem travar), que toca de verdade na velocidade da curva (playbackRate), com as curvas prontas do app (src/velocidade.js; a conta é repetida aqui
// porque o site não carrega código do editor enquanto o AEON está fechado ao público). Cortes, Legenda, Zoom e
// Entrega: um vídeo de exemplo (uma foto e uma fala de 20,5 s escrita
// aqui). Não transcreve, não envia e não grava nada: mostra as mesmas regras do app (pausas acima de um limite viram
// proposta e só saem ao aprovar; os estilos de legenda Destaque, Pop e Limpa; o zoom de 112% ou 122% nas frases de
// ênfase; o que cada destino leva) e a linha do tempo reage a cada escolha. O tempo do exemplo só anda enquanto o
// estúdio está na tela; com "reduzir movimento" nada toca sozinho e a prévia fica parada num quadro.

const $ = (s, r = document) => r.querySelector(s)
const $$ = (s, r = document) => [...r.querySelectorAll(s)]
const reduzir = matchMedia('(prefers-reduced-motion: reduce)')

const estudio = $('#estudio')
if (estudio) iniciar()

function iniciar() {
  // ───────── o exemplo: fala e pausa, com a frase de cada trecho e a palavra de ênfase (onde entra o zoom) ─────────
  const TRECHOS = [
    { fala: 'Todo vídeo começa no bruto.', d: 3.1 },
    { pausa: 0.55 },
    { fala: 'Horas de material, pausas, respiros.', d: 2.4 },
    { pausa: 0.25 },
    { fala: 'O AEON encontra cada silêncio', d: 3.7, enfase: true },
    { pausa: 1.15 },
    { fala: 'e propõe o corte.', d: 2.55 },
    { pausa: 0.2 },
    { fala: 'Você aprova o que fica.', d: 3.0, enfase: true },
    { pausa: 0.4 },
    { fala: 'O tempo é seu.', d: 3.2, enfase: true },
  ]
  let ini = 0
  for (const t of TRECHOS) {
    t.d = t.d ?? t.pausa
    t.ini = ini
    ini += t.d
    if (t.fala) {
      // blocos de no máximo 4 palavras (o preset "fala"); 5 palavras viram 3 + 2
      const palavras = t.fala.split(' ').map((texto, k, todas) => ({ texto, ini: t.ini + (t.d * k) / todas.length, fim: t.ini + (t.d * (k + 1)) / todas.length }))
      const corte = palavras.length > 4 ? Math.ceil(palavras.length / 2) : palavras.length
      t.blocos = [palavras.slice(0, corte), palavras.slice(corte)].filter((b) => b.length)
    }
  }
  const TOTAL = ini

  const S = { aba: 'velocidade', rampa: null, x: 0, limiar: 0.45, aprovado: false, estilo: 'destaque', zoom: 1.22, destino: 'fcpxml', tocando: !reduzir.matches, t: 0.9, emTela: false }
  const cortada = (t) => t.pausa !== undefined && S.aprovado && t.pausa >= S.limiar
  const marcada = (t) => t.pausa !== undefined && t.pausa >= S.limiar
  const duracao = () => TRECHOS.reduce((s, t) => s + (cortada(t) ? 0 : t.d), 0)
  const virgula = (n, casas = 1) => n.toFixed(casas).replace('.', ',')
  const relogio = (s) => `${Math.floor(s / 60)}:${String(Math.floor(s % 60)).padStart(2, '0')}`

  // ───────── a linha do tempo: três faixas com os mesmos trechos (zoom, clipe, legenda), para tudo fechar junto ─────────
  let semente = 11
  const acaso = () => (semente = (semente * 9301 + 49297) % 233280) / 233280
  const faixas = { zooms: $('#linhaZooms'), trilha: $('#linhaTrilha'), legendas: $('#linhaLegendas') }
  const celulas = TRECHOS.map((t) => {
    const zoom = el('div', 'celula')
    const clipe = el('div', `celula ${t.fala ? 'fala' : 'pausa'}`)
    const leg = el('div', 'celula')
    const corpo = el('div', 'clipe')
    const barras = Math.max(3, Math.round(t.d * 9))
    for (let i = 0; i < barras; i++) {
      const b = el('i')
      b.style.height = `${t.fala ? 26 + acaso() * 66 : 6 + acaso() * 10}%`
      corpo.append(b)
    }
    clipe.append(corpo)
    if (t.enfase) zoom.append(el('span', 'marca-zoom'))
    if (t.fala) for (const b of t.blocos) leg.append(Object.assign(el('span', 'marca-legenda'), { textContent: b.map((p) => p.texto).join(' ') }))
    faixas.zooms.append(zoom)
    faixas.trilha.append(clipe)
    faixas.legendas.append(leg)
    return { zoom, clipe, leg }
  })

  function desenharLinha() {
    const fica = TRECHOS.map((t) => !cortada(t))
    TRECHOS.forEach((t, i) => {
      const fora = !fica[i]
      celulas[i].clipe.classList.toggle('clipe-ini', fica[i] && !fica[i - 1])
      celulas[i].clipe.classList.toggle('clipe-fim', fica[i] && !fica[i + 1])
      const w = fora ? '0%' : `${((t.d / TOTAL) * 100).toFixed(3)}%`
      for (const c of Object.values(celulas[i])) c.style.flexBasis = w
      celulas[i].clipe.classList.toggle('marcada', marcada(t) && !fora)
      celulas[i].clipe.classList.toggle('fora', fora)
    })
    estudio.classList.toggle('cortado', S.aprovado && TRECHOS.some(cortada))
    estudio.classList.toggle('com-zoom', S.zoom > 1)
  }

  // ───────── a prévia: legenda no estilo escolhido, zoom na ênfase, tempo de saída ─────────
  // a cena da aba (cada aba tem a sua foto; a da vez fica por cima, com a troca suave do CSS)
  const cenas = $$('.visor-cena', estudio)
  const legenda = $('#visorLegenda')
  const selo = $('#visorZoom')
  let chaveLegenda = ''
  function desenharPrevia() {
    if (S.aba === 'velocidade') return mostrarRampa()
    const t = TRECHOS.find((x) => S.t >= x.ini && S.t < x.ini + x.d) || TRECHOS[0]
    // zoom: só nas frases de ênfase, com a mola do CSS
    const escala = t.fala && t.enfase ? S.zoom : 1
    for (const c of cenas) c.style.transform = escala > 1 && c.dataset.cena === S.aba ? `scale(${escala})` : ''
    selo.textContent = `${Math.round(S.zoom * 100)}%`
    selo.classList.toggle('visivel', escala > 1)
    // legenda: some na pausa; o bloco da vez com a palavra da vez
    let bloco = null
    if (t.fala) bloco = t.blocos.find((b) => S.t < b[b.length - 1].fim) || t.blocos[t.blocos.length - 1]
    const agora = bloco ? bloco.findIndex((p) => S.t >= p.ini && S.t < p.fim) : -1
    const chave = `${S.estilo}|${bloco ? bloco[0].ini : '-'}|${agora}`
    if (chave !== chaveLegenda) {
      chaveLegenda = chave
      legenda.dataset.estilo = S.estilo
      legenda.replaceChildren(
        ...(bloco || []).flatMap((p, k) => {
          const b = el('b')
          b.textContent = p.texto
          if (S.estilo === 'destaque') b.className = k < agora ? 'dita' : k === agora ? 'agora' : 'vem'
          else if (S.estilo === 'pop') b.className = k < agora ? 'dita' : k === agora ? 'agora surge' : 'escondida'
          return k < bloco.length - 1 ? [b, ' '] : [b]
        }),
      )
    }
    // tempo de saída: o que sobra depois dos cortes
    const passou = TRECHOS.reduce((s, x) => s + (cortada(x) || x.ini >= S.t ? 0 : Math.min(x.d, S.t - x.ini)), 0)
    $('#visorTempo').textContent = `${relogio(passou)} / ${relogio(duracao())}`
    // cabeça de leitura na mesma conta da linha
    $('#linhaCabeca').style.left = `calc(16px + (100% - 32px) * ${(passou / TOTAL).toFixed(4)})`
  }

  // ───────── tocar: só enquanto aparece e não pausado; pula as pausas cortadas, como o app ─────────
  let quadro = 0
  let antes = 0
  function laco(agora) {
    const dt = antes ? Math.min(0.1, (agora - antes) / 1000) : 0
    antes = agora
    if (S.aba === 'velocidade') {
      andarRampa(dt)
      quadro = requestAnimationFrame(laco)
      return
    }
    S.t += dt
    let t = TRECHOS.find((x) => S.t >= x.ini && S.t < x.ini + x.d)
    while (t && cortada(t)) {
      S.t = t.ini + t.d
      t = TRECHOS.find((x) => S.t >= x.ini && S.t < x.ini + x.d)
    }
    if (S.t >= TOTAL) S.t = 0
    desenharPrevia()
    quadro = requestAnimationFrame(laco)
  }
  function tocar() {
    cancelAnimationFrame(quadro)
    antes = 0
    const ligado = S.tocando && S.emTela
    estudio.classList.toggle('tocando', ligado)
    const botao = $('#visorPlay')
    botao.setAttribute('aria-label', S.tocando ? 'Pausar' : 'Tocar')
    botao.classList.toggle('pausado', !S.tocando)
    if (ligado) quadro = requestAnimationFrame(laco)
    else desenharPrevia()
    tocarVideo(ligado)
  }
  $('#visorPlay').addEventListener('click', () => {
    S.tocando = !S.tocando
    tocar()
  })
  new IntersectionObserver(
    (es) => {
      S.emTela = es[0].isIntersecting
      tocar()
    },
    { threshold: 0.25 },
  ).observe(estudio)

  // ───────── abas: o segmento desliza até a escolhida (setas do teclado também) ─────────
  const abas = $$('[role="tab"]', estudio)
  const marcaAba = $('.segmentos-marca', estudio)
  function irAba(nome, foco = false) {
    S.aba = nome
    estudio.dataset.aba = nome
    for (const b of abas) {
      const sim = b.dataset.aba === nome
      b.setAttribute('aria-selected', String(sim))
      b.tabIndex = sim ? 0 : -1
      $(`#${b.getAttribute('aria-controls')}`).hidden = !sim
      if (sim) {
        marcaAba.style.width = `${b.offsetWidth}px`
        marcaAba.style.transform = `translateX(${b.offsetLeft}px)`
        if (foco) b.focus()
      }
    }
    for (const c of cenas) c.classList.toggle('ativa', c.dataset.cena === nome)
    if (nome === 'entrega') desenharPacote()
    if (nome === 'velocidade') requestAnimationFrame(desenharCurva)
    tocarVideo(S.tocando && S.emTela)
  }
  for (const b of abas) b.addEventListener('click', () => irAba(b.dataset.aba))
  $('.segmentos', estudio).addEventListener('keydown', (e) => {
    const passo = { ArrowRight: 1, ArrowLeft: -1 }[e.key]
    if (!passo) return
    e.preventDefault()
    const i = abas.findIndex((b) => b.dataset.aba === S.aba)
    irAba(abas[(i + passo + abas.length) % abas.length].dataset.aba, true)
  })
  addEventListener('resize', () => irAba(S.aba))

  // ───────── cortes: o limite marca as pausas (laranja); aprovar tira da linha; desfazer devolve ─────────
  const limiar = $('#limiar')
  let mostrada = duracao()
  let tween = 0
  function desenharCortes() {
    const marcadas = TRECHOS.filter(marcada)
    // o ganho sai da mesma conta da duração (20,5 − 17,9 = 2,6, sem diferença de arredondamento)
    const ganho = TOTAL - TRECHOS.reduce((s, t) => s + (marcada(t) ? 0 : t.d), 0)
    $('#limiarValor').textContent = `${virgula(S.limiar, 2)} s`
    const aprovar = $('#aprovarCortes')
    aprovar.hidden = S.aprovado
    aprovar.disabled = !marcadas.length
    aprovar.textContent = marcadas.length ? `Aprovar ${marcadas.length} ${marcadas.length === 1 ? 'corte' : 'cortes'}` : 'Nenhuma pausa'
    $('#desfazerCortes').hidden = !S.aprovado
    $('#duracaoGanho').textContent = S.aprovado ? (ganho ? `−${virgula(ganho)} s` : '') : ganho ? `${virgula(ganho)} s para tirar` : ''
    // a duração conta até o valor novo
    const alvo = duracao()
    cancelAnimationFrame(tween)
    const de = mostrada
    const t0 = performance.now()
    const passo = (agora) => {
      const k = reduzir.matches ? 1 : Math.min(1, (agora - t0) / 600)
      mostrada = de + (alvo - de) * (1 - (1 - k) ** 3)
      $('#duracaoAgora').textContent = `${virgula(mostrada)} s`
      if (k < 1) tween = requestAnimationFrame(passo)
    }
    tween = requestAnimationFrame(passo)
    desenharLinha()
    desenharPrevia()
  }
  limiar.addEventListener('input', () => {
    S.limiar = Number(limiar.value)
    desenharCortes()
  })
  $('#aprovarCortes').addEventListener('click', () => {
    S.aprovado = true
    desenharCortes()
    $('#desfazerCortes').focus()
  })
  $('#desfazerCortes').addEventListener('click', () => {
    S.aprovado = false
    desenharCortes()
    $('#aprovarCortes').focus()
  })

  // ───────── escolhas em ficha (estilo, zoom, destino): um grupo de rádio com setas ─────────
  function grupo(sel, chave, aoMudar) {
    const caixa = $(sel)
    const opcoes = $$('[role="radio"]', caixa)
    const marcar = (b, foco) => {
      for (const o of opcoes) {
        o.setAttribute('aria-checked', String(o === b))
        o.tabIndex = o === b ? 0 : -1
      }
      const v = b.dataset[chave]
      S[chave] = chave === 'zoom' ? Number(v) : v
      if (foco) b.focus()
      aoMudar()
    }
    for (const o of opcoes) {
      o.tabIndex = o.getAttribute('aria-checked') === 'true' ? 0 : -1
      o.addEventListener('click', () => marcar(o))
    }
    caixa.addEventListener('keydown', (e) => {
      const passo = { ArrowRight: 1, ArrowDown: 1, ArrowLeft: -1, ArrowUp: -1 }[e.key]
      if (!passo) return
      e.preventDefault()
      const i = opcoes.findIndex((o) => o.getAttribute('aria-checked') === 'true')
      marcar(opcoes[(i + passo + opcoes.length) % opcoes.length], true)
    })
  }
  grupo('#estilos', 'estilo', () => {
    chaveLegenda = ''
    desenharPrevia()
  })
  grupo('#zooms', 'zoom', () => {
    desenharLinha()
    desenharPrevia()
  })
  grupo('#destinos', 'destino', desenharPacote)

  // ───────── entrega: o que vai no arquivo de cada destino (o mesmo que os exportadores do app gravam) ─────────
  function desenharPacote() {
    let clipes = 1
    TRECHOS.forEach((t) => cortada(t) && clipes++)
    const z = S.zoom > 1 ? `${Math.round(S.zoom * 100)}%` : null
    const nomeEstilo = { destaque: 'Destaque', pop: 'Pop', limpa: 'Limpa' }[S.estilo]
    const ITENS = {
      fcpxml: ['Entrevista.fcpxml', `${clipes} ${clipes === 1 ? 'clipe' : 'clipes'} na linha do tempo`, z && `Zoom de ${z} na escala do clipe`, S.rampa && 'Rampa em degraus de velocidade (timeMap)', 'Cores e marcadores', 'Legenda em .srt e .vtt'],
      xmeml: ['Entrevista.xml', `${clipes} ${clipes === 1 ? 'clipe' : 'clipes'} na linha do tempo`, z && `Zoom de ${z} no efeito Movimento`, S.rampa && 'Rampa em degraus de velocidade constante', 'Cores como rótulos e marcadores', 'Legenda em .srt e .vtt'],
      resolve: ['Entrevista.fcpxml e .edl', `${clipes} ${clipes === 1 ? 'clipe' : 'clipes'} na linha do tempo`, z && `Zoom de ${z} no .fcpxml`, S.rampa && 'Rampa em degraus (M2 no .edl)', 'Cores e marcadores', 'Legenda em .srt e .vtt'],
      video: ['Entrevista.mp4', `${virgula(duracao())} s depois dos cortes`, `Legenda ${nomeEstilo} gravada no vídeo`, z && `Zoom de ${z} gravado`, S.rampa && 'Rampa gravada, som só em 100%', 'Igual à prévia, quadro a quadro'],
    }[S.destino].filter(Boolean)
    $('#pacote').replaceChildren(
      ...ITENS.map((texto, i) => {
        const li = el('li', i === 0 ? 'arquivo' : '')
        li.style.setProperty('--i', i)
        li.textContent = texto
        return li
      }),
    )
  }

  // ───────── velocidade: a curva (log, 10% a 800%, 100% marcado) sobre o take escolhido ─────────
  const V_MIN = 0.1
  const V_MAX = 8
  const RAMPAS = {
    normal: null,
    heroi: [[0, 2], [0.3, 2], [0.44, 0.25], [0.6, 0.25], [0.74, 2], [1, 2]],
    bala: [[0, 3], [0.36, 3], [0.5, 0.12], [0.64, 3], [1, 3]],
    vale: [[0, 4], [0.28, 3.2], [0.5, 0.35], [0.72, 3.2], [1, 4]],
    pico: [[0, 1], [0.36, 1], [0.5, 6], [0.64, 1], [1, 1]],
    montagem: [[0, 1], [0.18, 4], [0.36, 0.5], [0.58, 0.5], [0.76, 4], [1, 1]],
  }
  S.rampa = RAMPAS.heroi.map((p) => p.slice())
  const video = $('#visorVideo')
  const svg = $('#curvaDemo svg')
  // os takes (marca/home/cenas/LEIAME.md): trocar mantém a curva e recomeça do primeiro quadro
  const TAKES = { onda: 'Onda quebrando na praia', cavalo: 'Cavalo rolando na grama', pelicano: 'Pelicano voando sobre o mar', flores: 'Flores ao vento' }
  S.take = 'onda'
  grupo('#takesDemo', 'take', () => {
    const tocava = Boolean(video.src)
    video.poster = `marca/home/cenas/${S.take}.jpg`
    video.dataset.src = `marca/home/cenas/${S.take}.mp4`
    video.setAttribute('aria-label', `${TAKES[S.take]}, na velocidade da curva`)
    S.x = 0
    if (tocava) {
      video.src = video.dataset.src
      tocarVideo(S.tocando && S.emTela)
    }
    mostrarRampa()
  })
  const duracaoVideo = () => (Number.isFinite(video.duration) && video.duration > 0 ? video.duration : 10)
  const pct = (v) => `${Math.round(v * 100)}%`

  /** v(x): Hermite monótona no log2 da velocidade, a mesma de src/velocidade.js › avaliar. */
  function vel(x) {
    const ps = S.rampa
    if (!ps) return 1
    const n = ps.length
    const xs = ps.map((p) => p[0])
    const ys = ps.map((p) => Math.log2(p[1]))
    if (x <= xs[0]) return 2 ** ys[0]
    if (x >= xs[n - 1]) return 2 ** ys[n - 1]
    const d = []
    for (let i = 0; i < n - 1; i++) d.push((ys[i + 1] - ys[i]) / (xs[i + 1] - xs[i]))
    const m = [d[0], ...d.slice(1).map((di, i) => (d[i] * di <= 0 ? 0 : (d[i] + di) / 2)), d[n - 2]]
    for (let i = 0; i < n - 1; i++) {
      if (d[i] === 0) {
        m[i] = m[i + 1] = 0
        continue
      }
      const a = m[i] / d[i]
      const b = m[i + 1] / d[i]
      const s2 = a * a + b * b
      if (s2 > 9) {
        m[i] = (3 / Math.sqrt(s2)) * a * d[i]
        m[i + 1] = (3 / Math.sqrt(s2)) * b * d[i]
      }
    }
    let i = 0
    while (i < n - 2 && x > xs[i + 1]) i++
    const h = xs[i + 1] - xs[i]
    const t = (x - xs[i]) / h
    const y = (2 * t ** 3 - 3 * t ** 2 + 1) * ys[i] + (t ** 3 - 2 * t ** 2 + t) * h * m[i] + (-2 * t ** 3 + 3 * t ** 2) * ys[i + 1] + (t ** 3 - t ** 2) * h * m[i + 1]
    return Math.min(V_MAX, Math.max(V_MIN, 2 ** y))
  }
  // tempo de saída até x (∫ dx / v), em frações do vídeo
  const saidaAte = (x) => {
    let s = 0
    const n = 200
    for (let k = 0; k < n; k++) s += 1 / vel(((k + 0.5) / n) * x)
    return (s / n) * x
  }

  function andarRampa(dt) {
    const D = duracaoVideo()
    S.x += (dt * vel(S.x)) / D
    if (S.x >= 1) {
      S.x = 0
      video.currentTime = 0
    }
    const v = vel(S.x)
    const taxa = Math.min(16, Math.max(0.0625, v))
    if (Math.abs(video.playbackRate - taxa) > 1e-3) video.playbackRate = taxa
    if (Math.abs(video.currentTime - S.x * D) > 0.3) video.currentTime = S.x * D
    mostrarRampa()
  }

  function mostrarRampa() {
    const v = vel(S.x)
    const leitura = $('#visorVelocidade')
    leitura.textContent = pct(v)
    leitura.dataset.faixa = v > 1.02 ? 'rapido' : v < 0.98 ? 'lento' : 'normal'
    const D = duracaoVideo()
    $('#visorTempo').textContent = `${relogio(D * saidaAte(S.x))} / ${relogio(D * saidaAte(1))}`
    const cab = svg.querySelector('.curva-cabeca')
    if (cab) cab.setAttribute('transform', `translate(${S.x * svg.clientWidth} 0)`)
  }

  function desenharDuracaoRampa() {
    const D = duracaoVideo()
    $('#rampaDuracao').textContent = `${virgula(D * saidaAte(1))} s`
    $('#rampaAntes').textContent = `de ${virgula(D)} s`
  }

  const NS = 'http://www.w3.org/2000/svg'
  let arrasto = null
  let focado = -1
  function geometria() {
    const w = svg.clientWidth || 1000
    const h = svg.clientHeight || 200
    const topo = 16
    const base = h - 14
    const LMAX = Math.log2(V_MAX)
    const LMIN = Math.log2(V_MIN)
    return { w, h, yDe: (v) => topo + ((LMAX - Math.log2(v)) / (LMAX - LMIN)) * (base - topo), vDe: (y) => 2 ** (LMAX - ((Math.min(base, Math.max(topo, y)) - topo) / (base - topo)) * (LMAX - LMIN)) }
  }
  function desenharCurva() {
    const { w, h, yDe } = geometria()
    svg.setAttribute('viewBox', `0 0 ${w} ${h}`)
    const add = (tag, attrs) => {
      const e = document.createElementNS(NS, tag)
      for (const [k, v] of Object.entries(attrs)) e.setAttribute(k, v)
      svg.append(e)
      return e
    }
    svg.replaceChildren()
    for (const v of [8, 4, 2, 1, 0.5, 0.25, 0.1]) {
      add('line', { x1: 0, x2: w, y1: yDe(v), y2: yDe(v), class: v === 1 ? 'curva-grade curva-cem' : 'curva-grade' })
      add('text', { x: 6, y: yDe(v) - 4, class: 'curva-rotulo' }).textContent = pct(v)
    }
    let d = ''
    for (let k = 0; k <= 160; k++) d += `${k ? 'L' : 'M'}${((k / 160) * w).toFixed(1)} ${yDe(vel(k / 160)).toFixed(1)}`
    add('path', { d: `${d}L${w} ${h}L0 ${h}Z`, class: 'curva-area' })
    add('path', { d, class: 'curva-linha' })
    const cab = add('g', { class: 'curva-cabeca' })
    const linhaCab = document.createElementNS(NS, 'line')
    for (const [k, v] of Object.entries({ x1: 0, x2: 0, y1: 0, y2: h })) linhaCab.setAttribute(k, v)
    cab.append(linhaCab)
    const ps = S.rampa || [[0, 1], [1, 1]]
    ps.forEach(([x, v], i) => {
      const c = add('circle', { cx: x * w, cy: yDe(v), r: 9, class: 'curva-ponto', tabindex: 0, role: 'slider', 'aria-label': `Ponto ${i + 1}`, 'aria-valuetext': `${pct(v)} em ${Math.round(x * 100)}% do vídeo`, 'aria-valuemin': 10, 'aria-valuemax': 800, 'aria-valuenow': Math.round(v * 100) })
      c.dataset.i = i
      if (i === focado) requestAnimationFrame(() => c.focus())
    })
    mostrarRampa()
    desenharDuracaoRampa()
  }

  function mudarRampa(ps, { marcar = true } = {}) {
    S.rampa = ps && !ps.every(([, v]) => Math.abs(v - 1) < 1e-6) ? ps : null
    if (marcar) for (const b of $$('#rampas [role="radio"]')) b.setAttribute('aria-checked', String(JSON.stringify(RAMPAS[b.dataset.rampa]) === JSON.stringify(S.rampa)))
    desenharCurva()
  }
  function moverPonto(i, x, v) {
    const ps = (S.rampa || [[0, 1], [1, 1]]).map((p) => p.slice())
    if (i > 0 && i < ps.length - 1) ps[i][0] = Math.min(ps[i + 1][0] - 0.03, Math.max(ps[i - 1][0] + 0.03, x))
    ps[i][1] = Math.min(V_MAX, Math.max(V_MIN, v))
    return ps
  }
  const noSvg = (e) => {
    const r = svg.getBoundingClientRect()
    return { x: (e.clientX - r.left) / r.width, y: ((e.clientY - r.top) / r.height) * (svg.clientHeight || 200) }
  }
  svg.addEventListener('pointerdown', (e) => {
    const c = e.target.closest('.curva-ponto')
    if (!c || e.button !== 0) return
    e.preventDefault()
    svg.setPointerCapture(e.pointerId)
    focado = Number(c.dataset.i)
    arrasto = focado
  })
  svg.addEventListener('pointermove', (e) => {
    if (arrasto === null) return
    const { x, y } = noSvg(e)
    mudarRampa(moverPonto(arrasto, x, geometria().vDe(y)))
  })
  const soltar = () => (arrasto = null)
  svg.addEventListener('pointerup', soltar)
  svg.addEventListener('pointercancel', soltar)
  svg.addEventListener('dblclick', (e) => {
    if (e.target.closest('.curva-ponto')) return
    const { x, y } = noSvg(e)
    const ps = [...(S.rampa || [[0, 1], [1, 1]]), [x, geometria().vDe(y)]].sort((a, b) => a[0] - b[0])
    focado = ps.findIndex((p) => p[0] === x)
    mudarRampa(ps)
  })
  svg.addEventListener('keydown', (e) => {
    const c = e.target.closest('.curva-ponto')
    if (!c) return
    const i = Number(c.dataset.i)
    const ps = S.rampa || [[0, 1], [1, 1]]
    const [x, v] = ps[i]
    const novos = { ArrowUp: () => moverPonto(i, x, v * 1.12), ArrowDown: () => moverPonto(i, x, v / 1.12), ArrowRight: () => moverPonto(i, x + 0.03, v), ArrowLeft: () => moverPonto(i, x - 0.03, v) }[e.key]?.() ?? ((e.key === 'Delete' || e.key === 'Backspace') && i > 0 && i < ps.length - 1 ? ps.filter((_, k) => k !== i) : null)
    if (!novos) return
    e.preventDefault()
    focado = Math.min(i, novos.length - 1)
    mudarRampa(novos)
  })
  for (const b of $$('#rampas [role="radio"]')) b.addEventListener('click', () => {
    focado = -1
    mudarRampa(RAMPAS[b.dataset.rampa] ? RAMPAS[b.dataset.rampa].map((p) => p.slice()) : null)
  })
  $('#rampas').addEventListener('keydown', (e) => {
    const passo = { ArrowRight: 1, ArrowDown: 1, ArrowLeft: -1, ArrowUp: -1 }[e.key]
    if (!passo) return
    e.preventDefault()
    const bs = $$('#rampas [role="radio"]')
    const i = bs.findIndex((b) => b.getAttribute('aria-checked') === 'true')
    const b = bs[(Math.max(0, i) + passo + bs.length) % bs.length]
    b.click()
    b.focus()
  })
  for (const b of $$('#rampas [role="radio"]')) b.tabIndex = b.getAttribute('aria-checked') === 'true' ? 0 : -1
  new ResizeObserver(() => S.aba === 'velocidade' && desenharCurva()).observe(svg)
  video.addEventListener('loadedmetadata', desenharCurva)

  /** O vídeo só baixa e toca na aba Velocidade, com o estúdio na tela e sem pausa. */
  function tocarVideo(ligado) {
    if (S.aba === 'velocidade' && ligado) {
      if (!video.src) video.src = video.dataset.src
      video.play().catch(() => {})
    } else video.pause()
  }

  irAba('velocidade')
  desenharCortes()
  desenharPacote()
}

function el(tag, classe = '') {
  const e = document.createElement(tag)
  if (classe) e.className = classe
  return e
}

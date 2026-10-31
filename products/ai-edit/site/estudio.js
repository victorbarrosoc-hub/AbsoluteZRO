// O "Teste ao vivo" do site: o AEON na própria página, com um vídeo de exemplo (uma foto e uma fala de 20,5 s escrita
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

  const S = { aba: 'cortes', limiar: 0.45, aprovado: false, estilo: 'destaque', zoom: 1.22, destino: 'fcpxml', tocando: !reduzir.matches, t: 0.9, emTela: false }
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
  const img = $('#visorImg')
  const legenda = $('#visorLegenda')
  const selo = $('#visorZoom')
  let chaveLegenda = ''
  function desenharPrevia() {
    const t = TRECHOS.find((x) => S.t >= x.ini && S.t < x.ini + x.d) || TRECHOS[0]
    // zoom: só nas frases de ênfase, com a mola do CSS
    const escala = t.fala && t.enfase ? S.zoom : 1
    img.style.transform = escala > 1 ? `scale(${escala})` : ''
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
    if (nome === 'entrega') desenharPacote()
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
      fcpxml: ['Entrevista.fcpxml', `${clipes} ${clipes === 1 ? 'clipe' : 'clipes'} na linha do tempo`, z && `Zoom de ${z} na escala do clipe`, 'Cores e marcadores', 'Legenda em .srt e .vtt'],
      xmeml: ['Entrevista.xml', `${clipes} ${clipes === 1 ? 'clipe' : 'clipes'} na linha do tempo`, z && `Zoom de ${z} no efeito Movimento`, 'Cores como rótulos e marcadores', 'Legenda em .srt e .vtt'],
      resolve: ['Entrevista.fcpxml e .edl', `${clipes} ${clipes === 1 ? 'clipe' : 'clipes'} na linha do tempo`, z && `Zoom de ${z} no .fcpxml`, 'Cores e marcadores', 'Legenda em .srt e .vtt'],
      video: ['Entrevista.mp4', `${virgula(duracao())} s depois dos cortes`, `Legenda ${nomeEstilo} gravada no vídeo`, z && `Zoom de ${z} gravado`, 'Igual à prévia, quadro a quadro'],
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

  irAba('cortes')
  desenharCortes()
  desenharPacote()
}

function el(tag, classe = '') {
  const e = document.createElement(tag)
  if (classe) e.className = classe
  return e
}

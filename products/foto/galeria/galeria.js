// A galeria do cliente: abre pelo link, sem cadastro. PIN (se houver) → grade com as fotos (pilhas de parecidas com a
// melhor na frente, abrindo no lugar) → o coração escolhe (na hora; se a rede falhar, desfaz e avisa) → contador fixo →
// foto grande com arrastar para a próxima, "esta ou esta" dentro da pilha, comentário e pedidos por foto → revisar e
// enviar com o nome → conclusão. Depois de enviada, só leitura.
//
// Preact + htm de /vendor, por caminho relativo (a CSP não aceita import map nem script inline). Nada de animação por
// quadro no Preact: o arrastar mexe no estilo direto. A página não leva o nome do produto: assina Absolute ZRO.
// A imagem com marca-d'água já vem gravada nos pixels por quem publicou; aqui só não há menu de contexto na foto.

import { render } from '../../vendor/preact/preact.mjs'
import { useCallback, useEffect, useMemo, useRef, useState } from '../../vendor/preact/hooks.mjs'
import { html } from '../../vendor/htm/preact.mjs'
import { enderecoDaFoto, escrever, pedir } from './rede.js'

const ROTULOS = { suavizar_pele: 'Suavizar pele', preto_e_branco: 'Preto e branco', remover_objeto: 'Remover objeto', clarear: 'Clarear', recortar: 'Recortar' }
const rotulo = (id) => ROTULOS[id] ?? id.replaceAll('_', ' ')
/** As etiquetas de uma foto na ordem da lista (a mesma em que aparecem para marcar). */
const naOrdem = (marcadas, lista) => [...lista.filter((id) => marcadas.includes(id)), ...marcadas.filter((id) => !lista.includes(id))]
const reduzir = matchMedia('(prefers-reduced-motion: reduce)')
const vibrar = (padrao) => {
  try {
    navigator.vibrate?.(padrao)
  } catch {
    /* sem vibração neste aparelho */
  }
}
const dia = (v, mes = 'long') => (v ? new Intl.DateTimeFormat('pt-BR', { day: 'numeric', month: mes }).format(new Date(v)) : '')
const plural = (n, um, varios) => `${n} ${n === 1 ? um : varios}`
const semMenu = (e) => e.preventDefault()
/** Tecla no documento, sempre com a função da última renderização (sem intervalo entre trocar o estado e ouvir de novo). */
function useTecla(fn, captura = false) {
  const atual = useRef(fn)
  atual.current = fn
  useEffect(() => {
    const ouvir = (e) => atual.current(e)
    document.addEventListener('keydown', ouvir, captura)
    return () => document.removeEventListener('keydown', ouvir, captura)
  }, [captura])
}
/** Trava a rolagem da página enquanto uma tela cheia está aberta (conta quantas pediram). */
let travas = 0
function travarRolagem() {
  travas += 1
  document.documentElement.classList.add('sem-rolar')
  return () => {
    travas -= 1
    if (travas <= 0) document.documentElement.classList.remove('sem-rolar')
  }
}

// ───────── ícones (traço único, 24 × 24) ─────────

const svg = (corpo, mais = '') =>
  html`<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true" class=${mais}>${corpo}</svg>`
const CORACAO = 'M12 20.4s-7.4-4.6-7.4-10.2A4.3 4.3 0 0 1 12 7.6a4.3 4.3 0 0 1 7.4 2.6c0 5.6-7.4 10.2-7.4 10.2Z'
const icone = {
  coracao: (cheio) =>
    html`<svg viewBox="0 0 24 24" fill=${cheio ? 'currentColor' : 'none'} stroke="currentColor" stroke-width="1.7" stroke-linejoin="round" aria-hidden="true"><path d=${CORACAO} /></svg>`,
  fechar: () => svg(html`<path d="M6 6l12 12M18 6 6 18" />`),
  voltar: () => svg(html`<path d="M14.5 5.5 8 12l6.5 6.5" />`),
  seguir: () => svg(html`<path d="M9.5 5.5 16 12l-6.5 6.5" />`),
  pilha: () => svg(html`<rect x="4" y="8" width="13" height="12" rx="2.5" /><path d="M8 4.5h9.5A2.5 2.5 0 0 1 20 7v9" />`),
  nota: () => svg(html`<path d="M5 6.5A2.5 2.5 0 0 1 7.5 4h9A2.5 2.5 0 0 1 19 6.5v7a2.5 2.5 0 0 1-2.5 2.5H11l-4.5 3.5V16A2.5 2.5 0 0 1 5 13.5Z" />`),
  comparar: () => svg(html`<rect x="3.5" y="5" width="7" height="14" rx="2" /><rect x="13.5" y="5" width="7" height="14" rx="2" />`),
  cadeado: () => svg(html`<rect x="5" y="10.5" width="14" height="9.5" rx="2.5" /><path d="M8 10.5V8a4 4 0 0 1 8 0v2.5" />`),
  certo: () => svg(html`<path d="m5.5 12.5 4.2 4.2 8.8-9.4" />`),
  fotos: () => svg(html`<rect x="3.5" y="5" width="17" height="14" rx="3" /><path d="m4 16 4.5-4.5 4 4 2.5-2.5 5 5" /><circle cx="15.5" cy="9.5" r="1.3" />`),
  tema: () => svg(html`<circle cx="12" cy="12" r="8.2" /><path d="M12 3.8a8.2 8.2 0 0 0 0 16.4Z" fill="currentColor" stroke="none" />`),
}
const SIMBOLO = html`<svg class="simbolo" xmlns="http://www.w3.org/2000/svg" viewBox="0 0 100 100" aria-hidden="true">
  <path fill="currentColor" d="M74.00 40.02C75.00 47.51 77.33 49.00 94.82 50.00C77.33 51.00 75.00 52.49 74.00 59.98C73.00 52.49 70.67 51.00 53.18 50.00C70.67 49.00 73.00 47.51 74.00 40.02Z" />
  <path fill="currentColor" fill-rule="evenodd" d="M9.70 50.00a34.30 34.30 0 1 0 68.60 0a34.30 34.30 0 1 0 -68.60 0ZM18.30 50.00a25.70 25.70 0 1 0 51.40 0a25.70 25.70 0 1 0 -51.40 0Z" />
</svg>`

// ───────── peças ─────────

function Assinatura({ baixo = false }) {
  const alternar = () => {
    const raiz = document.documentElement
    const novo = raiz.dataset.tema === 'escuro' ? 'claro' : 'escuro'
    raiz.dataset.tema = novo
    document.cookie = `foto_tema=${novo}; Path=/; Max-Age=31536000; SameSite=Lax`
    document.querySelector('meta[name=theme-color]')?.setAttribute('content', novo === 'escuro' ? '#0e0e10' : '#f5f5f7')
  }
  return html`<footer class=${`rodape ${baixo ? 'rodape--baixo' : ''}`}>
    <a class="rodape-marca" href="https://absolutezro.com" target="_blank" rel="noopener noreferrer">${SIMBOLO}<span>Absolute ZRO</span></a>
    <button class="rodape-tema" type="button" onClick=${alternar} aria-label="Trocar entre claro e escuro" title="Claro ou escuro">${icone.tema()}</button>
  </footer>`
}

/** Tela cheia de estado: um título fino × pesado, uma linha de apoio e, no máximo, uma ação. */
function Estado({ fino, pesado, apoio, acao, aoAgir, marca = SIMBOLO, classe = '' }) {
  return html`<section class="estado entra ${classe}">
    <div class="estado-marca">${marca}</div>
    <h1><span class="fino">${fino} </span><b class="pesado">${pesado}</b></h1>
    <p class="apoio">${apoio}</p>
    ${acao && html`<button class="vidro vidro--tinta vidro--grande" type="button" onClick=${aoAgir}>${acao}</button>`}
  </section>`
}

const ERROS = {
  link: { fino: 'Link', pesado: 'indisponível.', apoio: 'Peça um novo a quem enviou.' },
  limite: { fino: 'Muitas', pesado: 'tentativas.', apoio: 'Espere alguns minutos e abra de novo.' },
  rede: { fino: 'Sem', pesado: 'conexão.', apoio: 'Confira a internet e tente de novo.', acao: 'Tentar de novo' },
  sem_armazenamento: { fino: 'Fotos', pesado: 'indisponíveis.', apoio: 'Tente de novo mais tarde.', acao: 'Tentar de novo' },
  erro: { fino: 'Não', pesado: 'abriu.', apoio: 'Algo falhou do nosso lado.', acao: 'Tentar de novo' },
}

function Carregando() {
  return html`<section class="carregando" aria-label="Carregando as fotos">
    <div class="cabeca"><div class="osso osso--linha"></div><div class="osso osso--titulo"></div></div>
    <div class="grade grade--ossos">${Array.from({ length: 12 }, (_, i) => html`<div class="foto osso" style=${`--i:${i}`}></div>`)}</div>
  </section>`
}

function Pin({ aoAbrir }) {
  const [pin, setPin] = useState('')
  const [erro, setErro] = useState('')
  const [indo, setIndo] = useState(false)
  const campo = useRef(null)
  useEffect(() => campo.current?.focus(), [])
  const enviar = async (e) => {
    e.preventDefault()
    if (indo || pin.length < 4) return
    setIndo(true)
    setErro('')
    try {
      await pedir('pin', { pin })
      await aoAbrir()
    } catch (f) {
      setIndo(false)
      if (f.codigo === 'link') return aoAbrir()
      setErro(
        f.codigo === 'pin'
          ? 'PIN errado.'
          : f.codigo === 'limite'
            ? 'Muitas tentativas. Espere 15 minutos.'
            : f.codigo === 'rede'
              ? 'Sem conexão.'
              : 'Não deu certo.',
      )
      setPin('')
      vibrar([10, 60, 10])
      campo.current?.focus()
    }
  }
  return html`<section class="estado entra">
    <div class="estado-marca estado-marca--icone">${icone.cadeado()}</div>
    <h1><span class="fino">Digite o </span><b class="pesado">PIN.</b></h1>
    <p class="apoio">Ele veio com o link.</p>
    <form class="pin" onSubmit=${enviar} novalidate>
      <label class="so-leitor" for="pin">PIN</label>
      <input
        id="pin"
        ref=${campo}
        class=${`pin-campo ${erro ? 'pin-campo--erro' : ''}`}
        type="text"
        inputmode="numeric"
        pattern="[0-9]*"
        autocomplete="one-time-code"
        maxlength="8"
        placeholder="••••"
        value=${pin}
        onInput=${(e) => setPin(e.currentTarget.value.replace(/\D/g, '').slice(0, 8))}
        aria-describedby="pin-erro"
      />
      <p id="pin-erro" class="pin-erro" role="alert">${erro}</p>
      <button class="vidro vidro--tinta vidro--grande" type="submit" disabled=${indo || pin.length < 4}>${indo ? 'Abrindo' : 'Abrir'}</button>
    </form>
  </section>`
}

function Foto({ foto, n, pilha, aberta, daPilha, travada, pulsou, i, aoAbrir, aoEscolher, aoPilha }) {
  const temNota = Boolean(foto.comentario) || foto.etiquetas.length > 0
  return html`<div class=${`foto ${foto.escolhida ? 'escolhida' : ''} ${daPilha ? 'da-pilha' : ''} ${pulsou ? 'pulsou' : ''}`} style=${`--i:${Math.min(i, 14)}`} data-foto=${foto.id} role="listitem">
    <button class="foto-abrir" type="button" onClick=${() => aoAbrir(foto.id)} aria-label=${`Abrir a foto ${n}`}>
      <img
        src=${enderecoDaFoto(foto, true)}
        alt=""
        width=${foto.largura}
        height=${foto.altura}
        loading="lazy"
        decoding="async"
        draggable=${false}
        onContextMenu=${semMenu}
        onLoad=${(e) => e.currentTarget.classList.add('pronta')}
        onError=${(e) => e.currentTarget.closest('.foto')?.classList.add('falhou')}
      />
    </button>
    ${
      pilha &&
      html`<button class="selo selo--pilha" type="button" onClick=${() => aoPilha(foto.grupo)} aria-expanded=${aberta} aria-label=${aberta ? 'Fechar as parecidas' : `Ver as ${pilha.total} parecidas`}>
      ${aberta ? icone.fechar() : icone.pilha()}${!aberta && html`<span>${pilha.total}</span>`}${!aberta && pilha.escolhidas > 0 && html`<i class="selo-ponto" aria-hidden="true"></i>`}
    </button>`
    }
    ${temNota && html`<span class="selo selo--nota" aria-label="Com comentário">${icone.nota()}</span>`}
    ${
      travada
        ? foto.escolhida && html`<span class="coracao coracao--fixo" aria-label="Escolhida">${icone.coracao(true)}</span>`
        : html`<button class="coracao" type="button" aria-pressed=${foto.escolhida} aria-label=${`${foto.escolhida ? 'Tirar' : 'Escolher'} a foto ${n}`} onClick=${() => aoEscolher(foto.id)}>
          ${icone.coracao(foto.escolhida)}
        </button>`
    }
  </div>`
}

/** Comentário curto e pedidos de uma foto. */
function Nota({ foto, etiquetas, aoSalvar, aoFechar }) {
  const [texto, setTexto] = useState(foto.comentario ?? '')
  const [marcadas, setMarcadas] = useState(foto.etiquetas)
  const [indo, setIndo] = useState(false)
  const campo = useRef(null)
  useTecla((e) => e.key === 'Escape' && (e.stopPropagation(), aoFechar()), true)
  const alternar = (id) => setMarcadas((m) => (m.includes(id) ? m.filter((x) => x !== id) : [...m, id]))
  const salvar = async (e) => {
    e.preventDefault()
    setIndo(true)
    const deu = await aoSalvar(foto.id, texto.trim(), marcadas)
    if (!deu) setIndo(false)
  }
  return html`<div class="fundo" onClick=${(e) => e.target === e.currentTarget && aoFechar()}>
    <form class="folha sobe" role="dialog" aria-modal="true" aria-label="Comentário da foto" onSubmit=${salvar}>
      <div class="folha-topo">
        <h2>Algum pedido?</h2>
        <button class="redondo" type="button" onClick=${aoFechar} aria-label="Fechar">${icone.fechar()}</button>
      </div>
      <div class="pedidos" role="group" aria-label="Pedidos">
        ${etiquetas.map((id) => html`<button class="pedido" type="button" aria-pressed=${marcadas.includes(id)} onClick=${() => alternar(id)}>${rotulo(id)}</button>`)}
      </div>
      <label class="so-leitor" for="nota-texto">Comentário</label>
      <textarea id="nota-texto" ref=${campo} class="campo" rows="3" maxlength="500" placeholder="Escreva aqui, se quiser." value=${texto} onInput=${(e) => setTexto(e.currentTarget.value)}></textarea>
      <button class="vidro vidro--tinta vidro--grande" type="submit" disabled=${indo}>${indo ? 'Salvando' : 'Salvar'}</button>
    </form>
  </div>`
}

/** "Esta ou esta": duas fotos da mesma pilha por vez; a que fica enfrenta a próxima. */
function Comparar({ fotos, aoTerminar, aoFechar }) {
  const [campea, setCampea] = useState(0)
  const [rival, setRival] = useState(1)
  const escolher = (qual) => {
    vibrar(8)
    const proxima = Math.max(campea, rival) + 1
    if (proxima >= fotos.length) return aoTerminar(fotos[qual].id)
    setCampea(qual)
    setRival(proxima)
  }
  const lado = (i) => html`<button class="duelo-foto" type="button" key=${fotos[i].id} onClick=${() => escolher(i)} aria-label="Esta">
    <img src=${enderecoDaFoto(fotos[i])} alt="" draggable=${false} onContextMenu=${semMenu} style=${`aspect-ratio:${fotos[i].largura}/${fotos[i].altura}`} />
    <span class="duelo-esta">Esta</span>
  </button>`
  return html`<div class="duelo" role="dialog" aria-modal="true" aria-label="Esta ou esta">
    <div class="visor-topo">
      <button class="redondo redondo--escuro" type="button" onClick=${aoFechar} aria-label="Voltar">${icone.voltar()}</button>
      <p class="visor-conta">Esta ou esta</p>
      <p class="visor-conta visor-conta--fim">${Math.max(campea, rival)} de ${fotos.length - 1}</p>
    </div>
    <div class="duelo-palco">${lado(campea)}${lado(rival)}</div>
  </div>`
}

/** A foto grande: arrastar para os lados troca, setas no teclado, Esc fecha. */
function Visor({ fotos, inicio, total, travada, etiquetas, parado, aoEscolher, aoComentar, aoComparar, aoFechar }) {
  const [i, setI] = useState(inicio)
  const [nota, setNota] = useState(false)
  const tira = useRef(null)
  const toque = useRef(null)
  const sair = useRef(null)
  const foto = fotos[i]
  /** A tira volta para o lugar (soltou cedo, ou não há foto daquele lado). */
  const assentar = () => {
    const el = tira.current
    if (!el) return
    el.classList.add('indo')
    el.style.transform = ''
    setTimeout(() => el.classList.remove('indo'), 340)
  }
  const ir = useCallback(
    (passo, animado = true) => {
      const alvo = i + passo
      if (alvo < 0 || alvo >= fotos.length) return assentar()
      const el = tira.current
      if (!el || !animado || reduzir.matches) return setI(alvo)
      el.classList.add('indo')
      el.style.transform = `translate3d(calc(${-passo * 100}% ${passo > 0 ? '-' : '+'} 16px), 0, 0)`
      const fim = () => {
        el.removeEventListener('transitionend', fim)
        clearTimeout(reserva)
        el.classList.remove('indo')
        el.style.transform = ''
        setI(alvo)
      }
      const reserva = setTimeout(fim, 420)
      el.addEventListener('transitionend', fim)
    },
    [i, fotos.length],
  )
  useTecla((e) => {
    if (nota || parado) return
    if (e.key === 'Escape') aoFechar(foto.id)
    else if (e.key === 'ArrowRight') ir(1)
    else if (e.key === 'ArrowLeft') ir(-1)
    else if ((e.key === ' ' || e.key === 'p') && !travada && !e.target.closest?.('button, textarea, input')) {
      e.preventDefault()
      aoEscolher(foto.id)
    }
  })
  useEffect(() => {
    sair.current?.focus({ preventScroll: true })
    return travarRolagem()
  }, [])

  // arrastar: o dedo leva a tira; soltou depois de um quinto da largura (ou num gesto rápido), troca
  const pega = (e) => {
    if (e.pointerType === 'mouse' && e.button !== 0) return
    toque.current = { x: e.clientX, y: e.clientY, t: performance.now(), dx: 0, ativo: false }
  }
  const move = (e) => {
    const t = toque.current
    if (!t) return
    const dx = e.clientX - t.x
    const dy = e.clientY - t.y
    if (!t.ativo) {
      if (Math.abs(dx) < 8 || Math.abs(dx) < Math.abs(dy)) return
      t.ativo = true
      e.currentTarget.setPointerCapture?.(e.pointerId)
    }
    const naBorda = (dx > 0 && i === 0) || (dx < 0 && i === fotos.length - 1)
    t.dx = naBorda ? dx / 3 : dx
    if (tira.current) tira.current.style.transform = `translate3d(${t.dx}px, 0, 0)`
  }
  const solta = (e) => {
    const t = toque.current
    toque.current = null
    if (!t?.ativo) return
    const largura = e.currentTarget.clientWidth || 1
    const rapido = Math.abs(t.dx) > 40 && performance.now() - t.t < 260
    if (Math.abs(t.dx) > largura / 5 || rapido) ir(t.dx < 0 ? 1 : -1)
    else assentar()
  }

  const folha = (f, lugar) =>
    f &&
    html`<div class=${`visor-folha visor-folha--${lugar}`} key=${f.id}>
      <div class="visor-foto" style=${`--r:${f.largura / f.altura};background-image:url(${enderecoDaFoto(f, true)})`}>
        <img src=${enderecoDaFoto(f)} alt=${lugar === 'aqui' ? `Foto ${i + 1}` : ''} draggable=${false} onContextMenu=${semMenu} onLoad=${(e) => e.currentTarget.classList.add('pronta')} />
      </div>
    </div>`
  const daPilha = foto.grupo ? fotos.filter((f) => f.grupo === foto.grupo) : []
  const temNota = Boolean(foto.comentario) || foto.etiquetas.length > 0
  const salvarNota = async (id, texto, marcadas) => {
    const deu = await aoComentar(id, texto, marcadas)
    if (deu) setNota(false)
    return deu
  }
  return html`<div class="visor" role="dialog" aria-modal="true" aria-label="Foto ampliada">
    <div class="visor-topo">
      <button class="redondo redondo--escuro" type="button" ref=${sair} onClick=${() => aoFechar(foto.id)} aria-label="Fechar">${icone.fechar()}</button>
      <p class="visor-conta" aria-live="polite">${i + 1} de ${total ?? fotos.length}</p>
      <span class="visor-conta--fim"></span>
    </div>
    <div class="visor-palco" onPointerDown=${pega} onPointerMove=${move} onPointerUp=${solta} onPointerCancel=${solta}>
      <div class="visor-tira" ref=${tira}>${folha(fotos[i - 1], 'antes')}${folha(foto, 'aqui')}${folha(fotos[i + 1], 'depois')}</div>
      ${i > 0 && html`<button class="redondo redondo--escuro visor-seta visor-seta--antes" type="button" onClick=${() => ir(-1)} aria-label="Foto anterior">${icone.voltar()}</button>`}
      ${i < fotos.length - 1 && html`<button class="redondo redondo--escuro visor-seta visor-seta--depois" type="button" onClick=${() => ir(1)} aria-label="Próxima foto">${icone.seguir()}</button>`}
    </div>
    ${
      temNota &&
      html`<div class="visor-nota">
      ${naOrdem(foto.etiquetas, etiquetas).map((id) => html`<span class="pedido pedido--lido">${rotulo(id)}</span>`)}
      ${foto.comentario && html`<p>${foto.comentario}</p>`}
    </div>`
    }
    ${
      !travada &&
      html`<div class="visor-acoes">
      <button class="redondo redondo--escuro redondo--grande" type="button" onClick=${() => setNota(true)} aria-label=${temNota ? 'Mudar o comentário' : 'Comentar'}>
        ${icone.nota()}${temNota && html`<i class="selo-ponto" aria-hidden="true"></i>`}
      </button>
      <button class=${`escolha ${foto.escolhida ? 'escolha--sim' : ''}`} type="button" aria-pressed=${foto.escolhida} onClick=${() => aoEscolher(foto.id)} aria-label=${foto.escolhida ? 'Tirar da seleção' : 'Escolher esta foto'}>
        ${icone.coracao(foto.escolhida)}
      </button>
      ${
        daPilha.length > 1
          ? html`<button class="redondo redondo--escuro redondo--grande" type="button" onClick=${() => aoComparar(foto.grupo)} aria-label="Comparar com as parecidas" title="Esta ou esta">${icone.comparar()}</button>`
          : html`<span class="redondo--vago"></span>`
      }
    </div>`
    }
    ${nota && html`<${Nota} foto=${foto} etiquetas=${etiquetas} aoSalvar=${salvarNota} aoFechar=${() => setNota(false)} />`}
  </div>`
}

/** Revisar e enviar: o que foi escolhido, as extras com o texto do preço e o nome de quem envia. */
function Revisar({ galeria, escolhidas, parado, aoTirar, aoAbrir, aoEnviar, aoFechar }) {
  const [nome, setNome] = useState('')
  const [indo, setIndo] = useState(false)
  const [erro, setErro] = useState('')
  const n = escolhidas.length
  const extras = Math.max(n - galeria.contratadas, 0)
  const faltam = Math.max(galeria.contratadas - n, 0)
  useEffect(() => travarRolagem(), [])
  useTecla((e) => e.key === 'Escape' && !parado && aoFechar())
  const enviar = async (e) => {
    e.preventDefault()
    if (indo || !nome.trim() || !n) return
    setIndo(true)
    setErro('')
    const falha = await aoEnviar(nome.trim())
    if (falha) {
      setIndo(false)
      setErro(falha)
    }
  }
  return html`<div class="revisar sobe" role="dialog" aria-modal="true" aria-label="Revisar a seleção">
    <div class="revisar-topo">
      <button class="vidro vidro--pequeno" type="button" onClick=${aoFechar}>${icone.voltar()}Voltar</button>
    </div>
    <div class="revisar-corpo">
      <h1><span class="fino">Sua </span><b class="pesado">seleção.</b></h1>
      <p class="apoio">
        ${
          extras > 0
            ? html`${galeria.contratadas} do pacote e <b>${plural(extras, 'extra', 'extras')}</b>${galeria.precoExtra ? ` · ${galeria.precoExtra}` : ''}.`
            : faltam > 0
              ? `${plural(n, 'foto', 'fotos')}. Ainda cabem ${faltam}.`
              : `${plural(n, 'foto', 'fotos')}, a conta certa.`
        }
      </p>
      <div class="grade grade--revisar">
        ${escolhidas.map(
          (f) => html`<div class="foto" key=${f.id}>
            <button class="foto-abrir" type="button" onClick=${() => aoAbrir(f.id)} aria-label="Abrir a foto">
              <img src=${enderecoDaFoto(f, true)} alt="" loading="lazy" draggable=${false} onContextMenu=${semMenu} onLoad=${(e) => e.currentTarget.classList.add('pronta')} />
            </button>
            ${(f.comentario || f.etiquetas.length > 0) && html`<span class="selo selo--nota" aria-label="Com comentário">${icone.nota()}</span>`}
            <button class="coracao" type="button" aria-pressed="true" aria-label="Tirar da seleção" onClick=${() => aoTirar(f.id)}>${icone.coracao(true)}</button>
          </div>`,
        )}
      </div>
      <form class="enviar" onSubmit=${enviar} novalidate>
        <label for="nome">Seu nome</label>
        <input id="nome" class="campo" type="text" autocomplete="name" maxlength="80" placeholder="Quem está enviando" value=${nome} onInput=${(e) => setNome(e.currentTarget.value)} />
        <p class="pin-erro" role="alert">${erro}</p>
        <button class="vidro vidro--tinta vidro--grande" type="submit" disabled=${indo || !nome.trim() || !n}>${indo ? 'Enviando' : 'Enviar seleção'}</button>
        <p class="miudo">Depois de enviar, só ${galeria.fotografo} reabre.</p>
      </form>
    </div>
  </div>`
}

function Enviada({ galeria, envio, aoVer }) {
  return html`<section class="estado estado--feito entra">
    <div class="feito" aria-hidden="true">
      <svg viewBox="0 0 64 64" fill="none" stroke="currentColor" stroke-width="2.6" stroke-linecap="round" stroke-linejoin="round">
        <circle class="feito-anel" cx="32" cy="32" r="27" />
        <path class="feito-risco" d="m21 33 8 8 15-17" />
      </svg>
    </div>
    <h1><span class="fino">Seleção </span><b class="pesado">enviada.</b></h1>
    <p class="apoio">${galeria.fotografo} recebeu ${envio.escolhidas === 1 ? 'a sua foto' : `as suas ${envio.escolhidas} fotos`}${envio.extras > 0 ? `, com ${plural(envio.extras, 'extra', 'extras')}` : ''}.</p>
    <button class="vidro vidro--grande" type="button" onClick=${aoVer}>Ver o que escolhi</button>
  </section>`
}

// ───────── a galeria ─────────

function Galeria() {
  const [fase, setFase] = useState('carregando') // carregando | pin | galeria | feito | erro
  const [erro, setErro] = useState('erro')
  const [dados, setDados] = useState(null)
  const [fotos, setFotos] = useState([])
  const [filtro, setFiltro] = useState('todas')
  const [abertas, setAbertas] = useState(() => new Set())
  const [visor, setVisor] = useState(null) // { ids, i }
  const [duelo, setDuelo] = useState(null) // ids da pilha
  const [revisando, setRevisando] = useState(false)
  const [aviso, setAviso] = useState(null) // { texto, acao, aoAgir }
  const [semRede, setSemRede] = useState(!navigator.onLine)
  const [pulso, setPulso] = useState(null)
  const fotosRef = useRef(fotos)
  fotosRef.current = fotos
  const dadosRef = useRef(dados)
  dadosRef.current = dados
  const relogio = useRef(0)

  const avisar = useCallback((texto, acao, aoAgir) => {
    clearTimeout(relogio.current)
    setAviso({ texto, acao, aoAgir })
    relogio.current = setTimeout(() => setAviso(null), acao ? 6000 : 3200)
  }, [])

  const carregar = useCallback(async ({ contar = false } = {}) => {
    try {
      const d = await pedir('abrir', { contar })
      if (d.estado === 'pin') return setFase('pin')
      setDados({ galeria: d.galeria, etiquetas: d.etiquetas, envio: d.envio })
      setFotos(d.fotos)
      if (d.galeria.travada) setFiltro((f) => (d.fotos.some((x) => x.escolhida) ? 'escolhidas' : f))
      setFase((f) => (f === 'feito' ? f : 'galeria'))
    } catch (f) {
      setErro(ERROS[f.codigo] ? f.codigo : 'erro')
      setFase('erro')
    }
  }, [])
  useEffect(() => {
    carregar({ contar: true })
    const liga = () => setSemRede(false)
    const desliga = () => setSemRede(true)
    addEventListener('online', liga)
    addEventListener('offline', desliga)
    return () => {
      removeEventListener('online', liga)
      removeEventListener('offline', desliga)
    }
  }, [carregar])

  const marcar = (id, parte) => setFotos((lista) => lista.map((f) => (f.id === id ? { ...f, ...parte } : f)))

  /** O que fazer quando uma escrita falha (a tela já desfez o que tinha adiantado). */
  const falhou = useCallback(
    (f, deNovo) => {
      vibrar([10, 60, 10])
      if (f.codigo === 'rede') return avisar('Sem conexão. Não foi salvo.', 'Tentar de novo', deNovo)
      if (f.codigo === 'link' || f.codigo === 'pin') {
        setVisor(null)
        setRevisando(false)
        return carregar()
      }
      if (f.codigo === 'travada') {
        avisar('A seleção já foi enviada.')
        return carregar()
      }
      if (f.codigo === 'cheia') return avisar(`Você já escolheu as ${dadosRef.current.galeria.contratadas}.`)
      if (f.codigo === 'limite') return avisar('Muitos toques seguidos. Espere um pouco.')
      avisar('Não deu para salvar.', 'Tentar de novo', deNovo)
    },
    [avisar, carregar],
  )

  const escolher = useCallback(
    async (id) => {
      const g = dadosRef.current.galeria
      const foto = fotosRef.current.find((f) => f.id === id)
      if (!foto || g.travada) return
      const nova = !foto.escolhida
      const quantas = fotosRef.current.filter((f) => f.escolhida).length
      if (nova && !g.permiteExtras && quantas >= g.contratadas) {
        vibrar([10, 60, 10])
        return avisar(`Você já escolheu as ${g.contratadas}. Tire uma para trocar.`)
      }
      // na hora: o coração responde antes da rede
      marcar(id, { escolhida: nova })
      setPulso(nova ? id : null)
      vibrar(nova ? 12 : 6)
      try {
        await escrever('escolher', { foto: id, escolhida: nova })
      } catch (f) {
        marcar(id, { escolhida: !nova })
        falhou(f, () => escolher(id))
      }
    },
    [avisar, falhou],
  )

  const comentar = useCallback(
    async (id, comentario, etiquetas) => {
      try {
        const r = await escrever('comentar', { foto: id, comentario, etiquetas })
        marcar(id, { comentario: r.comentario, etiquetas: r.etiquetas })
        return true
      } catch (f) {
        falhou(f, () => comentar(id, comentario, etiquetas))
        return false
      }
    },
    [falhou],
  )

  const enviar = async (nome) => {
    try {
      const r = await escrever('enviar', { nome })
      setDados((d) => ({ ...d, galeria: { ...d.galeria, travada: true, estado: 'concluida' }, envio: r.envio }))
      setRevisando(false)
      setVisor(null)
      setFiltro('escolhidas')
      setFase('feito')
      vibrar([12, 80, 24])
      scrollTo(0, 0)
      return null
    } catch (f) {
      if (f.codigo === 'rede') return 'Sem conexão. Tente de novo.'
      if (f.codigo === 'nome') return 'Escreva seu nome.'
      if (f.codigo === 'vazia') return 'Escolha ao menos uma foto.'
      if (f.codigo === 'limite') return 'Muitas tentativas. Espere um pouco.'
      falhou(f)
      return 'Não deu para enviar.'
    }
  }

  // a ordem das fotos com as pilhas juntas (a melhor na frente) e os blocos da grade
  const { plana, blocos } = useMemo(() => {
    const grupos = new Map()
    for (const f of fotos) if (f.grupo) grupos.set(f.grupo, [...(grupos.get(f.grupo) ?? []), f])
    const vistos = new Set()
    const lista = []
    const partes = []
    for (const f of fotos) {
      const membros = f.grupo ? grupos.get(f.grupo) : null
      if (!membros || membros.length < 2) {
        lista.push(f)
        partes.push({ fotos: [f] })
      } else if (!vistos.has(f.grupo)) {
        vistos.add(f.grupo)
        const ordenados = [...membros].sort((a, b) => Number(b.melhor) - Number(a.melhor))
        lista.push(...ordenados)
        partes.push({ grupo: f.grupo, fotos: ordenados })
      }
    }
    return { plana: lista, blocos: partes }
  }, [fotos])
  const numero = useMemo(() => new Map(plana.map((f, i) => [f.id, i + 1])), [plana])
  const escolhidas = useMemo(() => plana.filter((f) => f.escolhida), [plana])

  const abrir = (id, lista = filtro === 'escolhidas' ? escolhidas : plana) => {
    const ids = lista.map((f) => f.id)
    setAviso(null)
    setVisor({ ids, i: Math.max(ids.indexOf(id), 0) })
  }
  const fecharVisor = (id) => {
    setVisor(null)
    setDuelo(null)
    const grupo = fotosRef.current.find((f) => f.id === id)?.grupo
    if (grupo && filtro === 'todas') setAbertas((a) => new Set(a).add(grupo))
    requestAnimationFrame(() => {
      const el = document.querySelector(`[data-foto="${id}"] .foto-abrir`)
      el?.focus({ preventScroll: true })
      el?.scrollIntoView({ block: 'nearest' })
    })
  }
  const alternarPilha = (grupo) =>
    setAbertas((a) => {
      const novo = new Set(a)
      if (novo.has(grupo)) novo.delete(grupo)
      else novo.add(grupo)
      return novo
    })
  const terminarDuelo = (id) => {
    const ids = plana.map((f) => f.id)
    setDuelo(null)
    setVisor({ ids, i: ids.indexOf(id) })
    const foto = fotosRef.current.find((f) => f.id === id)
    if (foto && !foto.escolhida) escolher(id)
  }

  useEffect(() => {
    const el = document.getElementById('galeria')
    el.dataset.fase = fase
    el.setAttribute('aria-busy', String(fase === 'carregando'))
  }, [fase])

  if (fase === 'carregando') return html`<${Carregando} />`
  if (fase === 'pin') return html`<${Pin} aoAbrir=${() => carregar({ contar: true })} /><${Assinatura} />`
  if (fase === 'erro') {
    const e = ERROS[erro]
    return html`<${Estado} ...${e} aoAgir=${() => (setFase('carregando'), carregar())} /><${Assinatura} />`
  }
  const { galeria, etiquetas, envio } = dados
  if (fase === 'feito') return html`<${Enviada} galeria=${galeria} envio=${envio} aoVer=${() => setFase('galeria')} /><${Assinatura} />`

  const n = escolhidas.length
  const extras = Math.max(n - galeria.contratadas, 0)
  const travada = galeria.travada
  const doVisor = visor ? visor.ids.map((id) => fotos.find((f) => f.id === id)).filter(Boolean) : null
  const doDuelo = duelo ? plana.filter((f) => f.grupo === duelo) : null
  let indice = 0
  const peca = (f, mais = {}) =>
    html`<${Foto} key=${f.id} foto=${f} n=${numero.get(f.id)} travada=${travada} pulsou=${pulso === f.id} i=${indice++} aoAbrir=${abrir} aoEscolher=${escolher} aoPilha=${alternarPilha} ...${mais} />`

  return html`
    <header class="topo">
      <div class="topo-nome">
        <strong>${galeria.nome}</strong>
        <span>${galeria.fotografo}</span>
      </div>
      ${
        fotos.length > 0 &&
        html`<div class="filtro" role="radiogroup" aria-label="O que mostrar">
        <button type="button" role="radio" aria-checked=${filtro === 'todas'} onClick=${() => setFiltro('todas')}>Todas</button>
        <button type="button" role="radio" aria-checked=${filtro === 'escolhidas'} onClick=${() => setFiltro('escolhidas')}>Escolhidas</button>
      </div>`
      }
    </header>

    ${
      fotos.length > 0 &&
      html`<section class="cabeca entra">
      ${!travada && galeria.prazo && html`<p class="sobretitulo">Até ${dia(galeria.prazo)}</p>`}
      ${
        travada
          ? html`<h1><span class="fino">Seleção </span><b class="pesado">enviada.</b></h1>
            <p class="apoio">${envio ? `Por ${envio.nome}, em ${dia(envio.em)}.` : 'Agora é só aguardar.'}</p>`
          : html`<h1><span class="fino">Escolha </span><b class="pesado">${plural(galeria.contratadas, 'foto', 'fotos')}.</b></h1>
            <p class="apoio">${galeria.mensagem || 'Toque no coração das que você quer.'}</p>`
      }
    </section>`
    }

    ${
      fotos.length === 0
        ? html`<section class="vazio">
          <div class="vazio-icone">${icone.fotos()}</div>
          <h2>As fotos ainda não chegaram.</h2>
          <p class="apoio">Volte daqui a pouco.</p>
        </section>`
        : filtro === 'escolhidas' && n === 0
          ? html`<section class="vazio">
            <div class="vazio-icone">${icone.coracao(false)}</div>
            <h2>Nada escolhido ainda.</h2>
            <button class="vidro" type="button" onClick=${() => setFiltro('todas')}>Ver todas</button>
          </section>`
          : html`<div class="grade cascata" role="list" aria-label="Fotos">
            ${
              filtro === 'escolhidas'
                ? escolhidas.map((f) => peca(f))
                : blocos.map((b) => {
                    if (!b.grupo) return peca(b.fotos[0])
                    const aberta = abertas.has(b.grupo)
                    const pilha = { total: b.fotos.length, escolhidas: b.fotos.slice(1).filter((f) => f.escolhida).length }
                    return aberta
                      ? b.fotos.map((f, k) => peca(f, { daPilha: true, aberta: true, pilha: k === 0 ? pilha : null }))
                      : peca(b.fotos[0], { pilha, aberta: false })
                  })
            }
          </div>`
    }

    <${Assinatura} baixo=${fotos.length === 0} />

    ${
      fotos.length > 0 &&
      html`<div class=${`doca ${travada ? 'doca--lida' : ''}`} role="region" aria-label="Sua seleção">
      <div class="doca-conta">
        <p class="conta" aria-live="polite">
          <b>${n}</b>${travada ? html`<span> ${n === 1 ? 'foto' : 'fotos'}</span>` : html`<span> de ${galeria.contratadas}</span>`}
        </p>
        ${
          extras > 0
            ? html`<p class="doca-extra">+${plural(extras, 'extra', 'extras')}${galeria.precoExtra ? ` · ${galeria.precoExtra}` : ''}</p>`
            : !travada && html`<div class="barra" aria-hidden="true"><i style=${`width:${Math.min((n / galeria.contratadas) * 100, 100)}%`}></i></div>`
        }
      </div>
      ${!travada && html`<button class="vidro vidro--tinta" type="button" disabled=${n === 0} onClick=${() => setRevisando(true)}>Revisar</button>`}
    </div>`
    }

    ${semRede && html`<p class="sem-rede" role="status">Sem internet</p>`}
    ${
      aviso &&
      html`<div class="aviso sobe" role="status">
      <span>${aviso.texto}</span>
      ${aviso.acao && html`<button type="button" onClick=${() => (setAviso(null), aviso.aoAgir?.())}>${aviso.acao}</button>`}
    </div>`
    }

    ${
      revisando &&
      html`<${Revisar} galeria=${galeria} escolhidas=${escolhidas} parado=${Boolean(visor)} aoTirar=${escolher} aoAbrir=${(id) => abrir(id, escolhidas)} aoEnviar=${enviar} aoFechar=${() => setRevisando(false)} />`
    }
    ${
      doVisor &&
      html`<${Visor}
      key=${`${visor.ids.length}:${visor.i}:${visor.ids[visor.i]}`}
      fotos=${doVisor}
      inicio=${visor.i}
      travada=${travada}
      etiquetas=${etiquetas}
      parado=${Boolean(doDuelo)}
      aoEscolher=${escolher}
      aoComentar=${comentar}
      aoComparar=${setDuelo}
      aoFechar=${revisando ? () => setVisor(null) : fecharVisor}
    />`
    }
    ${doDuelo && html`<${Comparar} fotos=${doDuelo} aoTerminar=${terminarDuelo} aoFechar=${() => setDuelo(null)} />`}
  `
}

render(html`<${Galeria} />`, document.getElementById('galeria'))

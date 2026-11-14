// A página do visitante de um evento: abre pelo link (ou pelo QR do cartaz), sem cadastro. PIN (se houver) → o pedido
// de consentimento, numa tela só dele (texto de src/rosto/textos.js, caixa dos 18 anos desmarcada; com crianças, a de
// "sou responsável", destacada) → a câmera AO VIVO com o oval e uma dica por vez → o desafio sorteado pelo servidor (de
// frente, depois vire para a esquerda, para a direita e chegue mais perto, na ordem pedida) → a assinatura no próprio
// celular → a prova de vida conferida no servidor → só os números vão → "É você" e
// "Talvez seja você" → favoritar e pedir as fotos (nome e contato; sem pagamento). No modo com consentimento, o pedido
// fica guardado e as fotos aparecem quando o fotógrafo processar: a pessoa volta pelo mesmo link. "Não quero aparecer"
// sempre à mão. "Lembrar neste celular" é opcional e tem "Esquecer".
//
// Preact + htm de /vendor por caminho relativo (a CSP não aceita import map nem script inline). Sem o nome do produto:
// assina Absolute ZRO. As prévias já vêm com a marca-d'água gravada nos pixels por quem publicou.

import { render } from '../../vendor/preact/preact.mjs'
import { useEffect, useRef, useState } from '../../vendor/preact/hooks.mjs'
import { html } from '../../vendor/htm/preact.mjs'
import { capturar, encerrar, ligarCamera, preparar } from './leitor.js'
import { chaveDaAba, esquecer, guardarNaAba, lembrado, lembrar, novaChave } from './memoria.js'
import { enderecoDaFoto, pedir } from './rede.js'
import { DICAS } from './src/rosto/qualidade.js'
import { INSTRUCOES } from './src/rosto/vida.js'
import { comPrazo, TEXTOS } from './src/rosto/textos.js'

const dia = (v) => (v ? new Intl.DateTimeFormat('pt-BR', { day: 'numeric', month: 'long' }).format(new Date(`${String(v).slice(0, 10)}T12:00:00`)) : '')
const plural = (n, um, varios) => `${n} ${n === 1 ? um : varios}`
const semMenu = (e) => e.preventDefault()
const DICA = { ...DICAS, ...INSTRUCOES, frente: 'Olhe para a câmera', denovo: 'Vamos de novo', pronto: 'Pronto', conferindo: 'Conferindo' }

// ───────── ícones (traço único, 24 × 24) ─────────

const svg = (corpo) =>
  html`<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">
    ${corpo}
  </svg>`
const CORACAO = 'M12 20.4s-7.4-4.6-7.4-10.2A4.3 4.3 0 0 1 12 7.6a4.3 4.3 0 0 1 7.4 2.6c0 5.6-7.4 10.2-7.4 10.2Z'
const icone = {
  coracao: (cheio) =>
    html`<svg viewBox="0 0 24 24" fill=${cheio ? 'currentColor' : 'none'} stroke="currentColor" stroke-width="1.7" stroke-linejoin="round" aria-hidden="true">
      <path d=${CORACAO} />
    </svg>`,
  fechar: () => svg(html`<path d="M6 6l12 12M18 6 6 18" />`),
  seguir: () => svg(html`<path d="M9.5 5.5 16 12l-6.5 6.5" />`),
  cadeado: () => svg(html`<rect x="5" y="10.5" width="14" height="9.5" rx="2.5" /><path d="M8 10.5V8a4 4 0 0 1 8 0v2.5" />`),
  rosto: () =>
    svg(
      html`<path d="M4 8V6.5A2.5 2.5 0 0 1 6.5 4H8M16 4h1.5A2.5 2.5 0 0 1 20 6.5V8M20 16v1.5a2.5 2.5 0 0 1-2.5 2.5H16M8 20H6.5A2.5 2.5 0 0 1 4 17.5V16" /><path
          d="M9.2 10v.6M14.8 10v.6M12 10.5v2.6h-.9M9.6 15.6a3.6 3.6 0 0 0 4.8 0"
        />`,
    ),
  certo: () => svg(html`<path d="m5.5 12.5 4.2 4.2 8.8-9.4" />`),
  relogio: () => svg(html`<circle cx="12" cy="12" r="8.2" /><path d="M12 7.5V12l3 2" />`),
  tema: () => svg(html`<circle cx="12" cy="12" r="8.2" /><path d="M12 3.8a8.2 8.2 0 0 0 0 16.4Z" fill="currentColor" stroke="none" />`),
  nada: () => svg(html`<circle cx="12" cy="12" r="8.2" /><path d="m6.2 6.2 11.6 11.6" />`),
  esquerda: () => svg(html`<path d="M19 12H5.5M11 6l-6 6 6 6" />`),
  direita: () => svg(html`<path d="M5 12h13.5M13 6l6 6-6 6" />`),
  perto: () => svg(html`<path d="M4 9V5h4M20 9V5h-4M4 15v4h4M20 15v4h-4" /><path d="M9.5 12h5M12 9.5v5" />`),
  frente: () => svg(html`<circle cx="12" cy="12" r="3.2" /><circle cx="12" cy="12" r="8.2" />`),
  crianca: () => svg(html`<circle cx="12" cy="8" r="3.2" /><path d="M6.5 20a5.5 5.5 0 0 1 11 0" />`),
}
const SIMBOLO = html`<svg class="simbolo" xmlns="http://www.w3.org/2000/svg" viewBox="0 0 100 100" aria-hidden="true">
  <path
    fill="currentColor"
    d="M74.00 40.02C75.00 47.51 77.33 49.00 94.82 50.00C77.33 51.00 75.00 52.49 74.00 59.98C73.00 52.49 70.67 51.00 53.18 50.00C70.67 49.00 73.00 47.51 74.00 40.02Z"
  />
  <path
    fill="currentColor"
    fill-rule="evenodd"
    d="M9.70 50.00a34.30 34.30 0 1 0 68.60 0a34.30 34.30 0 1 0 -68.60 0ZM18.30 50.00a25.70 25.70 0 1 0 51.40 0a25.70 25.70 0 1 0 -51.40 0Z"
  />
</svg>`

// ───────── peças ─────────

function Assinatura() {
  const alternar = () => {
    const raiz = document.documentElement
    const novo = raiz.dataset.tema === 'escuro' ? 'claro' : 'escuro'
    raiz.dataset.tema = novo
    document.cookie = `foto_tema=${novo}; Path=/; Max-Age=31536000; SameSite=Lax`
    document.querySelector('meta[name=theme-color]')?.setAttribute('content', novo === 'escuro' ? '#0e0e10' : '#f5f5f7')
  }
  return html`<footer class="rodape rodape--baixo">
    <a class="rodape-marca" href="https://absolutezro.com" target="_blank" rel="noopener noreferrer">${SIMBOLO}<span>Absolute ZRO</span></a>
    <button class="rodape-tema" type="button" onClick=${alternar} aria-label="Trocar entre claro e escuro" title="Claro ou escuro">${icone.tema()}</button>
  </footer>`
}

function Estado({ fino, pesado, apoio, acao, aoAgir, segunda, aoSegunda, marca = SIMBOLO }) {
  return html`<section class="estado entra">
    <div class=${`estado-marca ${marca === SIMBOLO ? '' : 'estado-marca--icone'}`}>${marca}</div>
    <h1><span class="fino">${fino} </span><b class="pesado">${pesado}</b></h1>
    ${apoio && html`<p class="apoio">${apoio}</p>`}
    ${acao && html`<button class="vidro vidro--tinta vidro--grande" type="button" onClick=${aoAgir}>${acao}</button>`}
    ${segunda && html`<button class="liso" type="button" onClick=${aoSegunda}>${segunda}</button>`}
  </section>`
}

const ERROS = {
  link: { fino: 'Link', pesado: 'indisponível.', apoio: 'Peça um novo a quem fotografou.' },
  limite: { fino: 'Muitas', pesado: 'tentativas.', apoio: 'Espere alguns minutos e tente de novo.' },
  'limite-aparelho': { fino: 'Muitas buscas', pesado: 'deste aparelho.', apoio: 'Tente em alguns minutos.', acao: 'Voltar' },
  'limite-rede': { fino: 'Muita gente', pesado: 'nesta rede.', apoio: 'Tente em alguns minutos.', acao: 'Voltar' },
  'limite-evento': { fino: 'Muita gente', pesado: 'buscando agora.', apoio: 'Tente em alguns minutos.', acao: 'Voltar' },
  vida: { fino: 'Não deu para', pesado: 'confirmar.', apoio: 'Faça cada movimento quando a tela pedir.', acao: 'Tentar de novo' },
  'vida-prazo': { fino: 'O tempo', pesado: 'acabou.', apoio: 'Faça cada movimento quando a tela pedir.', acao: 'Tentar de novo' },
  'vida-plano': { fino: 'Não deu para', pesado: 'confirmar.', apoio: 'A câmera precisa ver você, não uma foto ou tela.', acao: 'Tentar de novo' },
  'vida-outra': { fino: 'Só você', pesado: 'no quadro.', apoio: 'Do começo ao fim, sem trocar de pessoa.', acao: 'Tentar de novo' },
  prova: { fino: 'A câmera', pesado: 'precisa ver você.', apoio: 'Tire a selfie de novo, ao vivo.', acao: 'Tentar de novo' },
  rede: { fino: 'Sem', pesado: 'conexão.', apoio: 'Confira a internet e tente de novo.', acao: 'Tentar de novo' },
  'camera-negada': { fino: 'Sem', pesado: 'câmera.', apoio: 'Libere a câmera para este site e tente de novo.', acao: 'Tentar de novo' },
  'sem-camera': { fino: 'Sem', pesado: 'câmera.', apoio: 'Abra este link no celular.', acao: 'Voltar' },
  camera: { fino: 'A câmera', pesado: 'não abriu.', apoio: 'Feche outros apps que usam a câmera.', acao: 'Tentar de novo' },
  indisponivel: { fino: 'Busca', pesado: 'indisponível.', apoio: 'Tente de novo mais tarde.', acao: 'Tentar de novo' },
  sem_armazenamento: { fino: 'Fotos', pesado: 'indisponíveis.', apoio: 'Tente de novo mais tarde.', acao: 'Tentar de novo' },
  erro: { fino: 'Não', pesado: 'deu certo.', apoio: 'Algo falhou do nosso lado.', acao: 'Tentar de novo' },
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

/** O pedido de consentimento, numa tela só dele. */
function Pedido({ evento, tipo, aoPermitir, aoRecusar, aoNaoAparecer, voltar }) {
  const t = TEXTOS[tipo]
  const [maior, setMaior] = useState(false)
  const criancas = tipo === 'cadastroCriancas'
  return html`<section class="pedir entra" aria-labelledby="pedido-titulo">
    <div class="rosto-icone">${icone.rosto()}</div>
    <p class="sobretitulo evento-nome">${evento.nome}${evento.data ? ` · ${dia(evento.data)}` : ''}</p>
    ${criancas && html`<p class="ficha-criancas">${icone.crianca()}<span>Evento com crianças</span></p>`}
    <h1 id="pedido-titulo">${t.titulo}</h1>
    <p class="apoio">${comPrazo(t.corpo, evento.prazo)}</p>
    <label class=${`caixa ${criancas ? 'caixa--destaque' : ''}`}>
      <input type="checkbox" checked=${maior} onChange=${(e) => setMaior(e.currentTarget.checked)} required aria-required="true" />
      <span>${t.caixa}</span>
    </label>
    <div class="acoes">
      <button class="vidro vidro--tinta vidro--grande" type="button" disabled=${!maior} onClick=${aoPermitir}>
        ${tipo === 'remocao' ? 'Continuar' : 'Permitir'}
      </button>
      <button class="vidro vidro--grande" type="button" onClick=${aoRecusar}>${voltar ? 'Voltar' : 'Agora não'}</button>
    </div>
    <details class="detalhes">
      <summary>Como funciona e seus direitos</summary>
      <ul>
        <li>A comparação usa só números tirados do rosto; nenhuma imagem sua sai do celular.</li>
        <li>A busca vale só para este evento e termina em ${dia(evento.prazo)}.</li>
        <li>Você pode desistir e pedir para apagar a qualquer momento, por este link.</li>
        <li>A câmera pede alguns movimentos para confirmar que é alguém ao vivo, não uma foto.</li>
        <li>Um cookie deste aparelho só conta as buscas; ele não diz quem você é.</li>
        <li>Prefere sem rosto? Fale com quem fotografou.</li>
      </ul>
    </details>
    ${aoNaoAparecer && html`<button class="liso" type="button" onClick=${aoNaoAparecer}>Não quero aparecer</button>`}
  </section>`
}

/**
 * O download do leitor (uma vez), a câmera ao vivo e o desafio de vida: pede o desafio ao servidor, segue os passos,
 * manda os pontos para a prova e devolve por `aoPronto({ vetores, prova })`. `para`: 'busca' | 'cadastro' | 'remocao'.
 */
function Camera({ para, aoPronto, aoCancelar, aoErro }) {
  const video = useRef(null)
  const [fase, setFase] = useState('baixando')
  const [progresso, setProgresso] = useState(0)
  const [estado, setEstado] = useState({ etapa: 0, total: 4, passo: 'frente', boa: false })
  useEffect(() => {
    const parar = new AbortController()
    let desligar = null
    ;(async () => {
      try {
        await preparar((p) => setProgresso(Math.round(p * 100)))
        if (parar.signal.aborted) return
        setFase('camera')
        desligar = await ligarCamera(video.current)
        if (parar.signal.aborted) return desligar()
        // o desafio só sai com o leitor pronto e a câmera ligada: o prazo curto é todo da pessoa
        const { desafio } = await pedir('desafio')
        const r = await capturar(video.current, { desafio: { ...desafio, recebidoEm: performance.now() }, sinal: parar.signal, aoMudar: setEstado })
        desligar()
        desligar = null
        setEstado((e) => ({ ...e, passo: 'conferindo', boa: true }))
        const { prova } = await pedir('prova', { desafio, quadros: r.quadros, vetores: r.vetores, para })
        aoPronto({ vetores: r.vetores, prova })
      } catch (e) {
        desligar?.()
        if (e?.name !== 'AbortError' && !parar.signal.aborted) aoErro(e?.codigo ? e : 'indisponivel')
      }
    })()
    return () => {
      parar.abort()
      desligar?.()
    }
  }, [])
  const instrucao = !estado.boa && estado.dica && estado.passo !== 'conferindo' ? DICA[estado.dica] : (DICA[estado.passo] ?? DICA.frente)
  const seta = estado.boa && ['esquerda', 'direita', 'perto'].includes(estado.passo) ? icone[estado.passo]() : null
  return html`<div class="camera" role="dialog" aria-modal="true" aria-label="Câmera">
    <div class="camera-topo">
      <button class="redondo redondo--escuro" type="button" onClick=${aoCancelar} aria-label="Cancelar">${icone.fechar()}</button>
    </div>
    <div class=${`camera-palco ${estado.passo === 'perto' ? 'camera-palco--perto' : ''}`}>
      <video ref=${video} autoplay muted playsinline aria-hidden="true"></video>
      ${
        fase === 'camera' &&
        html`<svg class="oval" viewBox="0 0 100 140" preserveAspectRatio="xMidYMid slice" aria-hidden="true">
          <defs>
            <mask id="buraco">
              <rect width="100" height="140" fill="#fff" />
              <ellipse class="oval-furo" cx="50" cy="66" rx="27" ry="36" fill="#000" />
            </mask>
          </defs>
          <rect width="100" height="140" fill="rgb(0 0 0 / 0.55)" mask="url(#buraco)" />
          <ellipse class=${`oval-borda ${estado.boa ? 'boa' : ''}`} cx="50" cy="66" rx="27" ry="36" vector-effect="non-scaling-stroke" />
        </svg>`
      }
      ${seta && html`<div class=${`seta seta--${estado.passo}`} aria-hidden="true">${seta}</div>`}
    </div>
    <div class="camera-base" aria-live="polite">
      ${
        fase === 'baixando'
          ? html`<div class="preparo">
              <div class="anel" style=${`--p:${progresso}`} role="progressbar" aria-valuemin="0" aria-valuemax="100" aria-valuenow=${progresso}></div>
              <p class="dica">Preparando</p>
              <p class="miudo"><span class="anel-numero">${progresso}%</span> · só na primeira vez</p>
            </div>`
          : html`<p class="dica" data-passo=${estado.passo}>${instrucao}</p>
              <div class="passos" aria-label=${`${estado.etapa} de ${estado.total}`}>
                ${Array.from({ length: estado.total }, (_, i) => html`<i class=${i < estado.etapa ? 'feito' : ''}></i>`)}
              </div>
              <p class="miudo">A selfie não sai do seu celular.</p>`
      }
    </div>
  </div>`
}

function Foto({ foto, i, escolhida, aoAbrir, aoEscolher, marcar }) {
  return html`<div class=${`foto ${escolhida ? 'escolhida' : ''}`} style=${`--i:${Math.min(i, 14)}`} role="listitem">
    <button class="foto-abrir" type="button" onClick=${() => aoAbrir(foto)} aria-label=${`Abrir a foto ${i + 1}`}>
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
      marcar
        ? html`<input
            class="marcar"
            type="checkbox"
            checked=${escolhida}
            onChange=${() => aoEscolher(foto.id)}
            aria-label=${`Tirar a foto ${i + 1} da busca`}
          />`
        : html`<button
            class="coracao"
            type="button"
            aria-pressed=${escolhida}
            aria-label=${`${escolhida ? 'Tirar' : 'Escolher'} a foto ${i + 1}`}
            onClick=${() => aoEscolher(foto.id)}
          >
            ${icone.coracao(escolhida)}
          </button>`
    }
  </div>`
}

function Grade({ fotos, escolhidas, aoAbrir, aoEscolher, marcar = false }) {
  return html`<div class="grade cascata" role="list">
    ${fotos.map((f, i) => html`<${Foto} key=${f.id} foto=${f} i=${i} escolhida=${escolhidas.has(f.id)} aoAbrir=${aoAbrir} aoEscolher=${aoEscolher} marcar=${marcar} />`)}
  </div>`
}

function Ver({ foto, escolhida, aoEscolher, aoFechar }) {
  useEffect(() => {
    const tecla = (e) => e.key === 'Escape' && aoFechar()
    document.addEventListener('keydown', tecla)
    return () => document.removeEventListener('keydown', tecla)
  }, [])
  return html`<div class="ver" role="dialog" aria-modal="true" aria-label="Foto">
    <div class="camera-topo"><button class="redondo redondo--escuro" type="button" onClick=${aoFechar} aria-label="Fechar">${icone.fechar()}</button></div>
    <div class="ver-palco"><img src=${enderecoDaFoto(foto)} alt="" onContextMenu=${semMenu} /></div>
    <div class="ver-acoes">
      <button class="coracao" type="button" aria-pressed=${escolhida} aria-label=${escolhida ? 'Tirar' : 'Escolher'} onClick=${() => aoEscolher(foto.id)}>
        ${icone.coracao(escolhida)}
      </button>
    </div>
  </div>`
}

/** Pedir as fotos escolhidas: nome e contato. Sem pagamento neste corte. */
function FolhaPedido({ quantas, aoEnviar, aoFechar }) {
  const [nome, setNome] = useState('')
  const [contato, setContato] = useState('')
  const [indo, setIndo] = useState(false)
  const [erro, setErro] = useState('')
  const enviar = async (e) => {
    e.preventDefault()
    if (indo) return
    setIndo(true)
    setErro('')
    try {
      await aoEnviar(nome.trim(), contato.trim())
    } catch (f) {
      setIndo(false)
      setErro(f.codigo === 'limite' ? 'Muitos pedidos. Tente mais tarde.' : f.codigo === 'rede' ? 'Sem conexão.' : 'Não deu certo.')
    }
  }
  return html`<div class="fundo" onClick=${(e) => e.target === e.currentTarget && aoFechar()}>
    <div class="folha sobe" role="dialog" aria-modal="true" aria-labelledby="pedido-folha">
      <div class="folha-topo">
        <h2 id="pedido-folha">Pedir ${plural(quantas, 'foto', 'fotos')}</h2>
        <button class="redondo" type="button" onClick=${aoFechar} aria-label="Fechar">${icone.fechar()}</button>
      </div>
      <form onSubmit=${enviar}>
        <label class="so-leitor" for="p-nome">Seu nome</label>
        <input
          id="p-nome"
          class="campo"
          placeholder="Seu nome"
          autocomplete="name"
          maxlength="80"
          value=${nome}
          onInput=${(e) => setNome(e.currentTarget.value)}
        />
        <label class="so-leitor" for="p-contato">WhatsApp ou e-mail</label>
        <input
          id="p-contato"
          class="campo"
          placeholder="WhatsApp ou e-mail"
          autocomplete="email"
          maxlength="120"
          value=${contato}
          onInput=${(e) => setContato(e.currentTarget.value)}
        />
        <p class="pin-erro" role="alert">${erro}</p>
        <button class="vidro vidro--tinta vidro--grande" type="submit" disabled=${indo || !nome.trim() || contato.trim().length < 3}>
          ${indo ? 'Enviando' : 'Enviar pedido'}
        </button>
        <p class="miudo">Quem fotografou recebe seu pedido e fala com você.</p>
      </form>
    </div>
  </div>`
}

function Lembrar({ ligado, aoMudar, aoEsquecer }) {
  return html`<label class="chave">
      <span>Lembrar neste aparelho</span>
      <input type="checkbox" role="switch" checked=${ligado} onChange=${(e) => aoMudar(e.currentTarget.checked)} />
    </label>
    <button class="liso" type="button" onClick=${aoEsquecer}>Esquecer</button>`
}

// ───────── a página ─────────

function App() {
  const [fase, setFase] = useState('carregando')
  const [evento, setEvento] = useState(null)
  const [erro, setErro] = useState(null)
  const [fluxo, setFluxo] = useState('busca') // busca | remocao
  const [achadas, setAchadas] = useState(null) // { eu, talvez, processado? }
  const [escolhidas, setEscolhidas] = useState(new Set())
  const [vendo, setVendo] = useState(null)
  const [pedindo, setPedindo] = useState(false)
  const [pedidas, setPedidas] = useState(0)
  const [lembrando, setLembrando] = useState(false)
  const [conferir, setConferir] = useState(null) // remoção: fotos parecidas
  const [removidas, setRemovidas] = useState(0)
  const ultimos = useRef(null) // os vetores da última captura (só em memória)
  const prova = useRef(null) // a prova de vida da última captura (uso único no servidor)
  const lembranca = useRef(null) // busca aberta: a captura de antes vale de novo neste aparelho
  const chave = useRef(null)

  const falhar = (f) => {
    const escopo = f?.dados?.escopo ?? f?.escopo
    const motivo = f?.motivo ?? f?.dados?.motivo
    const fino = f?.codigo === 'limite' && escopo ? `limite-${escopo}` : f?.codigo === 'vida' && motivo ? `vida-${motivo === 'tela' ? 'plano' : motivo}` : null
    setErro(fino && ERROS[fino] ? fino : f?.codigo && ERROS[f.codigo] ? f.codigo : typeof f === 'string' && ERROS[f] ? f : 'erro')
    setFase('erro')
  }

  const consentimento = () => evento?.modo === 'consentimento'
  const tipoDoPedido = () =>
    fluxo === 'remocao' ? 'remocao' : evento?.modo === 'consentimento' ? (evento?.criancas ? 'cadastroCriancas' : 'cadastro') : 'busca'
  const paraDoPedido = () => (fluxo === 'remocao' ? 'remocao' : evento?.modo === 'consentimento' ? 'cadastro' : 'busca')

  async function abrir(contar = false) {
    setFase('carregando')
    try {
      const r = await pedir('abrir', { contar })
      if (r.estado === 'pin') return setFase('pin')
      setEvento(r.evento)
      // quem já pediu (modo com consentimento) ou pediu para lembrar volta direto
      const guardado = await lembrado()
      setLembrando(Boolean(guardado))
      const k = guardado?.chave || chaveDaAba()
      if (r.evento.modo === 'consentimento' && k) {
        chave.current = k
        try {
          const m = await pedir('minhas', { chave: k })
          setAchadas(m)
          return setFase('resultado')
        } catch (f) {
          if (f.codigo !== 'chave') throw f
          chave.current = null
        }
      }
      if (r.evento.modo === 'aberta' && guardado?.vetores?.length && guardado.lembranca) {
        ultimos.current = guardado.vetores
        lembranca.current = guardado.lembranca
        return buscar(guardado.vetores, r.evento)
      }
      setFase('inicio')
    } catch (f) {
      falhar(f)
    }
  }
  useEffect(() => {
    abrir(true)
  }, [])
  useEffect(() => {
    document.getElementById('evento')?.setAttribute('aria-busy', String(fase === 'carregando' || fase === 'buscando'))
  }, [fase])

  async function buscar(vetores, ev = evento) {
    setFase('buscando')
    // a prova vale uma vez: sai daqui e não volta
    const p = prova.current
    prova.current = null
    try {
      if (ev.modo === 'consentimento') {
        const k = chave.current || novaChave()
        const versao = (ev.criancas ? TEXTOS.cadastroCriancas : TEXTOS.cadastro).versao
        const r = await pedir('cadastrar', { vetores, chave: k, versao, prova: p })
        chave.current = k
        guardarNaAba(k)
        if (lembrando) await lembrar({ chave: k })
        setAchadas(r)
      } else {
        const r = await pedir('achar', { vetores, versao: TEXTOS.busca.versao, ...(p ? { prova: p } : { lembranca: lembranca.current }) })
        if (r.lembranca) lembranca.current = r.lembranca
        if (lembrando && lembranca.current) await lembrar({ vetores, lembranca: lembranca.current })
        setAchadas(r)
      }
      setFase('resultado')
    } catch (f) {
      // a lembrança deste aparelho não vale mais (cookie novo, prazo): volta ao começo, com selfie nova
      if (f.codigo === 'prova' && !p) {
        lembranca.current = null
        await esquecer()
        setLembrando(false)
        return setFase('inicio')
      }
      falhar(f)
    }
  }

  async function aoCapturar({ vetores, prova: p }) {
    ultimos.current = vetores
    prova.current = p
    if (fluxo === 'remocao') {
      setFase('buscando')
      try {
        const r = await pedir('remover', { vetores, versao: TEXTOS.remocao.versao, prova: p })
        setConferir(r.fotos)
        setEscolhidas(new Set(r.fotos.map((f) => f.id)))
        setFase('conferir')
      } catch (f) {
        falhar(f)
      }
      return
    }
    buscar(vetores)
  }

  async function confirmarRemocao() {
    setFase('buscando')
    try {
      const r = await pedir('remover', { vetores: ultimos.current, fotos: [...escolhidas], versao: TEXTOS.remocao.versao, prova: prova.current })
      ultimos.current = null
      prova.current = null
      setRemovidas(r.removidos)
      setEscolhidas(new Set())
      setFase('removido')
    } catch (f) {
      falhar(f)
    }
  }

  async function recusar() {
    const tipo = tipoDoPedido()
    pedir('recusar', { tipo: tipo === 'cadastroCriancas' ? 'cadastro' : tipo, versao: TEXTOS[tipo].versao }).catch(() => {})
    setFluxo('busca')
    setFase('recusou')
  }

  async function desistir() {
    try {
      if (chave.current) await pedir('desistir', { chave: chave.current })
    } catch (f) {
      if (f.codigo !== 'chave') return falhar(f)
    }
    chave.current = null
    ultimos.current = null
    await esquecer()
    setLembrando(false)
    setAchadas(null)
    setFase('desistiu')
  }

  async function mudarLembrar(ligar) {
    setLembrando(ligar)
    if (!ligar) return esquecer().then(() => chave.current && guardarNaAba(chave.current))
    await lembrar(consentimento() ? { chave: chave.current } : { vetores: ultimos.current, lembranca: lembranca.current })
  }

  async function esquecerTudo() {
    await esquecer()
    ultimos.current = null
    lembranca.current = null
    chave.current = consentimento() ? chave.current : null
    setLembrando(false)
    setAchadas(null)
    setEscolhidas(new Set())
    setFase('esquecido')
  }

  const escolher = (id) =>
    setEscolhidas((s) => {
      const n = new Set(s)
      if (n.has(id)) n.delete(id)
      else n.add(id)
      return n
    })

  async function enviarPedido(nome, contato) {
    const r = await pedir('pedir', { nome, contato, fotos: [...escolhidas] })
    setPedidas(r.fotos)
    setPedindo(false)
    setEscolhidas(new Set())
  }

  // ───────── telas ─────────

  if (fase === 'carregando' || fase === 'buscando')
    return html`<section class="estado" aria-label=${fase === 'buscando' ? 'Procurando' : 'Carregando'}>
      <div class="estado-marca">${SIMBOLO}</div>
      <h1><span class="fino">${fase === 'buscando' ? 'Procurando ' : ''}</span><b class="pesado">${fase === 'buscando' ? 'você.' : ''}</b></h1>
    </section>`
  if (fase === 'pin') return html`<${Pin} aoAbrir=${() => abrir(false)} /><${Assinatura} />`
  if (fase === 'erro') {
    const e = ERROS[erro] ?? ERROS.erro
    const agir = () =>
      erro === 'sem-camera' || erro.startsWith('limite-')
        ? setFase(achadas ? 'resultado' : 'inicio')
        : erro.startsWith('vida') || erro === 'prova'
          ? setFase('camera')
          : abrir(false)
    return html`<${Estado} ...${e} marca=${erro.startsWith('limite') ? icone.relogio() : undefined} aoAgir=${agir} /><${Assinatura} />`
  }
  if (fase === 'inicio' || fase === 'pedido-remocao')
    return html`<${Pedido}
        evento=${evento}
        tipo=${tipoDoPedido()}
        voltar=${fluxo === 'remocao'}
        aoPermitir=${() => setFase('camera')}
        aoRecusar=${fluxo === 'remocao' ? () => (setFluxo('busca'), setFase('inicio')) : recusar}
        aoNaoAparecer=${fluxo === 'busca' ? () => (setFluxo('remocao'), setFase(consentimento() ? 'ninguem' : 'pedido-remocao')) : null}
      />
      <${Assinatura} />`
  if (fase === 'camera')
    return html`<${Camera}
      para=${paraDoPedido()}
      aoPronto=${aoCapturar}
      aoCancelar=${() => (encerrar(), setFase(fluxo === 'remocao' ? 'pedido-remocao' : 'inicio'))}
      aoErro=${falhar}
    />`
  if (fase === 'ninguem')
    return html`<${Estado}
        marca=${icone.nada()}
        fino="Ninguém é"
        pesado="procurado sem pedir."
        apoio=${chave.current ? 'Você pediu para ser achado. Quer desistir?' : 'Neste evento só entra na busca quem pede.'}
        acao=${chave.current ? 'Desistir' : 'Voltar'}
        aoAgir=${chave.current ? desistir : () => (setFluxo('busca'), setFase('inicio'))}
        segunda=${chave.current ? 'Voltar' : null}
        aoSegunda=${() => (setFluxo('busca'), setFase(achadas ? 'resultado' : 'inicio'))}
      />
      <${Assinatura} />`
  if (fase === 'recusou' || fase === 'desistiu' || fase === 'esquecido')
    return html`<${Estado}
        marca=${icone.certo()}
        fino=${fase === 'recusou' ? 'Tudo' : fase === 'desistiu' ? 'Pedido' : 'Esquecido'}
        pesado=${fase === 'recusou' ? 'bem.' : fase === 'desistiu' ? 'apagado.' : 'neste celular.'}
        apoio=${fase === 'recusou' ? 'Nada foi comparado.' : fase === 'desistiu' ? 'Sua assinatura saiu deste evento.' : 'Nada deste evento ficou guardado aqui.'}
        acao="Voltar ao início"
        aoAgir=${() => (setFluxo('busca'), setFase('inicio'))}
      />
      <${Assinatura} />`
  if (fase === 'removido')
    return html`<${Estado}
        marca=${icone.certo()}
        fino="Pronto."
        pesado=${removidas ? `${plural(removidas, 'rosto saiu', 'rostos saíram')} da busca.` : 'Nada a tirar.'}
        apoio="Fotos novas parecidas com você também ficam de fora."
        acao="Voltar ao início"
        aoAgir=${() => (setFluxo('busca'), setFase('inicio'))}
      />
      <${Assinatura} />`
  if (fase === 'conferir')
    return html`<header class="cabeca entra">
        <p class="sobretitulo">Não quero aparecer</p>
        <h1>
          ${conferir.length ? html`<span class="fino">Confira </span><b class="pesado">${plural(conferir.length, 'foto', 'fotos')}.</b>` : 'Nenhuma foto parecida.'}
        </h1>
        <p class="apoio">${conferir.length ? 'Desmarque o que não for você.' : 'Nada seu aparece na busca deste evento.'}</p>
      </header>
      ${conferir.length > 0 && html`<${Grade} fotos=${conferir} escolhidas=${escolhidas} aoAbrir=${setVendo} aoEscolher=${escolher} marcar=${true} />`}
      <div class="doca">
        <div class="doca-conta">
          <span class="conta"><b>${escolhidas.size}</b> <span>marcadas</span></span>
        </div>
        ${
          conferir.length
            ? html`<button class="vidro vidro--tinta" type="button" disabled=${!escolhidas.size} onClick=${confirmarRemocao}>Tirar da busca</button>`
            : html`<button class="vidro" type="button" onClick=${() => (setFluxo('busca'), setFase('inicio'))}>Voltar</button>`
        }
      </div>
      ${vendo && html`<${Ver} foto=${vendo} escolhida=${escolhidas.has(vendo.id)} aoEscolher=${escolher} aoFechar=${() => setVendo(null)} />`}
      <${Assinatura} />`

  // resultado
  const eu = achadas?.eu ?? []
  const talvez = achadas?.talvez ?? []
  const nenhuma = !eu.length && !talvez.length
  const aguardando = consentimento() && nenhuma
  const ajustes = html`<div class="ajustes">
    <${Lembrar} ligado=${lembrando} aoMudar=${mudarLembrar} aoEsquecer=${esquecerTudo} />
    ${consentimento() && chave.current && html`<button class="liso" type="button" onClick=${desistir}>Desistir da busca</button>`}
    ${!consentimento() && html`<button class="liso" type="button" onClick=${() => (setFluxo('remocao'), setFase('pedido-remocao'))}>Não quero aparecer</button>`}
  </div>`
  if (aguardando || nenhuma)
    return html`<section class="estado estado--curto entra">
        <div class="estado-marca estado-marca--icone">${aguardando ? icone.relogio() : icone.rosto()}</div>
        <p class="sobretitulo evento-nome">${evento.nome}</p>
        ${
          aguardando
            ? html`<h1><span class="fino">Pedido </span><b class="pesado">feito.</b></h1>
                <p class="apoio">Suas fotos aparecem aqui quando o fotógrafo processar. Volte por este link até ${dia(evento.prazo)}.</p>
                <button class="vidro vidro--grande" type="button" onClick=${() => abrir(false)}>Ver de novo</button>`
            : html`<h1><span class="fino">Nenhuma foto </span><b class="pesado">sua aqui.</b></h1>
                <p class="apoio">Tente de novo com mais luz, de frente.</p>
                <button class="vidro vidro--tinta vidro--grande" type="button" onClick=${() => setFase('camera')}>Tentar de novo</button>`
        }
      </section>
      ${ajustes}
      <${Assinatura} />`
  return html`<header class="cabeca entra">
      <p class="sobretitulo evento-nome">${evento.nome}</p>
      <h1>
        ${eu.length ? html`<span class="fino">Suas </span><b class="pesado">fotos.</b>` : html`<span class="fino">Talvez seja </span><b class="pesado">você.</b>`}
      </h1>
      ${pedidas > 0 && html`<p class="apoio">Pedido de ${plural(pedidas, 'foto', 'fotos')} enviado.</p>`}
    </header>
    ${
      eu.length > 0 &&
      html`<section class="secao" aria-label="É você">
        <h2 class="secao-titulo">É você <span>${eu.length}</span></h2>
        <${Grade} fotos=${eu} escolhidas=${escolhidas} aoAbrir=${setVendo} aoEscolher=${escolher} />
      </section>`
    }
    ${
      talvez.length > 0 &&
      html`<details class="secao" open=${!eu.length}>
        <summary>${icone.seguir()} Talvez seja você <span>${talvez.length}</span></summary>
        <p class="apoio">Rosto pequeno, de lado ou perto de outro. Confira.</p>
        <${Grade} fotos=${talvez} escolhidas=${escolhidas} aoAbrir=${setVendo} aoEscolher=${escolher} />
      </details>`
    }
    ${ajustes}
    ${
      escolhidas.size > 0 &&
      html`<div class="doca sobe">
        <div class="doca-conta">
          <span class="conta"><b>${escolhidas.size}</b> <span>${escolhidas.size === 1 ? 'escolhida' : 'escolhidas'}</span></span>
        </div>
        <button class="vidro vidro--tinta" type="button" onClick=${() => setPedindo(true)}>Pedir</button>
      </div>`
    }
    ${vendo && html`<${Ver} foto=${vendo} escolhida=${escolhidas.has(vendo.id)} aoEscolher=${escolher} aoFechar=${() => setVendo(null)} />`}
    ${pedindo && html`<${FolhaPedido} quantas=${escolhidas.size} aoEnviar=${enviarPedido} aoFechar=${() => setPedindo(false)} />`}
    <${Assinatura} />`
}

render(html`<${App} />`, document.getElementById('evento'))

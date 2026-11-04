// O Sobedesce dentro de outra plataforma da Absolute ZRO (titular, 30/10/2026): /app/?no=carro (o porta-malas do Carro
// do Freela) e /app/?no=maestro (a aba Arquivos do Maestro). Mostra só a tarefa de mover arquivo: Transferências (o
// Início: escolher, destino e a fila) e Drive. Aparelhos, Referências, Criar, a Z e o Set ficam de fora (a plataforma
// tem os dela). Quem deixa embutir é o next.config.ts (frame-ancestors só do anfitrião).
// - Tema: o da plataforma, nunca o do aparelho. Vem em ?tema=escuro|claro e muda na hora por mensagem.
// - Mensagens (postMessage), só com a origem do anfitrião: o app conta os envios andando (o anfitrião acende o aviso no
//   menu e segura o fechar da aba) e a pasta aberta no Drive (o Maestro liga a pasta a um projeto). Nada de token.
// - Link que sairia do /app/ (entrar, criar conta, conectar o Drive) abre em outra aba (app.js): dentro do quadro, o
//   login da Absolute ZRO e o do Google não abrem.

const ANFITRIOES = {
  carro: ['https://carro.absolutezro.com'],
  maestro: ['https://maestro.absolutezro.com'],
  relay: ['https://relay.absolutezro.com'],
}
const params = typeof location !== 'undefined' ? new URLSearchParams(location.search) : new URLSearchParams()
const no = params.get('no')

/** Nome do anfitrião ('carro' | 'maestro') ou null fora de um quadro conhecido. */
export const ANFITRIAO = Object.hasOwn(ANFITRIOES, no) ? no : null
export const EMBUTIDO = ANFITRIAO !== null
/** O Relay escolhendo um vídeo (/app/?no=relay&modo=escolher): o toque no arquivo vira o recado `escolhido`. */
export const ESCOLHER = ANFITRIAO === 'relay' && params.get('modo') === 'escolher'

/**
 * Versão do contrato do modo embutido (04/11/2026). Vai no `pronto` com os `recursos` do anfitrião: quem embute só mostra
 * o que depende de um recado novo quando o `pronto` diz que ele existe (o SOBEDESCE antigo manda `pronto` sem nada, e o
 * Maestro esconde o botão). Recado novo = versão nova e o recurso na lista.
 *   1: pronto, envios, pasta (Maestro e Carro); escolhido (Relay).
 *   2: o Maestro manda a entrega para a pasta do card (`enviar`: /app/?no=maestro&modo=enviar&pasta=<id>&nome=<nome>;
 *      cada arquivo terminado vira o recado `enviado`) e a sonda (`?no=maestro&modo=sonda`: só o `pronto`, sem abrir o app).
 */
export const VERSAO_EMBUTIDO = 2
const RECURSOS = { carro: [], maestro: ['enviar'], relay: ['escolher'] }
export const RECURSOS_DO_ANFITRIAO = ANFITRIAO ? RECURSOS[ANFITRIAO] : []
/** O Maestro só pergunta o que este SOBEDESCE sabe fazer: nada de conta, fila nem tela. */
export const SONDA = ANFITRIAO === 'maestro' && params.get('modo') === 'sonda'

const ID_PASTA = /^[A-Za-z0-9_-]{4,200}$/

/** A pasta de entrega que o Maestro mandou no endereço (`pasta` + `nome`), ou null. Puro: o teste chama. */
export function pastaDoEndereco(p) {
  if (p.get('no') !== 'maestro' || p.get('modo') !== 'enviar') return null
  const id = p.get('pasta') || ''
  if (!ID_PASTA.test(id)) return null
  const nome = (p.get('nome') || '').replace(/[\u0000-\u001f\u007f]/g, ' ').replace(/\s+/g, ' ').trim().slice(0, 120) || 'Entrega'
  return { id, name: nome, driveId: null, path: [{ id, name: nome }] }
}
/** No modo `enviar`: a pasta do card do Maestro (o destino da fila). */
export const ENVIAR_PARA = typeof location !== 'undefined' ? pastaDoEndereco(params) : null

/**
 * O recado `enviado` de um item da fila, ou null enquanto não há o que dizer. Só arquivo que terminou nesta pasta, com
 * o id do Drive e a conferência já decidida: `ok` (MD5 do aparelho igual ao do Drive), `diferente` (não conferiu) ou
 * `sem` (o tamanho confere, sem MD5: grande demais, sem o arquivo, sem MD5 do Drive). Puro: o teste chama.
 */
export function recadoDoEnvio(it, pastaId) {
  if (!it || it.status !== 'done' || !it.fileId || it.folder?.id !== pastaId) return null
  const v = it.verify?.state
  if (!v || v === 'pending' || v === 'running') return null
  return {
    arquivo: {
      id: String(it.fileId),
      nome: String(it.name || '').slice(0, 200),
      tamanho: Number(it.size) || 0,
      mime: String(it.type || '').slice(0, 120),
      pasta: pastaId,
      conferencia: v === 'ok' ? 'ok' : v === 'mismatch' ? 'diferente' : 'sem',
    },
  }
}

/** Abas que existem no modo embutido ('transferencias' é a tela cheia da fila, aberta pelo cartão do Início). */
export const ABAS_EMBUTIDO = ['send', 'transferencias', 'drive']

/** Acima disto, a fila sugere o app do computador (cartão de RAW inteiro, pasta de brutos). */
export const GRANDE = 10 * 1024 ** 3

/** A origem de quem nos embute, se for um anfitrião conhecido. Com o próprio app em 127.0.0.1/localhost (teste e
 * desenvolvimento), um anfitrião local também vale. */
function origemDoAnfitriao() {
  if (!EMBUTIDO || typeof window === 'undefined' || window.parent === window) return null
  const vista = location.ancestorOrigins?.[0] || (document.referrer ? new URL(document.referrer).origin : null)
  if (!vista) return null
  if (ANFITRIOES[ANFITRIAO].includes(vista)) return vista
  const local = ['127.0.0.1', 'localhost'].includes(location.hostname)
  if (local && /^http:\/\/(127\.0\.0\.1|localhost)(:\d+)?$/.test(vista)) return vista
  return null
}
const ORIGEM = origemDoAnfitriao()
/** A origem do anfitrião (o Google Picker aberto dentro do quadro precisa dela em setOrigin, lib/picker.js). */
export const ORIGEM_ANFITRIAO = ORIGEM

/** Manda um recado ao anfitrião (só para a origem dele). */
export function avisarAnfitriao(tipo, dados = {}) {
  if (!ORIGEM) return
  try {
    window.parent.postMessage({ fonte: 'sobedesce', tipo, ...dados }, ORIGEM)
  } catch {
    // o anfitrião saiu
  }
}

function aplicarTema(tema) {
  if (tema === 'escuro' || tema === 'dark') document.documentElement.dataset.theme = 'dark'
  else if (tema === 'claro' || tema === 'light') document.documentElement.dataset.theme = 'light'
}

/** Liga o modo embutido: tema do anfitrião e o recado de "pronto". Chamado uma vez pelo app.js. */
export function iniciarEmbutido() {
  if (!EMBUTIDO) return
  document.documentElement.classList.add('is-embutido')
  document.documentElement.dataset.anfitriao = ANFITRIAO
  aplicarTema(params.get('tema'))
  window.addEventListener('message', (e) => {
    if (!ORIGEM || e.origin !== ORIGEM || e.source !== window.parent) return
    const d = e.data
    if (d && typeof d === 'object' && d.tipo === 'tema') aplicarTema(d.tema)
    // o Relay abre um canal para ler o arquivo aos pedaços e mandar o resultado (lib/embutido-relay.js)
    if (ESCOLHER && d && typeof d === 'object' && d.fonte === 'relay' && d.tipo === 'canal' && e.ports[0]) import('./embutido-relay.js').then((m) => m.atender(e.ports[0]))
  })
  avisarAnfitriao('pronto', { versao: VERSAO_EMBUTIDO, recursos: RECURSOS_DO_ANFITRIAO })
}

/** Modo `enviar` do Maestro: cada arquivo que termina na pasta do card vira o recado `enviado` (uma vez por arquivo). */
export function acompanharEntrega(engine) {
  if (!ENVIAR_PARA) return
  const ditos = new Set()
  engine.subscribe(() => {
    for (const it of engine.items) {
      if (ditos.has(it.id)) continue
      const r = recadoDoEnvio(it, ENVIAR_PARA.id)
      if (!r) continue
      ditos.add(it.id)
      avisarAnfitriao('enviado', r)
    }
  })
}

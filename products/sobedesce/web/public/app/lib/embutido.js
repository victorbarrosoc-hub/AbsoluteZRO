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
  avisarAnfitriao('pronto')
}

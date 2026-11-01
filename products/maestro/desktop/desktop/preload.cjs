// Ponte mínima para a página do Maestro e para a tela "Sem conexão": diz que é o app de computador e oferece
// "Tentar de novo" e "Abrir no navegador". Nada do Node chega à página.
//
// `cronometro` (0.2.0): o cronômetro mora também no app (barra de menus/bandeja, cronometro.cjs). O app conduz o
// Pomodoro e o "parado" (com a janela fechada também) e a página só mostra: recebe o que mudou e conta ao app as
// preferências do painel e o "Manter/Descartar" respondido. Só dados simples atravessam, conferidos de novo no main.cjs.

const { contextBridge, ipcRenderer } = require('electron')

const plataforma = process.platform === 'darwin' ? 'mac' : process.platform === 'win32' ? 'windows' : 'linux'

/** Assina um aviso do app; devolve como cancelar. */
const ouvir = (canal) => (cb) => {
  if (typeof cb !== 'function') return () => {}
  const f = (_e, dados) => {
    try {
      cb(dados)
    } catch {
      // erro da página não derruba a ponte
    }
  }
  ipcRenderer.on(canal, f)
  return () => ipcRenderer.removeListener(canal, f)
}

// "Abrir painel" pela barra pode chegar antes de a página montar o cronômetro: guarda e entrega quando ela assinar.
let painelPendente = false
let aoPainel = null
ipcRenderer.on('tempo:abrir-painel', () => {
  if (aoPainel) aoPainel()
  else painelPendente = true
})

const inteiro = (v) => (Number.isInteger(v) && v >= 0 && v <= 1000 ? v : undefined)

contextBridge.exposeInMainWorld('maestroDesktop', {
  isDesktop: true,
  plataforma,
  /** Volta para o Maestro (tela "Sem conexão"). */
  tentarDeNovo: () => ipcRenderer.invoke('maestro:tentar-de-novo'),
  /** Abre o endereço que falhou no navegador padrão (tela "Sem conexão"). */
  abrirNoNavegador: () => ipcRenderer.invoke('maestro:abrir-no-navegador'),
  cronometro: {
    versao: 1,
    /** O tempo mudou pela barra (pausar, retomar, trocar de card): a página relê `/api/tempo`. */
    aoMudar: ouvir('tempo:mudou'),
    /** O Pomodoro do app (fase, focos, pausa e as preferências). */
    aoPomodoro: ouvir('tempo:pomodoro'),
    /** O parado que o app viu ({ desde, ate, registro } ou null quando respondido). */
    aoParado: ouvir('tempo:parado'),
    /** "Abrir painel" na barra. */
    aoAbrirPainel(cb) {
      if (typeof cb !== 'function') return () => {}
      aoPainel = () => {
        try {
          cb()
        } catch {
          // erro da página não derruba a ponte
        }
      }
      if (painelPendente) {
        painelPendente = false
        Promise.resolve().then(aoPainel)
      }
      return () => {
        aoPainel = null
      }
    },
    /** A página montou o cronômetro: o app manda o Pomodoro e o parado de agora. */
    pronto: () => ipcRenderer.send('tempo:do-site', 'pronto'),
    /** A pessoa mudou o Pomodoro no painel (preferências, ou encerrou a pausa). */
    pomodoro(p) {
      const o = p && typeof p === 'object' ? p : {}
      const c = o.config && typeof o.config === 'object' ? o.config : {}
      ipcRenderer.send('tempo:do-site', 'pomodoro', {
        config: { focoMin: inteiro(c.focoMin), pausaMin: inteiro(c.pausaMin), longaMin: inteiro(c.longaMin), ciclos: inteiro(c.ciclos) },
        ociosoMin: inteiro(o.ociosoMin),
        fase: typeof o.fase === 'string' ? o.fase.slice(0, 10) : undefined,
      })
    },
    /** A pessoa respondeu "Manter/Descartar" na página. */
    paradoResolvido: () => ipcRenderer.send('tempo:do-site', 'parado-resolvido'),
  },
})

addEventListener('DOMContentLoaded', () => {
  document.documentElement.classList.add('maestro-desktop', `maestro-desktop--${plataforma}`)
})

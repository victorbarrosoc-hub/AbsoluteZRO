// RADION no Android: a ponte entre a página (radion.absolutezro.com) e o app, posta antes de qualquer script da página
// (WebViewCompat.addDocumentStartJavaScript, só na origem do RADION). Ela fala o mesmo contrato do RADION para computador
// (window.radionDesktop, products/radio/desktop/desktop/preload.cjs), que a página já entende: a página conta o estado do
// rádio (o app mostra na notificação e liga o serviço em primeiro plano) e o app manda 'alternar-fala' (Falar/Parar na
// tela bloqueada e o botão do fone). O canal com o app é RadionAndroid.postMessage (WebMessageListener, só esta origem).
;(() => {
  const A = window.RadionAndroid
  if (!A || window.radionDesktop) return
  const enviar = (m) => {
    try {
      A.postMessage(JSON.stringify(m))
    } catch {
      // app sem a ponte (página aberta num navegador)
    }
  }
  const ouvintes = new Set()
  Object.defineProperty(window, '__radionComando', {
    value: (c) => {
      for (const f of ouvintes) {
        try {
          f(c)
        } catch {
          // um ouvinte com erro não para os outros
        }
      }
    },
  })
  window.radionDesktop = Object.freeze({
    isDesktop: true,
    plataforma: 'android',
    tentarDeNovo: async () => location.reload(),
    abrirNoNavegador: async () => enviar({ t: 'fora', url: location.href }),
    estado: (e) => enviar({ t: 'estado', e: e && typeof e === 'object' ? e : {} }),
    notificar: (titulo, corpo) => enviar({ t: 'notificar', titulo: String(titulo || ''), corpo: String(corpo || '') }),
    compacto: () => {},
    onComando(cb) {
      ouvintes.add(cb)
      return () => ouvintes.delete(cb)
    },
    atalho: async () => null,
  })
  // No navegador do Android a página abre o microfone só durante a fala (para o som não ir ao alto-falante de ligação).
  // No app quem escolhe a saída é o próprio app (fone ou viva-voz), e o microfone precisa ficar aberto com a tela
  // travada: a página não deve se ver como "Android".
  try {
    Object.defineProperty(navigator, 'userAgentData', { value: undefined, configurable: true })
    const ua = navigator.userAgent.replace(/Android/g, 'Linux')
    Object.defineProperty(navigator, 'userAgent', { get: () => ua, configurable: true })
  } catch {
    // sem como ajustar: a página segue o padrão do navegador
  }
  const marcar = () => {
    document.documentElement.classList.add('radion-desktop', 'radion-desktop--android')
    const s = document.createElement('style')
    s.textContent = '.so-computador{display:none!important}'
    document.head.append(s)
  }
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', marcar, { once: true })
  else marcar()
})()

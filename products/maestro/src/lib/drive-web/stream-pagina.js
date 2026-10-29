// O lado da página do stream do Drive (packages/drive-web): registra o service worker (src/sw.js) e responde aos
// pedidos de token dele. O mesmo desenho do SOBEDESCE (web/public/app/lib/stream.js): <video> não manda Authorization,
// então aponta para <escopo>stream/<id> e o SW busca no Google com o token, repassando o Range.
//
// Chave da aba: cada página sorteia uma chave e põe em todo endereço; o SW manda a chave junto do pedido de token e a
// página só entrega o token se a chave for a dela. Um endereço de stream vindo de fora não usa o token de ninguém.
// O token não fica guardado: `obterToken(conta, { renovar })` é de quem chama (Maestro: POST /app/arquivos/token,
// que pede ao SOBEDESCE pela ponte do HUB) e a resposta só vive na memória.

function novaChave() {
  const b = new Uint8Array(16)
  crypto.getRandomValues(b)
  return Array.from(b, (x) => x.toString(16).padStart(2, '0')).join('')
}

/**
 * opções: { swUrl = '/drive-sw.js', escopo = '/app/', obterToken(conta, { renovar }) → { token, expiraEm (ms), api } }.
 * Devolve { chave, url(arquivo, conta), iniciar() → Promise<boolean> (o SW controla a página?) }.
 */
export function criarStream({ swUrl = '/drive-sw.js', escopo = '/app/', obterToken }) {
  const chave = novaChave()
  const base = `${escopo}stream/`
  let ponte = false
  let pronto = null

  function url(arquivo, conta = '') {
    const p = new URLSearchParams()
    if (arquivo.size != null) p.set('s', String(arquivo.size))
    if (arquivo.mimeType) p.set('t', arquivo.mimeType)
    p.set('n', arquivo.name || 'arquivo')
    if (conta) p.set('c', conta)
    p.set('k', chave)
    return `${base}${encodeURIComponent(arquivo.id)}?${p}`
  }

  function ligarPonte() {
    if (ponte) return
    ponte = true
    navigator.serviceWorker.addEventListener('message', async (e) => {
      const d = e.data
      const port = e.ports && e.ports[0]
      if (!d || d.type !== 'zro-drive-token' || !port) return
      if (d.k !== chave) return port.postMessage({ ok: false, reason: 'chave' })
      try {
        const t = await obterToken(typeof d.conta === 'string' ? d.conta : '', { renovar: Boolean(d.stale) })
        port.postMessage({ ok: true, k: chave, token: t.token, api: t.api, expiresAt: t.expiraEm })
      } catch (err) {
        port.postMessage({ ok: false, reason: err && err.reconectar ? 'reconectar' : 'erro' })
      }
    })
    try {
      navigator.serviceWorker.startMessages()
    } catch {
      // navegador antigo: as mensagens começam sozinhas
    }
  }

  function iniciar(espera = 6000) {
    if (pronto) return pronto
    if (typeof navigator === 'undefined' || !('serviceWorker' in navigator)) return (pronto = Promise.resolve(false))
    ligarPonte()
    pronto = navigator.serviceWorker
      .register(swUrl, { scope: escopo })
      .then(() =>
        navigator.serviceWorker.controller
          ? true
          : new Promise((resolve) => {
              const fim = (v) => {
                clearTimeout(t)
                navigator.serviceWorker.removeEventListener('controllerchange', mudou)
                resolve(v)
              }
              const mudou = () => fim(Boolean(navigator.serviceWorker.controller))
              const t = setTimeout(() => fim(Boolean(navigator.serviceWorker.controller)), espera)
              navigator.serviceWorker.addEventListener('controllerchange', mudou)
            }),
      )
      .catch(() => false)
    return pronto
  }

  return { chave, url, iniciar }
}

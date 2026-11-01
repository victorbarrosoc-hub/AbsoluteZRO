// Download da central com cada redirecionamento conferido (ADR 0036).
//
// O instalador vem de /baixar/app/<id>/<arquivo> do HUB, que redireciona para o Release no GitHub
// (github.com/victorbarrosoc-hub/…/releases/download/…) e dali para o servidor de arquivos do GitHub. O session.fetch
// do Electron segue os redirecionamentos sem dizer para onde foi (a resposta chega com `url` vazio) e não aceita
// `redirect: 'manual'`, então a regra "só HTTPS e só o Release" não dava para conferir por ele. Aqui o download usa
// net.request com `redirect: 'manual'`: cada salto passa por `permitido(url)` (regras.downloadPermitido) antes de
// seguir; fora da regra, cancela. O SHA-256 do catálogo continua sendo a garantia do arquivo (central.cjs).
//
// Devolve um objeto com a forma que central.baixar usa de um fetch: { ok, status, url, headers.get, body (Web stream) }.

const { Readable } = require('node:stream')

/** Erro de endereço fora da regra (a central mostra a mensagem como está). */
const recusado = (mensagem) => Object.assign(new Error(mensagem), { recusado: true })

/**
 * @param {{ net: import('electron').Net, session: import('electron').Session, permitido: (url: string) => boolean }} deps
 * @returns {(url: string, opts?: { signal?: AbortSignal }) => Promise<{ ok: boolean, status: number, url: string, headers: { get: (n: string) => string | null }, body: ReadableStream }>}
 */
function criarFetchDeDownload({ net, session, permitido }) {
  return (url, { signal } = {}) =>
    new Promise((ok, falha) => {
      if (!permitido(url)) return falha(recusado('Endereço de download recusado.'))
      if (signal && signal.aborted) return falha(new Error('Download cancelado.'))
      let ultima = url
      let resposta = null
      let terminou = false
      const req = net.request({ url, session, useSessionCookies: true, redirect: 'manual', method: 'GET' })
      const recusar = (err) => {
        if (terminou) return
        terminou = true
        falha(err)
      }
      const abortar = () => {
        try {
          req.abort()
        } catch {
          // já terminou
        }
        if (resposta) resposta.destroy(new Error('Download cancelado.'))
        recusar(new Error('Download cancelado.'))
      }
      if (signal) signal.addEventListener('abort', abortar, { once: true })
      req.on('redirect', (_status, _metodo, novo) => {
        if (!permitido(novo)) {
          recusar(recusado('Endereço de download recusado.'))
          try {
            req.abort()
          } catch {
            // já terminou
          }
          return
        }
        ultima = novo
        req.followRedirect()
      })
      req.on('response', (res) => {
        resposta = res
        terminou = true
        const cab = res.headers || {}
        ok({
          ok: res.statusCode >= 200 && res.statusCode < 300,
          status: res.statusCode,
          url: ultima,
          headers: {
            get: (nome) => {
              const v = cab[String(nome).toLowerCase()]
              return Array.isArray(v) ? (v[0] ?? null) : (v ?? null)
            },
          },
          body: Readable.toWeb(res),
        })
      })
      req.on('error', (err) => recusar(err instanceof Error ? err : new Error(String(err))))
      req.on('abort', () => recusar(new Error('Download cancelado.')))
      req.end()
    })
}

module.exports = { criarFetchDeDownload }

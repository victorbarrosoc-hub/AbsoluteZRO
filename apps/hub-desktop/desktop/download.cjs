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
//
// `criarFetchDireto` (ADR 0043): os pedaços do download paralelo (baixador.cjs) vão direto ao endereço final, pelo https
// do Node e com IPv4 primeiro (a rota IPv6 do GitHub até alguns provedores do Brasil é a mais lenta). Rede só IPv6:
// tenta de novo sem escolher a família. Cada redirecionamento passa pela mesma regra.

const { Readable } = require('node:stream')

/** Erro de endereço fora da regra (a central mostra a mensagem como está). */
const recusado = (mensagem) => Object.assign(new Error(mensagem), { recusado: true })

/**
 * @param {{ net: import('electron').Net, session: import('electron').Session, permitido: (url: string) => boolean }} deps
 * @returns {(url: string, opts?: { signal?: AbortSignal }) => Promise<{ ok: boolean, status: number, url: string, headers: { get: (n: string) => string | null }, body: ReadableStream }>}
 */
function criarFetchDeDownload({ net, session, permitido }) {
  return (url, { signal, headers } = {}) =>
    new Promise((ok, falha) => {
      if (!permitido(url)) return falha(recusado('Endereço de download recusado.'))
      if (signal && signal.aborted) return falha(new Error('Download cancelado.'))
      let ultima = url
      let resposta = null
      let terminou = false
      const req = net.request({ url, session, useSessionCookies: true, redirect: 'manual', method: 'GET' })
      for (const [nome, valor] of Object.entries(headers || {})) req.setHeader(nome, valor)
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

const cabecalhos = (cab) => ({
  get: (nome) => {
    const v = (cab || {})[String(nome).toLowerCase()]
    return Array.isArray(v) ? (v[0] ?? null) : (v ?? null)
  },
})

// sem endereço IPv4 (ou sem rota IPv4): tenta de novo sem escolher a família
const SEM_IPV4 = new Set(['ENOTFOUND', 'ENETUNREACH', 'EHOSTUNREACH', 'EADDRNOTAVAIL', 'EAFNOSUPPORT'])
const REDIRECIONA = new Set([301, 302, 303, 307, 308])

/**
 * GET pelo https do Node, IPv4 primeiro, com cada redirecionamento conferido por `permitido`. Sem cookies (o endereço
 * final do espelho e o link assinado do GitHub não precisam). Mesma forma de resposta do criarFetchDeDownload.
 * @param {{ https?: typeof import('node:https'), permitido: (url: string) => boolean, saltos?: number }} deps
 */
function criarFetchDireto({ https = require('node:https'), permitido, saltos = 5 }) {
  const pedir = (url, { signal, headers }, familia, restam) =>
    new Promise((ok, falha) => {
      if (!permitido(url)) return falha(recusado('Endereço de download recusado.'))
      if (signal && signal.aborted) return falha(new Error('Download cancelado.'))
      let req
      try {
        req = https.request(url, { method: 'GET', headers: headers || {}, ...(familia ? { family: familia } : {}), signal }, (res) => {
          const local = res.headers.location
          if (REDIRECIONA.has(res.statusCode) && local) {
            res.resume()
            if (restam <= 0) return falha(new Error('Redirecionamentos demais.'))
            let novo
            try {
              novo = new URL(local, url).href
            } catch {
              return falha(recusado('Endereço de download recusado.'))
            }
            return pedir(novo, { signal, headers }, familia, restam - 1).then(ok, falha)
          }
          ok({
            ok: res.statusCode >= 200 && res.statusCode < 300,
            status: res.statusCode,
            url,
            headers: cabecalhos(res.headers),
            body: Readable.toWeb(res),
          })
        })
      } catch (e) {
        return falha(e)
      }
      req.on('error', (err) => {
        if (familia === 4 && err && SEM_IPV4.has(err.code)) return pedir(url, { signal, headers }, 0, restam).then(ok, falha)
        falha(signal && signal.aborted ? new Error('Download cancelado.') : err)
      })
      req.end()
    })
  return (url, opts = {}) => pedir(url, opts, 4, saltos)
}

module.exports = { criarFetchDeDownload, criarFetchDireto }

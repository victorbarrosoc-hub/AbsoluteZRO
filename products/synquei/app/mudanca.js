// Mudança de endereço (ADR 0025): o Synquei mora em https://synquei.absolutezro.com. O navegador guarda os projetos
// por endereço, então quem abre o antigo (synquei.vercel.app) leva junto o que estava gravado lá: as chaves synquei:*
// vão comprimidas depois do # (o # não sai do navegador, nem para o servidor) para /mudanca/ do endereço novo, que
// grava só o que ainda não existe e segue para a mesma página. Uma vez por navegador (synquei:mudou); depois disso o
// antigo só redireciona. Se não couber no endereço, o antigo continua funcionando (dá para levar pelo .synquei).
//
// Script comum (não módulo), no <head> das páginas (mora em app/ para ir junto no app de computador, onde não faz nada): no endereço antigo sai antes de pintar. Os testes carregam este
// arquivo num contexto falso e usam window.SynqueiMudanca.
;(function (g) {
  var ANTIGO = 'synquei.vercel.app'
  var NOVO = 'https://synquei.absolutezro.com'
  var FEITO = 'synquei:mudou'
  var INDICE = 'synquei:index'
  var LIMITE = 1500000
  var MAX_CHAVES = 2000
  var RE_CHAVE = /^synquei:[A-Za-z0-9:_.-]{1,80}$/
  var RE_PROJETO = /^synquei:p:([A-Za-z0-9_-]{1,64})$/
  var VOLTA_PADRAO = '/app/'

  /** Caminho relativo seguro dentro do site. Endereço externo, `//`, `\` ou lixo viram /app/. */
  function voltaSegura(v) {
    if (typeof v !== 'string' || !v || v.length > 512) return VOLTA_PADRAO
    if (v.charAt(0) !== '/' || v.charAt(1) === '/' || v.indexOf('\\') >= 0 || /[\u0000-\u001f\u007f]/.test(v)) return VOLTA_PADRAO
    if (v === '/mudanca/' || v.indexOf('/mudanca/') === 0) return VOLTA_PADRAO
    return v
  }

  /** Tudo o que o Synquei gravou neste endereço (synquei:*), menos a marca da própria mudança. */
  function chaves(ls) {
    var out = {}
    for (var i = 0; i < ls.length; i++) {
      var k = ls.key(i)
      if (k && k !== FEITO && RE_CHAVE.test(k)) out[k] = ls.getItem(k)
    }
    return out
  }

  function lerJson(v) {
    try {
      return JSON.parse(v)
    } catch (e) {
      return null
    }
  }

  /**
   * Grava no endereço novo o que veio do antigo, sem apagar nem trocar nada que já exista aqui: projeto e ajuste só
   * entram se a chave estiver livre; a lista de projetos junta as duas. Devolve quantos projetos chegaram.
   */
  function aplicar(ls, itens) {
    if (!itens || typeof itens !== 'object') return 0
    var nomes = Object.keys(itens).slice(0, MAX_CHAVES)
    var projetos = 0
    for (var i = 0; i < nomes.length; i++) {
      var k = nomes[i]
      var v = itens[k]
      if (k === FEITO || k === INDICE || typeof v !== 'string' || !RE_CHAVE.test(k)) continue
      if (ls.getItem(k) !== null) continue
      var m = RE_PROJETO.exec(k)
      if (m) {
        var p = lerJson(v)
        if (!p || typeof p !== 'object' || p.id !== m[1] || !Array.isArray(p.clips)) continue
      }
      try {
        ls.setItem(k, v)
        if (m) projetos++
      } catch (e) {
        // sem espaço: o resto fica no endereço antigo
      }
    }
    var aqui = lerJson(ls.getItem(INDICE))
    var veio = lerJson(itens[INDICE])
    aqui = Array.isArray(aqui) ? aqui : []
    veio = Array.isArray(veio) ? veio : []
    var tem = {}
    for (var a = 0; a < aqui.length; a++) if (aqui[a] && aqui[a].id) tem[aqui[a].id] = true
    var lista = aqui.slice()
    for (var b = 0; b < veio.length; b++) {
      var e = veio[b]
      if (!e || typeof e.id !== 'string' || tem[e.id] || ls.getItem('synquei:p:' + e.id) === null) continue
      tem[e.id] = true
      lista.push(e)
    }
    if (lista.length !== aqui.length) {
      lista.sort(function (x, y) {
        return (Number(y.updatedAt) || 0) - (Number(x.updatedAt) || 0)
      })
      try {
        ls.setItem(INDICE, JSON.stringify(lista))
      } catch (e2) {}
    }
    return projetos
  }

  // ───────── pacote: JSON → gzip (quando o navegador tem CompressionStream) → base64url ─────────

  function paraB64(bytes) {
    var s = ''
    for (var i = 0; i < bytes.length; i += 0x8000) s += String.fromCharCode.apply(null, bytes.subarray(i, i + 0x8000))
    return btoa(s).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '')
  }

  function deB64(t) {
    var s = atob(t.replace(/-/g, '+').replace(/_/g, '/'))
    var out = new Uint8Array(s.length)
    for (var i = 0; i < s.length; i++) out[i] = s.charCodeAt(i)
    return out
  }

  function passar(bytes, stream) {
    return new Response(new Blob([bytes]).stream().pipeThrough(stream)).arrayBuffer().then(function (b) {
      return new Uint8Array(b)
    })
  }

  /** "g" + gzip ou "j" + JSON puro, em base64url. */
  function empacotar(itens, volta) {
    var bytes = new TextEncoder().encode(JSON.stringify({ v: 1, volta: voltaSegura(volta), itens: itens }))
    if (typeof CompressionStream !== 'function') return Promise.resolve('j' + paraB64(bytes))
    return passar(bytes, new CompressionStream('gzip')).then(function (z) {
      return 'g' + paraB64(z)
    })
  }

  /** Abre o pacote. Qualquer coisa fora do formato vira null. */
  function abrir(texto) {
    if (typeof texto !== 'string' || texto.length < 2 || texto.length > LIMITE) return Promise.resolve(null)
    var tipo = texto.charAt(0)
    var bytes
    try {
      bytes = deB64(texto.slice(1))
    } catch (e) {
      return Promise.resolve(null)
    }
    var pronto
    if (tipo === 'j') pronto = Promise.resolve(bytes)
    else if (tipo === 'g' && typeof DecompressionStream === 'function') pronto = passar(bytes, new DecompressionStream('gzip'))
    else return Promise.resolve(null)
    return pronto
      .then(function (b) {
        var d = lerJson(new TextDecoder().decode(b))
        if (!d || d.v !== 1 || !d.itens || typeof d.itens !== 'object') return null
        return { volta: voltaSegura(d.volta), itens: d.itens }
      })
      .catch(function () {
        return null
      })
  }

  // ───────── no endereço antigo: ir para o novo ─────────

  function partir(loc, ls, raiz) {
    var volta = voltaSegura(loc.pathname + loc.search + loc.hash)
    var itens = ls ? chaves(ls) : {}
    if (!ls || ls.getItem(FEITO) || !Object.keys(itens).length) return loc.replace(NOVO + volta)
    raiz.style.visibility = 'hidden'
    var mostrar = function () {
      raiz.style.visibility = ''
    }
    return empacotar(itens, volta).then(function (t) {
      if (t.length > LIMITE) return mostrar()
      try {
        ls.setItem(FEITO, new Date().toISOString())
      } catch (e) {}
      loc.replace(NOVO + '/mudanca/#' + t)
    }, mostrar)
  }

  g.SynqueiMudanca = { ANTIGO: ANTIGO, NOVO: NOVO, FEITO: FEITO, LIMITE: LIMITE, voltaSegura: voltaSegura, chaves: chaves, aplicar: aplicar, empacotar: empacotar, abrir: abrir, partir: partir }

  if (g.location && g.location.hostname === ANTIGO) {
    var ls = null
    try {
      ls = g.localStorage
    } catch (e) {}
    partir(g.location, ls, g.document.documentElement)
  }
})(typeof window !== 'undefined' ? window : globalThis)

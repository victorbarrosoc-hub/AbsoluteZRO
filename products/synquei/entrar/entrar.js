// Synquei · página de entrada (/entrar/). O site pede a conta Absolute ZRO (decisão do titular, 02/11/2026, no padrão
// do Relay): fora (Entrar com Absolute ZRO / Criar conta), dentro (quem é, Abrir o Synquei, Sair) e desligado (login
// não ligado neste endereço ou sem rede: o app segue aberto, como no app/js/conta.js). `?volta=` diz para onde ir
// depois de entrar (padrão /app/); `?zro=` traz o recado da volta do login.
;(function () {
  var AVISOS = {
    expirou: 'A entrada demorou demais. Tente de novo.',
    recusado: 'Entrada cancelada.',
    erro: 'Não deu para entrar agora. Tente de novo em instantes.',
    config: 'A entrada com a Absolute ZRO ainda não está ligada neste site.',
  }

  /** Só caminho deste site, fora do próprio /entrar/ (o mesmo critério de api/_zro.js). O resto vira /app/. */
  function voltaSegura(v) {
    if (typeof v !== 'string' || !v || v.length > 512) return '/app/'
    if (v.charAt(0) !== '/' || v.charAt(1) === '/' || v.indexOf('\\') >= 0 || /[\u0000-\u001f\u007f]/.test(v)) return '/app/'
    if (/^\/entrar(\/|$|\?|#)/.test(v)) return '/app/'
    return v
  }

  /** Resposta de /api/zro/eu?visitante=1 → 'dentro' | 'fora' | 'desligado'. */
  function estado(status, j) {
    if (status === 200 && j && j.ok && j.pessoa) return 'dentro'
    if ((status === 401 || (status === 200 && j && j.entrou === false)) && j && j.configurado) return 'fora'
    return 'desligado'
  }

  var iniciais = function (p) {
    return String(p.nome || p.email || '?')
      .split(/[\s@.]+/)
      .filter(Boolean)
      .slice(0, 2)
      .map(function (s) {
        return s.charAt(0).toUpperCase()
      })
      .join('')
  }
  var primeiroNome = function (p) {
    return String(p.nome || p.email || '').split(/[\s@]/)[0]
  }

  window.SynqueiEntrar = { voltaSegura: voltaSegura, estado: estado, AVISOS: AVISOS }
  if (!document.getElementById('fora')) return

  var $ = function (id) {
    return document.getElementById(id)
  }
  var q = new URLSearchParams(location.search)
  var pedida = q.get('volta')
  var volta = voltaSegura(pedida)
  $('entrar').href = '/api/zro/entrar?volta=' + encodeURIComponent(volta)
  $('criar').href = '/api/zro/entrar?criar=1&volta=' + encodeURIComponent(volta)
  // "Usar outra conta" (02/11/2026): sai da conta deste site (o /sair revoga o acesso) e pede a conta de novo com
  // prompt=login, mesmo com outra sessão aberta na Absolute ZRO; se o /sair falhar, segue mesmo assim.
  var outra = '/api/zro/entrar?outra=1&volta=' + encodeURIComponent(volta)
  Array.prototype.forEach.call(document.querySelectorAll('[data-outra]'), function (a) {
    a.href = outra
    a.addEventListener('click', function (ev) {
      ev.preventDefault()
      var ir = function () {
        location.assign(outra)
      }
      fetch('/api/zro/sair', { method: 'POST', credentials: 'same-origin', cache: 'no-store' }).then(ir, ir)
    })
  })
  $('abrir').href = volta
  $('abrir-sem').href = volta
  if (AVISOS[q.get('zro')]) $('aviso').textContent = AVISOS[q.get('zro')]

  function mostrar(st, j) {
    if (st === 'dentro') {
      // já dentro: quem veio de uma tela do Synquei volta para ela
      if (pedida) return location.replace(volta)
      var p = j.pessoa
      var av = $('avatar')
      av.textContent = iniciais(p)
      if (typeof p.foto === 'string' && /^https:\/\/[^\s"'<>]+$/.test(p.foto)) {
        var img = document.createElement('img')
        img.alt = ''
        img.referrerPolicy = 'no-referrer'
        img.onerror = function () {
          img.remove()
        }
        img.src = p.foto
        av.appendChild(img)
      }
      $('ola').textContent = 'Olá, ' + primeiroNome(p) + '.'
      $('quem').textContent = p.email || ''
      $('dentro').hidden = false
    } else if (st === 'fora') $('fora').hidden = false
    else $('desligado').hidden = false
  }

  fetch('/api/zro/eu?visitante=1', { cache: 'no-store', credentials: 'same-origin', headers: { accept: 'application/json' } })
    .then(function (r) {
      var json = (r.headers.get('content-type') || '').indexOf('application/json') >= 0
      return (json ? r.json() : Promise.resolve(null)).then(function (j) {
        mostrar(estado(r.status, j), j)
      })
    })
    .catch(function () {
      mostrar('desligado', null)
    })

  $('sair').addEventListener('click', function () {
    fetch('/api/zro/sair', { method: 'POST', credentials: 'same-origin' })
      .then(function () {
        location.replace('/entrar/')
      })
      .catch(function () {
        $('aviso').textContent = 'Não deu para sair agora. Tente de novo.'
      })
  })
})()

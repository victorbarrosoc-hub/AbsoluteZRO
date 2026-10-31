// Tela "Sem conexão": tenta de novo pelo botão (ou Enter) e sozinha quando a rede volta. Sem animação contínua.
;(function () {
  const ponte = window.tpeasyDesktop
  const q = new URLSearchParams(location.search)
  const motivo = q.get('motivo')
  const tentar = document.getElementById('tentar')
  const navegador = document.getElementById('navegador')
  const estado = document.getElementById('estado')

  if (motivo === 'servidor') {
    document.getElementById('titulo-fino').textContent = 'O TPeasy'
    document.getElementById('titulo-forte').textContent = 'não respondeu.'
    document.getElementById('texto').textContent = 'Tente de novo em instantes.'
  }

  let ocupado = false
  async function deNovo(auto) {
    if (ocupado || !ponte) return
    ocupado = true
    tentar.disabled = true
    estado.textContent = auto ? 'A rede voltou. Abrindo…' : 'Abrindo…'
    try {
      await ponte.tentarDeNovo()
    } finally {
      // se o TPeasy não abrir, o app volta para esta tela; libera o botão depois de um respiro
      setTimeout(() => {
        ocupado = false
        tentar.disabled = false
        estado.textContent = navigator.onLine ? '' : 'Ainda sem internet.'
      }, 2500)
    }
  }

  tentar.addEventListener('click', () => deNovo(false))
  navegador.addEventListener('click', () => ponte && ponte.abrirNoNavegador())
  addEventListener('online', () => deNovo(true))
  addEventListener('keydown', (e) => {
    if (e.key === 'Enter' && document.activeElement === document.body) deNovo(false)
  })
  tentar.focus()
  window.__tpeasyOffline = { pronto: true, temPonte: !!(ponte && ponte.isDesktop) }
})()

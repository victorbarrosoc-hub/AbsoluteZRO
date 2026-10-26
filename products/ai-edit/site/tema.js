// Tema antes da primeira pintura (sem piscar): a escolha guardada (a mesma chave do app, "zro-tema"); sem escolha, o
// escuro, que é o ambiente do AEON. Script clássico e pequeno, carregado no <head> (a CSP não aceita script inline).
;(function () {
  var t = 'dark'
  try {
    t = localStorage.getItem('zro-tema') || 'dark'
  } catch (e) {}
  document.documentElement.dataset.theme = t === 'light' ? 'light' : 'dark'
  document.documentElement.classList.add('js')
})()

// Barra de título do Mac: botões mandam a ação ao processo principal; o estado (título, voltar/avançar, carregando)
// chega pronto de lá. Nada de laço por quadro: a classe muda só quando o estado muda.
;(function () {
  const barra = window.zroBarra
  if (!barra) return
  const el = (id) => document.getElementById(id)
  for (const id of ['voltar', 'avancar', 'recarregar', 'inicio']) el(id).addEventListener('click', () => barra.acao(id))
  // clique duplo na barra: o mesmo do resto do Mac (ampliar ou minimizar, conforme o Ajuste do Sistema)
  document.querySelector('.barra').addEventListener('dblclick', (e) => {
    if (!e.target.closest('button')) barra.acao('duplo-clique')
  })
  barra.onEstado((s) => {
    el('titulo').textContent = s.titulo || 'Absolute ZRO'
    el('voltar').disabled = !s.voltar
    el('avancar').disabled = !s.avancar
    document.body.classList.toggle('carregando', !!s.carregando)
    document.body.classList.toggle('desfocada', !s.focada)
    document.body.classList.toggle('tela-cheia', !!s.telaCheia)
  })
})()

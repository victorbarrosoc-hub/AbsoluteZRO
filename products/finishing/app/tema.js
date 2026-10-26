// Revela · tema. Claro é o padrão da família Absolute ZRO; o escuro é escolha da pessoa, lembrada neste navegador.
// Script clássico no <head> (antes do CSS pintar) para a página não piscar no tema errado.
;(() => {
  const CHAVE = 'revela-tema'
  const raiz = document.documentElement
  const ler = () => {
    try {
      return localStorage.getItem(CHAVE) === 'escuro' ? 'escuro' : 'claro'
    } catch {
      return 'claro'
    }
  }
  const aplicar = (tema) => {
    if (tema === 'escuro') raiz.dataset.tema = 'escuro'
    else delete raiz.dataset.tema
    document.querySelector('meta[name="color-scheme"]')?.setAttribute('content', tema === 'escuro' ? 'dark' : 'light')
    trocarLogos(tema)
    document.dispatchEvent(new CustomEvent('revela:tema', { detail: tema }))
  }
  // a logo tem letras brancas (para o escuro) e grafite (para o claro); o filme colorido é o mesmo
  function trocarLogos(tema) {
    for (const img of document.querySelectorAll('img[src*="revela-logo"]'))
      img.src = img.getAttribute('src').replace(/revela-logo(-grafite)?\.png/, tema === 'escuro' ? 'revela-logo.png' : 'revela-logo-grafite.png')
  }
  document.addEventListener('DOMContentLoaded', () => trocarLogos(raiz.dataset.tema === 'escuro' ? 'escuro' : 'claro'))
  aplicar(ler())
  window.revelaTema = {
    atual: () => (raiz.dataset.tema === 'escuro' ? 'escuro' : 'claro'),
    alternar() {
      const novo = this.atual() === 'escuro' ? 'claro' : 'escuro'
      try {
        localStorage.setItem(CHAVE, novo)
      } catch {
        // janela privada: vale só nesta visita
      }
      aplicar(novo)
      return novo
    },
  }
})()

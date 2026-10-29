// Relay · tema. Claro é o padrão da família Absolute ZRO; o escuro é escolha da pessoa, lembrada neste navegador.
// Script clássico no <head> (antes do CSS pintar) para a página não piscar no tema errado.
;(() => {
  const CHAVE = 'relay-tema'
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
    document.querySelector('meta[name="theme-color"]')?.setAttribute('content', tema === 'escuro' ? '#0e0e10' : '#f5f5f7')
  }
  aplicar(ler())
  window.relayTema = {
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

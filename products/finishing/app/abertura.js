// Revela · abertura do app instalado (Tela de Início): a sala escura do laboratório. Sob a luz vermelha de segurança,
// uma tira de película entra correndo como no projetor; os quadros, ainda latentes, se revelam um a um em cor; um
// vazamento de luz atravessa a fita, o nome aparece e a sala acende para a ferramenta.
// Só no app aberto do ícone, uma vez por abertura (voltar do segundo plano não repete); toque pula. Sem animação para
// quem pediu menos movimento. Tudo em CSS (app/revela.css), nada por quadro.
// Script clássico no <head>, logo depois do tema: cobre a tela antes do primeiro quadro, para o app não piscar por baixo.
// ?abertura=1 mostra no navegador também (para ver antes de instalar).
;(() => {
  const CHAVE = 'revela-abriu'
  const raiz = document.documentElement
  const forcar = new URLSearchParams(location.search).get('abertura') === '1'
  const app = matchMedia('(display-mode: standalone)').matches || navigator.standalone === true
  const calmo = matchMedia('(prefers-reduced-motion: reduce)').matches
  let jaAbriu = false
  try {
    jaAbriu = sessionStorage.getItem(CHAVE) === '1'
    sessionStorage.setItem(CHAVE, '1')
  } catch {
    // sem armazenamento: abre toda vez, sem problema
  }
  if (!forcar && (!app || jaAbriu || calmo)) return

  raiz.classList.add('abrindo')
  const QUADROS = 7 // o do meio é o quadro da marca (com o fio de luz do ícone)
  const furos = '<i></i>'.repeat(QUADROS * 4)
  const quadros = Array.from(
    { length: QUADROS },
    (_, i) => `<span class="pel-quadro${i === (QUADROS - 1) / 2 ? ' pel-quadro--marca' : ''}" style="--i:${i}"></span>`,
  ).join('')

  function mostrar() {
    const tela = document.createElement('div')
    tela.className = 'abertura-app'
    tela.setAttribute('aria-hidden', 'true')
    tela.innerHTML = `
      <div class="pel-luz"></div>
      <div class="pel-fita">
        <div class="pel-furos">${furos}</div>
        <div class="pel-quadros">${quadros}</div>
        <div class="pel-furos">${furos}</div>
      </div>
      <div class="pel-vazamento"></div>
      <img class="pel-nome" src="marca/revela-logo.png" alt="" width="150" height="28" />
      <div class="pel-grao"></div>`
    document.body.append(tela)
    raiz.classList.remove('abrindo')
    const fim = () => tela.remove()
    tela.addEventListener('animationend', (e) => e.target === tela && fim())
    tela.addEventListener('pointerdown', () => tela.classList.add('abertura-pula'))
    setTimeout(fim, 5000) // rede: se a animação não terminar (aba em segundo plano), some do mesmo jeito
  }
  if (document.body) mostrar()
  else document.addEventListener('DOMContentLoaded', mostrar, { once: true })
})()

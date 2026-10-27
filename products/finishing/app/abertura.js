// Revela · abertura do app instalado (Tela de Início). O ícone entra, o quadro da película se revela em cor, como uma
// foto no revelador, e a tela abre para a ferramenta. Só no app aberto do ícone, uma vez por abertura (voltar do
// segundo plano não repete); toque pula. Sem animação para quem pediu menos movimento.
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
  // o mesmo desenho de marca/revela-icone.svg; o "revelado" passa da borda direita para entrar varrendo da direita
  const icone = `<svg viewBox="100 100 824 824" aria-hidden="true">
    <defs>
      <linearGradient id="ab-fundo" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#232327"/><stop offset="1" stop-color="#0C0C0E"/></linearGradient>
      <linearGradient id="ab-pelicula" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#FFC933"/><stop offset="1" stop-color="#FFAE00"/></linearGradient>
      <linearGradient id="ab-revelado" gradientUnits="userSpaceOnUse" gradientTransform="matrix(302 0 0 280 470 372)" x1="0" y1="1" x2="1" y2="0"><stop offset="0" stop-color="#4B1FB8"/><stop offset=".32" stop-color="#8B3FE8"/><stop offset=".62" stop-color="#E52B1A"/><stop offset=".82" stop-color="#FF7A1A"/><stop offset="1" stop-color="#FFC933"/></linearGradient>
      <clipPath id="ab-quadro"><rect x="252" y="372" width="520" height="280" rx="28"/></clipPath>
    </defs>
    <rect x="100" y="100" width="824" height="824" rx="186" fill="url(#ab-fundo)"/>
    <rect x="200" y="290" width="624" height="444" rx="40" fill="url(#ab-pelicula)"/>
    <g fill="#0C0C0E">${[236, 316, 396, 476, 556, 636, 716].map((x) => `<rect x="${x}" y="312" width="44" height="36" rx="9"/><rect x="${x}" y="676" width="44" height="36" rx="9"/>`).join('')}</g>
    <g clip-path="url(#ab-quadro)">
      <rect x="252" y="372" width="520" height="280" fill="#1B1B1F"/>
      <g class="abertura-revela">
        <polygon points="566,372 1100,372 1100,652 470,652" fill="url(#ab-revelado)"/>
        <line x1="566" y1="372" x2="470" y2="652" stroke="#FFF4E0" stroke-width="10" stroke-linecap="round"/>
      </g>
    </g>
  </svg>`

  function mostrar() {
    const tela = document.createElement('div')
    tela.className = 'abertura-app'
    tela.setAttribute('aria-hidden', 'true')
    tela.innerHTML = `<div class="abertura-icone">${icone}</div>`
    document.body.append(tela)
    raiz.classList.remove('abrindo')
    const fim = () => {
      tela.remove()
    }
    tela.addEventListener('animationend', (e) => e.target === tela && fim())
    tela.addEventListener('pointerdown', () => tela.classList.add('abertura-pula'))
    setTimeout(fim, 4000) // rede: se a animação não terminar (aba em segundo plano), some do mesmo jeito
  }
  if (document.body) mostrar()
  else document.addEventListener('DOMContentLoaded', mostrar, { once: true })
})()

// Revela · painel inicial: a Z, a IA do ecossistema Absolute ZRO (pedido do titular, 27/10/2026: a IA no painel
// inicial de todas as plataformas). É o mesmo <zro-ia> do HUB e de todos os apps, vindo de absolutezro.com. A Z
// conversa e lê dados da conta; não gradua nem gera LUT (isso é a pessoa, nas abas do dock).
//
// O token nunca chega aqui: o <zro-ia> fala com /api/zro/ia/*, o repasse da Vercel (api/_ia.js), que põe o access
// token da sessão (cookie cifrado) no Authorization. Sem conta ou sem o escopo da Z: "Entrar com Absolute ZRO".

import './conta.js'
import './menu.js'
import { icones } from './visual.js'

const HOSPEDADO = 'https://absolutezro.com/ia/v1/zro-ia.js'
const SUGESTOES = ['Qual LUT uso para S-Log3?', 'Como aplico uma LUT no Resolve?', 'Que preset uso para o YouTube?', 'O que faz um CST?']

// o painel desta página (as abas trocam de painel sem recarregar, app/navegar.js): tudo é procurado aqui dentro
const raiz = document.querySelector('main')
const lugar = raiz.querySelector('#zPainel')
const aviso = lugar.querySelector('.z-aviso')
const temaDe = () => (document.documentElement.dataset.tema === 'escuro' ? 'escuro' : 'claro')

icones()

function mostrar(texto, entrar = false) {
  aviso.hidden = false
  aviso.querySelector('p').textContent = texto
  const a = aviso.querySelector('a')
  a.hidden = !entrar
  a.href = `/api/zro/entrar?volta=${encodeURIComponent(location.pathname)}`
}

try {
  await import(HOSPEDADO)
  await customElements.whenDefined('zro-ia')
  const z = document.createElement('zro-ia')
  z.setAttribute('api', '/api/zro/ia')
  z.setAttribute('apoio', 'Que cor vamos revelar hoje?')
  z.setAttribute('sugestoes', JSON.stringify(SUGESTOES))
  z.setAttribute('tema', temaDe())
  // sem conta, login antigo sem o escopo zro.ia ou acesso que caiu: entrar (já pede o escopo da Z)
  z.addEventListener('zro-ia:sem-login', () => {
    lugar.dataset.z = 'sem-login'
    mostrar('Entre para conversar com a Z.', true)
  })
  document.addEventListener('revela:tema', () => z.setAttribute('tema', temaDe()))
  lugar.dataset.z = 'pronta'
  lugar.prepend(z)
} catch {
  lugar.dataset.z = 'fora'
  mostrar('A Z precisa de internet. As ferramentas seguem funcionando.')
}

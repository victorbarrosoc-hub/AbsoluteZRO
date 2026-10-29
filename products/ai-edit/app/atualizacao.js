// Aviso de versão nova, discreto na barra do app de desktop (desktop/atualizador.cjs faz o trabalho): "Versão nova" e
// Atualizar. Tocou, a mesma pílula mostra o andamento medido (bytes baixados do instalador), sem piscar: uma barra fina
// que só anda para a frente; depois o app fecha e abre de novo na versão nova. Se o app não consegue se trocar sozinho
// (fora de Aplicativos, sem permissão, troca anterior falhou), o botão vira Baixar (a página de instalação).
// No navegador e no app de desenvolvimento (build 0) nada aparece.

const MB = 1024 * 1024

/**
 * Estado do atualizador → o que a pílula mostra. Puro (testado em test/atualizador.test.js).
 * @returns {{ visivel: boolean, texto: string, dica: string, acao: 'atualizar'|'baixar'|null, rotulo: string,
 *   fracao: number|null, depois: boolean }}
 */
export function aviso(st) {
  const nada = { visivel: false, texto: '', dica: '', acao: null, rotulo: '', fracao: null, depois: false }
  if (!st || !st.nova) return nada
  const build = st.ultima?.build ? `Build ${st.ultima.build}.` : ''
  switch (st.fase) {
    case 'baixando': {
      const fracao = st.total > 0 ? Math.min(1, st.recebido / st.total) : null
      const texto = fracao === null ? (st.recebido ? `Baixando ${Math.round(st.recebido / MB)} MB` : 'Baixando…') : `Baixando ${Math.floor(fracao * 100)}%`
      return { ...nada, visivel: true, texto, dica: 'Baixando a versão nova. Pode seguir editando.', fracao }
    }
    case 'conferindo':
      return { ...nada, visivel: true, texto: 'Conferindo…', dica: 'Conferindo o arquivo baixado (SHA-256).', fracao: 1 }
    case 'preparando':
      return { ...nada, visivel: true, texto: 'Preparando…', dica: 'Preparando a troca.', fracao: 1 }
    case 'reiniciando':
      return { ...nada, visivel: true, texto: 'Reabrindo…', dica: 'O app fecha e abre de novo na versão nova.', fracao: 1 }
    case 'erro':
      return st.podeAtualizar
        ? { ...nada, visivel: true, texto: 'Não atualizou', dica: st.erro || '', acao: 'atualizar', rotulo: 'Tentar de novo', depois: true }
        : { ...nada, visivel: true, texto: 'Não atualizou', dica: [st.erro, 'Baixe a versão nova pelo site.'].filter(Boolean).join(' '), acao: 'baixar', rotulo: 'Baixar', depois: true }
    default:
      return st.podeAtualizar
        ? { ...nada, visivel: true, texto: 'Versão nova', dica: `${build} O app fecha, atualiza e abre de novo.`.trim(), acao: 'atualizar', rotulo: 'Atualizar', depois: true }
        : { ...nada, visivel: true, texto: 'Versão nova', dica: [build, st.motivo, 'Baixe pelo site.'].filter(Boolean).join(' '), acao: 'baixar', rotulo: 'Baixar', depois: true }
  }
}

/** Liga a pílula (#atualizacao) à ponte do desktop (window.aiEditDesktop.atualizacao). Sem ponte, não faz nada. */
export function montarAtualizacao(ponte, raiz = document.getElementById('atualizacao')) {
  if (!ponte || !raiz) return
  const texto = raiz.querySelector('.atualizacao-texto')
  const barra = raiz.querySelector('.atualizacao-barra')
  const cheio = barra.querySelector('span')
  const botao = raiz.querySelector('.atualizacao-botao')
  const depois = raiz.querySelector('.atualizacao-depois')
  let acao = null
  let maior = 0 // a barra só anda para a frente (uma volta para trás pareceria um salto)

  function pintar(st) {
    const a = aviso(st)
    raiz.hidden = !a.visivel
    if (!a.visivel) return
    texto.textContent = a.texto
    raiz.title = a.dica
    raiz.dataset.fase = st.fase || 'nova'
    barra.hidden = a.fracao === null
    if (a.fracao !== null) {
      maior = st.fase === 'baixando' ? Math.max(maior, a.fracao) : 1
      cheio.style.transform = `scaleX(${maior.toFixed(3)})`
      barra.setAttribute('aria-valuenow', String(Math.round(maior * 100)))
    }
    acao = a.acao
    botao.hidden = !a.acao
    botao.textContent = a.rotulo
    depois.hidden = !a.depois
  }

  botao.addEventListener('click', async () => {
    if (acao === 'atualizar') {
      maior = 0
      pintar(await ponte.atualizar())
    } else if (acao === 'baixar') await ponte.baixar()
  })
  depois.addEventListener('click', async () => pintar(await ponte.depois()))
  ponte.aoMudar(pintar)
  ponte.estado().then(pintar, () => {})
}

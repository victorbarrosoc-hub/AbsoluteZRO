// A casca do app: o topo em vidro (o símbolo como assinatura, o nome do trabalho, o dock com as quatro etapas e, à
// direita, o Set, o anel da Z, o tema e a conta) e o painel central, que é a única coisa que as abas trocam.
//
// Contrato de tela: app/telas/<nome>/index.js exporta `default` um componente Preact que recebe
// { loja, ativa } (e, se a tela é um palco escuro de ponta a ponta, `export const palco = true`: o topo e o dock
// escurecem junto). `ativa` diz se a aba está na frente: a tela fica montada (o estado dela é preservado) e só some.
// A tela ocupa o painel inteiro; use a classe `.tela` (rola por baixo do topo) ou `.tela.tela--fixa`.
//
// Teclas da casca: G vai para Decupar e D para Revelar (como no Lightroom); Ctrl/Cmd + Alt + 1–4 escolhem a etapa
// (os números sozinhos são estrelas); ? abre os atalhos.

import { cx, html, useEffect, useRef, useState } from '../preact.js'
import { NOME } from '../nome.js'
import { Icone } from '../icones.js'
import { Avisos, avisar } from '../componentes/aviso.js'
import { Menu, Numero, ProgressoAnel, usarMarca, Vazio } from '../componentes/base.js'
import { Folha, FolhaAtalhos } from '../componentes/folha.js'
import { usarLoja } from '../estado.js'
import { ACEITA } from '../../src/biblioteca/arquivos.js'
import { AcoesDeAbrir, Inicio, Recentes } from '../abrir/inicio.js'
import { usarAtalhos } from './atalhos.js'
import { Conta } from './conta.js'
import { ABAS, enderecoDaAba, usarRota } from './rota.js'
import { EntradaDoSet } from './set.js'
import { Simbolo } from './simbolo.js'
import { comTransicao } from './transicao.js'
import { AnelDaZ } from './z.js'

/** As telas, carregadas na primeira visita de cada aba. */
const CARREGAR = {
  decupar: () => import('../telas/decupar/index.js'),
  revelar: () => import('../telas/revelar/index.js'),
  estilos: () => import('../telas/estilos/index.js'),
  entregar: () => import('../telas/entregar/index.js'),
}

const ATALHOS_DA_CASCA = [
  { grupo: 'Ver', teclas: ['⌘', 'Alt', '1', '–', '4'], rotulo: 'Trocar de etapa' },
]

/** As miniaturas sendo feitas por trás: um anel discreto ao lado do nome. */
function Andamento({ loja }) {
  const [p, definir] = useState(loja.miniaturas.progresso())
  useEffect(() => loja.miniaturas.assinarProgresso(definir), [loja])
  const lendo = usarLoja(loja, (l) => l.lendo())
  if (lendo?.total) {
    return html`<span class="topo-andamento" role="status" aria-label="Lendo as fotos"><${ProgressoAnel} valor=${lendo.feitas / lendo.total} rotulo="Lendo as fotos" /><span><${Numero} valor=${lendo.total} /></span></span>`
  }
  if (!p.total || p.feitas >= p.total) return null
  return html`<span class="topo-andamento" title="Preparando as miniaturas"><${ProgressoAnel} valor=${p.feitas / p.total} rotulo="Preparando as miniaturas" /></span>`
}

function Trabalhos({ loja, aberta, aoFechar, aoEscolher }) {
  const atual = usarLoja(loja, (l) => l.trabalho()?.id)
  return html`<${Folha} aberta=${aberta} aoFechar=${aoFechar} titulo=${['Seus', 'trabalhos.']} largura=${760} classe="folha-trabalhos">
    <${AcoesDeAbrir}
      loja=${loja}
      grande=${false}
      aoEscolher=${() => {
        aoFechar()
        aoEscolher()
      }}
    />
    <${Recentes} loja=${loja} menos=${atual} aoAbrir=${aoFechar} />
  <//>`
}

function Renomear({ loja, aberta, aoFechar }) {
  const nome = usarLoja(loja, (l) => l.trabalho()?.nome || '')
  const campo = useRef(null)
  useEffect(() => {
    if (aberta) requestAnimationFrame(() => campo.current?.select())
  }, [aberta])
  const salvar = (e) => {
    e.preventDefault()
    loja.renomear(campo.current?.value)
    aoFechar()
  }
  return html`<${Folha} aberta=${aberta} aoFechar=${aoFechar} titulo=${['Nome', 'do trabalho.']} largura=${440}>
    <form onSubmit=${salvar}>
      <label class="campo"><span class="so-leitor">Nome</span><input ref=${campo} type="text" value=${nome} maxlength="80" autocomplete="off" /></label>
      <div class="folha-pe">
        <button type="button" class="vidro" onClick=${aoFechar}>Cancelar</button>
        <button type="submit" class="vidro vidro--tinta">Salvar</button>
      </div>
    </form>
  <//>`
}

/** Uma aba do painel: a tela carregada sob demanda, que fica montada depois da primeira visita. */
function Aba({ nome, ativa, loja, Tela, falhou, aoTentar }) {
  return html`<section class="painel-aba" hidden=${!ativa} data-tela=${nome} aria-label=${ABAS.find((a) => a.id === nome)?.rotulo}>
    ${Tela
      ? html`<${Tela} loja=${loja} ativa=${ativa} />`
      : falhou
        ? html`<div class="tela"><${Vazio} icone="aviso" titulo=${['Não deu', 'para abrir.']}><button type="button" class="vidro" onClick=${aoTentar}>Tentar de novo</button><//></div>`
        : null}
  </section>`
}

export function Casca({ loja, tema, lerConta }) {
  const { trabalho, situacao, ligado } = usarLoja(loja, (l) => ({ trabalho: l.trabalho(), situacao: l.situacao(), ligado: l.ligado() }))
  const [aba, ir] = usarRota()
  const [telas, definirTelas] = useState({})
  const [falhas, definirFalhas] = useState({})
  const [conta, definirConta] = useState(null)
  const [escuro, definirEscuro] = useState(tema.atual() === 'escuro')
  const [folha, definirFolha] = useState(null) // 'atalhos' | 'trabalhos' | 'renomear'
  const [soltando, definirSoltando] = useState(false)
  const arquivo = useRef(null)
  const dock = useRef(null)
  const aberto = !!trabalho && situacao !== 'abrindo'

  useEffect(() => {
    lerConta().then((c) => {
      definirConta(c)
      // a sessão acabou ou o acesso saiu: recarrega, e o servidor entrega a página neutra. Sem rede, fica como está
      // (e sem login configurado, que só acontece no modo local, também: recarregar não mudaria nada).
      if (!c.semRede && c.configurado !== false && !(c.ok && c.acesso)) location.reload()
    })
    void loja.iniciar()
  }, [])

  useEffect(() => {
    document.title = trabalho?.nome ? `${trabalho.nome} · ${NOME}` : NOME
  }, [trabalho?.nome])

  // a tela da aba entra na primeira visita
  const carregar = async (nome) => {
    if (telas[nome]) return telas[nome]
    try {
      const modulo = await CARREGAR[nome]()
      const Tela = modulo.default
      Tela.palco = !!modulo.palco
      definirTelas((t) => ({ ...t, [nome]: Tela }))
      definirFalhas((f) => ({ ...f, [nome]: false }))
      return Tela
    } catch {
      definirFalhas((f) => ({ ...f, [nome]: true }))
      return null
    }
  }
  useEffect(() => {
    if (aberto) void carregar(aba)
  }, [aberto, aba])

  usarMarca(dock, '[aria-current="page"]', [aba, aberto])

  const trocar = async (nome) => {
    if (nome === aba) return
    await carregar(nome)
    const de = ABAS.findIndex((a) => a.id === aba)
    const para = ABAS.findIndex((a) => a.id === nome)
    await comTransicao(() => ir(nome), { sentido: para > de ? 'frente' : 'volta' })
  }

  usarAtalhos(true, (e) => {
    if (e.key === '?') {
      e.preventDefault()
      return definirFolha('atalhos')
    }
    if (!aberto) return
    if ((e.ctrlKey || e.metaKey) && e.altKey) {
      const n = /^Digit([1-4])$/.exec(e.code)?.[1]
      if (n) {
        e.preventDefault()
        void trocar(ABAS[Number(n) - 1].id)
      }
      return
    }
    if (e.ctrlKey || e.metaKey || e.altKey) return
    const letra = e.key.toLowerCase()
    if (letra === 'g' && aba !== 'decupar') void trocar('decupar')
    else if (letra === 'd' && aba !== 'revelar') void trocar('revelar')
  })

  // soltar pasta ou arquivos em qualquer lugar da janela
  useEffect(() => {
    let dentro = 0
    const temArquivo = (e) => [...(e.dataTransfer?.types || [])].includes('Files')
    const entrou = (e) => {
      if (!temArquivo(e)) return
      dentro++
      definirSoltando(true)
    }
    const sobre = (e) => {
      if (!temArquivo(e)) return
      e.preventDefault()
      e.dataTransfer.dropEffect = 'copy'
    }
    const saiu = (e) => {
      if (!temArquivo(e)) return
      dentro = Math.max(0, dentro - 1)
      if (!dentro) definirSoltando(false)
    }
    const soltou = (e) => {
      if (!temArquivo(e)) return
      e.preventDefault()
      dentro = 0
      definirSoltando(false)
      loja.soltar(e.dataTransfer).catch(() => avisar('Não deu para ler o que foi solto.'))
    }
    addEventListener('dragenter', entrou)
    addEventListener('dragover', sobre)
    addEventListener('dragleave', saiu)
    addEventListener('drop', soltou)
    return () => {
      removeEventListener('dragenter', entrou)
      removeEventListener('dragover', sobre)
      removeEventListener('dragleave', saiu)
      removeEventListener('drop', soltou)
    }
  }, [])

  const escolher = () => arquivo.current?.click()
  const escolheu = (e) => {
    const lista = [...e.currentTarget.files]
    e.currentTarget.value = ''
    if (lista.length) loja.escolherFotos(lista).catch(() => avisar('Não deu para abrir essas fotos.'))
  }
  const alternarTema = () => definirEscuro(tema.alternar() === 'escuro')
  // a tela da frente é um palco de ponta a ponta: o topo e o dock escurecem com ela
  const noPalco = aberto && !!telas[aba]?.palco

  return html`<header class=${cx('topo', noPalco && 'sobre-palco')} data-com-dock=${aberto ? '' : undefined}>
      <div class="topo-esq">
        <button type="button" class="liso assinatura" aria-label=${aberto ? 'Seus trabalhos' : NOME} data-dica=${aberto ? 'Trabalhos' : undefined} data-dica-lado="direita" onClick=${() => aberto && definirFolha('trabalhos')}>
          <${Simbolo} />
        </button>
        ${aberto
          ? html`<${Menu}
                classe="trabalho"
                rotulo=${`Trabalho: ${trabalho.nome}`}
                gatilho=${html`<span class="trabalho-nome">${trabalho.nome}</span><${Icone} nome="baixo" />`}
                itens=${[
                  { rotulo: 'Adicionar fotos', icone: 'mais', aoEscolher: escolher },
                  !ligado && trabalho.origem === 'pasta' ? { rotulo: 'Ligar a pasta de novo', icone: 'ligar', aoEscolher: () => loja.religar() } : null,
                  { rotulo: 'Mudar o nome', icone: 'lapis', aoEscolher: () => definirFolha('renomear') },
                  { divisa: true },
                  { rotulo: 'Seus trabalhos', icone: 'pasta', aoEscolher: () => definirFolha('trabalhos') },
                  { rotulo: 'Fechar', icone: 'x', aoEscolher: () => loja.fecharTrabalho() },
                ]}
              />
              <${Andamento} loja=${loja} />`
          : null}
      </div>
      <div class="topo-dir">
        <${EntradaDoSet} conta=${conta} />
        <${AnelDaZ} conta=${conta} />
        <button type="button" class="liso" data-tema-botao aria-label=${escuro ? 'Usar o tema claro' : 'Usar o tema escuro'} aria-pressed=${escuro ? 'true' : 'false'} data-dica=${escuro ? 'Tema claro' : 'Tema escuro'} data-dica-lado="esquerda" onClick=${alternarTema}>
          <${Icone} nome=${escuro ? 'sol' : 'lua'} />
        </button>
        <${Conta} conta=${conta} aoAtalhos=${() => definirFolha('atalhos')} />
      </div>
    </header>
    ${aberto
        ? html`<nav class=${cx('dock', noPalco && 'sobre-palco')} aria-label="Etapas" ref=${dock}>
            <span class="dock-marca" data-marca-desliza aria-hidden="true"></span>
            ${ABAS.map(
              (a) =>
                html`<a
                  class="dock-aba"
                  href=${enderecoDaAba(a.id)}
                  aria-current=${a.id === aba ? 'page' : undefined}
                  data-aba=${a.id}
                  onClick=${(e) => {
                    if (e.metaKey || e.ctrlKey || e.shiftKey || e.button) return
                    e.preventDefault()
                    void trocar(a.id)
                  }}
                >
                  <${Icone} nome=${a.icone} /><span>${a.rotulo}</span>
                </a>`,
            )}
          </nav>`
        : null}
    <main class="painel" id="painel">
      ${situacao === 'retomando'
        ? null
        : aberto
          ? ABAS.filter((a) => a.id === aba || telas[a.id]).map((a) => html`<${Aba} key=${a.id} nome=${a.id} ativa=${a.id === aba} loja=${loja} Tela=${telas[a.id]} falhou=${falhas[a.id]} aoTentar=${() => carregar(a.id)} />`)
          : html`<${Inicio} loja=${loja} aoEscolher=${escolher} />`}
    </main>
    <input ref=${arquivo} class="so-leitor" type="file" multiple accept=${ACEITA} tabindex="-1" aria-hidden="true" data-escolher onChange=${escolheu} />
    <${Avisos} />
    <${FolhaAtalhos} aberta=${folha === 'atalhos'} aoFechar=${() => definirFolha(null)} extras=${ATALHOS_DA_CASCA} />
    <${Trabalhos} loja=${loja} aberta=${folha === 'trabalhos'} aoFechar=${() => definirFolha(null)} aoEscolher=${escolher} />
    <${Renomear} loja=${loja} aberta=${folha === 'renomear'} aoFechar=${() => definirFolha(null)} />
    ${soltando
      ? html`<div class="soltar" aria-hidden="true">
          <div class="soltar-alvo"><${Icone} nome="soltar" /><h2><span class="fino">Solte </span><span class="pesado">para abrir.</span></h2></div>
        </div>`
      : null}`
}

// Decupar: a análise começa sozinha quando o trabalho abre, as fotos caem em três baldes (Fica · Talvez · Fora) com o
// motivo, e a pessoa decide rápido, foto a foto (a grade e a lupa, com as teclas do Lightroom) ou cena a cena (→ aceita
// a melhor de cada momento). Cada foto explica a nota (painel I, sobreposição O). Fechar: tratar as escolhidas, mandar
// para o cliente escolher ou gravar as estrelas ao lado dos RAW. Nenhuma foto é movida, renomeada ou apagada.
//
// Contrato de tela: export default um componente Preact que recebe { loja, ativa }.
//
// Teclas da Decupar, além das da grade e da lupa (src/biblioteca/catalogo.js, padrão Lightroom):
//   C           modo Cenas (G volta)            S   a foto em foco passa a ser a escolhida do momento (e os pesos aprendem)
//   O           sobreposição na lupa            I   o painel "por que esta nota"
//   Espaço      zoom no rosto principal (sem rosto: 100% no centro)        Alt + ← →  rosto anterior, próximo

import { html, useEffect, useLayoutEffect, useRef, useState } from '../../preact.js'
import { Icone } from '../../icones.js'
import { Vazio } from '../../componentes/base.js'
import { avisar } from '../../componentes/aviso.js'
import { teclaDeOutro, usarAtalhos } from '../../casca/atalhos.js'
import { enderecoDaAba } from '../../casca/rota.js'
import { comTransicao, nomearFoto } from '../../casca/transicao.js'
import { usarCatalogo, usarFoto, usarLoja } from '../../estado.js'
import { BarraDaGrade, BarraDeSelecao } from '../../grade/barra.js'
import { marcar } from '../../grade/acoes.js'
import { Grade, TAMANHO_MAXIMO, TAMANHO_MINIMO, TAMANHO_PADRAO } from '../../grade/grade.js'
import { Lupa } from '../../lupa/lupa.js'
import { sobreposicao } from '../../decupagem/sobreposicao.js'
import { lerTecla } from '../../../src/biblioteca/catalogo.js'
import { APRENDIZADO } from '../../../src/decupagem/textos.js'
import { BarraDaDecupagem, PilulasDaDecupagem } from './barra.js'
import { Cenas } from './cenas.js'
import { esteiraDa, lembrar } from './esteira.js'
import { Explicacao, Sobreposicao } from './explica.js'
import { FolhaDeAceitar, FolhaDeAjustes, FolhaDeGravar } from './folhas.js'
import { Icone2 } from './icones.js'
import { fotografar, voar } from './voar.js'

/** A tela inteira é palco: a casca escurece o topo e o dock junto. */
export const palco = true

/** As teclas desta tela para a folha "?" (além das da grade e da lupa, que a casca mostra). */
export const atalhos = [
  { tecla: 'C', oque: 'Modo Cenas' },
  { tecla: 'S', oque: 'Esta passa a ser a escolhida do momento' },
  { tecla: '→', oque: 'Nas cenas: aceitar e passar' },
  { tecla: ['↑', '↓'], oque: 'Nas cenas: andar no momento' },
  { tecla: 'O', oque: 'O que a análise viu' },
  { tecla: 'I', oque: 'Por que esta nota' },
  { tecla: 'Espaço', oque: 'Zoom no rosto' },
  { tecla: ['Alt', '←', '→'], oque: 'Rosto anterior, próximo' },
]

// o estilo da Decupar entra junto com a tela (a casca só carrega a tela na primeira visita)
await new Promise((ok) => {
  if (document.querySelector('link[data-decupar]')) return ok()
  const l = document.createElement('link')
  l.rel = 'stylesheet'
  l.href = new URL('./decupar.css', import.meta.url).href
  l.dataset.decupar = ''
  l.onload = l.onerror = () => ok()
  document.head.append(l)
})

const CHAVE_DO_TAMANHO = 'foto_miniatura'
const CHAVE_DO_PAINEL = 'foto_decupar_painel'
const ALTURA_DA_BARRA = 56
const celular = () => matchMedia('(max-width: 719px)').matches

function tamanhoGuardado() {
  const v = Number(lembrar.ler(CHAVE_DO_TAMANHO))
  if (v >= TAMANHO_MINIMO && v <= TAMANHO_MAXIMO) return v
  return celular() ? 112 : TAMANHO_PADRAO
}

/** O estado da esteira, redesenhando quando muda. */
function usarEsteira(loja) {
  const e = esteiraDa(loja)
  const [est, definir] = useState(e.estado())
  useEffect(() => e.assinar(definir), [e])
  return [est, e]
}

/** O painel da foto em foco (acorda só quando ela muda). */
function PainelDaFoto({ loja, sobre, aoSobre, aoFechar }) {
  const foco = usarCatalogo(loja, (c) => c.foco(), ['selecao', 'fotos', 'filtro', 'ordem', 'pilhas'])
  const { foto } = usarFoto(loja, foco ?? '')
  return html`<${Explicacao} foto=${foto} sobre=${sobre} aoSobre=${aoSobre} aoFechar=${aoFechar} />`
}

function CamadaDaFoto({ loja, id, ativo }) {
  const { foto } = usarFoto(loja, id)
  return html`<${Sobreposicao} foto=${foto} ativo=${ativo} />`
}

/** Os rostos da foto da esquerda para a direita, com o principal marcado (para Espaço e Alt + setas). */
function rostosDe(foto) {
  const s = sobreposicao(foto)
  return s ? s.rostos.map((r, i) => ({ ...r, i })).sort((a, b) => a.x - b.x) : []
}

export default function Decupar({ loja, ativa }) {
  const c = loja.catalogo
  const guardado = loja.aba('decupar')
  const [est, esteira] = usarEsteira(loja)
  const [tamanho, definirTamanho] = useState(tamanhoGuardado)
  const [lupa, definirLupa] = useState(!!guardado.lupa)
  const [modo, definirModo] = useState(guardado.modo === 'cenas' ? 'cenas' : 'grade')
  const [painel, definirPainel] = useState(() => lembrar.ler(CHAVE_DO_PAINEL, celular() ? '0' : '1') === '1')
  const [sobre, definirSobre] = useState(false)
  const [rosto, definirRosto] = useState(-1)
  const [folha, definirFolha] = useState(null) // 'ajustes' | 'aceitar' | 'gravar'
  const controle = useRef({}).current
  const escolhidas = usarCatalogo(loja, (x) => x.contagens().marca.escolhida, ['fotos', 'dados', 'historico'])
  const temNota = usarCatalogo(loja, (x) => x.contagens().balde.sem < x.tamanho, ['fotos', 'dados'])
  const foco = usarCatalogo(loja, (x) => x.foco(), ['selecao', 'fotos', 'filtro', 'ordem', 'pilhas'])
  const trabalho = usarLoja(loja, (l) => l.trabalho()?.id)
  const vivo = useRef({})
  vivo.current = { lupa, modo, ativa, rosto }

  useEffect(() => {
    guardado.lupa = lupa
    guardado.modo = modo
  }, [lupa, modo])
  useEffect(() => definirRosto(-1), [foco])
  // outro trabalho começa na grade
  const trabalhoVisto = useRef(trabalho)
  useEffect(() => {
    if (trabalhoVisto.current === trabalho) return
    trabalhoVisto.current = trabalho
    definirModo('grade')
    definirLupa(false)
  }, [trabalho])

  const mudarTamanho = (v) => {
    definirTamanho(v)
    lembrar.gravar(CHAVE_DO_TAMANHO, String(v))
  }
  const miniaturaDe = (id) => document.querySelector(`.decupar .foto[data-id="${id}"] .foto-moldura`)

  // a miniatura cresce até o palco (e volta para o lugar dela)
  const abrir = (id) => {
    if (lupa) return
    const tirar = nomearFoto(miniaturaDe(id))
    void comTransicao(
      () => {
        tirar()
        definirLupa(true)
      },
      { sentido: 'fica' },
    )
  }
  const fechar = () => {
    if (!lupa) return
    const id = c.foco()
    let tirar = () => {}
    void comTransicao(
      () => {
        definirLupa(false)
        tirar = nomearFoto(id ? miniaturaDe(id) : null)
      },
      { sentido: 'fica' },
    ).then(() => tirar())
  }
  const mudarModo = (m) => {
    if (m === modo) return
    void comTransicao(
      () => {
        definirModo(m)
        if (m === 'cenas') definirLupa(false)
      },
      { sentido: 'fica' },
    )
  }

  // ───────── decidir ─────────

  /** S: esta foto passa a ser a escolhida do momento; a que era volta a não ter marca. Os pesos aprendem com a troca. */
  const trocarEscolhida = (id) => {
    const f = id && c.foto(id)
    if (!f) return
    const membros = f.grupo ? c.fotos().filter((x) => x.grupo === f.grupo) : []
    if (membros.length < 2) return avisar('Esta foto é a única do momento.', { duracao: 2200 })
    const antes = membros.find((x) => x.marca === 'escolhida' && x.id !== id) ?? membros.find((x) => x.escolha?.escolhida)
    if (antes?.id === id && f.marca === 'escolhida') return
    c.definir(
      membros.map((x) => x.id),
      (x) => (x.id === id ? { marca: 'escolhida' } : x.marca === 'escolhida' ? { marca: null } : null),
      { rotulo: 'Escolhida trocada' },
    )
    aprender(f, antes && antes.id !== id ? antes : null, { desfazer: true })
  }
  /** Uma troca ensina os pesos; a mudança aparece em palavras, com Zerar. */
  const aprender = (preferida, preterida, { desfazer = false } = {}) => {
    const frases = preterida ? esteira.aprender(preferida, preterida) : null
    const frase = frases?.find((x) => x !== APRENDIZADO.semMudanca())
    if (frase) avisar(frase, { desfazer: () => esteira.zerarAprendizado(), rotulo: 'Zerar', duracao: 6000 })
    else if (desfazer) avisar('Escolhida trocada', { desfazer: () => c.desfazer() })
  }

  // ───────── a lupa ─────────

  const alternarPainel = () =>
    definirPainel((v) => {
      lembrar.gravar(CHAVE_DO_PAINEL, v ? '0' : '1')
      return !v
    })
  const alternarSobre = () => definirSobre((v) => !v)
  /** Espaço: zoom no rosto principal. Sem rosto (ou com o zoom ligado), fica com a lupa (100% no centro, ou desliga). */
  const zoomNoRosto = () => {
    if (controle.zoomLigado?.()) return false
    const rostos = rostosDe(c.foto(c.foco()))
    const alvo = rostos.find((r) => r.principal) ?? rostos[0]
    if (!alvo) return false
    controle.zoomEm(alvo.x + alvo.largura / 2 - 0.5, alvo.y + alvo.altura / 2 - 0.5)
    definirRosto(alvo.i)
    return true
  }
  const andarNosRostos = (passo) => {
    const rostos = rostosDe(c.foto(c.foco()))
    if (!rostos.length) return
    const k = rostos.findIndex((r) => r.i === vivo.current.rosto)
    const alvo = rostos[(k < 0 ? (passo > 0 ? 0 : rostos.length - 1) : k + passo + rostos.length) % rostos.length]
    controle.zoomEm(alvo.x + alvo.largura / 2 - 0.5, alvo.y + alvo.altura / 2 - 0.5)
    definirRosto(alvo.i)
  }
  /** As teclas que valem em toda lupa da Decupar (a da grade e a das cenas). */
  const teclaDaLupa = (e) => {
    if (e.altKey && (e.key === 'ArrowLeft' || e.key === 'ArrowRight')) {
      andarNosRostos(e.key === 'ArrowRight' ? 1 : -1)
      return true
    }
    if (e.ctrlKey || e.metaKey || e.altKey) return false
    const k = e.key.toLowerCase()
    if (k === 'o') return (alternarSobre(), true)
    if (k === 'i') return (alternarPainel(), true)
    if (e.key === ' ') return zoomNoRosto()
    return false
  }
  const extras = html`<span class="separador dec-so-largo" aria-hidden="true"></span>
    <button
      type="button"
      class="liso dec-so-largo"
      aria-label="O que a análise viu"
      aria-pressed=${sobre ? 'true' : 'false'}
      data-dica="O que a análise viu"
      data-tecla="O"
      data-dica-lado="cima"
      onClick=${alternarSobre}
    >
      <${Icone2} nome="camadas" />
    </button>
    <button
      type="button"
      class="liso"
      aria-label="Por que esta nota"
      aria-pressed=${painel ? 'true' : 'false'}
      data-dica="Por que esta nota"
      data-tecla="I"
      data-dica-lado="cima"
      onClick=${alternarPainel}
    >
      <${Icone} nome="info" />
    </button>`
  const pecasDaLupa = {
    aoTecla: teclaDaLupa,
    camada: (id) => (sobre ? html`<${CamadaDaFoto} loja=${loja} id=${id} ativo=${id === c.foco() ? rosto : -1} />` : null),
    painel: html`<${PainelDaFoto} loja=${loja} sobre=${sobre} aoSobre=${alternarSobre} aoFechar=${alternarPainel} />`,
    painelAberto: painel,
    extras,
    controle,
    // no toque: para cima escolhe, para baixo rejeita (e a cena segue para a próxima foto)
    aoDeslizarNaCena: (lado) => marcar(loja, [c.foco()], lado === 'cima' ? 'escolhida' : 'rejeitada'),
  }

  // ───────── fechar ─────────

  /** Leva as escolhidas, já selecionadas, para outra etapa. */
  const levar = (aba) => {
    c.empilhar(false)
    c.filtrar({ marca: 'escolhida', estrelas: 0, cor: null, balde: null, motivo: null, cena: null, tipo: null, cliente: null, texto: null })
    c.selecionarTudo()
    loja.aba(aba).daDecupagem = { ids: c.selecionadas(), em: Date.now() }
    definirModo('grade')
    definirLupa(false)
    void comTransicao(
      () => {
        location.hash = enderecoDaAba(aba)
      },
      { sentido: 'frente' },
    )
  }
  const n = escolhidas
  const principal = n
    ? {
        acao: 'tratar',
        icone: 'tratar',
        rotulo: `Tratar ${n === 1 ? 'a escolhida' : `as ${n.toLocaleString('pt-BR')} escolhidas`}`,
        curto: `Tratar ${n.toLocaleString('pt-BR')}`,
        aoTocar: () => levar('estilos'),
      }
    : {
        acao: 'aceitar',
        icone: 'aceitar',
        rotulo: 'Aceitar sugestões',
        curto: 'Aceitar',
        desligado: !temNota,
        dica: temNota ? 'Fica vira escolhida, Fora vira rejeitada' : 'Espere a análise',
        aoTocar: () => definirFolha('aceitar'),
      }
  const mais = [
    { rotulo: 'Enviar para o cliente escolher', icone: 'entregar', aoEscolher: () => (n ? levar('entregar') : avisar('Escolha as fotos antes.')) },
    { rotulo: 'Gravar estrelas no Lightroom', icone: 'estrela', aoEscolher: () => definirFolha('gravar') },
    n && temNota ? { rotulo: 'Aceitar sugestões', icone: 'ok', aoEscolher: () => definirFolha('aceitar') } : null,
    { divisa: true },
    // no celular o modo sai da barra e mora aqui
    celular()
      ? {
          rotulo: modo === 'cenas' ? 'Ver a grade' : 'Ver por cenas',
          icone: modo === 'cenas' ? 'grade' : 'pilha',
          aoEscolher: () => mudarModo(modo === 'cenas' ? 'grade' : 'cenas'),
        }
      : null,
    { rotulo: 'Como decupar', icone: 'filtro', aoEscolher: () => definirFolha('ajustes') },
  ]

  // ───────── teclas da grade e o voo até o balde ─────────

  usarAtalhos(ativa && !lupa && modo === 'grade', (e) => {
    if (e.ctrlKey || e.metaKey || e.altKey) return
    const k = e.key.toLowerCase()
    if (k === 'c') {
      e.preventDefault()
      mudarModo('cenas')
    } else if (k === 's' && c.foco()) {
      e.preventDefault()
      trocarEscolhida(c.foco())
    }
  })

  // P e X na grade: a miniatura voa até a pílula da marca (a contagem sobe junto)
  useEffect(() => {
    const pilula = (marca) => document.querySelector(`.decupar .grade-barra .pilula[data-valor="${marca}"]`)
    const levarVoo = (ids, marca) => {
      const fotos = ids.slice(0, 4).map((id) => [id, fotografar(miniaturaDe(id))])
      setTimeout(() => {
        for (const [id, origem] of fotos) if (c.foto(id)?.marca === marca) void voar(origem, pilula(marca))
      }, 0)
    }
    const tecla = (e) => {
      const v = vivo.current
      if (!v.ativa || v.lupa || v.modo !== 'grade' || teclaDeOutro(e)) return
      const cmd = lerTecla(e)
      if (cmd?.acao === 'marca' && cmd.valor) levarVoo(c.alvo(), cmd.valor)
    }
    const clique = (e) => {
      const b = e.target instanceof Element && e.target.closest('.decupar .selecao [data-marcar]')
      if (!b || vivo.current.lupa) return
      const marca = b.dataset.marcar
      if (b.getAttribute('aria-pressed') !== 'true') levarVoo(c.alvo(), marca)
    }
    addEventListener('keydown', tecla, true)
    addEventListener('click', clique, true)
    return () => {
      removeEventListener('keydown', tecla, true)
      removeEventListener('click', clique, true)
    }
  }, [])

  // a casca mede o topo; a barra da decupagem e a dos filtros ficam por cima da grade
  const raiz = useRef(null)
  useLayoutEffect(() => raiz.current?.style.setProperty('--dec-a', `${ALTURA_DA_BARRA}px`), [])

  const fecharFolha = () => definirFolha(null)
  const fechamento = { rotulo: principal.rotulo, desligado: principal.desligado, aoTocar: principal.aoTocar }
  return html`<div class="decupar palco" ref=${raiz} data-modo=${modo}>
    <${Grade}
      loja=${loja}
      tamanho=${tamanho}
      aoAbrir=${abrir}
      teclado=${ativa && !lupa && modo === 'grade'}
      topo=${52 + ALTURA_DA_BARRA}
      base=${76}
      aoVazio=${() =>
        html`<${Vazio} icone="filtro" titulo=${['Nada', 'com esse filtro.']}
          ><button type="button" class="vidro" onClick=${() => c.limparFiltro()}>Limpar o filtro</button><//
        >`}
    />
    <${BarraDaDecupagem} loja=${loja} est=${est} esteira=${esteira} modo=${modo} aoModo=${mudarModo} principal=${principal} mais=${mais} />
    <${BarraDaGrade} loja=${loja} tamanho=${tamanho} aoTamanho=${mudarTamanho} extra=${html`<${PilulasDaDecupagem} loja=${loja} />`} />
    ${lupa || modo === 'cenas' ? null : html`<${BarraDeSelecao} loja=${loja} aoAbrir=${abrir} />`}
    ${
      lupa && ativa && modo === 'grade'
        ? html`<${Lupa}
            loja=${loja}
            aoFechar=${fechar}
            aoTecla=${(e) => {
              if (teclaDaLupa(e)) return true
              if (!e.ctrlKey && !e.metaKey && !e.altKey && e.key.toLowerCase() === 's') return (trocarEscolhida(c.foco()), true)
              return false
            }}
            aoDeslizar=${(lado) => {
              const id = c.foco()
              marcar(loja, [id], lado === 'cima' ? 'escolhida' : 'rejeitada')
              if (c.foco() === id) c.mover(1)
            }}
            camada=${pecasDaLupa.camada}
            painel=${pecasDaLupa.painel}
            painelAberto=${painel}
            extras=${extras}
            controle=${controle}
          />`
        : null
    }
    ${
      modo === 'cenas' && ativa
        ? html`<${Cenas}
            loja=${loja}
            lupa=${pecasDaLupa}
            aoSair=${() => mudarModo('grade')}
            aoTrocar=${trocarEscolhida}
            aoAprender=${(a, b) => aprender(a, b)}
            fechar=${fechamento}
          />`
        : null
    }
    <${FolhaDeAjustes} aberta=${folha === 'ajustes'} aoFechar=${fecharFolha} est=${est} esteira=${esteira} />
    <${FolhaDeAceitar}
      aberta=${folha === 'aceitar'}
      aoFechar=${fecharFolha}
      esteira=${esteira}
      aoAceitou=${(ids) => ids.length && avisar(`${ids.length.toLocaleString('pt-BR')} fotos decididas`, { desfazer: () => c.desfazer() })}
    />
    <${FolhaDeGravar} aberta=${folha === 'gravar'} aoFechar=${fecharFolha} loja=${loja} />
  </div>`
}

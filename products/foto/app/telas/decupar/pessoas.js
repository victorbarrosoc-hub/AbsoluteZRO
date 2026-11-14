// Agrupar por pessoa, na tela: a folha do aviso e do consentimento (regra 5 de docs/ARQUITETURA.md), a lista de
// pessoas com a cobertura de cada uma, "Esquecer rostos", e as pílulas por pessoa na linha de filtros. O ícone de cada
// pessoa é o próprio rosto recortado da miniatura da foto (CSS, sem guardar imagem nenhuma).

import { cx, html, useEffect, useState } from '../../preact.js'
import { Icone } from '../../icones.js'
import { Numero } from '../../componentes/base.js'
import { Folha } from '../../componentes/folha.js'
import { avisar } from '../../componentes/aviso.js'
import { usarCatalogo, usarMiniatura } from '../../estado.js'
import { coberturaDe } from '../../../src/decupagem/pessoas.js'
import { PESSOAS } from '../../../src/decupagem/textos.js'

const milhar = (n) => Number(n || 0).toLocaleString('pt-BR')
export const nomeDa = (p) => p.nome || PESSOAS.nome(Number(String(p.id).replace(/\D/g, '')) || 1)
const chaveDoFiltro = (p) => `pessoa:${p.id}`

/**
 * O estilo que mostra só o quadrado em volta de `caixa` (px de um quadro de `quadro.largura` × `quadro.altura`) de uma
 * imagem `url` posta como fundo: `folga` vezes o lado da caixa. Sem nada a mostrar, ''.
 */
export function recorteEmCss(url, caixa, quadro, folga = 1.25) {
  if (!url || !caixa || !quadro?.largura || !quadro?.altura) return ''
  const lado = Math.max(caixa.largura, caixa.altura) * folga
  const sw = Math.min(1, lado / quadro.largura)
  const sh = Math.min(1, lado / quadro.altura)
  const x0 = Math.max(0, Math.min(1 - sw, (caixa.x + caixa.largura / 2 - lado / 2) / quadro.largura))
  const y0 = Math.max(0, Math.min(1 - sh, (caixa.y + caixa.altura / 2 - lado / 2) / quadro.altura))
  const px = sw < 1 ? (x0 / (1 - sw)) * 100 : 50
  const py = sh < 1 ? (y0 / (1 - sh)) * 100 : 50
  const tamanho = `${(100 / sw).toFixed(2)}% ${(100 / sh).toFixed(2)}%`
  return `background-image:url("${url}");background-size:${tamanho};background-position:${px.toFixed(2)}% ${py.toFixed(2)}%`
}

/** O rosto da capa, recortado da miniatura por CSS (a caixa vem em px da prévia; `quadro` é o tamanho dela). */
export function RostoDaPessoa({ loja, pessoa, classe }) {
  const url = usarMiniatura(loja, pessoa.capa.foto)
  useEffect(() => {
    if (!url) loja.miniaturas.pedir?.(pessoa.capa.foto, 50)
  }, [pessoa.capa.foto, !!url])
  const { caixa, quadro } = pessoa.capa
  const estilo = recorteEmCss(url, caixa, quadro, 1.25)
  return html`<span class=${cx('rosto-pessoa', classe)} style=${estilo} aria-hidden="true">${url ? null : html`<${Icone} nome="pessoa" />`}</span>`
}

/** As pílulas por pessoa (as que mais aparecem), para a linha de filtros da grade. Só com o agrupamento ligado. */
export function PilulasDePessoas({ loja, est, aoAbrir, maximo = 8 }) {
  usarCatalogo(loja, (c) => c.versao, ['fotos', 'dados', 'filtro'])
  const c = loja.catalogo
  const e = est.pessoas
  if (!e?.ligado) return null
  const f = c.filtro()
  const ativa = f.idsDe?.startsWith('pessoa:') ? f.idsDe : null
  const lista = e.pessoas.slice(0, maximo)
  const rodando = e.situacao === 'rodando' || e.situacao === 'preparando'
  return html`<span class="dec-filtros dec-pessoas" role="group" aria-label="Pessoas">
    <span class="dec-divisa" aria-hidden="true"></span>
    <button type="button" class="pilula" data-valor="pessoas" title=${rodando ? PESSOAS.andamento(e.feitas, e.total) : 'Pessoas'} onClick=${aoAbrir}>
      <${Icone} nome="pessoa" />Pessoas<span class="pilula-n"
        >${rodando ? `${milhar(e.feitas)}/${milhar(e.total)}` : html`<${Numero} valor=${e.pessoas.length} />`}</span
      >
    </button>
    ${lista.map((p) => {
      const cob = coberturaDe(p, (id) => c.foto(id))
      const ligada = ativa === chaveDoFiltro(p)
      const sozinha = cob.fotos === 1 || cob.protegida
      return html`<button
        type="button"
        class="pilula pilula--pessoa"
        data-valor=${chaveDoFiltro(p)}
        data-sozinha=${sozinha ? '' : undefined}
        aria-pressed=${ligada ? 'true' : 'false'}
        aria-label=${`${nomeDa(p)}: ${cob.fotos} ${cob.fotos === 1 ? 'foto' : 'fotos'}`}
        title=${`${nomeDa(p)} · ${PESSOAS.cobertura(cob.fotos, cob.boas, cob.protegida)}`}
        onClick=${() => c.filtrar(ligada ? { ids: null, idsDe: null } : { ids: p.fotos, idsDe: chaveDoFiltro(p) })}
      >
        <${RostoDaPessoa} loja=${loja} pessoa=${p} />${p.nome ? html`<span class="pilula-nome">${p.nome}</span>` : null}<span class="pilula-n"
          ><${Numero} valor=${cob.fotos}
        /></span>
      </button>`
    })}
  </span>`
}

/** Uma linha da lista: rosto, nome (dá para trocar), cobertura e "ver só esta". */
function LinhaDaPessoa({ loja, esteira, pessoa, aoVer }) {
  const c = loja.catalogo
  const cob = coberturaDe(pessoa, (id) => c.foto(id))
  const [nome, definirNome] = useState(pessoa.nome ?? '')
  const sozinha = cob.fotos === 1 || cob.protegida
  return html`<li class="pessoa-linha" data-pessoa=${pessoa.id} data-sozinha=${sozinha ? '' : undefined}>
    <${RostoDaPessoa} loja=${loja} pessoa=${pessoa} classe="rosto-pessoa--grande" />
    <div class="pessoa-texto">
      <input
        type="text"
        class="pessoa-nome"
        value=${nome}
        placeholder=${nomeDa({ id: pessoa.id })}
        aria-label=${`Nome de ${nomeDa(pessoa)}`}
        maxlength="40"
        onInput=${(e) => definirNome(e.currentTarget.value)}
        onBlur=${() => nome !== (pessoa.nome ?? '') && esteira.pessoas.renomear(pessoa.id, nome)}
        onKeyDown=${(e) => e.key === 'Enter' && e.currentTarget.blur()}
      />
      <small>${PESSOAS.cobertura(cob.fotos, cob.boas, cob.protegida)}</small>
    </div>
    <button type="button" class="vidro vidro--pequeno" onClick=${() => aoVer(pessoa)}>Ver</button>
  </li>`
}

/**
 * A folha. Desligado: o aviso, os três pontos, o consentimento e "Agrupar". Ligado: as pessoas, a cobertura de cada
 * uma e "Esquecer rostos".
 */
export function FolhaDePessoas({ aberta, aoFechar, loja, esteira, est }) {
  const [consentiu, definirConsentiu] = useState(false)
  const e = est.pessoas
  const c = loja.catalogo
  // sem a camada de rostos e sem rosto lido antes, não há o que agrupar
  const semRostos = !est.camadas.includes('rostos') && !c.fotos().some((f) => Array.isArray(f.rostos))
  const ver = (p) => {
    c.filtrar({ ids: p.fotos, idsDe: chaveDoFiltro(p) })
    aoFechar()
  }
  const ligar = async () => {
    definirConsentiu(false)
    await esteira.pessoas.ligar()
  }
  const esquecer = async () => {
    const f = c.filtro()
    if (f.idsDe?.startsWith('pessoa:')) c.filtrar({ ids: null, idsDe: null })
    await esteira.pessoas.esquecer()
    aoFechar()
    avisar(PESSOAS.esquecidos)
  }
  if (!e.ligado) {
    return html`<${Folha} aberta=${aberta} aoFechar=${aoFechar} titulo=${PESSOAS.titulo} largura=${500} classe="folha-pessoas">
      <p class="pessoas-aviso">${PESSOAS.aviso}</p>
      <ul class="pessoas-pontos">
        ${PESSOAS.pontos.map((t, k) => html`<li><${Icone} nome=${['cadeado', 'lixo'][k]} />${t}</li>`)}
      </ul>
      ${semRostos ? html`<p class="apoio">${PESSOAS.semRostos}</p>` : null}
      <label class="pessoas-consentimento">
        <input type="checkbox" checked=${consentiu} disabled=${semRostos} onChange=${(x) => definirConsentiu(x.currentTarget.checked)} />
        <span>${PESSOAS.consentimento}</span>
      </label>
      <div class="folha-pe">
        <button type="button" class="vidro" onClick=${aoFechar}>Agora não</button>
        <button type="button" class="vidro vidro--tinta" data-acao="ligar-pessoas" disabled=${!consentiu || semRostos} onClick=${ligar}>
          ${PESSOAS.ligar}
        </button>
      </div>
    <//>`
  }
  const rodando = e.situacao === 'rodando' || e.situacao === 'preparando'
  return html`<${Folha} aberta=${aberta} aoFechar=${aoFechar} titulo=${['Pessoas', 'do ensaio.']} largura=${520} classe="folha-pessoas">
    ${
      e.situacao === 'indisponivel'
        ? html`<p class="apoio" title=${e.motivo ?? ''}>${PESSOAS.indisponivel}</p>`
        : rodando
          ? html`<p class="apoio" role="status">${PESSOAS.andamento(e.feitas, e.total)}</p>`
          : !e.pessoas.length
            ? html`<p class="apoio">${PESSOAS.nenhuma}</p>`
            : null
    }
    ${
      e.pessoas.length
        ? html`<ul class="pessoas-lista">
            ${e.pessoas.map((p) => html`<${LinhaDaPessoa} key=${p.id} loja=${loja} esteira=${esteira} pessoa=${p} aoVer=${ver} />`)}
          </ul>`
        : null
    }
    <div class="folha-pe">
      <button type="button" class="vidro" data-acao="esquecer-rostos" onClick=${esquecer}><${Icone} nome="lixo" />${PESSOAS.esquecer}</button>
      <button type="button" class="vidro vidro--tinta" onClick=${aoFechar}>Pronto</button>
    </div>
  <//>`
}

// As folhas da tela Estilos: importar (com o relatório honesto), extrair de uma foto (antes e depois, aderência medida),
// guardar o ajuste da foto como estilo, renomear ou mover de família, e "o que este estilo mexe". Pouco texto: o
// relatório vira forma (barra, números, fichas) e o detalhe fica recolhido.

import { cx, html, useEffect, useMemo, useRef, useState } from '../../preact.js'
import { Icone } from '../../icones.js'
import { Folha, Numero, Pilulas, Progresso } from '../../componentes/index.js'
import { DA_FOTO, eNeutro, mexidos, neutro, normalizar } from '../../../src/motor/ajustes.js'
import { criarPredefinicao, diferenca, gruposMexidos } from '../../../src/estilo/predefinicao.js'
import { qc } from '../../../src/estilo/qc.js'
import { ACEITA_IMPORTAR, ACEITA_REFERENCIA } from './arquivos.js'
import { usarPrevia } from './cartao.js'

const porcento = (v) => `${Math.round(Math.max(0, Math.min(1, v || 0)) * 100)}%`

/** Área de soltar com o botão de escolher. `aoArquivos(lista)`. */
export function Soltar({ aceita, multiplo = true, aoArquivos, titulo, children, classe }) {
  const entrada = useRef(null)
  const [sobre, definirSobre] = useState(false)
  const tem = (e) => [...(e.dataTransfer?.types || [])].includes('Files')
  return html`<div
    class=${cx('soltar-estilo', sobre && 'soltar-estilo--sobre', classe)}
    onDragEnter=${(e) => tem(e) && (e.preventDefault(), definirSobre(true))}
    onDragOver=${(e) => tem(e) && (e.preventDefault(), e.stopPropagation(), (e.dataTransfer.dropEffect = 'copy'))}
    onDragLeave=${(e) => !e.currentTarget.contains(e.relatedTarget) && definirSobre(false)}
    onDrop=${(e) => {
      if (!tem(e)) return
      e.preventDefault()
      e.stopPropagation()
      definirSobre(false)
      const lista = [...e.dataTransfer.files]
      if (lista.length) aoArquivos(lista)
    }}
  >
    <span class="soltar-estilo-icone" aria-hidden="true"><${Icone} nome="soltar" /></span>
    <h3><span class="fino">Solte </span><span class="pesado">${titulo}</span></h3>
    ${children}
    <button type="button" class="vidro" onClick=${() => entrada.current?.click()}>Escolher</button>
    <input
      ref=${entrada}
      class="so-leitor"
      type="file"
      tabindex="-1"
      aria-hidden="true"
      multiple=${multiplo}
      accept=${aceita}
      data-entrada=${aceita === ACEITA_REFERENCIA ? 'referencia' : 'importar'}
      onChange=${(e) => {
        const lista = [...e.currentTarget.files]
        e.currentTarget.value = ''
        if (lista.length) aoArquivos(lista)
      }}
    />
  </div>`
}

/** O que o qc diz, numa linha com o sinal. */
function Qualidade({ resultado }) {
  if (!resultado) return null
  if (resultado.aprovado) return html`<div class="qualidade qualidade--ok"><${Icone} nome="ok" /><span>Passou no controle de qualidade</span></div>`
  return html`<div class="qualidade">
    <${Icone} nome="aviso" />
    <span>${resultado.problemas.length === 1 ? resultado.problemas[0].texto : `${resultado.problemas.length} pontos de atenção`}</span>
    ${
      resultado.problemas.length > 1
        ? html`<details class="recolhido"><summary>Ver</summary><ul>${resultado.problemas.map((x) => html`<li>${x.texto}</li>`)}</ul></details>`
        : null
    }
  </div>`
}

const CLASSES = [
  ['exato', 'Exatas'],
  ['aproximado', 'Aproximadas'],
  ['ignorado', 'Ignoradas'],
]

/** O relatório da importação do Lightroom em forma: uma barra de três partes e os números; a lista fica recolhida. */
function Relatorio({ relatorio }) {
  const total = CLASSES.reduce((s, [k]) => s + (relatorio.resumo[k] || 0), 0) || 1
  return html`<div class="relatorio">
    <div class="relatorio-barra" role="img" aria-label=${CLASSES.map(([k, r]) => `${relatorio.resumo[k]} ${r.toLowerCase()}`).join(', ')}>
      ${CLASSES.map(([k]) => (relatorio.resumo[k] ? html`<span data-classe=${k} style=${`flex:${relatorio.resumo[k] / total}`}></span>` : null))}
    </div>
    <div class="relatorio-numeros">
      ${CLASSES.map(
        ([k, rotulo]) =>
          html`<div data-classe=${k}><span class="relatorio-n"><${Numero} valor=${relatorio.resumo[k] || 0} /></span><span class="relatorio-r">${rotulo}</span></div>`,
      )}
    </div>
    <details class="recolhido">
      <summary>Ver as ${total} chaves</summary>
      <ul class="relatorio-lista">
        ${relatorio.itens.map(
          (it) =>
            html`<li data-classe=${it.classe}>
              <code>${it.chave}</code><span>${it.razao}</span>
            </li>`,
        )}
      </ul>
    </details>
  </div>`
}

/** Uma linha do resultado da importação: a prévia do estilo na foto da pessoa, o nome e o relatório. */
function Importado({ item, previas, fonte, daFoto }) {
  const p = item.predefinicoes[0]
  const { url } = usarPrevia(previas, p && fonte ? { fonte, p, daFoto, lado: 320 } : null, { prioridade: 60 })
  return html`<article class="importado" data-arquivo=${item.arquivo}>
    <div class="importado-topo">
      <span class="importado-imagem">${url ? html`<img src=${url} alt="" />` : html`<span class="esqueleto"></span>`}</span>
      <div class="importado-nome">
        <h3>${item.predefinicoes.length > 1 ? `${item.predefinicoes.length} estilos` : (p?.nome ?? item.arquivo)}</h3>
        <span class="apoio">${item.arquivo}${item.lut ? ` · LUT ${item.lut.lado}³` : ''}</span>
      </div>
    </div>
    ${item.relatorio ? html`<${Relatorio} relatorio=${item.relatorio} />` : null}
    <${Qualidade} resultado=${item.qc} />
    ${item.avisos.length ? html`<ul class="avisos-estilo">${item.avisos.map((a) => html`<li>${a}</li>`)}</ul>` : null}
    ${item.erros.length ? html`<ul class="avisos-estilo avisos-estilo--erro">${item.erros.map((a) => html`<li>${a}</li>`)}</ul>` : null}
  </article>`
}

export function FolhaImportar({ aberta, aoFechar, resultados, lendo, aoArquivos, previas, fonte, daFoto }) {
  return html`<${Folha} aberta=${aberta} aoFechar=${aoFechar} titulo=${['Importar', 'estilos.']} largura=${640} classe="folha-estilo">
    ${
      resultados?.length
        ? html`<div class="importados">
            ${resultados.map((r) => html`<${Importado} key=${r.arquivo} item=${r} previas=${previas} fonte=${fonte} daFoto=${daFoto} />`)}
          </div>`
        : lendo
          ? html`<${Progresso} rotulo="Lendo" />`
          : html`<${Soltar} aceita=${ACEITA_IMPORTAR} aoArquivos=${aoArquivos} titulo="o preset.">
              <div class="formatos" aria-label="Formatos">
                ${['.xmp', '.lrtemplate', '.cube', '.zropreset', '.zropack', 'JPEG do Lightroom'].map((f) => html`<span class="ficha">${f}</span>`)}
              </div>
            <//>`
    }
    ${
      resultados?.length
        ? html`<div class="folha-pe">
            <${Soltar} aceita=${ACEITA_IMPORTAR} aoArquivos=${aoArquivos} titulo="mais." classe="soltar-estilo--linha" />
            <button type="button" class="vidro vidro--tinta" onClick=${aoFechar}>Pronto</button>
          </div>`
        : null
    }
  <//>`
}

/** Antes e depois com a divisória que a pessoa arrasta (um range de verdade, para o teclado). */
function Comparador({ antes, depois, largura, altura }) {
  const [x, definirX] = useState(50)
  return html`<div class="comparador" style=${`--x:${x}%;aspect-ratio:${largura} / ${altura}`}>
    <img src=${antes} alt="Antes" draggable="false" />
    <img class="comparador-depois" src=${depois} alt="Depois" draggable="false" />
    <span class="comparador-linha" aria-hidden="true"></span>
    <span class="comparador-rotulo comparador-rotulo--antes" aria-hidden="true">Antes</span>
    <span class="comparador-rotulo comparador-rotulo--depois" aria-hidden="true">Depois</span>
    <input type="range" min="0" max="100" value=${x} aria-label="Divisória entre antes e depois" onInput=${(e) => definirX(Number(e.currentTarget.value))} />
  </div>`
}

const NIVEL = { alta: 'alta', media: 'média', baixa: 'baixa' }

/**
 * Extrair de uma foto: 1 a 10 referências (JPEG/PNG), a foto em foco como alvo. `extrair(arquivos)` → resultado do
 * worker. `aoGuardar(predefinicao)`.
 */
export function FolhaExtrair({ aberta, aoFechar, comAlvo, extrair, aoGuardar, iniciais }) {
  const [refs, definirRefs] = useState([])
  const [situacao, definirSituacao] = useState('vazio') // vazio | medindo | pronto | erro
  const [resultado, definirResultado] = useState(null)
  const [erro, definirErro] = useState('')
  const [nome, definirNome] = useState('')
  const urls = useRef([])

  const limpar = () => {
    for (const u of urls.current) URL.revokeObjectURL(u)
    urls.current = []
  }
  useEffect(() => {
    if (!aberta) {
      limpar()
      definirRefs([])
      definirSituacao('vazio')
      definirResultado(null)
      definirErro('')
    }
  }, [aberta])
  useEffect(() => {
    if (aberta && iniciais?.length) void medir(iniciais)
  }, [aberta, iniciais])

  async function medir(lista) {
    const imagens = lista.filter((f) => /^image\/(jpeg|png)$/.test(f.type) || /\.(jpe?g|png)$/i.test(f.name)).slice(0, 10)
    if (!imagens.length) {
      definirErro('Use JPEG ou PNG.')
      definirSituacao('erro')
      return
    }
    limpar()
    const novas = imagens.map((f) => {
      const url = URL.createObjectURL(f)
      urls.current.push(url)
      return { nome: f.name, url }
    })
    definirRefs(novas)
    definirNome(imagens[0].name.replace(/\.[^.]+$/, '').slice(0, 60))
    definirSituacao('medindo')
    definirResultado(null)
    try {
      const r = await extrair(imagens)
      const antes = URL.createObjectURL(r.antes)
      const depois = URL.createObjectURL(r.depois)
      urls.current.push(antes, depois)
      definirResultado({ ...r, antes, depois })
      definirSituacao('pronto')
    } catch (e) {
      definirErro(e?.message || 'Não deu para medir esta foto.')
      definirSituacao('erro')
    }
  }

  const guardar = (e) => {
    e.preventDefault()
    if (!resultado) return
    aoGuardar({ ...resultado.predefinicao, id: undefined, nome: nome.trim() || resultado.predefinicao.nome })
  }

  return html`<${Folha} aberta=${aberta} aoFechar=${aoFechar} titulo=${['Extrair', 'de uma foto.']} largura=${760} classe="folha-estilo folha-extrair">
    ${
      situacao === 'vazio' || situacao === 'erro'
        ? html`<${Soltar} aceita=${ACEITA_REFERENCIA} aoArquivos=${medir} titulo="a referência.">
            <span class="apoio">${comAlvo ? 'Até 10 fotos. Comparo com a sua foto em foco.' : 'Sem uma foto sua aberta, só sai a tonalização.'}</span>
            ${erro ? html`<span class="apoio apoio--erro" role="alert">${erro}</span>` : null}
          <//>`
        : null
    }
    ${
      situacao === 'medindo'
        ? html`<div class="extraindo" role="status">
            <div class="referencias">${refs.map((r) => html`<img src=${r.url} alt=${r.nome} />`)}</div>
            <${Progresso} rotulo="Medindo o estilo" />
            <span class="apoio">Medindo o estilo…</span>
          </div>`
        : null
    }
    ${
      situacao === 'pronto' && resultado
        ? html`<form class="extraido" onSubmit=${guardar}>
            <${Comparador} antes=${resultado.antes} depois=${resultado.depois} largura=${resultado.largura} altura=${resultado.altura} />
            <div class="extraido-medidas">
              <div class="aderencia" title="Quanto da diferença para a referência sumiu">
                <span class="sobretitulo">Aderência</span>
                <span class="aderencia-n" data-aderencia=${resultado.erro.aderencia}><${Numero} valor=${resultado.erro.aderencia} formato=${porcento} /></span>
              </div>
              <div class="extraido-grupos">
                ${resultado.grupos.length ? resultado.grupos.map((g) => html`<span class="ficha">${g}</span>`) : html`<span class="apoio">Nenhum controle mexido.</span>`}
                ${resultado.pareado ? html`<span class="ficha ficha--marca" title="A referência é a mesma cena da sua foto">Mesma cena</span>` : null}
              </div>
              <details class="recolhido">
                <summary>Confiança</summary>
                <ul class="confianca">
                  ${Object.entries(resultado.confianca).map(([k, v]) => html`<li><span>${k === 'vizinhanca' ? 'vizinhança' : k}</span><span data-nivel=${v}>${NIVEL[v] ?? v}</span></li>`)}
                </ul>
              </details>
            </div>
            ${resultado.avisos.length ? html`<ul class="avisos-estilo">${resultado.avisos.map((a) => html`<li>${a}</li>`)}</ul>` : null}
            <div class="folha-pe folha-pe--campo">
              <label class="campo campo--linha"><span class="so-leitor">Nome</span><input type="text" value=${nome} maxlength="80" onInput=${(e) => definirNome(e.currentTarget.value)} /></label>
              <button type="button" class="vidro" onClick=${() => definirSituacao('vazio')}>Outra</button>
              <button type="submit" class="vidro vidro--tinta" disabled=${!resultado.grupos.length}>Guardar como estilo</button>
            </div>
          </form>`
        : null
    }
  <//>`
}

// Os grupos que podem viajar num estilo novo (o que é da foto começa desligado).
const GRUPOS = [
  ['luz', 'Luz'],
  ['cor', 'Cor'],
  ['presenca', 'Presença'],
  ['curva', 'Curva'],
  ['misturador', 'Misturador'],
  ['tonalizacao', 'Tonalização'],
  ['pb', 'Preto e branco'],
  ['detalhe', 'Detalhe'],
  ['efeitos', 'Efeitos'],
  ['calibracao', 'Calibração'],
  ['tela', 'Tela'],
  ['look', 'Look'],
  ['luz.exposicao', 'Exposição'],
  ['branco', 'Branco'],
]

/** Os grupos em que estes ajustes mexem (nomes de GRUPOS). */
export function gruposDe(ajustes) {
  const m = mexidos(ajustes)
  const a = normalizar(ajustes)
  const tem = new Set()
  for (const c of m) {
    if (c === 'luz.exposicao') tem.add('luz.exposicao')
    else if (c.startsWith('branco.')) tem.add('branco')
    else if (c.startsWith('geometria.') || c === 'intensidade') continue
    else tem.add(c.split('.')[0] === 'look' ? 'look' : c.split('.')[0])
  }
  if (a.branco.modo !== 'original') tem.add('branco')
  return GRUPOS.filter(([k]) => tem.has(k))
}

/** Monta os ajustes do estilo novo só com os grupos escolhidos. */
export function soOsGrupos(ajustes, grupos) {
  const a = normalizar(ajustes)
  const n = neutro()
  for (const g of grupos) {
    if (g === 'luz') {
      const exposicao = n.luz.exposicao
      n.luz = { ...a.luz, exposicao }
    } else if (g === 'luz.exposicao') n.luz.exposicao = a.luz.exposicao
    else n[g] = structuredClone(a[g])
  }
  const levar = DA_FOTO.filter((d) => grupos.includes(d))
  return { ajustes: n, levar }
}

/** Guardar o ajuste da foto em foco como estilo. `look`: o look do estilo que a foto usa (quando ela usa um). */
export function FolhaCriar({ aberta, aoFechar, ajustes, look, familias, aoGuardar }) {
  const disponiveis = useMemo(() => (ajustes ? gruposDe(ajustes).filter(([k]) => k !== 'look' || look) : []), [ajustes, look])
  const [grupos, definirGrupos] = useState([])
  const [nome, definirNome] = useState('')
  const [familia, definirFamilia] = useState('Minhas')
  useEffect(() => {
    if (aberta) {
      definirGrupos(disponiveis.map(([k]) => k).filter((k) => !DA_FOTO.includes(k)))
      definirNome('')
      definirFamilia('Minhas')
    }
  }, [aberta])
  const vazio = !ajustes || eNeutro(ajustes) || !disponiveis.length
  const salvar = (e) => {
    e.preventDefault()
    if (!grupos.length || !nome.trim()) return
    const { ajustes: a, levar } = soOsGrupos(ajustes, grupos)
    try {
      const p = criarPredefinicao({ nome: nome.trim(), familia, ajustes: a, levar, look: grupos.includes('look') ? look : null, origem: { tipo: 'manual' } })
      aoGuardar(p)
    } catch {
      // nome vazio: o botão já fica desligado
    }
  }
  return html`<${Folha} aberta=${aberta} aoFechar=${aoFechar} titulo=${['Guardar', 'como estilo.']} largura=${560} classe="folha-estilo">
    ${
      vazio
        ? html`<div class="vazio vazio--folha"><span class="apoio">Esta foto ainda não tem ajustes.</span></div>`
        : html`<form onSubmit=${salvar} class="criar">
            <label class="campo"><span>Nome</span><input type="text" required maxlength="80" value=${nome} onInput=${(e) => definirNome(e.currentTarget.value)} autocomplete="off" /></label>
            <div class="campo"><span>O que viaja</span>
              <${Pilulas}
                rotulo="O que viaja"
                multiplo
                opcoes=${disponiveis.map(([k, r]) => ({ valor: k, rotulo: r }))}
                valor=${grupos}
                aoMudar=${(v) => definirGrupos(v || [])}
              />
            </div>
            <label class="campo"><span>Família</span>
              <select value=${familia} onChange=${(e) => definirFamilia(e.currentTarget.value)}>
                ${familias.map((f) => html`<option value=${f}>${f}</option>`)}
              </select>
            </label>
            <div class="folha-pe">
              <button type="button" class="vidro" onClick=${aoFechar}>Cancelar</button>
              <button type="submit" class="vidro vidro--tinta" disabled=${!grupos.length || !nome.trim()}>Guardar</button>
            </div>
          </form>`
    }
  <//>`
}

/** Renomear ou mover de família. `modo`: 'renomear' | 'mover'. */
export function FolhaEditar({ aberta, aoFechar, modo, p, familias, aoSalvar }) {
  const [valor, definir] = useState('')
  const [nova, definirNova] = useState('')
  const campo = useRef(null)
  useEffect(() => {
    if (!aberta || !p) return
    definir(modo === 'renomear' ? p.nome : p.familia)
    definirNova('')
    requestAnimationFrame(() => campo.current?.select?.())
  }, [aberta, p, modo])
  const salvar = (e) => {
    e.preventDefault()
    const v = modo === 'mover' && valor === '__nova' ? nova.trim() : valor.trim()
    if (v) aoSalvar(v)
  }
  return html`<${Folha}
    aberta=${aberta}
    aoFechar=${aoFechar}
    titulo=${modo === 'renomear' ? ['Novo', 'nome.'] : ['Mover', 'de família.']}
    largura=${440}
    classe="folha-estilo"
  >
    <form onSubmit=${salvar}>
      ${
        modo === 'renomear'
          ? html`<label class="campo"><span class="so-leitor">Nome</span><input ref=${campo} type="text" maxlength="80" value=${valor} onInput=${(e) => definir(e.currentTarget.value)} /></label>`
          : html`<label class="campo"><span class="so-leitor">Família</span>
              <select ref=${campo} value=${valor} onChange=${(e) => definir(e.currentTarget.value)}>
                ${familias.map((f) => html`<option value=${f}>${f}</option>`)}
                <option value="__nova">Nova família…</option>
              </select>
            </label>
            ${
              valor === '__nova'
                ? html`<label class="campo"><span class="so-leitor">Nome da família</span><input type="text" maxlength="40" placeholder="Nome da família" value=${nova} onInput=${(e) => definirNova(e.currentTarget.value)} /></label>`
                : null
            }`
      }
      <div class="folha-pe">
        <button type="button" class="vidro" onClick=${aoFechar}>Cancelar</button>
        <button type="submit" class="vidro vidro--tinta">Salvar</button>
      </div>
    </form>
  <//>`
}

const NOME_DO_GRUPO = {
  luz: 'Luz',
  cor: 'Cor',
  presenca: 'Presença',
  curva: 'Curva',
  misturador: 'Misturador',
  tonalizacao: 'Tonalização',
  pb: 'Preto e branco',
  detalhe: 'Detalhe',
  efeitos: 'Efeitos',
  calibracao: 'Calibração',
  geometria: 'Geometria',
  tela: 'Tela',
  look: 'Look',
  geral: 'Geral',
}

/** "O que este estilo mexe": os controles em palavras, por painel, e o controle de qualidade. */
export function FolhaMexe({ aberta, aoFechar, p }) {
  const linhas = useMemo(() => (p ? diferenca(p) : []), [p])
  const resultado = useMemo(() => (aberta && p ? qc(p) : null), [aberta, p])
  const grupos = new Map()
  for (const l of linhas) {
    const g = NOME_DO_GRUPO[l.grupo] ?? l.grupo
    if (!grupos.has(g)) grupos.set(g, [])
    grupos.get(g).push(l.texto)
  }
  const resumo = p?.origem?.relatorio?.resumo
  return html`<${Folha} aberta=${aberta} aoFechar=${aoFechar} titulo=${['O que', `${p?.nome ?? 'o estilo'} mexe.`]} largura=${520} classe="folha-estilo folha-mexe">
    ${p ? html`<div class="mexe-grupos" aria-label="Grupos">${gruposMexidos(p).map((g) => html`<span class="ficha">${g}</span>`)}</div>` : null}
    <dl class="mexe">
      ${[...grupos].map(([g, lista]) => html`<div><dt>${g}</dt>${lista.map((t) => html`<dd>${t}</dd>`)}</div>`)}
    </dl>
    ${linhas.length ? null : html`<span class="apoio">Não mexe em nada.</span>`}
    ${resumo ? html`<span class="apoio mexe-origem">Do Lightroom: ${resumo.exato} exatas, ${resumo.aproximado} aproximadas, ${resumo.ignorado} ignoradas.</span>` : null}
    <${Qualidade} resultado=${resultado} />
  <//>`
}

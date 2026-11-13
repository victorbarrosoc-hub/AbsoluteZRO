// Exportar em lote: o quê, tratar com o quê, a saída (predefinição ou personalizada) e para onde. Depois, a fila:
// progresso por foto, estimativa honesta (só depois de medir algumas), pausar, retomar, cancelar, repetir as que
// falharam e o que já saiu com esta receita fica de fora. Tudo pesado roda em workers (lote.js).

import { cx, html, useEffect, useMemo, useRef, useState } from '../../preact.js'
import { usarCatalogo, usarLoja } from '../../estado.js'
import { Chave, Controle, Numero, Pilulas, Progresso, ProgressoAnel, Segmentado, avisar } from '../../componentes/index.js'
import { Icone } from '../../icones.js'
import { NOME } from '../../nome.js'
import { ESPACOS_DE_SAIDA, PREDEFINICOES_DE_SAIDA, extensaoDaReceita, normalizarReceita, receitaDaPredefinicao } from '../../../src/exportar/fila.js'
import { FICHAS, preencherModelo, segmentosDaPasta } from '../../../src/exportar/nome.js'
import { aplicarMarcaDagua } from '../../../src/exportar/marca-dagua.js'
import { Miniatura, Simbolo, carregarEstilos, contarCriterios, fotosDe, fotosTexto, numero, tamanhoTexto, tempoTexto } from './comum.js'
import { destinoPasta, destinoZip, escolherPasta, temPasta } from './destino.js'
import { chaveDoItem, criarExportacao, lerFeitas, tratamentoDe } from './lote.js'
import { impressao, mascaraDeImagem, mascaraDeTexto } from './marca.js'

const ESPACOS = { srgb: 'sRGB', p3: 'Display P3', adobe: 'Adobe RGB', rec2020: 'Rec. 2020', prophoto: 'ProPhoto' }
const FORMATOS = { jpeg: 'JPEG', tiff: 'TIFF', png: 'PNG', webp: 'WebP' }
const METADADOS = { 'sem-local': 'Tudo, sem o local', todos: 'Tudo', 'so-direitos': 'Só autoria', nenhum: 'Nenhum' }
const POSICOES = { diagonal: 'Diagonal', 'inferior-direito': 'Canto', centro: 'Centro' }
const ROTULO_FICHA = { nome: 'Nome', seq: 'Número', data: 'Data', trabalho: 'Trabalho', estrelas: 'Estrelas', predefinicao: 'Estilo' }

/** Uma linha que resume a receita: "JPEG · sRGB · 2160 px". */
function resumoDaReceita(r) {
  const tamanho =
    r.tamanho.tipo === 'lado'
      ? `${numero(r.tamanho.px)} px`
      : r.tamanho.tipo === 'megapixels'
        ? `${String(r.tamanho.mp).replace('.', ',')} MP`
        : r.tamanho.tipo === 'caixa'
          ? `${r.tamanho.largura} × ${r.tamanho.altura}`
          : 'Tamanho cheio'
  const fmt = r.formato === 'tiff' || r.formato === 'png' ? `${FORMATOS[r.formato]} ${r.bits} bits` : FORMATOS[r.formato]
  return [fmt, ESPACOS[r.espaco], tamanho, r.marcaDagua ? 'Marca' : null].filter(Boolean).join(' · ')
}

const marcaDaReceita = (m) => ({ posicao: m.posicao, opacidade: m.opacidade, tamanho: m.tamanho })

const celular = () => typeof matchMedia === 'function' && matchMedia('(max-width: 719px)').matches

// ─────────── a saída em cartões ───────────

function CartaoDeSaida({ p, ativo, aoEscolher, i }) {
  const r = p.receita
  const lado = r.tamanho.tipo === 'lado' ? `${numero(r.tamanho.px)} px` : 'Cheio'
  return html`<button type="button" class=${cx('saida', ativo && 'saida--ativa')} aria-pressed=${ativo ? 'true' : 'false'}
    style=${`--i:${i}`} onClick=${aoEscolher}>
    <span class="saida-moldura" data-formato=${r.formato} aria-hidden="true">
      <span class="saida-formato">${FORMATOS[r.formato]}</span>
      <span class="saida-espaco">${r.espaco === 'p3' ? 'P3' : ESPACOS[r.espaco]}</span>
      ${r.marcaDagua ? html`<span class="saida-marca">${r.marcaDagua.texto}</span>` : null}
    </span>
    <strong>${p.nome}</strong>
    <span class="saida-apoio">${r.formato === 'tiff' ? `${r.bits} bits · ${lado}` : lado}</span>
  </button>`
}

// ─────────── personalizar ───────────

function Campo({ rotulo, children, classe }) {
  return html`<label class=${cx('campo', classe)}><span>${rotulo}</span>${children}</label>`
}

function PrevisaoDaMarca({ loja, fotoId, mascara, marca }) {
  const ref = useRef(null)
  useEffect(() => {
    let vivo = true
    const tela = ref.current
    if (!tela || !fotoId) return
    void (async () => {
      const px = await loja.miniaturas.pixels(fotoId, { lado: 420 }).catch(() => null)
      if (!vivo || !px) return
      const n = px.largura * px.altura
      const dados = new Float32Array(n * 3)
      for (let p = 0, i = 0, j = 0; p < n; p++, i += 3, j += 4) {
        dados[i] = px.rgba[j] / 255
        dados[i + 1] = px.rgba[j + 1] / 255
        dados[i + 2] = px.rgba[j + 2] / 255
      }
      let imagem = { largura: px.largura, altura: px.altura, dados }
      if (mascara && marca) imagem = aplicarMarcaDagua(imagem, mascara, marca)
      const saida = new ImageData(px.largura, px.altura)
      for (let p = 0, i = 0, j = 0; p < n; p++, i += 3, j += 4) {
        saida.data[j] = imagem.dados[i] * 255
        saida.data[j + 1] = imagem.dados[i + 1] * 255
        saida.data[j + 2] = imagem.dados[i + 2] * 255
        saida.data[j + 3] = 255
      }
      tela.width = px.largura
      tela.height = px.altura
      tela.getContext('2d').putImageData(saida, 0, 0)
    })()
    return () => {
      vivo = false
    }
  }, [fotoId, mascara, marca && JSON.stringify(marca)])
  return html`<canvas class="marca-previa" ref=${ref} aria-label="Prévia da marca-d’água" role="img"></canvas>`
}

function Personalizar({ receita, mudar, marca, mudarMarca, mascara, loja, primeira, contextoDoNome }) {
  const r = receita
  const comPerda = r.formato === 'jpeg' || r.formato === 'webp'
  const nomeRef = useRef(null)
  const exemplo = primeira ? `${preencherModelo(r.nome, contextoDoNome(primeira, 1))}.${extensaoDaReceita(r)}` : null
  const pasta = segmentosDaPasta(r.pasta).join('/')
  const inserirFicha = (f) => {
    const campo = nomeRef.current
    const ficha = f === 'seq' ? '{seq:3}' : `{${f}}`
    const de = campo?.selectionStart ?? r.nome.length
    const ate = campo?.selectionEnd ?? r.nome.length
    mudar({ nome: r.nome.slice(0, de) + ficha + r.nome.slice(ate) })
    requestAnimationFrame(() => {
      campo?.focus()
      campo?.setSelectionRange(de + ficha.length, de + ficha.length)
    })
  }
  const tamanhoTipo = r.tamanho.tipo === 'lado' ? 'lado' : 'original'
  return html`<div class="personalizar-corpo">
    <div class="grade-campos">
      <div class="campo"><span>Formato</span>
        <${Segmentado}
          rotulo="Formato"
          valor=${r.formato}
          opcoes=${Object.entries(FORMATOS).map(([valor, rotulo]) => ({ valor, rotulo }))}
          aoMudar=${(formato) => mudar({ formato })}
        />
      </div>
      ${
        comPerda
          ? html`<${Controle} rotulo="Qualidade" valor=${r.qualidade} min=${40} max=${100} neutro=${40} formato=${(v) => String(v)}
            aoMudar=${(qualidade) => mudar({ qualidade })} />`
          : html`<div class="campo"><span>Bits</span>
              <${Segmentado} rotulo="Bits" valor=${r.bits} opcoes=${[
                { valor: 8, rotulo: '8 bits' },
                { valor: 16, rotulo: '16 bits' },
              ]} aoMudar=${(bits) => mudar({ bits })} />
            </div>`
      }
      <${Campo} rotulo="Espaço de cor">
        <select value=${r.espaco} disabled=${r.formato === 'webp'} onChange=${(e) => mudar({ espaco: e.currentTarget.value })}>
          ${ESPACOS_DE_SAIDA.map((e) => html`<option value=${e}>${ESPACOS[e]}</option>`)}
        </select>
      <//>
      <div class="campo"><span>Tamanho</span>
        <div class="linha-campo">
          <${Segmentado}
            rotulo="Tamanho"
            valor=${tamanhoTipo}
            opcoes=${[
              { valor: 'original', rotulo: 'Cheio' },
              { valor: 'lado', rotulo: 'Lado maior' },
            ]}
            aoMudar=${(t) => mudar({ tamanho: t === 'lado' ? { tipo: 'lado', px: 2048 } : { tipo: 'original' } })}
          />
          ${
            tamanhoTipo === 'lado'
              ? html`<input
                  class="numero-px"
                  type="number"
                  min="16"
                  max="65535"
                  aria-label="Pixels no lado maior"
                  value=${r.tamanho.px}
                  onChange=${(e) => mudar({ tamanho: { tipo: 'lado', px: Number(e.currentTarget.value) || 2048 } })}
                /><span class="unidade">px</span>`
              : null
          }
        </div>
      </div>
      <${Campo} rotulo="Nitidez de saída">
        <select value=${r.nitidez?.destino ?? ''} onChange=${(e) => mudar({ nitidez: e.currentTarget.value || null })}>
          <option value="">Nenhuma</option>
          <option value="tela">Tela</option>
          <option value="fosco">Papel fosco</option>
          <option value="brilhante">Papel brilhante</option>
        </select>
      <//>
      <${Campo} rotulo="Metadados">
        <select value=${r.metadados} onChange=${(e) => mudar({ metadados: e.currentTarget.value })}>
          ${Object.entries(METADADOS).map(([v, t]) => html`<option value=${v}>${t}</option>`)}
        </select>
      <//>
    </div>

    <div class="bloco-marca">
      <${Chave}
        ligada=${!!r.marcaDagua}
        rotulo="Marca-d’água"
        aoMudar=${(sim) => mudar({ marcaDagua: sim ? { ...marcaDaReceita(marca), texto: marca.texto || 'PROVA' } : null })}
      />
      ${
        r.marcaDagua
          ? html`<div class="marca-config">
              <${PrevisaoDaMarca} loja=${loja} fotoId=${primeira?.id} mascara=${mascara} marca=${r.marcaDagua} />
              <div class="marca-campos">
                <${Segmentado}
                  rotulo="Marca de"
                  valor=${marca.tipo}
                  opcoes=${[
                    { valor: 'texto', rotulo: 'Texto' },
                    { valor: 'imagem', rotulo: 'Imagem PNG' },
                  ]}
                  aoMudar=${(tipo) => mudarMarca({ tipo })}
                />
                ${
                  marca.tipo === 'texto'
                    ? html`<${Campo} rotulo="Texto"><input type="text" maxlength="60" value=${marca.texto}
                      onInput=${(e) => mudarMarca({ texto: e.currentTarget.value })} /><//>`
                    : html`<label class="vidro vidro--pequeno arquivo-png">
                        <input type="file" accept="image/png" class="so-leitor"
                          onChange=${(e) => e.currentTarget.files[0] && mudarMarca({ arquivo: e.currentTarget.files[0] })} />
                        ${marca.arquivo ? marca.arquivo.name : 'Escolher PNG'}
                      </label>`
                }
                <${Segmentado}
                  rotulo="Posição"
                  valor=${r.marcaDagua.posicao in POSICOES ? r.marcaDagua.posicao : 'inferior-direito'}
                  opcoes=${Object.entries(POSICOES).map(([valor, rotulo]) => ({ valor, rotulo }))}
                  aoMudar=${(posicao) => mudarMarca({ posicao })}
                />
                <${Controle}
                  rotulo="Opacidade"
                  valor=${Math.round(r.marcaDagua.opacidade * 100)}
                  min=${5}
                  max=${100}
                  neutro=${5}
                  formato=${(v) => `${v}%`}
                  aoMudar=${(v) => mudarMarca({ opacidade: v / 100 })}
                />
                <${Controle}
                  rotulo="Tamanho"
                  valor=${Math.round(r.marcaDagua.tamanho * 100)}
                  min=${5}
                  max=${100}
                  neutro=${5}
                  formato=${(v) => `${v}%`}
                  aoMudar=${(v) => mudarMarca({ tamanho: v / 100 })}
                />
              </div>
            </div>`
          : null
      }
    </div>

    <div class="grade-campos grade-campos--nome">
      <div class="campo campo--nome">
        <span>Nome do arquivo</span>
        <input ref=${nomeRef} type="text" value=${r.nome} spellcheck="false" onInput=${(e) => mudar({ nome: e.currentTarget.value })} />
        <div class="fichas" role="group" aria-label="Inserir no nome">
          ${FICHAS.map((f) => html`<button type="button" class="pilula pilula--ficha" onClick=${() => inserirFicha(f)}>${ROTULO_FICHA[f]}</button>`)}
        </div>
        ${exemplo ? html`<span class="exemplo" title="Como a primeira vai se chamar">${pasta ? `${pasta}/` : ''}${exemplo}</span>` : null}
      </div>
      <${Campo} rotulo="Subpasta">
        <input type="text" value=${r.pasta} placeholder="Nenhuma" spellcheck="false" onInput=${(e) => mudar({ pasta: e.currentTarget.value })} />
      <//>
    </div>
  </div>`
}

// ─────────── a fila ───────────

function usarLote(lote) {
  const [, redesenhar] = useState(0)
  useEffect(() => {
    if (!lote) return
    let quadro = 0
    const cancelar = lote.assinar(() => {
      if (quadro) return
      quadro = requestAnimationFrame(() => {
        quadro = 0
        redesenhar((n) => n + 1)
      })
    })
    return () => {
      cancelar()
      cancelAnimationFrame(quadro)
    }
  }, [lote])
  return lote?.estado()
}

const TEXTO_DO_ESTADO = { 'na-fila': 'Na fila', pronta: 'Pronta', falhou: 'Não saiu', pulada: 'Pulada' }
const MOTIVO = { 'ja-feita': 'Já saiu assim', repetida: 'Repetida', cancelada: 'Cancelada' }

function LinhaDaFila({ loja, item, foto, andamento }) {
  const fase = andamento?.fase
  const texto =
    item.estado === 'tratando'
      ? fase === 'gravando'
        ? 'Gravando'
        : fase === 'revelando'
          ? 'Revelando'
          : 'Começando'
      : item.estado === 'pronta'
        ? item.resultado?.nome
        : item.estado === 'pulada'
          ? MOTIVO[item.motivo] || item.motivo
          : item.estado === 'falhou'
            ? item.motivo
            : TEXTO_DO_ESTADO[item.estado]
  return html`<li class="fila-linha" data-estado=${item.estado} data-id=${item.id} data-tentativas=${item.tentativas}>
    <${Miniatura} loja=${loja} id=${item.id} />
    <span class="fila-nome">${foto?.nome ?? item.id}</span>
    <span class="fila-estado" title=${texto}>${texto}</span>
    <span class="fila-sinal" aria-hidden="true">
      ${
        item.estado === 'tratando'
          ? html`<${ProgressoAnel} valor=${fase === 'gravando' ? 1 : (andamento?.p ?? 0)} rotulo="Andamento" />`
          : item.estado === 'pronta'
            ? html`<${Icone} nome="ok" />`
            : item.estado === 'falhou'
              ? html`<${Icone} nome="aviso" />`
              : null
      }
    </span>
  </li>`
}

function Fila({ loja, lote, aoVoltar, nomeSaida }) {
  const e = usarLote(lote)
  if (!e) return null
  const { contagem, estimativa, pausada, cancelada, terminada } = e.fila
  const ativas = contagem.total - contagem.puladas
  const resolvidas = contagem.prontas + contagem.falhas
  const fim = e.fase === 'terminada' && terminada
  const medindo = e.fase === 'medindo'
  const restante = !fim && !pausada ? tempoTexto(estimativa.restanteMs) : null
  const destino = lote.destino
  const onde = destino.tipo === 'pasta' ? `na pasta ${destino.onde}` : `no ${destino.onde}`
  let titulo
  if (fim && contagem.prontas && !contagem.falhas && !cancelada) titulo = ['Pronto.', `${fotosTexto(contagem.prontas)}.`]
  else if (fim && cancelada) titulo = ['Cancelada.', `${numero(contagem.prontas)} de ${numero(ativas)}.`]
  else if (fim && contagem.falhas) titulo = ['Quase.', `${numero(contagem.falhas)} não ${contagem.falhas === 1 ? 'saiu' : 'saíram'}.`]
  else if (fim) titulo = ['Nada', 'a fazer.']
  else if (medindo) titulo = ['Medindo', 'a luz.']
  else if (pausada) titulo = ['Pausada', `em ${numero(resolvidas)} de ${numero(ativas)}.`]
  else titulo = ['Exportando', `${numero(resolvidas)} de ${numero(ativas)}.`]
  const progresso = medindo ? (e.medidas.total ? e.medidas.feitas / e.medidas.total : null) : ativas ? resolvidas / ativas : 1
  const fotos = new Map(loja.catalogo.fotos().map((f) => [f.id, f]))
  return html`<section class="fila entra" aria-live="polite" data-fase=${fim ? 'fim' : e.fase}>
    <header class="fila-cabeca">
      <div class="fila-titulo">
        <h3><span class="fino">${titulo[0]} </span><span class="pesado">${titulo[1]}</span></h3>
        <div class="apoio fila-apoio">
          ${
            fim
              ? html`${contagem.prontas ? `${tamanhoTexto(e.bytes)} ${onde}` : null}${
                  contagem.puladas && !cancelada ? html`<span class="ficha">${numero(contagem.puladas)} já tinham saído assim</span>` : null
                }`
              : medindo
                ? `${numero(e.medidas.feitas)} de ${numero(e.medidas.total)} · exposição e branco, foto a foto`
                : restante
                  ? `Falta ${restante}`
                  : pausada
                    ? 'As que estavam em curso terminam.'
                    : contagem.prontas < 3
                      ? 'Medindo o ritmo…'
                      : ''
          }
        </div>
      </div>
      <div class="fila-acoes">
        ${
          !fim
            ? html`${
                medindo
                  ? null
                  : pausada
                    ? html`<button type="button" class="vidro vidro--tinta" onClick=${() => lote.retomar()}><${Simbolo} nome="tocar" />Retomar</button>`
                    : html`<button type="button" class="vidro" onClick=${() => lote.pausar()}><${Simbolo} nome="pausar" />Pausar</button>`
              }<button type="button" class="vidro" onClick=${() => lote.cancelar()}>Cancelar</button>`
            : html`${
                contagem.falhas
                  ? html`<button type="button" class="vidro vidro--tinta"
              onClick=${() => lote.repetir()}>Repetir ${numero(contagem.falhas)}</button>`
                  : null
              }${
                destino.tipo === 'zip' && contagem.prontas
                  ? html`<button type="button" class=${cx('vidro', !contagem.falhas && 'vidro--tinta')} onClick=${() => destino.baixar()}><${Simbolo}
                    nome="baixar" />Baixar o .zip</button>`
                  : null
              }<button type="button" class="vidro" onClick=${aoVoltar}>Nova exportação</button>`
        }
      </div>
    </header>
    <${Progresso} valor=${fim ? 1 : progresso} rotulo=${titulo.join(' ')} classe="fila-barra" />
    ${e.erro ? html`<div class="linha-aviso" role="alert"><${Icone} nome="aviso" />${e.erro}</div>` : null}
    <ol class="fila-lista">
      ${(fim ? [...e.fila.itens].sort((a, b) => (b.estado === 'falhou') - (a.estado === 'falhou')) : e.fila.itens).map(
        (item) => html`<${LinhaDaFila}
        key=${item.id} loja=${loja} item=${item} foto=${fotos.get(item.id)} andamento=${e.andamento.get(item.id)} />`,
      )}
    </ol>
    <span class="so-leitor" data-saida>${nomeSaida}</span>
  </section>`
}

// ─────────── o painel ───────────

const RECEITA_INICIAL = receitaDaPredefinicao('entrega')

export function Exportar({ loja, ativa, pedido }) {
  const guardado = loja.aba('entregar-exportar')
  const trabalho = usarLoja(loja, (l) => l.trabalho())
  const ligado = usarLoja(loja, (l) => l.ligado())
  const [estrelas, definirEstrelas] = useState(guardado.estrelas ?? 3)
  const contagens = usarCatalogo(loja, (c) => contarCriterios(c, estrelas), ['fotos', 'filtro', 'selecao', 'dados*'])
  const [criterio, definirCriterio] = useState(guardado.criterio ?? null)
  const [tratarCom, definirTratarCom] = useState(guardado.tratarCom ?? 'ajustes')
  const [estilos, definirEstilos] = useState(null)
  const [estiloId, definirEstiloId] = useState(guardado.estiloId ?? null)
  const [intensidade, definirIntensidade] = useState(guardado.intensidade ?? 100)
  const [corrigir, definirCorrigir] = useState(guardado.corrigir ?? true)
  const [saidaId, definirSaidaId] = useState(guardado.saidaId ?? 'entrega')
  const [receita, definirReceita] = useState(guardado.receita ?? RECEITA_INICIAL)
  const [marca, definirMarca] = useState(guardado.marca ?? { tipo: 'texto', texto: 'PROVA', arquivo: null, posicao: 'diagonal', opacidade: 0.25, tamanho: 0.3 })
  const [mascara, definirMascara] = useState(null)
  const [pasta, definirPasta] = useState(guardado.pasta ?? null)
  const [destinoTipo, definirDestinoTipo] = useState(guardado.destinoTipo ?? 'zip')
  const [refazer, definirRefazer] = useState(false)
  const [lote, definirLote] = useState(guardado.lote ?? null)
  const [abrindo, definirAbrindo] = useState(false)
  const [aberto, definirAberto] = useState(!!guardado.aberto)

  useEffect(() => {
    Object.assign(guardado, { estrelas, criterio, tratarCom, estiloId, intensidade, corrigir, saidaId, receita, marca, pasta, destinoTipo, lote, aberto })
  })
  // os estilos da pessoa podem ter mudado na aba Estilos: relê ao voltar
  useEffect(() => {
    if (ativa) void carregarEstilos().then(definirEstilos)
  }, [ativa])
  // "Tratar as escolhidas pelo cliente" (da galeria): já chega com elas
  useEffect(() => {
    if (!pedido) return
    definirCriterio(pedido.criterio)
    if (lote && lote.estado().fase === 'terminada') definirLote(null)
  }, [pedido])
  // a máscara da marca-d'água, desenhada de novo quando o texto ou a imagem mudam
  useEffect(() => {
    let vivo = true
    if (!receita.marcaDagua) return definirMascara(null)
    const fazer = marca.tipo === 'imagem' && marca.arquivo ? mascaraDeImagem(marca.arquivo) : mascaraDeTexto(marca.texto || 'PROVA')
    void fazer.then((m) => vivo && definirMascara(m)).catch(() => vivo && definirMascara(null))
    return () => {
      vivo = false
    }
  }, [!!receita.marcaDagua, marca.tipo, marca.texto, marca.arquivo])

  const criterioEfetivo = criterio ?? (contagens.escolhidas ? 'escolhidas' : 'filtro')
  const fotos = useMemo(() => fotosDe(loja.catalogo, criterioEfetivo, { estrelas }), [criterioEfetivo, estrelas, contagens])
  const estilo = tratarCom === 'estilo' ? (estilos?.porId.get(estiloId) ?? estilos?.lista[0] ?? null) : null
  const tratar = estilo ? { predefinicao: estilo, modo: corrigir ? 'manter-o-que-ja-mexi' : 'so-estilo', intensidade } : null
  const r = normalizarReceita(receita)
  const chaveDestino = destinoTipo === 'pasta' && pasta ? `pasta:${pasta.name}` : 'zip'
  const marcaChave = r.marcaDagua ? impressao(mascara) : null
  const semOriginal = fotos.filter((f) => !loja.temOriginal(f.id)).length
  const feitas = useMemo(() => {
    if (!trabalho || !fotos.length) return 0
    const lista = new Set(lerFeitas(trabalho.id))
    if (!lista.size) return 0
    return fotos.filter((foto) =>
      lista.has(chaveDoItem({ foto, tratamento: tratamentoDe(foto, tratar), receita: r, destino: chaveDestino, marca: marcaChave })),
    ).length
  }, [fotos, JSON.stringify(r), tratar && `${tratar.predefinicao.id}${tratar.modo}${tratar.intensidade}`, chaveDestino, marcaChave, lote])
  const contextoDoNome = (f, seq) => ({
    nome: f.nome,
    seq,
    data: f.exif?.data,
    trabalho: trabalho?.nome ?? '',
    estrelas: f.estrelas,
    predefinicao: estilo?.nome ?? '',
  })

  const mudarReceita = (parcial) => {
    const nova = normalizarReceita({ ...r, ...parcial })
    definirReceita(nova)
    definirSaidaId(null)
  }
  const mudarMarca = (parcial) => {
    const nova = { ...marca, ...parcial }
    definirMarca(nova)
    if (r.marcaDagua) {
      const texto = nova.tipo === 'imagem' ? 'Imagem' : nova.texto || 'PROVA'
      mudarReceita({ marcaDagua: { texto, posicao: nova.posicao, opacidade: nova.opacidade, tamanho: nova.tamanho } })
    }
  }
  const escolherSaida = (p) => {
    definirSaidaId(p.id)
    const nova = receitaDaPredefinicao(p.id)
    if (nova.marcaDagua)
      definirMarca((m) => ({
        ...m,
        tipo: 'texto',
        texto: nova.marcaDagua.texto,
        posicao: nova.marcaDagua.posicao,
        opacidade: nova.marcaDagua.opacidade,
        tamanho: nova.marcaDagua.tamanho,
      }))
    definirReceita(nova)
  }
  const pedirPasta = async () => {
    const p = await escolherPasta()
    if (p) {
      definirPasta(p)
      definirDestinoTipo('pasta')
    }
  }

  async function exportar() {
    if (!fotos.length || abrindo) return
    if (r.marcaDagua && !mascara) return avisar('A marca-d’água ainda está sendo desenhada.')
    if (r.marcaDagua && marca.tipo === 'imagem' && !marca.arquivo) return avisar('Escolha a imagem da marca-d’água.')
    definirAbrindo(true)
    try {
      const nomeSaida = saidaId ? PREDEFINICOES_DE_SAIDA.find((p) => p.id === saidaId)?.nome : 'Personalizada'
      const contexto = { trabalho: trabalho?.nome ?? '', software: NOME }
      const comum = { subpasta: r.pasta, contexto, modelo: r.nome, extensao: extensaoDaReceita(r) }
      let destino
      if (destinoTipo === 'pasta' && pasta) {
        if (pasta.requestPermission && (await pasta.requestPermission({ mode: 'readwrite' })) !== 'granted') {
          definirAbrindo(false)
          return avisar('Sem permissão para gravar nessa pasta.')
        }
        destino = await destinoPasta(pasta, comum)
      } else {
        const base = `${trabalho?.nome || 'Fotos'} - ${nomeSaida}`.replace(/[\\/:*?"<>|]+/g, '-')
        destino = destinoZip({ nome: `${base}.zip`, ...comum })
      }
      const itens = fotos.map((foto) => ({ foto, arquivo: loja.arquivo(foto.id)?.arquivo ?? null }))
      const novo = criarExportacao({
        itens,
        receita: { ...r, marcaDagua: r.marcaDagua ? { ...r.marcaDagua, texto: marca.tipo === 'imagem' ? `imagem ${marcaChave}` : r.marcaDagua.texto } : null },
        tratar,
        destino,
        chaveDestino,
        mascara,
        marca: marcaChave,
        contexto,
        looks: (id) => estilos?.look(id),
        trabalho: trabalho.id,
        refazer,
        aoMudar() {
          const s = novo.estado()
          if (s.fase === 'terminada' && destino.tipo === 'zip' && !s.fila.cancelada && s.fila.contagem.prontas && !novo.baixado) {
            novo.baixado = true
            destino.baixar()
          }
        },
      })
      definirRefazer(false)
      definirLote(novo)
      void novo.comecar()
    } catch (e) {
      avisar(`Não deu para começar: ${e?.message ?? e}`)
    } finally {
      definirAbrindo(false)
    }
  }

  if (lote) {
    return html`<${Fila}
      loja=${loja}
      lote=${lote}
      nomeSaida=${resumoDaReceita(r)}
      aoVoltar=${() => {
        if (lote.estado().rodando) lote.cancelar()
        definirLote(null)
      }}
    />`
  }

  const opcoesCriterio = [
    { valor: 'escolhidas', rotulo: 'Escolhidas', contagem: contagens.escolhidas },
    ...(contagens.selecao ? [{ valor: 'selecao', rotulo: 'Seleção', contagem: contagens.selecao }] : []),
    { valor: 'nota', rotulo: `${'★'.repeat(estrelas)} ou mais`, contagem: contagens.nota, dica: 'Pelas suas estrelas' },
    { valor: 'filtro', rotulo: 'Filtro atual', contagem: contagens.filtro },
    ...(contagens.cliente ? [{ valor: 'cliente', rotulo: 'Do cliente', contagem: contagens.cliente }] : []),
  ]
  const ondeVai = destinoTipo === 'pasta' && pasta ? pasta.name : '.zip'

  return html`<div class="exportar">
    <div class="exportar-config">
      ${celular() ? html`<div class="linha-aviso linha-aviso--leve"><${Simbolo} nome="computador" />Exportar em lote é coisa de computador.</div>` : null}
      <section class="bloco" style="--i:0">
        <h3 class="sobretitulo">O quê</h3>
        <${Pilulas} rotulo="O que exportar" opcoes=${opcoesCriterio} valor=${criterioEfetivo} aoMudar=${(v) => v && definirCriterio(v)} rola=${true} />
        ${
          criterioEfetivo === 'nota'
            ? html`<div class="estrelas-minimo" role="group" aria-label="Estrelas no mínimo">
                ${[1, 2, 3, 4, 5].map(
                  (n) =>
                    html`<button type="button" class="pilula" aria-pressed=${n === estrelas ? 'true' : 'false'}
                      onClick=${() => definirEstrelas(n)}>${'★'.repeat(n)}</button>`,
                )}
              </div>`
            : null
        }
      </section>

      <section class="bloco" style="--i:1">
        <h3 class="sobretitulo">Tratar com</h3>
        <${Segmentado}
          rotulo="Tratar com"
          valor=${tratarCom}
          opcoes=${[
            { valor: 'ajustes', rotulo: 'Os ajustes de cada foto' },
            { valor: 'estilo', rotulo: 'Um estilo' },
          ]}
          aoMudar=${definirTratarCom}
        />
        ${
          tratarCom === 'estilo'
            ? html`<div class="estilo-config entra">
                <label class="campo">
                  <span class="so-leitor">Estilo</span>
                  <select value=${estilo?.id ?? ''} onChange=${(e) => definirEstiloId(e.currentTarget.value)} disabled=${!estilos}>
                    ${(estilos?.grupos ?? []).map(
                      ([familia, lista]) => html`<optgroup label=${familia}>${lista.map((p) => html`<option value=${p.id}>${p.nome}</option>`)}</optgroup>`,
                    )}
                  </select>
                </label>
                <${Controle} rotulo="Intensidade" valor=${intensidade} min=${0} max=${200} neutro=${100}
                  formato=${(v) => `${v}%`} aoMudar=${definirIntensidade} />
                <${Chave} ligada=${corrigir} rotulo="Corrigir luz e branco de cada foto antes" aoMudar=${definirCorrigir} />
              </div>`
            : null
        }
      </section>

      <section class="bloco" style="--i:2">
        <h3 class="sobretitulo">Saída</h3>
        <div class="saidas cascata">
          ${PREDEFINICOES_DE_SAIDA.map(
            (p, i) => html`<${CartaoDeSaida} key=${p.id} p=${p} i=${i} ativo=${saidaId === p.id}
            aoEscolher=${() => escolherSaida(p)} />`,
          )}
        </div>
        <details class="personalizar" open=${aberto} onToggle=${(e) => definirAberto(e.currentTarget.open)}>
          <summary><span>Personalizar</span><span class="ficha">${saidaId ? resumoDaReceita(r) : `Personalizada · ${resumoDaReceita(r)}`}</span></summary>
          ${
            aberto
              ? html`<${Personalizar}
                  receita=${r}
                  mudar=${mudarReceita}
                  marca=${marca}
                  mudarMarca=${mudarMarca}
                  mascara=${mascara}
                  loja=${loja}
                  primeira=${fotos[0]}
                  contextoDoNome=${contextoDoNome}
                />`
              : null
          }
        </details>
      </section>

      <section class="bloco" style="--i:3">
        <h3 class="sobretitulo">Para onde</h3>
        <div class="destinos">
          ${
            temPasta()
              ? html`<button type="button" class=${cx('destino', destinoTipo === 'pasta' && pasta && 'destino--ativo')}
                aria-pressed=${destinoTipo === 'pasta' && pasta ? 'true' : 'false'} onClick=${() => (pasta ? definirDestinoTipo('pasta') : pedirPasta())}>
                  <${Icone} nome="pasta" /><span><strong>${pasta ? pasta.name : 'Uma pasta'}</strong><span
                    class="destino-apoio">${pasta ? 'Nada é sobrescrito' : 'Escolher…'}</span></span>
                </button>`
              : null
          }
          <button type="button" class=${cx('destino', !(destinoTipo === 'pasta' && pasta) && 'destino--ativo')}
            aria-pressed=${!(destinoTipo === 'pasta' && pasta) ? 'true' : 'false'} onClick=${() => definirDestinoTipo('zip')}>
            <${Simbolo} nome="zip" /><span><strong>Um .zip</strong><span class="destino-apoio">Baixado no fim</span></span>
          </button>
          ${
            pasta && destinoTipo === 'pasta'
              ? html`<button type="button" class="liso trocar-pasta" aria-label="Trocar a pasta" data-dica="Trocar a pasta"
            onClick=${pedirPasta}><${Icone} nome="trocar" /></button>`
              : null
          }
        </div>
      </section>
    </div>

    <aside class="resumo cartao">
      <div class="resumo-pilha" aria-hidden="true">
        ${fotos.slice(0, 3).map((f, i) => html`<${Miniatura} key=${f.id} loja=${loja} id=${f.id} classe=${`resumo-mini resumo-mini--${i}`} />`)}
        ${fotos.length ? null : html`<span class="mini resumo-mini resumo-mini--0 resumo-mini--vazia"></span>`}
      </div>
      <div class="resumo-numero"><${Numero} valor=${fotos.length} /><span>${fotos.length === 1 ? 'foto' : 'fotos'}</span></div>
      <div class="resumo-linhas">
        <span class="ficha">${resumoDaReceita(r)}</span>
        ${estilo ? html`<span class="ficha">${estilo.nome}${intensidade !== 100 ? ` · ${intensidade}%` : ''}</span>` : null}
        <span class="ficha">${destinoTipo === 'pasta' && pasta ? html`<${Icone} nome="pasta" />` : html`<${Simbolo} nome="zip" />`}${ondeVai}</span>
      </div>
      ${
        feitas && !refazer
          ? html`<div class="resumo-feitas">${numero(feitas)} já saíram assim e ficam de fora. <button type="button" class="link"
            onClick=${() => definirRefazer(true)}>Fazer de novo</button></div>`
          : refazer
            ? html`<div class="resumo-feitas">Todas de novo. <button type="button" class="link"
              onClick=${() => definirRefazer(false)}>Pular as feitas</button></div>`
            : null
      }
      ${
        semOriginal && fotos.length
          ? html`<div class="resumo-feitas resumo-feitas--aviso">
              ${semOriginal === fotos.length ? 'Os originais não estão ao alcance.' : `${numero(semOriginal)} sem o original ao alcance.`}
              ${
                trabalho?.origem === 'pasta' && !ligado
                  ? html` <button type="button" class="link"
                onClick=${() => loja.religar()}>Religar a pasta</button>`
                  : null
              }
            </div>`
          : null
      }
      <button
        type="button"
        class="vidro vidro--tinta vidro--grande resumo-acao"
        disabled=${!fotos.length || abrindo || semOriginal === fotos.length || (feitas === fotos.length && !refazer)}
        onClick=${exportar}
        data-exportar
      >
        ${fotos.length ? `Exportar ${fotosTexto(fotos.length - (refazer ? 0 : feitas))}` : 'Nada para exportar'}
      </button>
    </aside>
  </div>`
}

// A galeria para o cliente escolher: criar (a ficha e as fotos), gerar as prévias aqui mesmo (2048 px com a marca
// gravada, sem metadados, e a miniatura de 480 px), enviar com o sha256 de cada uma, publicar e mostrar o endereço UMA
// vez (o servidor não guarda o token legível). Depois: o estado (aberta, em andamento, concluída), trocar o link, PIN,
// revogar, reabrir, encerrar. A seleção do cliente volta para o catálogo (`cliente` de cada foto) e vira o filtro
// "Escolhidas pelo cliente", com os comentários e os pedidos; daí o lote do Exportar já sai com elas.
//
// Sem armazenamento (503 sem_armazenamento), sem banco ou sem sessão, a galeria mostra uma linha e nada mais.

import { html, useEffect, useMemo, useRef, useState } from '../../preact.js'
import { usarCatalogo, usarLoja } from '../../estado.js'
import { Chave, Esqueleto, Folha, Menu, Numero, Pilulas, Progresso, ProgressoAnel, avisar } from '../../componentes/index.js'
import { Icone } from '../../icones.js'
import { Miniatura, Simbolo, carregarEstilos, contarCriterios, copiar, dataTexto, fotosDe, fotosTexto, numero, ordemDaGaleria, tempoTexto } from './comum.js'
import { criarEnvio } from './lote.js'
import { mascaraDeTexto } from './marca.js'
import { qrSvg } from '../../componentes/qr.js'
import { ETIQUETAS, ErroServico, foraDoAr, servico, vinculo } from './servico.js'

const MARCA_DA_GALERIA = { posicao: 'diagonal', opacidade: 0.22, tamanho: 0.3 }
const ESPERA_DO_ESTADO = 15000

const ESTADOS = {
  rascunho: 'Rascunho',
  publicada: 'Aberta',
  concluida: 'Concluída',
  reaberta: 'Reaberta',
  encerrada: 'Encerrada',
}
function rotuloDoEstado(g) {
  if (g.estado === 'publicada' && g.escolhidas > 0) return 'Em andamento'
  return ESTADOS[g.estado] ?? g.estado
}

const MOTIVOS_FORA = {
  sem_armazenamento: 'A galeria precisa do armazenamento ligado no servidor.',
  sem_banco: 'A galeria precisa do serviço ligado no servidor.',
  sem_sessao: 'A galeria precisa da sua conta: entre para usar.',
}

function textoDoErro(e) {
  if (!(e instanceof ErroServico)) return String(e?.message ?? e)
  return (
    {
      rede: 'Sem conexão com o servidor.',
      travada: 'A galeria está travada (concluída ou encerrada).',
      teto: 'Passou do limite de 1.500 fotos por galeria.',
      faltam_arquivos: 'Faltam prévias para enviar.',
      sem_fotos: 'A galeria não tem fotos.',
      estado: 'Isso não vale no estado atual da galeria.',
      campo: `Confira o campo ${e.corpo?.campo ?? ''}.`.replace(' .', '.'),
      gps: 'A prévia levava posição de GPS.',
      grande: 'Prévia grande demais.',
    }[e.codigo] ?? `Não deu (${e.codigo}).`
  )
}

/** A seleção do cliente no catálogo: `cliente` de cada foto da galeria (só o que mudou). */
function aplicarSelecao(catalogo, galeriaId, fotosDaGaleria, selecao) {
  const porFoto = new Map(selecao.fotos.map((f) => [f.fotoId, f]))
  const mudancas = []
  for (const fg of fotosDaGaleria) {
    const atual = catalogo.foto(fg.fotoId)
    if (!atual) continue
    const s = porFoto.get(fg.fotoId)
    const novo = s ? { galeria: galeriaId, escolhida: !!s.escolhida, comentario: s.comentario || null, etiquetas: s.etiquetas || [] } : null
    if (JSON.stringify(atual.cliente ?? null) !== JSON.stringify(novo)) mudancas.push({ id: fg.fotoId, cliente: novo })
  }
  if (mudancas.length) catalogo.atualizarVarias(mudancas)
  return mudancas.length
}

// ─────────── o endereço, uma vez ───────────

function FolhaDoLink({ endereco, pin, aoFechar }) {
  const [copiado, definirCopiado] = useState(false)
  const svg = useMemo(() => (endereco ? qrSvg(endereco) : ''), [endereco])
  return html`<${Folha} aberta=${!!endereco} aoFechar=${aoFechar} titulo=${['Link', 'pronto.']} largura=${520} classe="folha-link">
    <div class="link-corpo">
      <div class="link-qr" dangerouslySetInnerHTML=${{ __html: svg }}></div>
      <label class="campo link-campo">
        <span class="so-leitor">Endereço da galeria</span>
        <input type="text" readonly value=${endereco ?? ''} onFocus=${(e) => e.currentTarget.select()} data-endereco />
      </label>
      <div class="link-aviso"><${Icone} nome="aviso" />Copie agora: o endereço não fica guardado.</div>
      ${pin ? html`<div class="link-aviso link-aviso--leve"><${Icone} nome="cadeado" />PIN ${pin}: mande por outro caminho.</div>` : null}
      <div class="folha-pe">
        <button type="button" class="vidro" onClick=${aoFechar}>Fechar</button>
        <button
          type="button"
          class="vidro vidro--tinta"
          onClick=${async () => {
            const ok = await copiar(endereco)
            definirCopiado(ok)
            if (!ok) avisar('Não deu para copiar: selecione o endereço.')
          }}
        >
          <${Simbolo} nome=${copiado ? 'link' : 'copiar'} />${copiado ? 'Copiado' : 'Copiar'}
        </button>
      </div>
    </div>
  <//>`
}

function FolhaDoPin({ aberta, temPin, aoFechar, aoSalvar }) {
  const [pin, definirPin] = useState('')
  const valido = /^\d{4,8}$/.test(pin)
  return html`<${Folha} aberta=${aberta} aoFechar=${aoFechar} titulo=${['PIN', 'do link.']} largura=${420}>
    <form
      onSubmit=${(e) => {
        e.preventDefault()
        if (valido) aoSalvar(pin)
      }}
    >
      <label class="campo"><span>4 a 8 números</span><input type="text" inputmode="numeric" autocomplete="off" maxlength="8" value=${pin}
        onInput=${(e) => definirPin(e.currentTarget.value.replace(/\D/g, ''))} /></label>
      <div class="folha-pe">
        ${temPin ? html`<button type="button" class="vidro" onClick=${() => aoSalvar(null)}>Tirar o PIN</button>` : null}
        <button type="submit" class="vidro vidro--tinta" disabled=${!valido}>Salvar</button>
      </div>
    </form>
  <//>`
}

function Confirmar({ pedido, aoFechar }) {
  return html`<${Folha} aberta=${!!pedido} aoFechar=${aoFechar} titulo=${pedido?.titulo ?? ['', '']} largura=${420}>
    ${
      pedido
        ? html`<div class="apoio">${pedido.apoio}</div>
            <div class="folha-pe">
              <button type="button" class="vidro" onClick=${aoFechar}>Cancelar</button>
              <button
                type="button"
                class="vidro vidro--tinta"
                onClick=${() => {
                  aoFechar()
                  pedido.fazer()
                }}
              >
                ${pedido.botao}
              </button>
            </div>`
        : null
    }
  <//>`
}

// ─────────── criar ───────────

function Criar({ loja, aoCriar, outras, aoAbrirOutra }) {
  const trabalho = usarLoja(loja, (l) => l.trabalho())
  const contagens = usarCatalogo(loja, (c) => contarCriterios(c, 3), ['fotos', 'filtro', 'selecao', 'dados*'])
  const [criterio, definirCriterio] = useState(null)
  const [ficha, definirFicha] = useState({
    nome: trabalho?.nome || '',
    fotografo: '',
    contratadas: '',
    permiteExtras: false,
    precoExtra: '',
    prazo: '',
    mensagem: '',
    marcaDagua: true,
    textoMarca: '',
    pin: '',
  })
  const efetivo = criterio ?? (contagens.escolhidas ? 'escolhidas' : 'todas')
  const fotos = useMemo(() => fotosDe(loja.catalogo, efetivo), [efetivo, contagens])
  const mudar = (k) => (e) => definirFicha((f) => ({ ...f, [k]: e.currentTarget.type === 'checkbox' ? e.currentTarget.checked : e.currentTarget.value }))
  const contratadas = Number(ficha.contratadas) || Math.min(fotos.length, 5000) || 0
  const pinOk = !ficha.pin || /^\d{4,8}$/.test(ficha.pin)
  const pode = fotos.length > 0 && fotos.length <= 1500 && ficha.nome.trim() && contratadas >= 1 && pinOk
  const enviar = (e) => {
    e.preventDefault()
    if (pode) aoCriar({ ...ficha, contratadas }, fotos)
  }
  return html`<form class="galeria-criar entra" onSubmit=${enviar} data-criar>
    <div class="galeria-criar-fotos cartao">
      <div class="faixa-fotos" aria-hidden="true">
        ${fotos.slice(0, 5).map((f, i, l) => {
          // um leque centrado: a primeira no meio, as outras abrindo para os dois lados
          const lugares = l.map((_, j) => j - (l.length - 1) / 2).sort((a, b) => Math.abs(a) - Math.abs(b) || a - b)
          const p = lugares[i]
          return html`<${Miniatura} key=${f.id} loja=${loja} id=${f.id} classe="faixa-mini"
            estilo=${`--x:${p * 46}px;--r:${p * 6}deg;z-index:${9 - Math.round(Math.abs(p) * 2)}`} />`
        })}
      </div>
      <div class="galeria-criar-numero"><${Numero} valor=${fotos.length} /><span>${fotos.length === 1 ? 'foto' : 'fotos'}</span></div>
      <${Pilulas}
        rotulo="Que fotos vão"
        valor=${efetivo}
        aoMudar=${(v) => v && definirCriterio(v)}
        rola=${true}
        opcoes=${[
          { valor: 'escolhidas', rotulo: 'Escolhidas', contagem: contagens.escolhidas },
          ...(contagens.selecao ? [{ valor: 'selecao', rotulo: 'Seleção', contagem: contagens.selecao }] : []),
          { valor: 'filtro', rotulo: 'Filtro atual', contagem: contagens.filtro },
          { valor: 'todas', rotulo: 'Todas', contagem: contagens.todas },
        ]}
      />
      ${fotos.length > 1500 ? html`<div class="linha-aviso"><${Icone} nome="aviso" />Até 1.500 fotos por galeria.</div>` : null}
    </div>
    <div class="galeria-criar-ficha">
      <label class="campo campo--largo"><span>Nome do trabalho</span><input name="nome" type="text" required maxlength="120" value=${ficha.nome}
        onInput=${mudar('nome')} /></label>
      <label class="campo"><span>Quem assina</span><input name="fotografo" type="text" maxlength="80" placeholder="O nome da sua conta"
        value=${ficha.fotografo} onInput=${mudar('fotografo')} /></label>
      <label class="campo"><span>Fotos no pacote</span><input name="contratadas" type="number" min="1" max="5000" inputmode="numeric"
        placeholder=${String(Math.max(1, Math.min(fotos.length, 5000)))} value=${ficha.contratadas} onInput=${mudar('contratadas')} /></label>
      <label class="campo"><span>Prazo</span><input name="prazo" type="date" value=${ficha.prazo} onInput=${mudar('prazo')} /></label>
      <label class="campo"><span>PIN</span><input name="pin" type="text" inputmode="numeric" maxlength="8" placeholder="Opcional" value=${ficha.pin}
        onInput=${(e) => definirFicha((f) => ({ ...f, pin: e.currentTarget.value.replace(/\D/g, '') }))} /></label>
      <div class="linha-chave campo--largo">
        <${Chave} ligada=${ficha.permiteExtras} rotulo="Pode escolher extras" aoMudar=${(v) => definirFicha((f) => ({ ...f, permiteExtras: v }))} />
        ${
          ficha.permiteExtras
            ? html`<input name="precoExtra" type="text" maxlength="60" placeholder="R$ 25 por foto" aria-label="Preço da extra"
          value=${ficha.precoExtra} onInput=${mudar('precoExtra')} />`
            : null
        }
      </div>
      <div class="linha-chave campo--largo">
        <${Chave} ligada=${ficha.marcaDagua} rotulo="Marca-d’água nas prévias" aoMudar=${(v) => definirFicha((f) => ({ ...f, marcaDagua: v }))} />
        ${
          ficha.marcaDagua
            ? html`<input name="textoMarca" type="text" maxlength="60" placeholder=${ficha.fotografo || 'PROVA'} aria-label="Texto da marca"
          value=${ficha.textoMarca} onInput=${mudar('textoMarca')} />`
            : null
        }
      </div>
      <label class="campo campo--largo"><span>Mensagem</span><input name="mensagem" type="text" maxlength="280" placeholder="Uma linha para o cliente"
        value=${ficha.mensagem} onInput=${mudar('mensagem')} /></label>
      <div class="galeria-criar-pe">
        <button type="submit" class="vidro vidro--tinta vidro--grande" disabled=${!pode}>Criar e enviar ${fotosTexto(fotos.length)}</button>
      </div>
    </div>
    ${
      outras?.length
        ? html`<div class="outras">
            <h3 class="sobretitulo">Outras galerias</h3>
            ${outras.slice(0, 6).map(
              (g) => html`<button type="button" class="outra" onClick=${() => aoAbrirOutra(g.id)}>
                <strong>${g.nome}</strong><span class="ficha">${rotuloDoEstado(g)}</span><span class="outra-n">${fotosTexto(g.fotos)}</span>
              </button>`,
            )}
          </div>`
        : null
    }
  </form>`
}

// ─────────── enviando ───────────

function Envio({ loja, envio, total, aoPublicar, aoRepetir, aoCancelar, publicando }) {
  const [, redesenhar] = useState(0)
  useEffect(() => {
    const t = setInterval(() => redesenhar((n) => n + 1), 400)
    return () => clearInterval(t)
  }, [])
  const e = envio.estado()
  const { contagem, estimativa, terminada } = e.fila
  const feitas = contagem.prontas
  const fim = terminada && !e.rodando
  const restante = tempoTexto(estimativa.restanteMs)
  const falharam = `${numero(contagem.falhas)} não ${contagem.falhas === 1 ? 'saiu' : 'saíram'}.`
  const textoDoEnvio = fim ? (contagem.falhas ? falharam : 'Prévias com a marca, sem metadados.') : restante ? `Falta ${restante}` : 'Preparando as prévias…'
  // a janela de fotos em volta do andamento: as prontas sobem, as que esperam ficam embaixo, apagadas
  const itens = e.fila.itens
  const proxima = itens.findIndex((x) => x.estado !== 'pronta')
  const de = Math.max(0, Math.min(itens.length - 9, (proxima < 0 ? itens.length : proxima) - 4))
  const janela = itens.slice(de, de + 9)
  return html`<section class="envio entra" data-envio=${fim ? 'fim' : 'rodando'}>
    <div class="envio-palco" aria-hidden="true">
      ${janela.map(
        (x) => html`<span class="envio-casa" key=${x.id} data-estado=${x.estado}><${Miniatura} loja=${loja} id=${x.id}
        classe="envio-mini" /></span>`,
      )}
    </div>
    <h3>
      <span class="fino">${fim ? (contagem.falhas ? 'Quase.' : 'Enviadas.') : 'Enviando'} </span><span class="pesado"
        >${numero(feitas)} de ${numero(total)}.</span
      >
    </h3>
    <div class="apoio">${textoDoEnvio}</div>
    <${Progresso} valor=${feitas + contagem.falhas ? (feitas + contagem.falhas) / total : null} rotulo="Envio das prévias" classe="envio-barra" />
    <div class="envio-acoes">
      ${
        fim
          ? html`${contagem.falhas ? html`<button type="button" class="vidro" onClick=${aoRepetir}>Repetir ${numero(contagem.falhas)}</button>` : null}
              <button type="button" class="vidro vidro--tinta vidro--grande" disabled=${!feitas || publicando} onClick=${aoPublicar} data-publicar>
                ${publicando ? 'Publicando…' : contagem.falhas ? 'Publicar sem elas' : 'Publicar'}
              </button>`
          : html`<button type="button" class="vidro" onClick=${aoCancelar}>Cancelar</button>`
      }
    </div>
  </section>`
}

// ─────────── a seleção do cliente ───────────

function SelecaoDoCliente({ loja, selecao, aoTratar }) {
  const [filtro, definirFiltro] = useState('escolhidas')
  const comPedido = selecao.fotos.filter((f) => f.comentario || f.etiquetas?.length)
  const lista = filtro === 'pedidos' ? comPedido : selecao.fotos.filter((f) => f.escolhida)
  const lightroom = async () => {
    const ok = await copiar(selecao.listas.lightroom)
    avisar(ok ? 'Lista copiada. No Lightroom: Biblioteca, Texto, Nome do arquivo contém.' : 'Não deu para copiar.')
  }
  const captureOne = async () => {
    const ok = await copiar(selecao.listas.captureOne)
    avisar(ok ? 'Lista copiada para o Capture One.' : 'Não deu para copiar.')
  }
  return html`<section class="pelo-cliente entra" data-selecao>
    <header class="pelo-cliente-cabeca">
      <${Pilulas}
        rotulo="Filtro"
        valor=${filtro}
        aoMudar=${(v) => v && definirFiltro(v)}
        opcoes=${[
          { valor: 'escolhidas', rotulo: 'Escolhidas pelo cliente', contagem: selecao.escolhidas },
          { valor: 'pedidos', rotulo: 'Com pedido', contagem: comPedido.length },
        ]}
      />
      <div class="pelo-cliente-acoes">
        <button type="button" class="vidro" disabled=${!selecao.escolhidas} onClick=${lightroom} data-lightroom>Copiar para o Lightroom</button>
        <${Menu}
          rotulo="Mais listas"
          classeBotao="vidro vidro--icone"
          lado="direita"
          gatilho=${html`<${Icone} nome="tres" />`}
          itens=${[{ rotulo: 'Copiar para o Capture One', aoEscolher: captureOne }]}
        />
        <button type="button" class="vidro vidro--tinta" disabled=${!selecao.escolhidas} onClick=${aoTratar} data-tratar-cliente>
          Tratar ${selecao.escolhidas === 1 ? 'a escolhida' : `as ${numero(selecao.escolhidas)} escolhidas`}
        </button>
      </div>
    </header>
    ${
      lista.length
        ? html`<ul class="pelo-cliente-grade cascata">
            ${lista.map(
              (f, i) => html`<li class="pelo-cliente-foto" style=${`--i:${i}`} data-foto=${f.fotoId}>
                <${Miniatura} loja=${loja} id=${f.fotoId} />
                <div class="pelo-cliente-info">
                  <span class="pelo-cliente-nome">${f.escolhida ? html`<${Simbolo} nome="coracao" classe="coracao-cheio" />` : null}${f.nome}</span>
                  ${f.comentario ? html`<span class="pelo-cliente-comentario"><${Simbolo} nome="balao" />${f.comentario}</span>` : null}
                  ${
                    f.etiquetas?.length
                      ? html`<span class="pelo-cliente-etiquetas">${f.etiquetas.map(
                          (t) => html`<span
                    class="ficha">${ETIQUETAS[t] ?? t}</span>`,
                        )}</span>`
                      : null
                  }
                </div>
              </li>`,
            )}
          </ul>`
        : html`<div class="pelo-cliente-vazia apoio">${filtro === 'pedidos' ? 'Nenhum pedido.' : 'O cliente ainda não escolheu.'}</div>`
    }
  </section>`
}

// ─────────── a galeria publicada ───────────

function Painel({ loja, dados, selecao, aoAcao, aoTratar, ocupado }) {
  const g = dados.galeria
  const viva = g.link?.vivo
  const fracao = g.contratadas ? Math.min(1, g.escolhidas / g.contratadas) : 0
  const itensDoMenu = [
    g.link ? { rotulo: g.link.temPin ? 'Trocar ou tirar o PIN' : 'Pôr um PIN', icone: 'cadeado', aoEscolher: () => aoAcao('pin') } : null,
    g.estado === 'concluida' ? { rotulo: 'Reabrir para o cliente', icone: 'desfazer', aoEscolher: () => aoAcao('reabrir') } : null,
    g.link ? { rotulo: 'Revogar o link', icone: 'x', perigo: true, aoEscolher: () => aoAcao('revogar') } : null,
    g.estado !== 'encerrada' ? { rotulo: 'Encerrar a galeria', icone: 'lixo', perigo: true, aoEscolher: () => aoAcao('encerrar') } : null,
  ].filter(Boolean)
  return html`<div class="painel-galeria">
    <section class="estado-galeria cartao entra" data-estado=${g.estado}>
      <div class="estado-anel" aria-hidden="true"><${ProgressoAnel} valor=${fracao} rotulo="Escolhidas" /></div>
      <div class="estado-texto">
        <span class="sobretitulo" data-rotulo-estado>${rotuloDoEstado(g)}</span>
        <h3><span class="pesado" data-contagem><${Numero} valor=${g.escolhidas} /> de ${numero(g.contratadas)}</span><span class="fino"> escolhidas</span></h3>
        <div class="estado-fichas">
          <span class="ficha">${g.nome}</span>
          <span class="ficha">${fotosTexto(g.fotos)}</span>
          ${g.envio ? html`<span class="ficha">Enviada por ${g.envio.nome}, ${dataTexto(g.envio.em)}</span>` : null}
          ${
            g.link
              ? html`<span class="ficha">${viva ? `Link até ${dataTexto(g.link.expiraEm)}` : 'Link vencido'}</span>${
                  g.link.temPin
                    ? html`<span
                class="ficha"><${Icone} nome="cadeado" />PIN</span>`
                    : null
                }<span
                class="ficha">${numero(g.link.aberturas)} ${g.link.aberturas === 1 ? 'abertura' : 'aberturas'}</span>`
              : g.estado !== 'encerrada'
                ? html`<span class="ficha">Sem link</span>`
                : null
          }
        </div>
      </div>
      <div class="estado-acoes">
        <button type="button" class="vidro liso-icone" aria-label="Atualizar" data-dica="Atualizar" disabled=${ocupado}
          onClick=${() => aoAcao('atualizar')}><${Simbolo} nome="atualizar" /></button>
        ${
          g.estado !== 'encerrada'
            ? html`<button type="button" class="vidro" disabled=${ocupado} onClick=${() => aoAcao('link')} data-trocar-link><${Simbolo}
          nome="link" />${g.link ? 'Novo link' : 'Criar link'}</button>`
            : null
        }
        ${
          itensDoMenu.length
            ? html`<${Menu} rotulo="Mais" classeBotao="vidro vidro--icone" lado="direita" gatilho=${html`<${Icone}
          nome="tres" />`} itens=${itensDoMenu} />`
            : null
        }
      </div>
    </section>
    ${
      selecao
        ? html`<${SelecaoDoCliente} loja=${loja} selecao=${selecao} aoTratar=${aoTratar} />`
        : html`<div class="pelo-cliente"><${Esqueleto}
      altura=${120} raio=${18} /></div>`
    }
  </div>`
}

// ─────────── o painel inteiro ───────────

export function Galeria({ loja, ativa, aoTratarCliente }) {
  const guardado = loja.aba('entregar-galeria')
  const trabalho = usarLoja(loja, (l) => l.trabalho())
  const [situacao, definirSituacao] = useState(guardado.situacao ?? 'carregando') // carregando | fora | erro | nova | galeria
  const [motivo, definirMotivo] = useState(guardado.motivo ?? null)
  const [lista, definirLista] = useState(guardado.lista ?? [])
  const [dados, definirDados] = useState(guardado.dados ?? null)
  const [selecao, definirSelecao] = useState(guardado.selecao ?? null)
  const [envio, definirEnvio] = useState(guardado.envio ?? null)
  const [total, definirTotal] = useState(guardado.total ?? 0)
  const [publicacao, definirPublicacao] = useState(guardado.publicacao ?? null) // { validadeDias, pin }
  const [endereco, definirEndereco] = useState(null)
  const [pinMostrado, definirPinMostrado] = useState(null)
  const [folhaPin, definirFolhaPin] = useState(false)
  const [confirmar, definirConfirmar] = useState(null)
  const [ocupado, definirOcupado] = useState(false)
  const estilos = useRef(null)

  useEffect(() => {
    Object.assign(guardado, { situacao, motivo, lista, dados, selecao, envio, total, publicacao })
  })

  const falhar = (e) => {
    if (foraDoAr(e)) {
      definirMotivo(e.codigo)
      definirSituacao('fora')
    } else avisar(textoDoErro(e))
  }

  async function lerGaleria(id) {
    const d = await servico.ler(id)
    definirDados(d)
    if (d.galeria.estado !== 'rascunho') {
      const s = await servico.selecao(id)
      definirSelecao(s)
      aplicarSelecao(loja.catalogo, id, d.fotos, s)
    }
    return d
  }

  async function carregar() {
    try {
      const galerias = await servico.listar()
      definirLista(galerias)
      const id = trabalho ? vinculo.ler(trabalho.id) : null
      if (id && galerias.some((g) => g.id === id)) {
        await lerGaleria(id)
        definirSituacao('galeria')
      } else {
        if (id) vinculo.gravar(trabalho.id, null)
        definirSituacao('nova')
      }
    } catch (e) {
      if (foraDoAr(e)) falhar(e)
      else {
        definirMotivo(textoDoErro(e))
        definirSituacao('erro')
      }
    }
  }

  // ao entrar na aba e a cada 15 s enquanto ela está na frente: o estado e a seleção do cliente
  useEffect(() => {
    if (!ativa) return
    if (situacao === 'carregando' || situacao === 'erro') void carregar()
    const t = setInterval(() => {
      const g = guardado.dados?.galeria
      if (document.visibilityState !== 'visible' || guardado.situacao !== 'galeria' || !g || ['rascunho', 'encerrada'].includes(g.estado) || guardado.envio)
        return
      void lerGaleria(g.id).catch(() => {})
    }, ESPERA_DO_ESTADO)
    return () => clearInterval(t)
  }, [ativa, trabalho?.id])

  // ─── criar e enviar ───
  async function criar(ficha, fotos) {
    definirOcupado(true)
    try {
      const prazo = ficha.prazo ? new Date(`${ficha.prazo}T23:59:00`).toISOString() : null
      const corpo = {
        nome: ficha.nome.trim(),
        contratadas: ficha.contratadas,
        permiteExtras: ficha.permiteExtras,
        precoExtra: ficha.permiteExtras ? ficha.precoExtra.trim() || null : null,
        prazo,
        mensagem: ficha.mensagem.trim() || null,
        marcaDagua: ficha.marcaDagua,
        ...(ficha.fotografo.trim() ? { fotografo: ficha.fotografo.trim() } : {}),
      }
      const g = await servico.criar(corpo)
      vinculo.gravar(trabalho.id, g.id)
      const dias = prazo ? Math.ceil((Date.parse(prazo) - Date.now()) / 86400000) + 7 : 30
      const pub = { validadeDias: Math.max(7, Math.min(90, Math.max(30, dias))), pin: ficha.pin || null }
      definirPublicacao(pub)
      definirDados({ galeria: g, fotos: [] })
      definirSituacao('galeria')
      await enviarFotos(g, fotos, { texto: ficha.textoMarca.trim() || g.fotografo || 'PROVA', ligada: ficha.marcaDagua })
    } catch (e) {
      falhar(e)
    } finally {
      definirOcupado(false)
    }
  }

  async function enviarFotos(g, fotos, { texto, ligada }) {
    estilos.current ??= await carregarEstilos().catch(() => null)
    const mascara = ligada ? await mascaraDeTexto(texto) : null
    const marca = ligada ? { texto, ...MARCA_DA_GALERIA } : null
    const itens = ordemDaGaleria(fotos).map((x) => ({ ...x, arquivo: loja.arquivo(x.foto.id)?.arquivo ?? null }))
    const novo = criarEnvio({
      itens,
      mascara,
      marca,
      looks: (id) => estilos.current?.look(id),
      async enviar(it, r, sinal) {
        const [reg] = await servico.registrar(
          g.id,
          [
            {
              fotoId: it.foto.id,
              nome: it.foto.nome,
              ordem: it.ordem,
              grupo: it.grupo,
              melhor: it.melhor,
              largura: r.previa.largura,
              altura: r.previa.altura,
              tipo: 'image/jpeg',
              tamanho: r.previa.bytes.length,
              sha256: r.previa.sha256,
              mini: { tipo: 'image/jpeg', tamanho: r.mini.bytes.length, sha256: r.mini.sha256 },
            },
          ],
          sinal,
        )
        await servico.enviarArquivo(g.id, reg.id, 'previa', r.previa.bytes, sinal)
        await servico.enviarArquivo(g.id, reg.id, 'mini', r.mini.bytes, sinal)
      },
    })
    definirTotal(itens.length)
    definirEnvio(novo)
    const fim = await novo.comecar()
    // tudo enviado: publica e mostra o endereço; com falha, a pessoa decide (repetir ou publicar sem elas)
    if (fim && !fim.cancelada && !fim.contagem.falhas && fim.contagem.prontas && g.estado === 'rascunho') await publicar(g)
  }

  async function publicar(g = guardado.dados?.galeria) {
    definirOcupado(true)
    try {
      const pub = publicacao ?? { validadeDias: 30, pin: null }
      const r = await servico.publicar(g.id, { validadeDias: pub.validadeDias, ...(pub.pin ? { pin: pub.pin } : {}) })
      definirEnvio(null)
      definirPinMostrado(pub.pin)
      definirEndereco(r.endereco)
      definirPublicacao(null)
      await lerGaleria(g.id)
    } catch (e) {
      falhar(e)
    } finally {
      definirOcupado(false)
    }
  }

  async function acao(nome) {
    const g = dados.galeria
    const rodar = async (f) => {
      definirOcupado(true)
      try {
        await f()
        await lerGaleria(g.id)
      } catch (e) {
        falhar(e)
      } finally {
        definirOcupado(false)
      }
    }
    if (nome === 'atualizar') return rodar(async () => {})
    if (nome === 'pin') return definirFolhaPin(true)
    if (nome === 'reabrir') return rodar(() => servico.reabrir(g.id))
    if (nome === 'link') {
      return definirConfirmar({
        titulo: g.link ? ['Novo', 'link.'] : ['Criar', 'o link.'],
        apoio: g.link ? 'O endereço de agora para de abrir.' : 'Um endereço novo para o cliente.',
        botao: g.link ? 'Trocar' : 'Criar',
        fazer: () =>
          rodar(async () => {
            const r = await servico.trocarLink(g.id, { validadeDias: 30 })
            definirPinMostrado(null)
            definirEndereco(r.endereco)
          }),
      })
    }
    if (nome === 'revogar') {
      return definirConfirmar({
        titulo: ['Revogar', 'o link.'],
        apoio: 'O cliente deixa de abrir. A seleção fica.',
        botao: 'Revogar',
        fazer: () => rodar(() => servico.revogar(g.id)),
      })
    }
    if (nome === 'encerrar') {
      return definirConfirmar({
        titulo: ['Encerrar', 'a galeria.'],
        apoio: 'O link morre para sempre. A seleção fica com você.',
        botao: 'Encerrar',
        fazer: () => rodar(() => servico.encerrar(g.id)),
      })
    }
  }

  async function continuarRascunho() {
    const d = dados
    const faltam = d.fotos
      .filter((f) => !f.enviada || !f.mini?.enviada)
      .map((f) => loja.catalogo.foto(f.fotoId))
      .filter(Boolean)
    if (!faltam.length) return publicar(d.galeria)
    await enviarFotos(d.galeria, faltam, { texto: d.galeria.fotografo || 'PROVA', ligada: d.galeria.marcaDagua })
  }

  // ─── o que aparece ───
  if (situacao === 'carregando') {
    return html`<div class="galeria-carregando" aria-busy="true"><${Esqueleto} altura=${148} raio=${28} /><${Esqueleto} altura=${220} raio=${28} /></div>`
  }
  if (situacao === 'fora') {
    return html`<div class="linha-aviso linha-aviso--fora" role="status" data-fora=${motivo}><${Icone}
      nome="info" />${MOTIVOS_FORA[motivo] ?? MOTIVOS_FORA.sem_banco}</div>`
  }
  if (situacao === 'erro') {
    return html`<div class="linha-aviso" role="alert"><${Icone} nome="aviso" />${motivo}<button type="button" class="link"
      onClick=${() => definirSituacao('carregando') || carregar()}>Tentar de novo</button></div>`
  }

  const folhas = html`
    <${FolhaDoLink} endereco=${endereco} pin=${pinMostrado} aoFechar=${() => definirEndereco(null)} />
    <${FolhaDoPin}
      aberta=${folhaPin}
      temPin=${!!dados?.galeria?.link?.temPin}
      aoFechar=${() => definirFolhaPin(false)}
      aoSalvar=${async (pin) => {
        definirFolhaPin(false)
        try {
          await servico.pin(dados.galeria.id, pin)
          await lerGaleria(dados.galeria.id)
          avisar(pin ? 'PIN salvo. Mande por outro caminho.' : 'PIN tirado.')
        } catch (e) {
          falhar(e)
        }
      }}
    />
    <${Confirmar} pedido=${confirmar} aoFechar=${() => definirConfirmar(null)} />`

  if (situacao === 'nova' || !dados) {
    return html`<div class="galeria">
      <${Criar}
        loja=${loja}
        aoCriar=${criar}
        outras=${lista}
        aoAbrirOutra=${async (id) => {
          vinculo.gravar(trabalho.id, id)
          try {
            await lerGaleria(id)
            definirSituacao('galeria')
          } catch (e) {
            falhar(e)
          }
        }}
      />
      ${folhas}
    </div>`
  }

  const g = dados.galeria
  if (envio) {
    return html`<div class="galeria">
      <${Envio}
        loja=${loja}
        envio=${envio}
        total=${total}
        publicando=${ocupado}
        aoPublicar=${() => publicar(g)}
        aoRepetir=${() => envio.repetir()}
        aoCancelar=${() => {
          envio.cancelar()
          definirEnvio(null)
          void lerGaleria(g.id).catch(() => {})
        }}
      />
      ${folhas}
    </div>`
  }

  if (g.estado === 'rascunho') {
    const enviadas = dados.fotos.filter((f) => f.enviada && f.mini?.enviada).length
    return html`<div class="galeria">
      <section class="estado-galeria cartao entra" data-estado="rascunho">
        <div class="estado-texto">
          <span class="sobretitulo">Rascunho</span>
          <h3><span class="pesado">${numero(enviadas)} de ${numero(dados.fotos.length)}</span><span class="fino"> enviadas</span></h3>
          <div class="estado-fichas"><span class="ficha">${g.nome}</span></div>
        </div>
        <div class="estado-acoes">
          <button
            type="button"
            class="vidro"
            onClick=${() =>
              definirConfirmar({
                titulo: ['Apagar', 'o rascunho.'],
                apoio: 'As prévias enviadas saem do servidor. As fotos daqui ficam.',
                botao: 'Apagar',
                fazer: async () => {
                  try {
                    await servico.apagar(g.id)
                    vinculo.gravar(trabalho.id, null)
                    definirDados(null)
                    definirSituacao('nova')
                  } catch (e) {
                    falhar(e)
                  }
                },
              })}
          >
            Apagar
          </button>
          <button type="button" class="vidro vidro--tinta" disabled=${ocupado || !dados.fotos.length} onClick=${continuarRascunho} data-publicar>
            ${enviadas === dados.fotos.length ? 'Publicar' : 'Enviar as que faltam'}
          </button>
        </div>
      </section>
      ${folhas}
    </div>`
  }

  return html`<div class="galeria">
    <${Painel}
      loja=${loja}
      dados=${dados}
      selecao=${selecao}
      ocupado=${ocupado}
      aoAcao=${acao}
      aoTratar=${() => aoTratarCliente()}
    />
    ${folhas}
  </div>`
}

export { aplicarSelecao }

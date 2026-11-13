// O painel do fotógrafo para a busca por rosto em evento: `PainelEvento({ loja })`, para a tela Entregar encaixar.
//
//   lista      os eventos, com fotos, rostos, buscas e pedidos
//   novo       nome, data, modo ("Com consentimento", o padrão, ou "Busca aberta", só com o aviso aceito), prazo, PIN,
//              marca-d'água e quais fotos (todas do trabalho ou a seleção)
//   detalhe    preparar (rostos + prévias com marca, retomável), publicar (o endereço aparece UMA vez, com o QR e o
//              cartaz A4), no modo com consentimento comparar aqui os pedidos de busca (a cada 30 s com o painel
//              aberto) e subir só as ligações, pedidos de foto, trocar o link, encerrar e apagar
//
// Texto curto; os textos de aviso moram em src/rosto/textos.js. Nada de vetor na tela.

import { cx, html, useEffect, useMemo, useRef, useState } from '../preact.js'
import { Chave, Folha, Numero, Pilulas, Progresso, Segmentado, avisar } from '../componentes/index.js'
import { usarCatalogo } from '../estado.js'
import { qrSvg } from '../telas/entregar/qr.js'
import { comPrazo, TEXTOS } from '../../src/rosto/textos.js'
import { cartazA4 } from './cartaz.js'
import { api, criarPreparo, escolhaDe, esquecerEvento, lembrarEscolha, processarPedidos } from './preparo.js'

const PRAZOS = [7, 14, 30]
const dia = (v, mes = 'short') =>
  v ? new Intl.DateTimeFormat('pt-BR', { day: 'numeric', month: mes }).format(new Date(v.length === 10 ? `${v}T12:00:00` : v)) : ''
const plural = (n, um, varios) => `${(n ?? 0).toLocaleString('pt-BR')} ${n === 1 ? um : varios}`
const MENSAGENS = {
  rede: 'Sem conexão.',
  sem_armazenamento: 'O armazenamento das prévias ainda não foi ligado.',
  sem_banco: 'O banco ainda não foi ligado.',
  sem_sessao: 'Entre de novo.',
  sem_aviso: 'Aceite o aviso da busca aberta antes de publicar.',
  faltam_arquivos: 'Ainda há fotos sem prévia.',
  sem_fotos: 'Prepare as fotos antes.',
  prorrogado: 'O prazo já foi estendido uma vez.',
}
const mensagem = (e) => MENSAGENS[e?.codigo] ?? 'Não deu certo.'

function usarFolhaDeEstilo() {
  if (typeof document === 'undefined' || document.querySelector('link[data-rosto]')) return
  const link = document.createElement('link')
  link.rel = 'stylesheet'
  link.href = new URL('./painel.css', import.meta.url).pathname
  link.dataset.rosto = ''
  document.head.append(link)
}

function Numeros({ e }) {
  const c = e.contagens
  const itens = [
    ['Fotos', c.enviadas, c.fotos > c.enviadas ? `de ${c.fotos}` : null],
    ['Rostos', c.rostos, null],
    [
      e.modo === 'aberta' ? 'Buscas' : 'Pediram',
      e.modo === 'aberta' ? c.buscas : c.pessoas,
      e.modo === 'consentimento' && c.pendentes ? `${c.pendentes} na fila` : null,
    ],
    ['Pedidos', c.pedidos, null],
  ]
  return html`<div class="rosto-numeros">
    ${itens.map(
      ([rotulo, n, extra]) =>
        html`<div class="rosto-numero">
          <b><${Numero} valor=${n ?? 0} /></b><span>${rotulo}</span>${extra && html`<small>${extra}</small>`}
        </div>`,
    )}
  </div>`
}

function Fichas({ e }) {
  return html`<span class="rosto-fichas">
    <span class="ficha">${e.modo === 'aberta' ? 'Busca aberta' : 'Com consentimento'}</span>
    <span class="ficha">${{ rascunho: 'Rascunho', publicado: 'No ar', encerrado: 'Encerrado' }[e.estado]}</span>
    ${e.estado !== 'encerrado' && html`<span class="ficha">até ${dia(e.prazo)}</span>`}
  </span>`
}

// ───────── novo evento ─────────

function Novo({ loja, aoCriar, aoFechar }) {
  const total = usarCatalogo(loja, (c) => c.fotos().length, ['fotos'])
  const selecionadas = usarCatalogo(loja, (c) => c.selecionadas().length, ['selecao', 'fotos'])
  const [nome, setNome] = useState(loja.trabalho?.()?.nome ?? '')
  const [data, setData] = useState('')
  const [modo, setModo] = useState('consentimento')
  const [prazo, setPrazo] = useState(14)
  const [comMarca, setComMarca] = useState(true)
  const [marca, setMarca] = useState('Prova')
  const [quais, setQuais] = useState(selecionadas ? 'selecao' : 'todas')
  const [aceito, setAceito] = useState(false)
  const [indo, setIndo] = useState(false)
  const prazoData = new Date(Date.now() + prazo * 86400000).toISOString()
  const aviso = TEXTOS[modo === 'aberta' ? 'ativacaoAberta' : 'ativacaoConsentimento']
  const pode = nome.trim() && (modo === 'consentimento' || aceito) && (quais === 'todas' ? total : selecionadas) > 0 && !indo
  const criar = async (ev) => {
    ev.preventDefault()
    if (!pode) return
    setIndo(true)
    try {
      const r = await api('POST', '', {
        nome: nome.trim(),
        data: data || null,
        modo,
        prazoDias: prazo,
        marcaDagua: comMarca,
        aviso: modo === 'aberta' ? aviso.versao : TEXTOS.ativacaoConsentimento.versao,
      })
      const ids = quais === 'selecao' ? loja.catalogo.selecionadas().map((f) => f.id) : loja.catalogo.fotos().map((f) => f.id)
      aoCriar(r.evento, { ids, marca: comMarca ? marca.trim() || 'Prova' : null })
    } catch (e) {
      setIndo(false)
      avisar(mensagem(e))
    }
  }
  return html`<form class="rosto-novo" onSubmit=${criar}>
    <label class="campo"
      >Nome do evento<input value=${nome} maxlength="120" placeholder="Corrida da Serra" onInput=${(e) => setNome(e.currentTarget.value)}
    /></label>
    <label class="campo">Data<input type="date" value=${data} onInput=${(e) => setData(e.currentTarget.value)} /></label>
    <${Segmentado}
      rotulo="Modo"
      valor=${modo}
      aoMudar=${(v) => (setModo(v), setAceito(false))}
      opcoes=${[
        { valor: 'consentimento', rotulo: 'Com consentimento' },
        { valor: 'aberta', rotulo: 'Busca aberta' },
      ]}
    />
    <p class="apoio rosto-aviso">${comPrazo(aviso.corpo, prazoData)}</p>
    ${
      modo === 'aberta' &&
      html`<label class="rosto-caixa"
        ><input type="checkbox" checked=${aceito} onChange=${(e) => setAceito(e.currentTarget.checked)} /><span>${aviso.caixa}</span></label
      >`
    }
    <div class="rosto-linha">
      <span class="rosto-rotulo">Prazo</span>
      <${Pilulas} rotulo="Prazo" valor=${prazo} aoMudar=${(v) => v && setPrazo(v)} opcoes=${PRAZOS.map((d) => ({ valor: d, rotulo: `${d} dias` }))} />
    </div>
    <div class="rosto-linha">
      <span class="rosto-rotulo">Fotos</span>
      <${Pilulas}
        rotulo="Fotos"
        valor=${quais}
        aoMudar=${(v) => v && setQuais(v)}
        opcoes=${[
          { valor: 'todas', rotulo: 'Todas', contagem: total },
          { valor: 'selecao', rotulo: 'Seleção', contagem: selecionadas },
        ]}
      />
    </div>
    <${Chave} ligada=${comMarca} aoMudar=${setComMarca} rotulo="Marca-d'água" />
    ${comMarca && html`<label class="campo">Texto da marca<input value=${marca} maxlength="40" onInput=${(e) => setMarca(e.currentTarget.value)} /></label>`}
    <div class="rosto-acoes">
      <button type="button" class="vidro" onClick=${aoFechar}>Cancelar</button>
      <button type="submit" class="vidro vidro--tinta" disabled=${!pode}>${indo ? 'Criando' : 'Criar evento'}</button>
    </div>
  </form>`
}

// ───────── o endereço (uma vez), o QR e o cartaz ─────────

function Endereco({ endereco, evento }) {
  const qr = useMemo(() => qrSvg(endereco, { rotulo: 'QR do evento' }), [endereco])
  const copiar = async (texto, rotulo) => {
    try {
      await navigator.clipboard.writeText(texto)
      avisar(`${rotulo} copiado.`)
    } catch {
      avisar('Não deu para copiar.')
    }
  }
  const baixar = async () => {
    const blob = await cartazA4({ endereco, nome: evento.nome, data: evento.data, modo: evento.modo, prazo: evento.prazo })
    const a = document.createElement('a')
    a.href = URL.createObjectURL(blob)
    a.download = `cartaz-${
      evento.nome
        .toLowerCase()
        .replace(/[^a-z0-9]+/g, '-')
        .replace(/^-|-$/g, '') || 'evento'
    }.png`
    a.click()
    setTimeout(() => URL.revokeObjectURL(a.href), 4000)
  }
  return html`<div class="cartao rosto-endereco">
    <div class="rosto-qr" dangerouslySetInnerHTML=${{ __html: qr }}></div>
    <div class="rosto-endereco-texto">
      <p class="sobretitulo">Guarde agora</p>
      <p class="rosto-url">${endereco}</p>
      <p class="apoio">Este endereço não aparece de novo.</p>
      <div class="rosto-acoes">
        <button type="button" class="vidro vidro--tinta" onClick=${() => copiar(endereco, 'Endereço')}>Copiar</button>
        <button type="button" class="vidro" onClick=${baixar}>Cartaz A4</button>
        <button type="button" class="rosto-texto" onClick=${() => copiar(comPrazo(TEXTOS.regulamento.corpo, evento.prazo), 'Texto')}>
          Texto do regulamento
        </button>
      </div>
    </div>
  </div>`
}

// ───────── detalhe ─────────

function Detalhe({ loja, id, inicial, aoVoltar, aoMudar }) {
  const [e, setE] = useState(null)
  const [preparo, setPreparo] = useState(null)
  const [endereco, setEndereco] = useState(null)
  const [pin, setPin] = useState('')
  const [pedidos, setPedidos] = useState(null)
  const [fila, setFila] = useState(null)
  const preparador = useRef(null)

  const recarregar = async () => {
    try {
      const r = await api('GET', `/${id}`)
      setE(r.evento)
      aoMudar?.()
      return r
    } catch (f) {
      avisar(mensagem(f))
      return null
    }
  }
  useEffect(() => {
    recarregar().then((r) => r && inicial && comecar(r.evento, inicial))
    return () => preparador.current?.pausar()
  }, [id])

  // com consentimento e no ar: compara os pedidos de busca aqui, a cada 30 s com o painel aberto
  useEffect(() => {
    if (!e || e.modo !== 'consentimento' || e.estado !== 'publicado') return
    let vivo = true
    const vez = async () => {
      try {
        const r = await processarPedidos(e)
        if (!vivo) return
        setFila(r)
        if (r.pessoas) recarregar()
      } catch (erro) {
        console.warn('rosto: comparar', erro?.message)
        /* tenta na próxima */
      }
    }
    vez()
    const t = setInterval(vez, 30000)
    return () => {
      vivo = false
      clearInterval(t)
    }
  }, [e?.id, e?.estado])

  function comecar(ev, { ids, marca }) {
    lembrarEscolha(ev.id, { ids, marca })
    preparador.current?.pausar()
    preparador.current = criarPreparo({
      loja,
      evento: ev,
      ids,
      marca,
      aoMudar: (s) => {
        setPreparo(s)
        if (s.situacao !== 'rodando') recarregar()
      },
    })
    preparador.current.comecar()
  }
  // continuar de onde parou: as fotos e a marca escolhidas ao criar (guardadas neste computador); sem elas, o trabalho
  const continuar = () => {
    const antes = escolhaDe(e.id)
    const existem = new Set(loja.catalogo.fotos().map((f) => f.id))
    const ids = (antes?.ids ?? [...existem]).filter((x) => existem.has(x))
    comecar(e, { ids, marca: antes ? antes.marca : e.marcaDagua ? 'Prova' : null })
  }

  const publicar = async () => {
    try {
      const r = await api('POST', `/${id}/publicar`, pin ? { pin } : {})
      setEndereco(r.endereco)
      setE(r.evento)
      aoMudar?.()
    } catch (f) {
      avisar(mensagem(f))
    }
  }
  const trocar = async () => {
    try {
      const r = await api('POST', `/${id}/link`, pin ? { pin } : {})
      setEndereco(r.endereco)
      setE(r.evento)
    } catch (f) {
      avisar(mensagem(f))
    }
  }
  const encerrar = async () => {
    if (!confirm('Encerrar o evento? O link para de funcionar e as assinaturas somem agora.')) return
    try {
      await api('POST', `/${id}/encerrar`)
      await esquecerEvento(id)
      setEndereco(null)
      recarregar()
    } catch (f) {
      avisar(mensagem(f))
    }
  }
  const apagar = async () => {
    if (!confirm('Apagar o evento, as prévias e os pedidos?')) return
    try {
      await api('DELETE', `/${id}`)
      await esquecerEvento(id)
      aoVoltar(true)
    } catch (f) {
      avisar(mensagem(f))
    }
  }
  const verPedidos = async () => {
    try {
      setPedidos((await api('GET', `/${id}/pedidos`)).pedidos)
    } catch (f) {
      avisar(mensagem(f))
    }
  }

  if (!e) return html`<div class="rosto-detalhe"><${Progresso} valor=${null} rotulo="Abrindo" /></div>`
  const c = e.contagens
  const rodando = preparo?.situacao === 'rodando'
  const prontoParaPublicar = e.estado === 'rascunho' && c.fotos > 0 && c.enviadas === c.fotos && !rodando
  return html`<div class="rosto-detalhe">
    <header class="rosto-cabeca">
      <button type="button" class="rosto-texto" onClick=${() => aoVoltar(false)}>Eventos</button>
      <h3>${e.nome}</h3>
      <${Fichas} e=${e} />
    </header>
    <${Numeros} e=${e} />
    ${
      e.estado === 'rascunho' &&
      html`<div class="cartao rosto-passo">
        ${
          preparo &&
          html`<${Progresso} valor=${preparo.total ? preparo.feitas / preparo.total : 0} rotulo="Preparando as fotos" />
            <p class="apoio">
              ${plural(preparo.feitas, 'foto pronta', 'fotos prontas')} de
              ${preparo.total}${preparo.porFoto ? ` · ${(preparo.porFoto / 1000).toFixed(1)} s por foto` : ''}
              ${preparo.falhas ? ` · ${plural(preparo.falhas, 'falha', 'falhas')}` : ''}${preparo.erro ? ` · ${mensagem({ codigo: preparo.erro })}` : ''}
            </p>`
        }
        <div class="rosto-acoes">
          ${
            rodando
              ? html`<button type="button" class="vidro" onClick=${() => preparador.current?.pausar()}>Pausar</button>`
              : html`<button type="button" class=${cx('vidro', !prontoParaPublicar && 'vidro--tinta')} onClick=${continuar}>
                  ${c.fotos ? 'Continuar' : 'Preparar fotos'}
                </button>`
          }
          ${
            prontoParaPublicar &&
            html`<label class="campo rosto-pin"
                >PIN (opcional)<input inputmode="numeric" maxlength="8" value=${pin} onInput=${(ev) => setPin(ev.currentTarget.value.replace(/\D/g, ''))}
              /></label>
              <button type="button" class="vidro vidro--tinta" onClick=${publicar} disabled=${pin && pin.length < 4}>Publicar</button>`
          }
        </div>
      </div>`
    }
    ${endereco && html`<${Endereco} endereco=${endereco} evento=${e} />`}
    ${
      e.estado === 'publicado' &&
      !endereco &&
      html`<div class="cartao rosto-passo">
        <p class="apoio">Link no ar${e.link ? ` · ${plural(e.link.aberturas, 'abertura', 'aberturas')}` : ''}${e.link?.temPin ? ' · com PIN' : ''}.</p>
        <div class="rosto-acoes">
          <label class="campo rosto-pin"
            >PIN (opcional)<input inputmode="numeric" maxlength="8" value=${pin} onInput=${(ev) => setPin(ev.currentTarget.value.replace(/\D/g, ''))}
          /></label>
          <button type="button" class="vidro" onClick=${trocar} disabled=${pin && pin.length < 4}>Trocar link</button>
        </div>
      </div>`
    }
    ${
      e.modo === 'consentimento' &&
      e.estado === 'publicado' &&
      fila &&
      html`<p class="apoio rosto-fila">
        Os pedidos de busca são comparados aqui, neste
        computador.${fila.faltam ? ` Faltam os rostos de ${plural(fila.faltam, 'foto', 'fotos')} neste aparelho.` : ''}
      </p>`
    }
    <div class="rosto-acoes rosto-acoes--fim">
      ${c.pedidos > 0 && html`<button type="button" class="vidro" onClick=${verPedidos}>Ver pedidos</button>`}
      ${e.estado === 'publicado' && html`<button type="button" class="rosto-texto" onClick=${encerrar}>Encerrar</button>`}
      <button type="button" class="rosto-texto rosto-perigo" onClick=${apagar}>Apagar</button>
    </div>
    <${Folha} aberta=${!!pedidos} aoFechar=${() => setPedidos(null)} titulo=${['Pedidos', 'de foto']}>
      <ul class="rosto-pedidos">
        ${(pedidos ?? []).map(
          (p) =>
            html`<li>
              <b>${p.nome}</b> <span class="apoio">${p.contato} · ${dia(p.em)}</span>
              <span class="rosto-nomes">${p.fotos.map((f) => f.nome).join(', ')}</span>
            </li>`,
        )}
      </ul>
    </${Folha}>
  </div>`
}

const resumoDe = (e) =>
  [plural(e.contagens.enviadas, 'foto', 'fotos'), plural(e.contagens.rostos, 'rosto', 'rostos'), plural(e.contagens.pedidos, 'pedido', 'pedidos')].join(' · ')

// ───────── o painel ─────────

export function PainelEvento({ loja }) {
  usarFolhaDeEstilo()
  const [eventos, setEventos] = useState(null)
  const [aberto, setAberto] = useState(null)
  const [novo, setNovo] = useState(false)
  const [inicial, setInicial] = useState(null)
  const [erro, setErro] = useState(null)
  const carregar = async () => {
    try {
      setEventos((await api('GET', '')).eventos)
      setErro(null)
    } catch (e) {
      setErro(mensagem(e))
    }
  }
  useEffect(() => {
    carregar()
  }, [])

  if (aberto)
    return html`<section class="rosto-painel">
      <${Detalhe} loja=${loja} id=${aberto} inicial=${inicial} aoVoltar=${() => (setAberto(null), setInicial(null), carregar())} aoMudar=${carregar} />
    </section>`
  return html`<section class="rosto-painel" aria-labelledby="rosto-titulo">
    <header class="rosto-cabeca">
      <div>
        <h3 id="rosto-titulo"><span class="fino">Busca </span><span class="pesado">por rosto</span></h3>
        <p class="apoio">Cada convidado acha as próprias fotos com uma selfie.</p>
      </div>
      <button type="button" class="vidro vidro--tinta" onClick=${() => setNovo(true)}>Novo evento</button>
    </header>
    ${erro && html`<p class="apoio">${erro}</p>`}
    ${eventos && !eventos.length && !erro && html`<p class="apoio rosto-vazio">Nenhum evento ainda.</p>`}
    <ul class="rosto-lista">
      ${(eventos ?? []).map(
        (e) =>
          html`<li>
            <button type="button" class="cartao rosto-item" onClick=${() => setAberto(e.id)}>
              <span class="rosto-item-nome">${e.nome}${e.data ? html` <span class="apoio">· ${dia(e.data)}</span>` : ''}</span>
              <${Fichas} e=${e} />
              <span class="apoio">${resumoDe(e)}</span>
            </button>
          </li>`,
      )}
    </ul>
    <${Folha} aberta=${novo} aoFechar=${() => setNovo(false)} titulo=${['Novo', 'evento']}>
      ${
        novo &&
        html`<${Novo}
          loja=${loja}
          aoFechar=${() => setNovo(false)}
          aoCriar=${(ev, ini) => {
            setNovo(false)
            setInicial(ini)
            setAberto(ev.id)
          }}
        />`
      }
    </${Folha}>
  </section>`
}

export default PainelEvento

// Cartões → Backup Automático (docs/BACKUP-AUTOMATICO.md): o projeto configurado uma vez; depois é só espetar o cartão.
// Na primeira vez, um toque diz de quem ele é ("Ana" + "FX30") e para onde vai; nas próximas, passa sozinho para
// Diária NN / Cenas (vídeo) ou Fotos / Dono - Câmera / Cartão NN em cada destino, compara, confere e diz se pode formatar.
// Motor em src/backup/ (estado pelo SSE 'backup'). Visual no padrão do kit (docs/UI-KIT.md).
import { html, useEffect, useState } from '/vendor/preact-htm.js'
import { useStore } from '../lib/store.js'
import { api, attempt } from '../lib/api.js'
import { bytes, count, plural, tildify, baseName } from '../lib/format.js'
import { cx, storage } from '../lib/ui.js'
import { navigate } from '../lib/router.js'
import { abrirNoSynquei, openExternal, pickFolderPath } from '../lib/desktop.js'
import { Icon } from './icons.js'
import { Button, Checkbox, Switch } from './common.js'
import { Barra, BotaoGrande, Destaque, GraficoVelocidade, Item, Linha, Linhas, Pagina, Passo, Pilulas, Resumo, Stats, Vazio } from './kit.js'
import { useLocalRoots } from './local-picker.js'
import { Fonte } from './comparar-partes.js'
import { duracao } from './discos.js'
import { abrirPreviaCartao } from './previa-cartao.js'

const FRASE = 'Espete o cartão: o backup passa sozinho, organizado por diária e por dono.'
const post = (url, body = {}) => attempt(api.post(url, body))

const ESTADO = {
  lendo: { texto: 'Lendo o cartão', tom: 'down', icone: 'refresh' },
  pedido: { texto: 'De quem é?', tom: 'warn', icone: 'user' },
  fila: { texto: 'Na fila', tom: 'down', icone: 'clock' },
  copiando: { texto: 'Passando agora', tom: 'up', icone: 'copy' },
  ok: { texto: 'OK, pode formatar', tom: 'ok', icone: 'circle-check' },
  falta: { texto: 'Tem pendência', tom: 'warn', icone: 'warning' },
  erro: { texto: 'Parou', tom: 'err', icone: 'circle-x' },
  cancelado: { texto: 'Parado', tom: 'warn', icone: 'x' },
  ignorado: { texto: 'Ignorado', tom: 'neutro', icone: 'eye-off' },
  disco: { texto: 'Plugado', tom: 'neutro', icone: 'disk' },
  pronto: { texto: 'Pronto para copiar', tom: 'down', icone: 'sdcard' },
  destino: { texto: 'Destino deste projeto', tom: 'neutro', icone: 'disk' },
  ejetado: { texto: 'Ejetado · pode tirar', tom: 'ok', icone: 'check' },
}

// O que o projeto passa e para onde vai o cartão de cada dono (src/backup/midia.js).
const MIDIAS = [
  { id: 'videos', rotulo: 'Vídeos', icone: 'film', sub: 'Em Cenas' },
  { id: 'fotos', rotulo: 'Fotos', icone: 'photo', sub: 'Em Fotos' },
  { id: 'tudo', rotulo: 'Os dois', icone: 'copy', sub: 'Vídeo em Cenas, foto em Fotos' },
]
const SECOES = [
  { id: 'cenas', rotulo: 'Cenas', icone: 'film' },
  { id: 'fotos', rotulo: 'Fotos', icone: 'photo' },
  { id: 'separar', rotulo: 'Separar', icone: 'copy', dica: 'Vídeo em Cenas, foto em Fotos' },
]
const pastasDaMidia = (m) => (m === 'videos' ? 'Cenas' : m === 'fotos' ? 'Fotos' : 'Cenas · Fotos')
const rotuloSecao = (s) => (s === 'cenas' ? 'Cenas' : s === 'fotos' ? 'Fotos' : 'Cenas · Fotos')
const TIPOS = [
  { id: 'videos', rotulo: 'Vídeos', icone: 'film' },
  { id: 'fotos', rotulo: 'Fotos', icone: 'photo' },
  { id: 'outros', rotulo: 'Outros', icone: 'doc', dica: 'XML, áudio e índice da câmera' },
]

/** Um grupo de chips (um só escolhido). */
function Chips({ opcoes, valor, onChange, label }) {
  return html`<div class="bk-donos-escolha" role="radiogroup" aria-label=${label}>
    ${opcoes.map(
      (o) => html`<button type="button" role="radio" aria-checked=${valor === o.id ? 'true' : 'false'} class=${cx('bk-dono-btn', valor === o.id && 'is-on')} onClick=${() => onChange(o.id)} title=${o.dica || o.sub || ''}>
        <${Icon} name=${o.icone} size=${14} />${o.rotulo}
      </button>`,
    )}
  </div>`
}

/** Ação que pede um segundo toque (excluir, limpar): nada some com um clique só. */
function Confirma({ icone, children, pergunta, sim, onSim, disabled, size = 'sm' }) {
  const [aberto, setAberto] = useState(false)
  const [ocupado, setOcupado] = useState(false)
  if (!aberto) return html`<${Button} size=${size} variant="ghost" icon=${icone} onClick=${() => setAberto(true)} disabled=${disabled}>${children}</${Button}>`
  return html`<span class="bk-confirma" role="group" aria-label=${pergunta}>
    <span class="bk-confirma-txt">${pergunta}</span>
    <${Button} size=${size} variant="ghost" onClick=${() => setAberto(false)} disabled=${ocupado}>Não</${Button}>
    <${Button} size=${size} icon=${icone} class="bk-confirma-sim" disabled=${ocupado} onClick=${async () => {
      setOcupado(true)
      await onSim()
      setOcupado(false)
      setAberto(false)
    }}>${sim}</${Button}>
  </span>`
}

// ───── "escolher o que passar" ─────

/**
 * O que tem no cartão (por tipo e as pastas com vídeo ou foto) e o que a pessoa quer passar desta vez. Tudo marcado no
 * começo. `onPronto(escolha)`: { tipos, pastas } (pastas null = todas).
 */
function Escolha({ caminho, nome, inicial, midia = 'tudo', onPronto, onCancelar, confirmar = 'Passar o que marquei' }) {
  const [c, setC] = useState(null)
  const [erro, setErro] = useState(null)
  const [tipos, setTipos] = useState(inicial?.tipos || null)
  const [pastas, setPastas] = useState(inicial?.pastas || null)
  useEffect(() => {
    let vivo = true
    attempt(api.post('/api/backup/conteudo', { caminho })).then((r) => {
      if (!vivo) return
      if (!r) return setErro('Não consegui ler o cartão.')
      setC(r)
      const daMidia = (t) => (midia === 'videos' ? t !== 'fotos' : midia === 'fotos' ? t === 'fotos' : true)
      setTipos((x) => x || TIPOS.map((t) => t.id).filter((t) => r.tipos[t].arquivos && daMidia(t)))
      setPastas((x) => x || r.pastas.map((p) => p.pasta))
    })
    return () => (vivo = false)
  }, [caminho])
  const marcar = (lista, id, on) => (on ? [...new Set([...lista, id])] : lista.filter((x) => x !== id))
  const visiveis = c ? TIPOS.filter((t) => c.tipos[t.id].arquivos) : []
  const pronto = c && tipos?.length && (!c.pastas.length || pastas?.length)
  const enviar = () => onPronto({ tipos, pastas: c.pastas.length && pastas.length < c.pastas.length ? pastas : null })
  return html`<section class="bk-escolha k-entra" aria-label=${`O que passar de ${nome}`}>
    <div class="bk-escolha-topo">
      <span class="k-rot">O que passar de “${nome}”</span>
      <span class="bk-escolha-dica">O que ficar de fora continua no cartão.</span>
    </div>
    ${erro ? html`<p class="bk-vazio-txt">${erro}</p>` : !c ? html`<${Barra} p=${null} label="Lendo o cartão" />` : null}
    ${c
      ? html`<div class="bk-escolha-tipos">
            ${visiveis.map(
              (t) => html`<label class=${cx('bk-escolha-tipo', tipos?.includes(t.id) && 'is-on')} title=${t.dica || ''}>
                <${Checkbox} checked=${tipos?.includes(t.id)} onChange=${(on) => setTipos(marcar(tipos || [], t.id, on))} label=${t.rotulo} />
                <${Icon} name=${t.icone} size=${15} />
                <b>${t.rotulo}</b>
                <span>${count(c.tipos[t.id].arquivos)} · ${bytes(c.tipos[t.id].bytes)}</span>
              </label>`,
            )}
          </div>
          ${c.pastas.length > 1
            ? html`<details class="bk-escolha-pastas">
                <summary>Pastas do cartão <span>${pastas ? `${pastas.length} de ${c.pastas.length}` : ''}</span></summary>
                <ul>
                  ${c.pastas.map(
                    (p) => html`<li><label class="check-label">
                      <${Checkbox} checked=${pastas?.includes(p.pasta)} onChange=${(on) => setPastas(marcar(pastas || [], p.pasta, on))} label=${p.pasta || 'Raiz do cartão'} />
                      <span class="mono-path">${p.pasta || 'Raiz do cartão'}</span>
                      <span class="sub">${[p.videos ? plural(p.videos, 'vídeo', 'vídeos') : null, p.fotos ? plural(p.fotos, 'foto', 'fotos') : null, bytes(p.bytes)].filter(Boolean).join(' · ')}</span>
                    </label></li>`,
                  )}
                </ul>
              </details>`
            : null}`
      : null}
    <div class="bk-dono-acoes">
      <${Button} size="sm" variant="ghost" onClick=${onCancelar}>Cancelar</${Button}>
      <${Button} size="sm" icon="check" onClick=${enviar} disabled=${!pronto}>${confirmar}</${Button}>
    </div>
  </section>`
}

const horaDe = (iso) => {
  try {
    return new Date(iso).toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' })
  } catch {
    return ''
  }
}

// ───── criar / editar o projeto ─────

function FormProjeto({ inicial, tipos = [], onPronto, onCancelar, onExcluido, topo }) {
  const roots = useLocalRoots()
  const [nome, setNome] = useState(inicial?.nome || '')
  const [destinos, setDestinos] = useState(inicial?.destinos?.length ? inicial.destinos.map((d) => d.caminho) : [null])
  const [ejetar, setEjetar] = useState(!!inicial?.ejetar)
  const [tipo, setTipo] = useState(inicial?.tipo || '')
  // Projeto novo pergunta o que passa (nada escolhido no começo); o antigo já passava tudo.
  const [midia, setMidia] = useState(inicial ? inicial.midia || 'tudo' : null)
  const [synquei, setSynquei] = useState(inicial ? inicial.synquei !== false : true)
  const [precolor, setPrecolor] = useState(!!inicial?.precolor)
  const [levarProxies, setLevarProxies] = useState(!!inicial?.levarProxies)
  const [ligar, setLigar] = useState(true)
  const [ocupado, setOcupado] = useState(false)
  const ds = destinos.filter(Boolean)
  const escolher = (atual) => pickFolderPath({ title: 'Onde guardar o backup?', defaultPath: atual || undefined })
  const salvar = async () => {
    setOcupado(true)
    const tipoFinal = synquei ? tipo : ''
    const r = inicial ? await post('/api/backup/projeto', { id: inicial.id, nome, destinos: ds, ejetar, tipo: tipoFinal, midia, synquei, precolor, levarProxies }) : await post('/api/backup/projetos', { nome, destinos: ds, ejetar, ligar, tipo: tipoFinal, midia, synquei, precolor, levarProxies })
    setOcupado(false)
    if (r) onPronto?.()
  }
  const exemplo = [ds[0] ? baseName(ds[0]) : 'HD', nome.trim() || 'Projeto', 'Diária 01', pastasDaMidia(midia || 'tudo'), 'Ana - FX30', 'Cartão 01']
  const dica = !nome.trim() ? 'Falta o nome do projeto' : !midia ? 'Falta dizer o que vai passar' : !ds.length ? 'Falta escolher onde guardar' : ds.length === 1 ? 'Com dois destinos você já sai com o backup' : `${ds.length} destinos ao mesmo tempo`
  const lado = html`<${Resumo} titulo="Como fica no disco">
      <div class="k-caixa bk-arvore" aria-label="Pastas">
        ${exemplo.map(
          (p, i) => html`<div class="bk-arvore-linha" style=${`--n:${i}`}>
            <${Icon} name=${i === 0 ? 'disk' : i === exemplo.length - 1 ? 'sdcard' : 'folder'} size=${14} />
            <span class=${cx(i >= 4 && 'is-dono')}>${p}</span>
          </div>`,
        )}
      </div>
      <p class="cp-resumo-txt">O dono do cartão é perguntado só na primeira vez que ele é espetado.</p>
    </${Resumo}>
    <${BotaoGrande} icone="check" onClick=${salvar} disabled=${ocupado || !nome.trim() || !ds.length || !midia} dica=${dica}>${inicial ? 'Salvar' : 'Criar o projeto'}</${BotaoGrande}>
    ${onCancelar ? html`<${Button} icon="x" onClick=${onCancelar} class="cp-lado-btn">Cancelar</${Button}>` : null}
    ${inicial
      ? html`<div class="bk-excluir">
          <${Confirma} icone="trash" pergunta="Excluir o projeto? Os arquivos nos HDs ficam." sim="Excluir" onSim=${async () => (await post('/api/backup/apagar', { id: inicial.id })) && onExcluido?.()}>Excluir projeto</${Confirma}>
        </div>`
      : null}`

  return html`<${Pagina} titulo="Cartões" frase=${FRASE} class="page-backup" lado=${lado}>
    ${topo}
    <${Passo} n="1" titulo=${inicial ? 'O projeto' : 'Novo projeto'} frase="O nome vira a pasta principal em cada destino." i=${2}>
      <input class="input bk-nome" type="text" maxlength="120" placeholder="ex.: SERHS · Evento de verão" value=${nome} onInput=${(e) => setNome(e.currentTarget.value)} aria-label="Nome do projeto" />
    </${Passo}>
    <${Passo} n="2" titulo="O que vai passar" frase="Vídeo vai para Cenas, foto para Fotos." i=${3}>
      <${Chips} opcoes=${MIDIAS} valor=${midia} onChange=${setMidia} label="O que vai passar do cartão" />
    </${Passo}>
    <${Passo} n="3" titulo="Para onde" sub=${ds.length > 1 ? `${ds.length} destinos` : 'destino'} frase="O HD principal e os backups. O cartão é lido uma vez e gravado em todos." i=${4}>
      <div class="cp-destinos">
        ${destinos.map(
          (d, i) => html`<${Fonte}
            key=${i}
            icone="disk"
            tom="up"
            rotulo=${destinos.length > 1 ? (i === 0 ? 'Principal' : `Backup ${i}`) : null}
            valor=${d ? baseName(d) || d : null}
            caminho=${d ? tildify(d, roots?.home) : ''}
            vazio=${i === 0 ? 'Escolher o HD principal' : `Escolher o backup ${i}`}
            dica="O HD ou a pasta onde o projeto fica"
            onTrocar=${async () => {
              const p = await escolher(d)
              if (p) setDestinos(destinos.map((x, k) => (k === i ? p : x)))
            }}
            onSoltarPasta=${(p) => setDestinos(destinos.map((x, k) => (k === i ? p : x)))}
            onTirar=${destinos.length > 1 ? () => setDestinos(destinos.filter((_, k) => k !== i)) : d ? () => setDestinos([null]) : null}
            tirarLabel="Tirar este destino"
          />`,
        )}
        ${destinos.length < 4
          ? html`<button type="button" class="cp-mais" onClick=${() => setDestinos([...destinos, null])}><span><${Icon} name="plus" size=${14} strokeWidth=${2.2} /></span> Outro destino (backup)</button>`
          : null}
      </div>
    </${Passo}>
    <${Passo} n="4" titulo="No fim" frase="Cada arquivo copiado é lido de novo no destino e conferido." i=${5}>
      <${Linhas}>
        ${inicial
          ? null
          : html`<${Linha} titulo="Começar sozinho ao espetar" sub="O cartão conhecido passa direto; o novo pergunta de quem é.">
              <${Switch} checked=${ligar} label="Começar sozinho ao espetar" onChange=${setLigar} />
            </${Linha}>`}
        <${Linha} titulo="Ejetar o cartão ao terminar" sub="Só quando estiver tudo certo em todos os destinos.">
          <${Switch} checked=${ejetar} label="Ejetar o cartão ao terminar" onChange=${setEjetar} />
        </${Linha}>
        <${Linha} titulo="Levar os proxies da câmera" sub=${levarProxies ? 'LRV, THM e afins vão junto com o material.' : 'Desligado: LRV, THM e arquivos do sistema ficam no cartão. Não seguram o “pode formatar”.'}>
          <${Switch} checked=${levarProxies} label="Levar os proxies da câmera" onChange=${setLevarProxies} />
        </${Linha}>
        <${Linha} titulo="Frames com cor ao terminar o cartão" sub=${precolor ? 'Cartão OK: um frame por clipe, com a LUT e o ajuste da câmera daquele dono (Estúdio › Frames).' : 'Desligado: os frames saem quando você tocar em “Frames do cartão”.'}>
          <${Switch} checked=${precolor} label="Frames com cor ao terminar o cartão" onChange=${setPrecolor} />
        </${Linha}>
        <${Linha} titulo="Usar o Synquei" sub=${synquei ? 'No fim, “Preparar no Synquei” organiza a mídia no DaVinci.' : 'Desligado: sem o botão do Synquei.'}>
          <${Switch} checked=${synquei} label="Usar o Synquei" onChange=${setSynquei} />
        </${Linha}>
        ${synquei && tipos.length
          ? html`<${Linha} titulo="No Synquei" sub="O tipo de projeto já chega escolhido.">
              <span class="select bk-tipo"><select value=${tipo} onChange=${(e) => setTipo(e.currentTarget.value)} aria-label="Tipo de projeto no Synquei">
                <option value="">Escolher lá</option>
                ${tipos.map((t) => html`<option value=${t.id}>${t.label}</option>`)}
              </select><${Icon} name="chevron-down" size=${12} /></span>
            </${Linha}>`
          : null}
      </${Linhas}>
    </${Passo}>
  </${Pagina}>`
}

const pastaPadrao = (nome, camera) => [nome.trim() || 'Nome', camera.trim()].filter(Boolean).join(' - ')

// ───── "de quem é este cartão?" ─────

function Pedido({ p, donos, i, midia = 'tudo' }) {
  const [donoId, setDonoId] = useState(p.donoSugerido || null)
  const [novo, setNovo] = useState(!donos.length)
  const [nome, setNome] = useState('')
  const [camera, setCamera] = useState(p.camera?.curto && p.camera.curto !== p.camera.marca ? p.camera.curto : p.camera?.curto || '')
  const [pasta, setPasta] = useState('')
  const [secao, setSecao] = useState(p.secaoSugerida || 'cenas')
  const [escolha, setEscolha] = useState(null)
  const [escolhendo, setEscolhendo] = useState(false)
  const [ocupado, setOcupado] = useState(false)
  const responder = async (extra) => {
    setOcupado(true)
    await post('/api/backup/responder', { caminho: p.caminho, ...extra, ...(extra.ignorar ? {} : { secao: midia === 'tudo' ? secao : undefined, escolha }) })
    setOcupado(false)
  }
  const ct = p.conteudo
  const temDos = ct ? [ct.videos?.arquivos ? plural(ct.videos.arquivos, 'vídeo', 'vídeos') : null, ct.fotos?.arquivos ? plural(ct.fotos.arquivos, 'foto', 'fotos') : null].filter(Boolean) : []
  const pronto = novo ? !!nome.trim() : !!donoId
  const cam = p.camera?.modelo ? `${p.camera.curto} (${p.camera.modelo})` : p.camera?.curto
  return html`<section class="bk-pedido k-entra" style=${`--i:${i}`} role="alertdialog" aria-label=${`Cartão novo: ${p.nome}`}>
    <div class="bk-pedido-topo">
      <span class="bk-pedido-ic" aria-hidden="true"><${Icon} name="sdcard" size=${22} strokeWidth=${1.8} /></span>
      <div class="bk-pedido-txt">
        <span class="k-rot">Cartão novo · um toque só</span>
        <h2>De quem é o cartão “${p.nome}”?</h2>
        <p>${[p.capacidade ? bytes(p.capacidade) : null, cam ? `câmera ${cam}` : null].filter(Boolean).join(' · ') || 'Nas próximas vezes ele passa sozinho.'}</p>
      </div>
    </div>
    ${donos.length
      ? html`<div class="bk-donos-escolha" role="radiogroup" aria-label="Dono do cartão">
          ${donos.map(
            (d) => html`<button type="button" role="radio" aria-checked=${!novo && donoId === d.id ? 'true' : 'false'} class=${cx('bk-dono-btn', !novo && donoId === d.id && 'is-on')} onClick=${() => (setNovo(false), setDonoId(d.id))}>
              <${Icon} name="user" size=${14} />${d.rotulo}${p.donoSugerido === d.id ? html`<em>mesma câmera</em>` : null}
            </button>`,
          )}
          <button type="button" role="radio" aria-checked=${novo ? 'true' : 'false'} class=${cx('bk-dono-btn is-novo', novo && 'is-on')} onClick=${() => setNovo(true)}><${Icon} name="plus" size=${14} />Outra pessoa</button>
        </div>`
      : null}
    ${novo
      ? html`<div class="bk-novo-dono">
          <label><span class="k-rot">Nome</span><input class="input" type="text" maxlength="60" placeholder="ex.: Ana" value=${nome} onInput=${(e) => setNome(e.currentTarget.value)} /></label>
          <label><span class="k-rot">Câmera</span><input class="input" type="text" maxlength="40" placeholder="ex.: FX30" value=${camera} onInput=${(e) => setCamera(e.currentTarget.value)} /></label>
          <label class="bk-novo-pasta-campo"><span class="k-rot">Nome da pasta <em>opcional</em></span><input class="input mono-path" type="text" maxlength="80" placeholder=${pastaPadrao(nome, camera)} value=${pasta} onInput=${(e) => setPasta(e.currentTarget.value)} aria-label="Nome da pasta do dono" /></label>
          <span class="bk-novo-pasta mono-path">${midia === 'tudo' ? rotuloSecao(secao) : pastasDaMidia(midia)} / ${pasta.trim() || pastaPadrao(nome, camera)} / Cartão 01</span>
        </div>`
      : null}
    ${midia === 'tudo'
      ? html`<div class="bk-pedido-secao">
          <span class="k-rot">Vai para${temDos.length ? html` <em>tem ${temDos.join(' e ')}</em>` : null}</span>
          <${Chips} opcoes=${SECOES} valor=${secao} onChange=${setSecao} label="Pasta do cartão" />
        </div>`
      : null}
    ${escolhendo
      ? html`<${Escolha} caminho=${p.caminho} nome=${p.nome} inicial=${escolha} midia=${midia} confirmar="Usar esta escolha" onCancelar=${() => setEscolhendo(false)} onPronto=${(e) => (setEscolha(e), setEscolhendo(false))} />`
      : null}
    <div class="bk-pedido-acoes">
      <${Button} variant="ghost" icon="eye-off" onClick=${() => responder({ ignorar: true })} disabled=${ocupado}>Ignorar este disco</${Button}>
      <${Button} variant="ghost" icon="list" onClick=${() => setEscolhendo(true)} disabled=${ocupado || escolhendo} title="Só uma parte do cartão">${escolha ? 'Escolha feita · mudar' : 'Escolher o que passar'}</${Button}>
      <button type="button" class="k-botao bk-comecar" disabled=${ocupado || !pronto} onClick=${() => responder(novo ? { nome, camera, pasta } : { donoId })}>
        <${Icon} name="copy" size=${18} strokeWidth=${2} />${escolha ? 'Passar o escolhido' : 'Começar o backup'}
      </button>
    </div>
  </section>`
}

// ───── os donos da diária (com a pasta de cada um) ─────

function Dono({ d, k, bloqueado, midia = 'tudo' }) {
  const [editando, setEditando] = useState(false)
  const [nome, setNome] = useState(d.nome || '')
  const [camera, setCamera] = useState(d.camera || '')
  const [pasta, setPasta] = useState(d.pastaPropria ? d.pasta : '')
  const [secao, setSecao] = useState(d.secao || 'separar')
  const [ocupado, setOcupado] = useState(false)
  const abrir = () => {
    setSecao(d.secao || 'separar')
    setNome(d.nome || '')
    setCamera(d.camera || '')
    setPasta(d.pastaPropria ? d.pasta : '')
    setEditando(true)
  }
  const salvar = async () => {
    setOcupado(true)
    const r = await post('/api/backup/dono', { id: d.id, nome, camera, pasta, ...(midia === 'tudo' ? { secao } : {}) })
    setOcupado(false)
    if (r) setEditando(false)
  }
  if (editando) {
    return html`<div class="bk-dono is-editando">
      <div class="bk-novo-dono">
        <label><span class="k-rot">Nome</span><input class="input" type="text" maxlength="60" value=${nome} onInput=${(e) => setNome(e.currentTarget.value)} /></label>
        <label><span class="k-rot">Câmera</span><input class="input" type="text" maxlength="40" value=${camera} onInput=${(e) => setCamera(e.currentTarget.value)} /></label>
        <label class="bk-novo-pasta-campo"><span class="k-rot">Nome da pasta <em>opcional</em></span><input class="input mono-path" type="text" maxlength="80" placeholder=${pastaPadrao(nome, camera)} value=${pasta} onInput=${(e) => setPasta(e.currentTarget.value)} aria-label="Nome da pasta do dono" /></label>
        <span class="bk-novo-pasta">Os cartões que já passaram ficam onde estão. Os próximos vão para “${pasta.trim() || pastaPadrao(nome, camera)}”.</span>
      </div>
      ${midia === 'tudo' ? html`<div class="bk-pedido-secao"><span class="k-rot">Os cartões vão para</span><${Chips} opcoes=${SECOES} valor=${secao} onChange=${setSecao} label="Pasta dos cartões" /></div>` : null}
      <div class="bk-dono-acoes">
        <${Button} size="sm" variant="ghost" onClick=${() => setEditando(false)} disabled=${ocupado}>Cancelar</${Button}>
        <${Button} size="sm" icon="check" onClick=${salvar} disabled=${ocupado || !nome.trim()}>Salvar</${Button}>
      </div>
    </div>`
  }
  return html`<div class="bk-dono k-entra" style=${`--i:${k}`}>
    <span class="bk-dono-ic"><${Icon} name="user" size=${16} /></span>
    <b>${d.rotulo}</b>
    <span>${d.cartoes ? `${plural(d.cartoes, 'cartão', 'cartões')} · ${bytes(d.bytes)}` : 'Nenhum cartão nesta diária'} · ${midia === 'tudo' ? rotuloSecao(d.secao) : pastasDaMidia(midia)}</span>
    <span class="bk-dono-pasta mono-path" title=${`Em ${midia === 'tudo' ? rotuloSecao(d.secao) : pastasDaMidia(midia)} / ${d.pasta}`}><${Icon} name="folder" size=${12} />${d.pasta}</span>
    <button type="button" class="bk-dono-editar" onClick=${abrir} disabled=${bloqueado} aria-label=${`Editar ${d.rotulo}`} title="Editar nome, câmera e pasta"><${Icon} name="pencil" size=${13} /></button>
  </div>`
}

// ───── a descarga de agora ─────

/** As fases do cartão numa régua (titular, 05/11/2026): Copiar → Conferir → Pode formatar. */
function Fases({ job }) {
  const conferindo = job.progresso?.etapa === 'conferindo' || (job.fase === 'comparando' && job.tentativa > 0)
  const atual = job.fase === 'ejetando' ? 2 : conferindo ? 1 : 0
  const nomes = ['Copiar', 'Conferir', 'Pode formatar']
  return html`<div class="bk-fases" role="list" aria-label="Fases do cartão">
    ${nomes.map((n, i) => html`<div role="listitem" class=${cx('bk-fase-item', i < atual && 'is-ok', i === atual && 'is-agora')} aria-current=${i === atual ? 'step' : undefined}><span>${n}</span><i></i></div>`)}
  </div>`
}

function Agora({ job, pontos }) {
  const g = job.progresso
  if (job.fase === 'esperando-destino') {
    return html`<${Passo}
      icone="disk"
      cor="warn"
      titulo=${`Esperando ${job.faltando.join(' e ')}`}
      sub=${job.nome}
      frase=${`O disco "${job.nome}" (${job.dono}) está pronto. Conecte o destino: começa sozinho.`}
      i=${3}
      acao=${html`<${Button} size="sm" icon="x" onClick=${() => post('/api/backup/cancelar')}>Parar</${Button}>`}
    >
      <${Barra} p=${null} label="Esperando o destino" />
    </${Passo}>`
  }
  const frac = g ? (g.copiados + g.conferidos) / (g.totalBytes + g.totalConferir || 1) : null
  return html`<${Passo}
    icone="copy"
    cor="up"
    titulo=${job.dono}
    sub=${job.nome}
    frase=${job.pasta}
    i=${3}
    acao=${html`<${Button} size="sm" icon="x" onClick=${() => post('/api/backup/cancelar')}>Parar</${Button}>`}
  >
    <${Barra} p=${job.fase === 'comparando' ? null : frac} vivo label="Andamento da descarga" />
    ${g
      ? html`<${Stats}
          colunas=${4}
          itens=${[
            { icone: 'gauge', valor: g.velocidade ? `${bytes(g.velocidade)}/s` : '—', rotulo: 'agora', tom: 'up' },
            { icone: 'doc', valor: `${count(g.arquivos)}/${count(g.totalArquivos)}`, rotulo: 'arquivos', tom: 'down' },
            { icone: 'clock', valor: g.restante != null ? duracao(g.restante) : '—', rotulo: 'falta', tom: 'ok' },
            { icone: 'shield', valor: g.etapa === 'conferindo' ? 'conferindo' : `${bytes(g.copiados)}`, rotulo: g.etapa === 'conferindo' ? 'lendo de volta' : `de ${bytes(g.totalBytes)}`, tom: 'neutro' },
          ]}
        />`
      : html`<p class="bk-fase">${job.fase === 'ejetando' ? 'Tudo conferido. Ejetando o cartão' : job.fase === 'comparando' ? (job.tentativa ? 'Comparando de novo: confere se ficou tudo' : 'Comparando o cartão com os destinos') : 'Preparando'}</p>`}
    ${pontos.length > 1 ? html`<div class="cp-grafico"><${GraficoVelocidade} pontos=${pontos.map((x) => ({ up: x }))} altura=${120} label="Velocidade da descarga" /></div>` : null}
    <${Fases} job=${job} />
  </${Passo}>`
}

/**
 * Imprevistos do último cartão que passou OK (src/backup/imprevistos.js): nome repetido que foi para a pasta
 * "contador zerado" e gravação que parece interrompida (copiou igual, mas o arquivo está quebrado no próprio cartão).
 */
function Imprevistos({ u }) {
  if (!u || u.resultado !== 'ok' || (!u.suspeitos && !u.zerados)) return null
  const lista = [...(u.listaSuspeitos || []).map((r) => ({ r, tipo: 'suspeito' })), ...(u.listaZerados || []).map((r) => ({ r, tipo: 'zerado' }))]
  const frases = [
    u.suspeitos ? `${plural(u.suspeitos, 'gravação parece interrompida', 'gravações parecem interrompidas')} (bateria ou cartão saiu no meio). Confira antes de formatar` : null,
    u.zerados ? `A câmera voltou a numerar do zero: ${plural(u.zerados, 'arquivo com nome repetido foi', 'arquivos com nome repetido foram')} para a pasta “contador zerado”, ao lado do cartão` : null,
  ].filter(Boolean)
  return html`<${Passo} icone="warning" cor=${u.suspeitos ? 'warn' : 'ok'} titulo=${u.suspeitos ? `Confira antes de formatar: ${u.dono}` : `Nada por cima: ${u.dono}`} frase=${frases.join('. ')} i=${4}>
    ${lista.length ? html`<ul class="bk-lista">${lista.map((x) => html`<li class=${cx(x.tipo === 'suspeito' && 'is-alerta')}><${Icon} name=${x.tipo === 'suspeito' ? 'warning' : 'folder'} size=${12} /><span class="mono-path">${x.r}</span></li>`)}</ul>` : null}
  </${Passo}>`
}

function Ultimo({ u }) {
  if (u?.resultado === 'ok') return html`<${Imprevistos} u=${u} />`
  if (!u) return null
  const lista = [...(u.listaFaltam || []).map((r) => ({ r, tipo: 'falta' })), ...(u.listaAlertas || []).map((r) => ({ r, tipo: 'alerta' }))]
  return html`<${Passo}
    icone="warning"
    cor=${u.resultado === 'cancelado' ? 'warn' : 'err'}
    titulo=${u.resultado === 'cancelado' ? `Descarga parada: ${u.dono}` : `Ainda não formate: ${u.dono}`}
    frase=${u.erro || [u.faltam ? `${plural(u.faltam, 'arquivo não está', 'arquivos não estão')} em todos os destinos` : null, u.alertas ? `${plural(u.alertas, 'arquivo tem', 'arquivos têm')} o mesmo nome e outro tamanho no destino (nada foi gravado por cima)` : null].filter(Boolean).join('. ')}
    i=${4}
  >
    ${lista.length
      ? html`<ul class="bk-lista">${lista.map((x) => html`<li class=${cx(x.tipo === 'alerta' && 'is-alerta')}><${Icon} name=${x.tipo === 'alerta' ? 'warning' : 'minus'} size=${12} /><span class="mono-path">${x.r}</span></li>`)}</ul>`
      : null}
  </${Passo}>`
}

function Volume({ v, midia }) {
  const [escolhendo, setEscolhendo] = useState(false)
  const e = v.pasta && v.estado === 'ok' ? { ...ESTADO.ok, texto: 'Pasta copiada' } : v.parcial && v.estado === 'ok' ? { ...ESTADO.ok, texto: 'Passou o escolhido' } : ESTADO[v.estado] || ESTADO.lendo
  const acoes = []
  // Ver o que tem no cartão antes de copiar (fotos, RAW e vídeos).
  if (!v.pasta && ['disco', 'pronto', 'fila', 'ignorado', 'ok', 'falta', 'erro', 'cancelado', 'pedido'].includes(v.estado)) acoes.push(html`<${Button} size="sm" icon="eye" onClick=${() => abrirPreviaCartao({ caminho: v.caminho, nome: v.nome })} title="Ver as fotos e os vídeos do cartão">Ver</${Button}>`)
  if (!v.pasta && ['disco', 'pronto', 'ignorado', 'ok', 'falta', 'erro', 'cancelado'].includes(v.estado)) acoes.push(html`<${Button} size="sm" icon="list" onClick=${() => setEscolhendo(true)} disabled=${escolhendo} title="Só uma parte do cartão">Escolher…</${Button}>`)
  if (v.estado === 'disco' || v.estado === 'ignorado') acoes.push(html`<${Button} size="sm" icon="sdcard" onClick=${() => post('/api/backup/usar', { caminho: v.caminho })}>Usar como cartão</${Button}>`)
  if (v.estado === 'pronto') acoes.push(html`<${Button} size="sm" icon="copy" onClick=${() => post('/api/backup/usar', { caminho: v.caminho })}>Copiar agora</${Button}>`)
  if (['ok', 'falta', 'erro', 'cancelado'].includes(v.estado) && v.dono && v.estado !== 'ok') acoes.push(html`<${Button} size="sm" icon="retry" onClick=${() => post('/api/backup/repetir', { caminho: v.caminho })}>Copiar de novo</${Button}>`)
  // Marcou um HD/SSD como cartão por engano: desfaz (para, esquece o dono e passa a ignorar o disco).
  if (['disco', 'pronto', 'fila', 'ok', 'falta', 'erro', 'cancelado', 'ejetado'].includes(v.estado))
    acoes.push(
      v.pasta
        ? html`<${Button} size="sm" variant="ghost" icon="x" onClick=${() => post('/api/backup/nao-cartao', { caminho: v.caminho })}>Tirar da lista</${Button}>`
        : html`<${Button} size="sm" variant="ghost" icon="x" onClick=${() => post('/api/backup/nao-cartao', { caminho: v.caminho })} title="Não copiar este disco neste projeto">Não é cartão</${Button}>`,
    )
  if (!v.pasta && !['copiando', 'ejetado', 'lendo', 'destino'].includes(v.estado)) acoes.push(html`<${Button} size="sm" icon="arrow-up" onClick=${() => post('/api/backup/ejetar', { caminho: v.caminho })}>Ejetar</${Button}>`)
  const tam = v.capacidade ? bytes(v.capacidade) : null
  return html`<${Item}
      icone=${v.pasta ? 'folder' : v.estado === 'destino' || v.estado === 'disco' ? 'disk' : 'sdcard'}
      tom=${e.tom}
      titulo=${v.nome}
      sub=${v.erro || [v.dono || e.texto, tam].filter(Boolean).join(' · ')}
      fim=${html`<span class=${cx('bk-estado', `is-${e.tom}`)}><${Icon} name=${e.icone} size=${13} />${e.texto}</span>${acoes}`}
    />
    ${escolhendo
      ? html`<${Escolha} caminho=${v.caminho} nome=${v.nome} midia=${midia} onCancelar=${() => setEscolhendo(false)} onPronto=${async (esc) => (await post('/api/backup/escolher', { caminho: v.caminho, escolha: esc })) && setEscolhendo(false)} />`
      : null}`
}

// ───── o painel do projeto ─────

/**
 * Um destino: quanto ainda cabe na mídia física (barra do que já ocupou) e, com a média dos cartões da diária,
 * quantos cartões ainda cabem. Pouco espaço (menos de 10% ou de 2 cartões) fica em laranja.
 */
function EspacoDestino({ d, i, media }) {
  const papel = i === 0 ? 'Principal' : `Backup ${i}`
  if (d.conectado === false) {
    return html`<div class="bk-destino is-fora">
      <span class="bk-destino-ic"><${Icon} name="disk" size=${15} /></span>
      <span class="bk-destino-txt"><b>${d.nome}</b><span>${papel} · desconectado</span></span>
    </div>`
  }
  const temTotal = d.total != null && d.livre != null && d.total > 0
  const usado = temTotal ? 1 - d.livre / d.total : null
  const cabem = media && d.livre != null ? Math.floor(d.livre / media) : null
  const pouco = d.livre != null && ((temTotal && d.livre / d.total < 0.1) || (cabem != null && cabem < 2))
  return html`<div class=${cx('bk-destino', 'is-espaco', pouco && 'is-pouco')}>
    <span class="bk-destino-ic"><${Icon} name="disk" size=${15} /></span>
    <span class="bk-destino-txt">
      <span class="bk-destino-linha"><b>${d.nome}</b><span class="bk-destino-livre">${d.livre != null ? `${bytes(d.livre)} livres` : '…'}</span></span>
      ${temTotal ? html`<${Barra} p=${usado} tom=${pouco ? 'erro' : undefined} label=${`Espaço usado em ${d.nome}`} />` : null}
      <span>${papel}${temTotal ? ` · de ${bytes(d.total)}` : ''}${cabem != null ? ` · cabem ~${count(cabem)} ${cabem === 1 ? 'cartão' : 'cartões'} como os de hoje` : ''}</span>
    </span>
  </div>`
}

/**
 * "Gravando agora": o momento que vai em cada cartão que passar (o Synquei põe o cartão nele em vez de adivinhar).
 * Pílulas com os momentos do tipo do projeto; sem tipo, um campo livre. "Automático" deixa o Synquei decidir.
 */
function GravandoAgora({ p }) {
  const [texto, setTexto] = useState(p.momento || '')
  useEffect(() => setTexto(p.momento || ''), [p.momento])
  const marcar = (m) => post('/api/backup/momento', { momento: m || '' })
  const lista = p.momentos || []
  const itens = [{ value: '', label: 'Automático' }, ...lista.map((m) => ({ value: m, label: m }))]
  // um momento escrito à mão (ou de outro tipo) continua aparecendo marcado
  if (p.momento && !lista.includes(p.momento)) itens.push({ value: p.momento, label: p.momento })
  return html`<div class="k-caixa bk-momento">
    <div class="bk-momento-topo"><b>Gravando agora</b><span>${p.momento ? `Os próximos cartões entram em “${p.momento}” no Synquei` : 'O Synquei separa pela pasta e pelo horário'}</span></div>
    ${lista.length
      ? html`<${Pilulas} label="Momento dos próximos cartões" valor=${p.momento || ''} itens=${itens} onEscolher=${marcar} />`
      : html`<form class="bk-momento-livre" onSubmit=${(e) => (e.preventDefault(), marcar(texto))}>
          <input class="input" value=${texto} maxlength="60" placeholder="Ex.: Abertura, Take 3, Palestra 2" aria-label="Momento dos próximos cartões" onInput=${(e) => setTexto(e.currentTarget.value)} onBlur=${() => texto !== (p.momento || '') && marcar(texto)} />
        </form>`}
  </div>`
}

function Painel({ v, topo, onNovo, onEditar }) {
  const p = v.projeto
  const [pontos, setPontos] = useState([])
  const g = v.job?.progresso
  useEffect(() => {
    if (!g) return
    setPontos((x) => [...x.slice(-59), g.velocidade || 0])
  }, [g?.copiados, g?.conferidos])
  useEffect(() => {
    if (!v.job) setPontos([])
  }, [v.job?.caminho])

  const desligado = !v.ligado
  let destaque
  if (desligado) destaque = html`<${Destaque} tom="grad" titulo="Desligado" linha="Os cartões esperam o seu toque: “Usar como cartão”" />`
  else if (v.job?.fase === 'esperando-destino') destaque = html`<${Destaque} tom="erro" titulo="Esperando o destino" linha=${`Conecte ${v.job.faltando.join(' e ')}`} />`
  else if (v.job) {
    const frac = g ? (g.copiados + g.conferidos) / (g.totalBytes + g.totalConferir || 1) : null
    destaque = html`<${Destaque} titulo=${`Passando · ${v.job.dono}`} numero=${frac != null ? Math.floor(frac * 100) : '…'} unidade=${frac != null ? '%' : ''} progresso=${frac} linha=${g ? `${bytes(g.copiados)} de ${bytes(g.totalBytes)}` : v.job.fase === 'ejetando' ? 'Ejetando o cartão' : 'Comparando'} vivo />`
  } else if (v.pedidos.length) destaque = html`<${Destaque} tom="erro" titulo="Cartão novo" numero=${v.pedidos.length} unidade=${v.pedidos.length === 1 ? 'esperando o dono' : 'esperando o dono'} linha="Um toque e ele passa" />`
  else if (v.ultimo?.resultado === 'ok') destaque = html`<${Destaque} tom="ok" titulo=${v.ultimo.soPasta ? 'Pasta copiada (o resto do cartão não foi conferido)' : v.ultimo.parcial ? 'Passou o escolhido (o resto ficou no cartão)' : 'Cartão OK, pode formatar'} numero=${count(v.ultimo.copiados)} unidade=${v.ultimo.copiados === 1 ? 'arquivo novo' : 'arquivos novos'} linha=${`${v.ultimo.dono} · ${bytes(v.ultimo.bytes)} em ${duracao(v.ultimo.segundos)}`} />`
  else destaque = html`<${Destaque} tom="grad" titulo="Ligado" linha="Espete um cartão" vivo />`

  // Cartão conferido: a mídia já pode ir para o Synquei (ele lê o descargas.jsonl da pasta do projeto).
  const synquei = p.synquei !== false && !v.job && v.ultimo?.resultado === 'ok'
  // Cartão conferido: os brutos dele viram frames com a cor da câmera do dono (Estúdio › Frames, "Pasta ou cartão")
  const framesDoCartao = !v.job && v.ultimo?.resultado === 'ok' && !!v.ultimo.pastaVideo
  const abrirFrames = () => {
    // com o pré-color ligado, os frames já estão sendo feitos: só abre o Frames (o andamento e o histórico)
    if (!p.precolor) storage.set('frames.pedido', { caminho: v.ultimo.pastaVideo, nome: `${v.ultimo.dono} · ${v.ultimo.cartao}`, donoId: v.ultimo.donoId })
    navigate('frames')
  }
  const lado = html`<${Resumo} titulo=${desligado ? 'Backup automático' : 'Agora'}>
      ${destaque}
      ${framesDoCartao ? html`<${Button} icon="sparkle" class="bk-synquei" onClick=${abrirFrames} title="Um frame por clipe, com a cor (LUT e ajuste) da câmera deste dono">${p.precolor ? 'Ver os frames do cartão' : 'Frames do cartão'}</${Button}>` : null}
      ${synquei || (!v.job && p.totalDiaria.descargas)
        ? html`<div class="bk-proximo">
            ${p.totalDiaria.descargas ? html`<${Button} icon="doc" variant="ghost" onClick=${() => openExternal(`/api/backup/relatorio?id=${encodeURIComponent(v.atual)}`)} title=${`Câmeras, cartões e conferência da ${p.diaria.nome}`}>Relatório</${Button}>` : null}
            ${synquei ? html`<${Button} icon="arrow-right" class="bk-synquei" onClick=${() => abrirNoSynquei(v.atual)} title=${p.tipo ? `Como ${v.tiposSynquei?.find((t) => t.id === p.tipo)?.label || p.tipo}` : 'O tipo de projeto você escolhe no Synquei'}>Preparar no Synquei</${Button}>` : null}
          </div>`
        : null}
      ${p.synquei !== false ? html`<${GravandoAgora} p=${p} />` : null}
      <div class="k-caixa bk-destinos">
        ${p.destinos.map((d, i) => html`<${EspacoDestino} d=${d} i=${i} media=${p.mediaCartao} />`)}
      </div>
    </${Resumo}>
    <${Resumo} titulo="Já passou">
      <div class="k-caixa bk-passou">
        <div class="bk-passou-linha">
          <span class="bk-passou-ic is-down"><${Icon} name="sdcard" size=${15} /></span>
          <b>${bytes(p.total.bytes)}</b>
          <span>no projeto · ${plural(p.total.descargas, 'cartão', 'cartões')} · ${plural(p.total.arquivos, 'arquivo', 'arquivos')}</span>
        </div>
        <div class="bk-passou-linha">
          <span class="bk-passou-ic is-up"><${Icon} name="clock" size=${15} /></span>
          <b>${bytes(p.totalDiaria.bytes)}</b>
          <span>na ${p.diaria.nome} · ${plural(p.totalDiaria.descargas, 'cartão', 'cartões')}</span>
        </div>
      </div>
    </${Resumo}>
    ${desligado
      ? html`<${BotaoGrande} icone="sdcard" onClick=${() => post('/api/backup/ligar', { ligado: true })} dica="Cada cartão espetado passa sozinho">Ligar o backup automático</${BotaoGrande}>`
      : html`<div class="bk-ligado"><${Linhas}><${Linha} titulo="Começar sozinho" sub="Ligado: cada cartão espetado passa sozinho."><${Switch} checked=${true} label="Backup automático" onChange=${() => post('/api/backup/ligar', { ligado: false })} /></${Linha}></${Linhas}></div>`}`

  const acoes = html`${v.projetos.length > 1
      ? html`<span class="select bk-projetos"><select value=${v.atual} onChange=${(e) => post('/api/backup/abrir', { id: e.currentTarget.value })} aria-label="Projeto">${v.projetos.map((x) => html`<option value=${x.id}>${x.nome}</option>`)}</select><${Icon} name="chevron-down" size=${12} /></span>`
      : null}
    <${Button} icon="pencil" onClick=${onEditar} title="Nome, destinos, o que passa, Synquei e excluir o projeto">Editar</${Button}>
    <${Button} icon="plus" onClick=${onNovo}>Novo projeto</${Button}>
    <${Confirma} size=${undefined} icone="trash" pergunta="Excluir este projeto? Os arquivos nos HDs ficam." sim="Excluir" onSim=${() => post('/api/backup/apagar', { id: v.atual })}>Excluir</${Confirma}>`

  const espetados = v.volumes.filter((x) => x.estado !== 'pedido' && x.estado !== 'copiando')
  // "Copiar uma pasta…": uma pasta do cartão (ou de qualquer disco) entra como cartão; o comparativo pula o que já passou.
  const copiarPasta = async () => {
    const caminho = await pickFolderPath({ title: 'Qual pasta copiar?', subtitle: 'Do cartão: o que já passou dele não copia de novo.', defaultPath: v.volumes.find((x) => !x.pasta && x.estado !== 'destino')?.caminho })
    if (caminho) await post('/api/backup/pasta', { caminho })
  }

  return html`<${Pagina} titulo="Cartões" frase=${FRASE} class="page-backup bk-painel" lado=${lado} acoes=${acoes}>
    ${topo}
    ${v.pedidos.map((x, k) => html`<${Pedido} key=${x.caminho} p=${x} midia=${p.midia} donos=${p.donos.map((d) => ({ id: d.id, rotulo: d.rotulo }))} i=${k + 2} />`)}
    ${v.job ? html`<${Agora} job=${v.job} pontos=${pontos} />` : null}
    ${!v.job ? html`<${Ultimo} u=${v.ultimo} />` : null}

    <${Passo}
      icone="clock"
      cor="down"
      titulo=${p.diaria.nome}
      sub=${p.nome}
      frase=${`${p.pasta.split(/[\\/]/).join(' / ')} / ${pastasDaMidia(p.midia)} / …`}
      i=${2}
      acao=${html`<div class="cp-acoes-topo">
        ${p.diarias.length > 1
          ? html`<span class="select bk-diarias"><select value=${p.diaria.n} onChange=${(e) => post('/api/backup/diaria', { n: Number(e.currentTarget.value) })} aria-label="Diária">${p.diarias.map((d) => html`<option value=${d.n}>${d.nome}</option>`)}</select><${Icon} name="chevron-down" size=${12} /></span>`
          : null}
        <${Button} size="sm" icon="plus" onClick=${() => post('/api/backup/diaria')} disabled=${!!v.job}>Nova diária</${Button}>
      </div>`}
    >
      ${p.sugerirNovaDiaria
        ? html`<div class="bk-aviso"><${Icon} name="info" size=${15} /><span>A data mudou desde a última descarga desta diária. Começar a próxima?</span><${Button} size="sm" onClick=${() => post('/api/backup/diaria')} disabled=${!!v.job}>Começar Diária ${String(Math.max(...p.diarias.map((d) => d.n)) + 1).padStart(2, '0')}</${Button}></div>`
        : null}
      ${p.donos.length
        ? html`<div class="bk-donos">${p.donos.map((d, k) => html`<${Dono} key=${d.id} d=${d} k=${k} midia=${p.midia} bloqueado=${v.job?.dono === d.rotulo} />`)}</div>`
        : html`<p class="bk-vazio-txt">Nenhum cartão nesta diária ainda.</p>`}
    </${Passo}>

    ${v.fila.length
      ? html`<${Passo} icone="clock" cor="down" titulo="Na fila" sub=${plural(v.fila.length, 'cartão', 'cartões')} frase="Um cartão por vez: o próximo começa sozinho." i=${5}>
          <div class="k-itens">${v.fila.map((x) => html`<${Item} icone="sdcard" tom="down" titulo=${x.nome} sub=${x.dono} />`)}</div>
        </${Passo}>`
      : null}

    <${Passo}
      icone="disk"
      cor="ok"
      titulo="Discos plugados"
      sub=${espetados.length ? plural(espetados.length, 'disco', 'discos') : null}
      frase="Cartão que não apareceu sozinho? Toque em “Usar como cartão”. Quer só uma parte? Escolha a pasta: o que já passou desse cartão não copia de novo."
      i=${6}
      acao=${html`<${Button} size="sm" icon="folder" onClick=${copiarPasta}>Copiar uma pasta…</${Button}>`}
    >
      ${espetados.length
        ? html`<div class="k-itens">${espetados.map((x) => html`<${Volume} key=${x.caminho} v=${x} midia=${p.midia} />`)}</div>`
        : v.volumes.length
          ? html`<p class="bk-vazio-txt">Os outros discos estão logo acima, esperando ou passando.</p>`
          : html`<p class="bk-vazio-txt">Nenhum cartão ou disco externo plugado agora. Espetou e não apareceu em alguns segundos? Veja se ele aparece no Finder (Mac) ou no Explorador (Windows).</p>`}
    </${Passo}>

    <${Passo}
      icone="list"
      cor="up"
      titulo="Histórico"
      sub=${p.historico.length ? plural(p.historico.length, 'descarga', 'descargas') : null}
      i=${7}
      acao=${html`<div class="cp-acoes-topo">
        ${p.ignorados ? html`<${Button} size="sm" icon="eye" onClick=${() => post('/api/backup/ignorados/limpar')}>Perguntar de novo pelos ignorados (${p.ignorados})</${Button}>` : null}
        ${p.historico.length ? html`<${Confirma} icone="trash" pergunta="Limpar o histórico? Os arquivos ficam." sim="Limpar" disabled=${!!v.job} onSim=${() => post('/api/backup/historico/limpar')}>Limpar histórico</${Confirma}>` : null}
      </div>`}
    >
      ${p.historico.length
        ? html`<div class="k-itens bk-historico">
            ${p.historico.map(
              (h) => html`<${Item}
                icone=${h.resultado === 'ok' ? 'circle-check' : h.resultado === 'cancelado' ? 'x' : 'warning'}
                tom=${h.resultado === 'ok' ? 'ok' : h.resultado === 'cancelado' ? 'warn' : 'erro'}
                titulo=${`${h.dono} · ${h.cartao}`}
                sub=${h.pasta}
                fim=${html`<span class="bk-hist-fim"><b>${h.copiados ? `${count(h.copiados)} novos · ${bytes(h.bytes)}` : 'nada novo'}</b><span>${horaDe(h.quando)} · ${duracao(h.segundos)}</span></span>`}
              />`,
            )}
          </div>`
        : html`<${Vazio} icone="sdcard" titulo=${v.ligado ? 'Espete o primeiro cartão' : 'Ligue o backup automático'}>
            ${v.ligado ? 'Na primeira vez, um toque diz de quem ele é. Depois, passa sozinho.' : 'Depois é só espetar os cartões. O app compara, copia o que falta e confere.'}
          </${Vazio}>`}
    </${Passo}>
  </${Pagina}>`
}

export function BackupPanel({ topo }) {
  const v = useStore((s) => s.backup)
  const [modo, setModo] = useState(null) // null | 'novo' | 'editar'
  if (!v) {
    return html`<${Pagina} titulo="Cartões" frase=${FRASE} class="page-backup">${topo}<${Passo} icone="refresh" cor="down" titulo="Carregando" i=${2}><${Barra} p=${null} /></${Passo}></${Pagina}>`
  }
  if (!v.projeto || modo === 'novo') return html`<${FormProjeto} topo=${topo} tipos=${v.tiposSynquei || []} onPronto=${() => setModo(null)} onCancelar=${v.projeto ? () => setModo(null) : null} />`
  if (modo === 'editar') return html`<${FormProjeto} topo=${topo} tipos=${v.tiposSynquei || []} inicial=${v.projeto} onPronto=${() => setModo(null)} onCancelar=${() => setModo(null)} onExcluido=${() => setModo(null)} />`
  return html`<${Painel} v=${v} topo=${topo} onNovo=${() => setModo('novo')} onEditar=${() => setModo('editar')} />`
}

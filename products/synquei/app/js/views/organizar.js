// Organizar: a pasta do projeto no Backup Automático do SOBEDESCE ligada ao Synquei e ao DaVinci. Cada cartão que
// termina de passar entra sozinho (app/js/organizar.js); aqui ficam as pastas, as diárias com seus cartões e a ponte
// com o Resolve. Sem o SOBEDESCE: "Organizar uma pasta" estuda qualquer pasta do SSD e mostra os momentos para a
// pessoa conferir (e corrigir por câmera) antes de mandar para o editor.

import { S, openProject, lerProjeto } from '../store.js'
import { h, icon, ago, plural, modal, uiDark } from '../util.js'
import { devColor } from '../media/devices.js'
import { go } from '../main.js'
import { escolherTipo } from '../tipo-picker.js'
import { tipoDe } from '../tipos.js'
import { duracao } from '../relatorio.js'
import { O, api, adicionarPasta, reorganizarTudo, organizarAgora, atualizarDavinci, mandarParaDavinci, setMandarParaDavinci, organizarPastaLivre, estudarPastaLivre, mandarEstudo, estudoDe, corrigirNoEstudo, mostrarArquivo, trocarTipoDoEstudo } from '../organizar.js'

// projetos lidos do disco para a tela (sem abrir): id → { updatedAt, p }
const lidos = new Map()
function projetoSalvo(id) {
  if (!id) return null
  if (S.project && S.project.id === id) return S.project
  const item = S.list.find((x) => x.id === id)
  if (!item) return null
  const c = lidos.get(id)
  if (c && c.updatedAt === item.updatedAt) return c.p
  const p = lerProjeto(id)
  lidos.set(id, { updatedAt: item.updatedAt, p })
  return p
}

/** Os arquivos que o Synquei gravou na pasta Synquei/ (relatório, Premiere, Final Cut), como botões. */
function arquivosGerados(pastaId, p) {
  const a = (p && p.org && p.org.arquivos) || {}
  const ic = { Relatório: 'painel', 'Premiere Pro': 'film', 'Final Cut Pro': 'film' }
  const nomes = Object.keys(a).filter((k) => ic[k])
  if (!nomes.length) return ''
  return `<div class="org-gerados">${nomes.map((k) => `<button class="btn btn-ghost btn-sm" data-act="org-mostrar" data-id="${h(pastaId)}" data-arquivo="${h(a[k])}" title="${h(a[k])}">${icon(ic[k])}${k === 'Relatório' ? 'Relatório' : h(k)}</button>`).join('')}</div>`
}

const ESTADO = {
  novo: ['chip', 'Na fila'],
  pronto: ['chip chip-ok', 'Organizado'],
  erro: ['chip chip-err', 'Erro'],
}

function fluxo() {
  const dv = O.davinci
  const passo = (ic, t, s, ok) => `<div class="org-passo${ok ? ' is-ok' : ''}"><span class="org-passo-ic">${icon(ic)}</span><b>${t}</b><small>${s}</small></div>`
  const ligadas = O.pastas.filter((p) => p.ligado).length
  return `<div class="org-fluxo">
    ${passo('download', 'SOBEDESCE', ligadas ? `${plural(ligadas, 'pasta vigiada', 'pastas vigiadas')}` : 'Ligue a pasta do projeto', ligadas > 0)}
    <span class="org-seta">${icon('arrow')}</span>
    ${passo('sync', 'Synquei', O.atual ? 'Organizando agora' : O.fila.length ? `${plural(O.fila.length, 'cartão', 'cartões')} na fila` : 'Esperando cartões', true)}
    <span class="org-seta">${icon('arrow')}</span>
    ${passo('film', 'DaVinci Resolve', !mandarParaDavinci() ? 'Desligado' : !dv || !dv.instalado ? 'Instale a ponte' : dv.conectado ? `Ligado${dv.projeto ? ` · ${h(dv.projeto)}` : ''}` : 'Abra Workspace › Scripts › Synquei', !!(dv && dv.conectado && mandarParaDavinci()))}
  </div>`
}

function agora() {
  if (O.esperando && O.fila.length)
    return `<div class="info-box org-agora">${icon('info')}<div><b>${plural(O.fila.length, 'cartão novo esperando', 'cartões novos esperando')}.</b> O projeto “${h(S.project ? S.project.name : '')}” está aberto: o Synquei espera você fechar para não mexer nele. <a href="#" data-act="org-agora" style="text-decoration:underline">Organizar agora</a></div></div>`
  if (!O.atual) return ''
  return `<div class="info-box org-agora is-live">${icon('sync')}<div><b>${h(O.etapa || 'Organizando')}</b>${O.fila.length ? ` · mais ${plural(O.fila.length, 'cartão', 'cartões')} na fila` : ''}${S.sync.running ? ` · ${S.sync.done}/${S.sync.total}` : ''}</div></div>`
}

function davinci() {
  const dv = O.davinci || {}
  const on = mandarParaDavinci()
  const ultima = (dv.respostas || [])[0]
  const status = !dv.instalado
    ? '<span class="chip">Ponte não instalada</span>'
    : dv.conectado
      ? `<span class="chip chip-ok">${icon('check')}Janela do Synquei aberta no DaVinci</span>`
      : '<span class="chip chip-warn">DaVinci fechado ou janela do Synquei fechada</span>'
  return `<section class="card"><header class="card-head"><h2>DaVinci Resolve Studio</h2>${status}</header><div class="card-pad">
    <div class="set-row"><div><b>Mandar cada cartão para o DaVinci</b><small>Pastas na Media Pool por diária › Câmeras ou Áudio › dono › cartão, uma cor por câmera, Cena, Take, Câmera e Cartão nos metadados e as linhas do tempo sincronizadas da diária em Sequências.</small></div><label class="switch"><input type="checkbox" data-change="org-davinci" ${on ? 'checked' : ''} aria-label="Mandar para o DaVinci"/><i></i></label></div>
    <div class="set-row"><div><b>1. Instalar a ponte</b><small>Põe o script “Synquei” no menu do DaVinci. ${dv.instalado ? 'Já instalado.' : ''}</small></div><button class="btn ${dv.instalado ? 'btn-secondary' : 'btn-primary'} btn-sm" data-act="org-instalar">${icon('download')}${dv.instalado ? 'Instalar de novo' : 'Instalar no DaVinci'}</button></div>
    <div class="set-row"><div><b>2. No DaVinci: Workspace › Scripts › Synquei</b><small>Abre uma janelinha; deixe aberta enquanto grava. Ela pega os cartões no projeto do DaVinci com o mesmo nome do projeto do SOBEDESCE (ou clique em “Usar o projeto aberto”). Precisa do DaVinci Resolve Studio: a versão grátis não aceita scripts.</small></div></div>
    ${dv.esperando ? `<div class="warn-box">${icon('warn')}<div>O DaVinci está esperando o projeto <b>${h(dv.esperando)}</b>. Abra esse projeto ou clique em “Usar o projeto aberto” na janelinha do Synquei.</div></div>` : ''}
    <div class="set-row"><div><b>Fila do DaVinci</b><small>${dv.fila ? `${plural(dv.fila, 'pedido esperando', 'pedidos esperando')} a janelinha` : 'Nada esperando'}${ultima ? ` · último: ${plural(ultima.importados, 'clipe novo', 'clipes novos')}${ultima.linhas && ultima.linhas.length ? `, ${plural(ultima.linhas.length, 'linha do tempo', 'linhas do tempo')}` : ''}${ultima.guardadas && ultima.guardadas.length ? ` (${plural(ultima.guardadas.length, 'editada ficou guardada', 'editadas ficaram guardadas')})` : ''}` : ''}</small></div><button class="btn btn-ghost btn-sm" data-act="org-dv-status">${icon('sync')}Conferir</button></div>
  </div></section>`
}

/** Download do Drive (modo pasta única): a operação inteira, com o que a conferência do disco achou. */
function operacao(c) {
  const [cls, txt0] = ESTADO[c.estado] || ESTADO.novo
  const conf = c.conferencia || { ausentes: [], alterados: [], movidos: [] }
  const pend = conf.ausentes.length + conf.alterados.length
  const txt = c.estado === 'pronto' ? (pend || (c.recibo && c.recibo.estado === 'com_pendencias') ? 'Preparado · com pendências' : 'Preparado') : txt0
  const atual = O.atual && O.atual.id === c.id
  const det = [plural(c.arquivos, 'arquivo', 'arquivos')]
  if (conf.ausentes.length) det.push(plural(conf.ausentes.length, 'ausente', 'ausentes'))
  if (conf.alterados.length) det.push(plural(conf.alterados.length, 'alterado', 'alterados'))
  if (conf.movidos.length) det.push(plural(conf.movidos.length, 'movido', 'movidos'))
  const dica = [...conf.ausentes.map((r) => `Ausente: ${r}`), ...conf.alterados.map((r) => `Alterado: ${r}`), ...conf.movidos.map((r) => `Movido: ${r}`)].slice(0, 12).join('\n')
  return `<li class="org-cartao"${dica ? ` title="${h(dica)}"` : ''}><span class="dot" style="--c:${devColor({ color: 0 }, uiDark())}"></span><div><b>${h(c.nome || 'Download do Drive')}</b> · Download do Drive<small>${det.join(' · ')}${c.quando ? ` · ${ago(Date.parse(c.quando))}` : ''}${c.erro ? ` · ${h(c.erro)}` : ''}</small></div><span class="${atual ? 'chip chip-blue' : pend && c.estado === 'pronto' ? 'chip chip-warn' : cls}">${atual ? 'Preparando' : txt}</span></li>`
}

function cartao(c, cores) {
  if (c.modo === 'drive') return operacao(c)
  const [cls, txt] = ESTADO[c.estado] || ESTADO.novo
  const atual = O.atual && O.atual.id === c.id
  return `<li class="org-cartao"><span class="dot" style="--c:${devColor({ color: Math.min(8, (cores || {})[c.dono.pasta || c.dono.nome] ?? 8) }, uiDark())}"></span><div><b>${h(c.dono.pasta || c.dono.nome)}</b> · ${h(c.pasta.split('/').pop())}<small>${plural(c.arquivos, 'arquivo', 'arquivos')}${c.quando ? ` · ${ago(Date.parse(c.quando))}` : ''}${c.erro ? ` · ${h(c.erro)}` : ''}</small></div><span class="${atual ? 'chip chip-blue' : cls}">${atual ? 'Organizando' : txt}</span></li>`
}

function pasta(p) {
  const porDiaria = new Map()
  for (const c of p.cartoes) {
    const n = c.diaria.n
    if (!porDiaria.has(n)) porDiaria.set(n, { nome: c.diaria.nome, cartoes: [] })
    porDiaria.get(n).cartoes.push(c)
  }
  const diarias = [...porDiaria.entries()].sort((a, b) => b[0] - a[0])
  return `<section class="card org-pasta"><header class="card-head"><div><h2>${h(p.nome)}</h2><p class="sub mono" style="font-size:12px">${h(p.raiz)}</p></div>
    <div style="display:flex;gap:6px;align-items:center;flex-wrap:wrap"><label class="switch" title="Vigiar esta pasta"><input type="checkbox" data-change="org-ligar" data-id="${h(p.id)}" ${p.ligado ? 'checked' : ''} aria-label="Vigiar esta pasta"/><i></i></label>
    <button class="btn btn-ghost btn-sm" data-act="org-abrir" data-id="${h(p.id)}">${icon('folder')}Abrir pasta</button>
    <button class="btn btn-ghost btn-sm" data-act="org-tudo" data-id="${h(p.id)}">${icon('sync')}Organizar tudo de novo</button>
    <button class="icon-btn" data-act="org-tirar" data-id="${h(p.id)}" aria-label="Parar de vigiar e tirar da lista">${icon('trash')}</button></div></header>
    <div class="card-pad">${
      diarias.length
        ? diarias
            .map(([n, d]) => {
              const pid = p.projetos && p.projetos[n]
              return `<div class="org-diaria"><div class="org-diaria-topo"><h3>${h(d.nome)}</h3><span class="sub">${d.cartoes.every((c) => c.modo === 'drive') ? 'Download do Drive' : plural(d.cartoes.length, 'cartão', 'cartões')}</span>${pid && S.list.some((x) => x.id === pid) ? `<button class="btn btn-secondary btn-sm" data-act="org-proj" data-id="${h(pid)}">${icon('timeline')}Abrir projeto</button>` : ''}</div>${pid ? momentosDaDiaria(projetoSalvo(pid)) : ''}${pid ? arquivosGerados(p.id, projetoSalvo(pid)) : ''}<ul class="org-cartoes">${d.cartoes.map((c) => cartao(c, p.cores)).join('')}</ul></div>`
            })
            .join('')
        : `<p class="sub">Nenhum cartão terminou ainda. Quando o SOBEDESCE terminar o próximo, ele aparece aqui e vai sozinho para o projeto.</p>`
    }
    <p class="sub org-pastas-trabalho">${icon('folder')}<span>Criadas em volta da mídia (nada é movido): <b>Assets</b>, <b>Exports</b> e <b>Synquei/Sequências</b>.</span></p></div></section>`
}

/** Uma linha com os momentos que o Synquei entendeu na diária (casamento: cerimônia, festa…; clipe: takes). */
function momentosDaDiaria(p) {
  const m = p && p.momentos
  if (!m || !m.momentos || !m.momentos.length) return ''
  return `<div class="org-momentos-linha">${m.momentos
    .slice(0, 10)
    .map((x) => `<span class="chip${x.sugestao ? ' chip-warn' : ''}" title="${x.sugestao ? 'Sugerido pelo horário: confira' : ''}">${h(x.nome)} · ${x.clipes}</span>`)
    .join('')}${m.partes ? `<span class="chip">${plural(m.partes, m.parte === 'Take' ? 'take' : 'parte', m.parte === 'Take' ? 'takes' : 'partes')}</span>` : ''}</div>`
}

const ORIGEM = { marcado: 'Marcado', pasta: 'Pela pasta', horario: 'Pelo horário', padrao: 'Sem pista' }

/** O estudo de uma pasta livre: números, momentos × câmera (com troca de momento) e as ações. */
function estudo(pasta, p) {
  const m = p.momentos
  if (!m) return '<p class="sub">Estudo ainda não feito.</p>'
  const prontos = p.clips.filter((c) => c.status === 'ready')
  const sinc = prontos.filter((c) => c.sync).length
  const cams = new Set(prontos.filter((c) => c.kind !== 'audio').map((c) => c.deviceId)).size
  const dur = prontos.filter((c) => c.kind !== 'audio').reduce((t, c) => t + (c.duration || 0), 0)
  const stat = (n, t) => `<div class="org-stat"><b>${n}</b><span>${t}</span></div>`
  const manual = p.momentosManual || {}
  const opcoes = m.opcoes || []
  const grupos = m.grupos || []
  const porMomento = new Map()
  grupos.forEach((g, i) => {
    if (!porMomento.has(g.momento)) porMomento.set(g.momento, { nome: g.nome, pasta: g.pasta, linhas: [] })
    porMomento.get(g.momento).linhas.push({ ...g, i })
  })
  const linha = (g) => {
    const marcado = g.ids.every((id) => manual[id])
    const opts = [...opcoes]
    if (!opts.some((o) => o.id === g.momento)) opts.unshift({ id: g.momento, nome: g.nome })
    const sel = `<select class="select" data-change="org-momento" data-id="${h(pasta.id)}" data-g="${g.i}" aria-label="Momento de ${h(g.camera)}">${marcado ? '<option value="">Automático</option>' : ''}${opts.map((o) => `<option value="${h(o.id)}"${o.id === g.momento ? ' selected' : ''}>${h(o.nome)}</option>`).join('')}</select>`
    const det = [plural(g.ids.length, g.audio ? 'arquivo' : 'clipe', g.audio ? 'arquivos' : 'clipes')]
    if (g.broll && !g.audio) det.push(g.broll === g.ids.length ? 'b-roll' : `${g.broll} b-roll`)
    return `<li class="org-grupo"><span class="org-grupo-ic">${icon(g.audio ? 'mic' : 'camera')}</span><div><b>${h(g.camera)}</b><small>${det.join(' · ')}${g.sugeridos ? ` · <span class="org-sug">${marcado ? 'corrigido' : 'sugerido'}</span>` : ''}</small></div>${sel}</li>`
  }
  const blocos = [...porMomento.values()]
    .map((b) => {
      const sug = b.linhas.some((l) => l.sugeridos && !l.ids.every((id) => manual[id]))
      return `<div class="org-momento"><div class="org-momento-topo"><h4>${h(b.pasta)}</h4>${sug ? '<span class="chip chip-warn">Confira</span>' : ''}</div><ul class="org-grupos">${b.linhas.map(linha).join('')}</ul></div>`
    })
    .join('')
  const tipo = tipoDe(p.type)
  const dv = mandarParaDavinci()
  return `<div class="org-estudo">
    <div class="org-stats">${stat(prontos.length, 'arquivos')}${stat(cams, cams === 1 ? 'câmera' : 'câmeras')}${stat(duracao(dur), 'de imagem')}${stat(prontos.length ? `${Math.round((sinc / prontos.length) * 100)}%` : '–', 'sincronizado')}${stat(m.broll || 0, 'b-roll')}</div>
    <div class="org-estudo-topo"><div><h3>${tipo ? h(tipo.label) : 'Momentos'}</h3><p class="sub">${m.sugeridos ? `${plural(m.sugeridos, 'clipe foi sugerido', 'clipes foram sugeridos')} pelo horário. Troque o momento se não for.` : 'Tudo pela pasta ou pelo que você marcou.'}</p></div>
      <button class="btn btn-ghost btn-sm" data-act="org-tipo" data-id="${h(pasta.id)}">${icon('edit')}Tipo</button></div>
    ${blocos || '<p class="sub">Nenhum clipe pronto nesta pasta.</p>'}
    <div class="org-estudo-acoes"><button class="btn btn-primary" data-act="org-mandar" data-id="${h(pasta.id)}">${icon(dv ? 'film' : 'export')}${dv ? 'Mandar para o DaVinci' : 'Gerar Premiere e Final Cut'}</button>${arquivosGerados(pasta.id, p)}</div>
    <p class="sub org-pastas-trabalho">${icon('lock')}<span>Os originais ficam onde estão: a organização vive no editor e na pasta <b>Synquei</b>.</span></p>
  </div>`
}

/** Pasta livre ("Organizar uma pasta"): sem vigia, estudada quando a pessoa pede. */
function pastaLivre(pasta) {
  const c = (pasta.cartoes || [])[0]
  const atual = O.atual && O.atual.pastaId === pasta.id
  const naFila = O.fila.some((x) => x.pastaId === pasta.id)
  const e = estudoDe(pasta.id)
  const p = e && projetoSalvo(e.projetoId)
  const tipo = tipoDe(pasta.tipo)
  let corpo
  if (atual) corpo = `<div class="info-box org-agora is-live">${icon('sync')}<div><b>${h(O.etapa || 'Estudando a pasta')}</b>${S.sync.running ? ` · ${S.sync.done}/${S.sync.total}` : ''}</div></div>`
  else if (naFila) corpo = `<p class="sub">${icon('clock')} Na fila para estudar.</p>`
  else if (c && c.estado === 'erro') corpo = `<div class="warn-box">${icon('warn')}<div>${h(c.erro || 'Não deu certo.')} <a href="#" data-act="org-estudar" data-id="${h(pasta.id)}" style="text-decoration:underline">Tentar de novo</a></div></div>`
  else if (p) corpo = estudo(pasta, p)
  else corpo = `<p class="sub">Ainda não estudada.</p>`
  const enviado = O.enviados[pasta.id]
  return `<section class="card org-pasta org-livre"><header class="card-head"><div><h2>${h(pasta.nome)}</h2><p class="sub mono" style="font-size:12px">${h(pasta.raiz)}</p></div>
    <div style="display:flex;gap:6px;align-items:center;flex-wrap:wrap">${tipo ? `<span class="chip">${icon(tipo.icon)}${h(tipo.label)}</span>` : ''}${enviado ? `<span class="chip chip-ok">${icon('check')}Mandado ${ago(enviado)}</span>` : ''}
    <button class="btn btn-ghost btn-sm" data-act="org-abrir" data-id="${h(pasta.id)}">${icon('folder')}Abrir pasta</button>
    <button class="btn btn-ghost btn-sm" data-act="org-estudar" data-id="${h(pasta.id)}" ${atual || naFila ? 'disabled' : ''} title="Lê o que entrou de novo na pasta (o que já foi lido fica)">${icon('sync')}Estudar de novo</button>
    <button class="icon-btn" data-act="org-tirar" data-id="${h(pasta.id)}" aria-label="Tirar da lista">${icon('trash')}</button></div></header>
    <div class="card-pad">${corpo}</div></section>`
}

export default {
  title: 'Organizar',
  render() {
    if (!O.ativo)
      return `<div class="page tela"><header class="page-head"><div><h1>Organizar</h1><p class="page-lead">SOBEDESCE › Synquei › DaVinci, sozinho a cada cartão.</p></div></header>
        <div class="info-box">${icon('info')}<div>O Organizar vigia pastas do seu computador e fala com o DaVinci: só funciona no <b>app de desktop</b> do Synquei. <a href="https://absolutezro.com/baixar" target="_blank" rel="noopener" style="text-decoration:underline">Use no computador com a Absolute ZRO</a></div></div></div>`
    const livres = O.pastas.filter((p) => p.origem === 'livre')
    const vigiadas = O.pastas.filter((p) => p.origem !== 'livre')
    return `<div class="page tela"><header class="page-head"><div><h1>Organizar</h1><p class="page-lead">O material entende o tipo de vídeo e chega no editor por momento, câmera e cartão.</p></div><div class="page-actions"><button class="btn btn-secondary" data-act="org-add">${icon('download')}Ligar pasta do SOBEDESCE</button><button class="btn btn-primary" data-act="org-livre">${icon('folder')}Organizar uma pasta</button></div></header>
      ${vigiadas.length ? fluxo() : ''}
      ${agora()}
      <div class="settings stagger">
        ${livres.map(pastaLivre).join('')}
        ${vigiadas.map(pasta).join('')}
        ${
          O.pastas.length
            ? ''
            : `<section class="card"><div class="card-pad org-vazio">${icon('folder')}<div><b>Uma pasta do SSD ou a do SOBEDESCE</b><p class="sub">Escolha o tipo de vídeo e a pasta: o Synquei estuda, mostra os momentos para você conferir e manda para o editor. Os originais não saem do lugar.</p></div><button class="btn btn-primary" data-act="org-livre">${icon('folder')}Organizar uma pasta</button></div></section>`
        }
        ${davinci()}
      </div></div>`
  },
  acts: {
    'org-add': () => adicionarPasta(),
    'org-livre': async () => {
      const r = await escolherTipo({ novo: true })
      if (r && r.type) organizarPastaLivre(r.type)
    },
    'org-estudar': (el, e) => {
      if (e) e.preventDefault()
      estudarPastaLivre(el.dataset.id)
    },
    'org-mandar': (el) => mandarEstudo(el.dataset.id),
    'org-mostrar': (el) => mostrarArquivo(el.dataset.id, el.dataset.arquivo),
    'org-tipo': async (el) => {
      const e = estudoDe(el.dataset.id)
      const p = e && projetoSalvo(e.projetoId)
      if (!p) return
      const r = await escolherTipo({ name: p.name, type: p.type, multicam: p.export && p.export.multicam, novo: false })
      if (r && r.type && (r.type !== p.type || r.multicam !== (p.export && p.export.multicam))) trocarTipoDoEstudo(el.dataset.id, r)
    },
    'org-agora': (el, e) => {
      e.preventDefault()
      organizarAgora()
    },
    'org-abrir': (el) => api.abrir(el.dataset.id),
    'org-tudo': async (el) => {
      if (await modal({ title: 'Organizar tudo de novo?', body: 'Todos os cartões desta pasta passam outra vez pelo Synquei e pelo DaVinci. O que já está no DaVinci não é importado de novo; as linhas do tempo da diária são trocadas (as que você editou ficam guardadas com outro nome).', ok: 'Organizar de novo' })) reorganizarTudo(el.dataset.id)
    },
    'org-tirar': async (el) => {
      if (await modal({ title: 'Parar de vigiar esta pasta?', body: 'Ela sai da lista. Os arquivos, os projetos do Synquei e o que está no DaVinci continuam onde estão.', ok: 'Parar de vigiar', danger: true })) api.remover(el.dataset.id)
    },
    'org-proj': (el) => {
      if (openProject(el.dataset.id)) go('linha')
    },
    'org-instalar': async () => {
      try {
        await globalThis.synqueiDesktop.davinci.instalar()
        await modal({ title: 'Ponte instalada', body: 'Agora, no DaVinci Resolve Studio: Workspace › Scripts › Synquei. Deixe a janelinha aberta. Se o DaVinci já estava aberto, feche e abra de novo para o script aparecer no menu.', ok: 'Entendi', cancel: false })
      } catch (e) {
        await modal({ title: 'Não consegui instalar', body: h(e.message || String(e)), ok: 'Ok', cancel: false })
      }
      atualizarDavinci()
    },
    'org-dv-status': () => atualizarDavinci(),
  },
  changes: {
    'org-davinci': (el) => setMandarParaDavinci(el.checked),
    'org-momento': (el) => {
      const e = estudoDe(el.dataset.id)
      const p = e && projetoSalvo(e.projetoId)
      const g = p && p.momentos && p.momentos.grupos[Number(el.dataset.g)]
      if (g) corrigirNoEstudo(el.dataset.id, g.ids, el.value || null)
    },
    'org-ligar': (el) => api.ligar(el.dataset.id, el.checked),
  },
}

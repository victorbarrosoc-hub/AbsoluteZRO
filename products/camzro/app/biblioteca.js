// CAMZRO · os clipes deste aparelho: por dia, com o bom take marcado, para rever, mandar para o rolo de fotos ou para
// outro app (compartilhar), e para DESCARREGAR numa pasta (SSD, HD, pasta do computador) com conferência: cada
// arquivo copiado é lido de volta e o xxh64 tem que bater com o do original (o mesmo algoritmo e o mesmo relatório
// "<hash>  <arquivo>" do SOBEDESCE e do xxhsum). Só depois de conferido o clipe aparece como descarregado.
// O CAMZRO nunca apaga um clipe sozinho: apagar pede dois toques.

import { A, S, $, avisar, atualizarTela } from './app.js'
import { topo, grupo, nota, esc } from './paineis.js'
import { svg, pintar } from './icones.js'
import * as arm from './motor/armazem.js'
import * as md from './nucleo/metadados.js'
import { duracaoTexto } from './nucleo/timecode.js'
import { bytesTexto } from './nucleo/armazenamento.js'
import { marcaCurta } from './nucleo/claquete.js'

const urls = new Map()
const url = (chave, blob) => {
  if (urls.has(chave)) URL.revokeObjectURL(urls.get(chave))
  const u = URL.createObjectURL(blob)
  urls.set(chave, u)
  return u
}

/** Miniatura 192×108 do quadro de agora (no fim do take), guardada ao lado do clipe. Devolve a URL. */
export async function miniaturaDoVideo(video, nome) {
  try {
    const c = document.createElement('canvas')
    c.width = 192
    c.height = 108
    c.getContext('2d').drawImage(video, 0, 0, c.width, c.height)
    const blob = await new Promise((r) => c.toBlob(r, 'image/jpeg', 0.8))
    if (!blob) return null
    const w = await arm.escritorSimples(`${nome}.jpg`)
    await w.write(blob)
    await w.close()
    return url(nome, blob)
  } catch {
    return null
  }
}

export async function miniaturaSalva(nome) {
  try {
    return url(nome, await arm.arquivo(`${nome}.jpg`))
  } catch {
    return null
  }
}

let lista = []
const selecionados = new Set()
let selecionando = false
let apagando = null
let descarga = null // { feitos, total, bytes, totalBytes, erro }

const dia = (c) => new Date(c.sidecar?.criado || c.modificado).toLocaleDateString('pt-BR', { weekday: 'short', day: '2-digit', month: 'short' })

export async function folhaBiblioteca() {
  lista = (await arm.listar().catch(() => [])).filter((c) => !c.gravando)
  const espaco = await arm.espaco()
  if (!lista.length)
    return `${topo('', 'Clipes')}<div class="vazio">${svg('biblioteca')}<b>Nenhum clipe ainda.</b><br>Os takes ficam aqui, no aparelho.</div>`
  const total = lista.reduce((t, c) => t + c.tamanho, 0)
  const porDia = new Map()
  for (const c of lista) {
    const d = dia(c)
    if (!porDia.has(d)) porDia.set(d, [])
    porDia.get(d).push(c)
  }
  const miniaturas = await Promise.all(lista.map((c) => miniaturaSalva(c.nome)))
  const mini = new Map(lista.map((c, i) => [c.nome, miniaturas[i]]))
  const cartaoClipe = (c) => {
    const s = c.sidecar
    const bom = Boolean(s?.claquete?.bom)
    const desc = s?.descargas?.length ? ` · ${svg('ok').replace('width="24" height="24"', 'width="12" height="12"')} descarregado` : ''
    const info = s ? `${esc(marcaCurta(s.claquete))} · ${duracaoTexto(s.duracao_s)} · ${esc(s.timecode?.inicio || '')}` : bytesTexto(c.tamanho)
    const img = mini.get(c.nome)
    return `<div class="clipe" data-nome="${esc(c.nome)}">
      <button type="button" class="clipe__img" data-acao="ver" aria-label="Ver ${esc(c.nome)}"${img ? ` style="background-image:url(${img})"` : ''}>${selecionando ? svg(selecionados.has(c.nome) ? 'ok' : 'mais') : svg('play')}</button>
      <div><b>${esc(c.nome)}</b><small>${info}</small><small>${bytesTexto(c.tamanho)}${s?.recuperado ? ' · recuperado' : ''}${s && s.fechado === false ? ' · MP4 fragmentado' : ''}${desc}</small></div>
      <div class="clipe__acoes">
        <button type="button" data-acao="bom" aria-pressed="${bom}" aria-label="Bom take" title="Bom take">${svg(bom ? 'estrelaCheia' : 'estrela')}</button>
        <button type="button" data-acao="mandar" aria-label="Compartilhar" title="Salvar no rolo / mandar">${svg('compartilhar')}</button>
        <button type="button" data-acao="apagar" aria-label="Apagar" title="${apagando === c.nome ? 'Toque de novo para apagar' : 'Apagar'}"${apagando === c.nome ? ' class="perigo"' : ''}>${svg(apagando === c.nome ? 'alerta' : 'lixo')}</button>
      </div></div>`
  }
  const grupos = [...porDia].map(([d, cs]) => grupo(`${d} · ${cs.length} ${cs.length === 1 ? 'clipe' : 'clipes'}`, `<div class="clipes">${cs.map(cartaoClipe).join('')}</div>`)).join('')
  const progresso = descarga ? `<div class="grupo"><div class="progresso"><i style="width:${Math.round((descarga.bytes / Math.max(1, descarga.totalBytes)) * 100)}%"></i></div>${nota(descarga.erro ? `<b>${esc(descarga.erro)}</b>` : `Copiando e conferindo ${descarga.feitos} de ${descarga.total}…`)}</div>` : ''
  const alvo = selecionando && selecionados.size ? `${selecionados.size} selecionado${selecionados.size > 1 ? 's' : ''}` : 'Todos'
  return `${topo('', 'Clipes')}
    <div id="reprodutor-casa"></div>
    ${progresso}
    <div class="acoes-folha">
      <button type="button" class="glass-btn glass-btn--pequeno" data-acao="selecionar">${selecionando ? 'Pronto' : 'Selecionar'}</button>
      ${'showDirectoryPicker' in window ? `<button type="button" class="glass-btn glass-btn--pequeno glass-btn--ink" data-acao="descarregar"${descarga && !descarga.erro && descarga.feitos < descarga.total ? ' disabled' : ''}>${svg('pasta')}Descarregar · ${alvo}</button>` : ''}
      ${selecionando && selecionados.size ? `<button type="button" class="glass-btn glass-btn--pequeno" data-acao="mandar-varios">${svg('compartilhar')}Mandar</button>` : ''}
    </div>
    ${grupos}
    ${grupo('Para a edição', `<div class="acoes-folha"><button type="button" class="glass-btn glass-btn--pequeno" data-acao="csv">CSV do DaVinci</button><button type="button" class="glass-btn glass-btn--pequeno" data-acao="ale">ALE</button><button type="button" class="glass-btn glass-btn--pequeno" data-acao="relatorio">Relatório de câmera</button></div>`)}
    ${nota(`${lista.length} clipes · ${bytesTexto(total)} · ${bytesTexto(espaco.livre)} livres. ${'showDirectoryPicker' in window ? 'A descarga confere cada cópia (xxh64) antes de marcar.' : 'Para descarregar com conferência, abra no computador (Chrome ou Edge).'}`)}`
}

const alvoSelecionado = () => (selecionando && selecionados.size ? lista.filter((c) => selecionados.has(c.nome)) : lista)
const sidecarsDe = (cs) => cs.map((c) => c.sidecar).filter(Boolean)

function baixar(nomeArquivo, conteudo, tipo) {
  const a = document.createElement('a')
  a.href = URL.createObjectURL(conteudo instanceof Blob ? conteudo : new Blob([conteudo], { type: tipo }))
  a.download = nomeArquivo
  document.body.append(a)
  a.click()
  a.remove()
  setTimeout(() => URL.revokeObjectURL(a.href), 5000)
}

const tipoDe = (n) => (/\.mov$/i.test(n) ? 'video/quicktime' : /\.webm$/i.test(n) ? 'video/webm' : 'video/mp4')

async function mandar(cs) {
  const arquivos = []
  for (const c of cs) {
    const f = await arm.arquivo(c.arquivo)
    arquivos.push(new File([f], c.arquivo, { type: tipoDe(c.arquivo) }))
  }
  if (navigator.canShare?.({ files: arquivos })) {
    try {
      await navigator.share({ files: arquivos })
      return
    } catch (e) {
      if (e?.name === 'AbortError') return
    }
  }
  for (const f of arquivos) baixar(f.name, f)
}

/** Marca (ou desmarca) o bom take: o último clipe, ou o `nome`. */
export async function marcarBom(nome = S.ultimoClipe?.nome, valor) {
  if (!nome) return avisar('Grave um take primeiro.')
  const s = await arm.lerJson(`${nome}.json`)
  if (!s) return avisar('Este clipe não tem ficha.')
  s.claquete.bom = valor ?? !s.claquete.bom
  await arm.salvarJson(`${nome}.json`, s)
  avisar(s.claquete.bom ? `${nome}: bom take` : `${nome}: desmarcado`)
  return s.claquete.bom
}

/** xxh64 de um Blob em blocos (sem carregar o arquivo inteiro na memória). */
let xx = null
async function xxh64(blob, aoBytes = () => {}) {
  xx ??= (await import('./vendor/xxhash-wasm.js')).default()
  const h = (await xx).create64()
  const leitor = blob.stream().getReader()
  for (;;) {
    const { done, value } = await leitor.read()
    if (done) break
    h.update(value)
    aoBytes(value.byteLength)
  }
  return h.digest().toString(16).padStart(16, '0')
}

/**
 * Descarga conferida: escolhe a pasta, cria <projeto ou CAMZRO>/<AAMMDD>/<rolo>/ e copia vídeo, ficha e miniatura.
 * Cada vídeo: hash da origem, cópia, releitura do destino, hash de novo; só iguais contam. No fim, o relatório
 * CAMZRO_copia_<data>.xxh64, o CSV do DaVinci, o ALE e o relatório de câmera na mesma pasta.
 */
async function descarregar(cs, redesenhar) {
  let raiz
  try {
    raiz = await window.showDirectoryPicker({ id: 'camzro-descarga', mode: 'readwrite', startIn: 'videos' })
  } catch {
    return
  }
  const limpo = (t) => String(t || '').replace(/[\\/:*?"<>|\u0000-\u001f]/g, ' ').trim().slice(0, 60)
  descarga = { feitos: 0, total: cs.length, bytes: 0, totalBytes: cs.reduce((t, c) => t + c.tamanho * 3, 0), erro: null }
  redesenhar()
  const linhasHash = []
  const fichas = []
  const agora = new Date()
  try {
    for (const c of cs) {
      const s = c.sidecar
      const projeto = limpo(s?.claquete?.projeto) || 'CAMZRO'
      const data = (s?.clipe || c.nome).split('_')[1] || 'sem-data'
      const rolo = limpo(s?.claquete?.rolo) || 'A001'
      let dir = await raiz.getDirectoryHandle(projeto, { create: true })
      dir = await dir.getDirectoryHandle(data, { create: true })
      dir = await dir.getDirectoryHandle(rolo, { create: true })
      const origem = await arm.arquivo(c.arquivo)
      const hashOrigem = await xxh64(origem, (b) => (descarga.bytes += b))
      const fh = await dir.getFileHandle(c.arquivo, { create: true })
      const w = await fh.createWritable()
      await origem.stream().pipeTo(w)
      descarga.bytes += origem.size
      const hashDestino = await xxh64(await fh.getFile(), (b) => (descarga.bytes += b))
      if (hashDestino !== hashOrigem) throw new Error(`${c.arquivo}: a cópia não bate com o original. Nada foi marcado.`)
      linhasHash.push(`${hashOrigem}  ${projeto}/${data}/${rolo}/${c.arquivo}`)
      // a LUT do monitor, quando havia, vai junto
      try {
        const cubo = await arm.arquivo(`${c.nome}.cube`)
        const wc = await (await dir.getFileHandle(`${c.nome}.cube`, { create: true })).createWritable()
        await cubo.stream().pipeTo(wc)
      } catch {}
      if (s) {
        const nova = { ...s, descargas: [...(s.descargas || []), { pasta: `${raiz.name}/${projeto}/${data}/${rolo}`, xxh64: hashOrigem, em: new Date().toISOString() }] }
        await arm.salvarJson(`${c.nome}.json`, nova)
        const fj = await (await dir.getFileHandle(`${c.nome}.json`, { create: true })).createWritable()
        await fj.write(new Blob([JSON.stringify(nova, null, 2)], { type: 'application/json' }))
        await fj.close()
        fichas.push(nova)
      }
      descarga.feitos++
      redesenhar()
    }
    const carimbo = agora.toISOString().slice(0, 16).replace(/[-:T]/g, '')
    const escrever = async (nome, texto, tipo) => {
      const w = await (await raiz.getFileHandle(nome, { create: true })).createWritable()
      await w.write(new Blob([texto], { type: tipo }))
      await w.close()
    }
    await escrever(`CAMZRO_copia_${carimbo}.xxh64`, `${linhasHash.join('\n')}\n`, 'text/plain')
    if (fichas.length) {
      await escrever(`CAMZRO_${carimbo}_DaVinci.csv`, md.csvResolve(fichas), 'text/csv')
      await escrever(`CAMZRO_${carimbo}.ale`, md.ale(fichas), 'text/plain')
      await escrever(`CAMZRO_${carimbo}_relatorio.html`, md.relatorioHtml(fichas), 'text/html')
    }
    avisar(`${cs.length} ${cs.length === 1 ? 'clipe copiado e conferido' : 'clipes copiados e conferidos'}.`, { ms: 5000 })
    descarga = null
  } catch (e) {
    descarga.erro = e?.message || 'A descarga parou.'
    avisar(descarga.erro, { ruim: true, ms: 7000 })
  }
  redesenhar()
}

/** Liga os cliques da folha de clipes (a folha é redesenhada a cada mudança). */
export function ligarBiblioteca(corpo) {
  const redesenhar = async () => {
    if (corpo.dataset.aberta !== 'biblioteca') return
    const rolagem = corpo.scrollTop
    corpo.innerHTML = await folhaBiblioteca()
    pintar(corpo)
    corpo.scrollTop = rolagem
  }
  corpo.onclick = async (e) => {
    const ac = e.target.closest('[data-acao]')
    if (!ac || corpo.dataset.aberta !== 'biblioteca') return
    e.stopPropagation()
    const nome = ac.closest('[data-nome]')?.dataset.nome
    const c = lista.find((x) => x.nome === nome)
    switch (ac.dataset.acao) {
      case 'ver': {
        if (selecionando) {
          if (selecionados.has(nome)) selecionados.delete(nome)
          else selecionados.add(nome)
          return redesenhar()
        }
        const f = await arm.arquivo(c.arquivo)
        const casa = $('reprodutor-casa')
        casa.innerHTML = `<video class="reprodutor" controls playsinline src="${url(`ver:${nome}`, f)}"></video>`
        casa.querySelector('video').play().catch(() => {})
        corpo.scrollTop = 0
        return
      }
      case 'bom':
        await marcarBom(nome)
        return redesenhar()
      case 'mandar':
        return mandar([c])
      case 'mandar-varios':
        return mandar(alvoSelecionado())
      case 'apagar':
        if (apagando !== nome) {
          apagando = nome
          setTimeout(() => {
            if (apagando === nome) {
              apagando = null
              void redesenhar()
            }
          }, 4000)
          return redesenhar()
        }
        apagando = null
        await arm.apagar(c.arquivo)
        await arm.apagar(`${nome}.json`)
        await arm.apagar(`${nome}.jpg`)
        await arm.apagar(`${nome}.cube`)
        if (S.ultimoClipe?.nome === nome) S.ultimoClipe = null
        avisar(`${nome} apagado.`)
        atualizarTela()
        return redesenhar()
      case 'selecionar':
        selecionando = !selecionando
        selecionados.clear()
        return redesenhar()
      case 'descarregar':
        return descarregar(alvoSelecionado(), redesenhar)
      case 'csv':
        return baixar(`CAMZRO_${A.claquete.projeto || 'diaria'}_DaVinci.csv`, md.csvResolve(sidecarsDe(alvoSelecionado())), 'text/csv')
      case 'ale':
        return baixar(`CAMZRO_${A.claquete.projeto || 'diaria'}.ale`, md.ale(sidecarsDe(alvoSelecionado())), 'text/plain')
      case 'relatorio':
        return baixar(`CAMZRO_relatorio.html`, md.relatorioHtml(sidecarsDe(alvoSelecionado()), { titulo: A.claquete.projeto ? `Relatório de câmera · ${A.claquete.projeto}` : 'Relatório de câmera' }), 'text/html')
    }
  }
}

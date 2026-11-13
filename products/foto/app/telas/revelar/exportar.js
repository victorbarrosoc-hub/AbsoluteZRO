// Exportar esta foto (a ação secundária da Revelar; o lote é a aba Entregar). A sessão revela em resolução cheia
// (exportarPixels: na placa em ladrilhos, ou no worker) no espaço de cor da receita, e src/exportar (gerarSaida) faz o
// arquivo: tamanho, nitidez de saída, marca-d'água, perfil ICC, EXIF e XMP. Grava pelo seletor de arquivo do sistema
// quando existe (pedido ANTES de revelar: o navegador só abre o seletor logo depois do clique), senão baixa.

import { html, useRef, useState } from '../../preact.js'
import { Folha, Progresso, avisar } from '../../componentes/index.js'
import { NOME } from '../../nome.js'
import { PREDEFINICOES_DE_SAIDA, TIPOS_MIME, gerarSaida, receitaDaPredefinicao } from '../../../src/exportar/fila.js'
import { nomeDeSaida } from '../../../src/exportar/nome.js'

const semExtensao = (nome) => String(nome || 'foto').replace(/\.[^.]+$/, '')
const tamanho = (n) => (n > 1e6 ? `${(n / 1e6).toLocaleString('pt-BR', { maximumFractionDigits: 1 })} MB` : `${Math.max(1, Math.round(n / 1e3))} KB`)

/** A máscara da marca-d'água (alfa 0..1) desenhada num canvas com a fonte da casa. */
async function mascaraDe(texto) {
  await document.fonts?.ready
  const altura = 220
  const medir = new OffscreenCanvas(8, 8).getContext('2d')
  const fonte = `800 ${altura * 0.78}px 'Figtree Variable', system-ui, sans-serif`
  medir.font = fonte
  const largura = Math.ceil(medir.measureText(texto).width + altura * 0.3)
  const tela = new OffscreenCanvas(largura, altura)
  const c = tela.getContext('2d')
  c.font = fonte
  c.textBaseline = 'middle'
  c.textAlign = 'center'
  c.fillStyle = '#fff'
  c.fillText(texto, largura / 2, altura / 2)
  const { data } = c.getImageData(0, 0, largura, altura)
  const dados = new Float32Array(largura * altura)
  for (let i = 0; i < dados.length; i++) dados[i] = data[i * 4 + 3] / 255
  return { largura, altura, dados }
}

/** O codificador do navegador (WebP e JPEG abaixo de 90), pelo canvas. */
async function codificar({ formato, largura, altura, rgba, qualidade }) {
  const tela = new OffscreenCanvas(largura, altura)
  tela.getContext('2d').putImageData(new ImageData(new Uint8ClampedArray(rgba.buffer, rgba.byteOffset, largura * altura * 4), largura, altura), 0, 0)
  const blob = await tela.convertToBlob({ type: formato === 'webp' ? 'image/webp' : 'image/jpeg', quality: qualidade / 100 })
  return new Uint8Array(await blob.arrayBuffer())
}

/**
 * Revela e grava. `sessao`: a da tela; `foto`: a do catálogo; `ajustes` e `look` os de agora. `aoProgredir(0..1 | null)`.
 * Devolve { nome, bytes, largura, altura, gravado: 'arquivo' | 'download' }.
 */
export async function exportarFoto({ sessao, foto, ajustes, look, predefinicao, aoProgredir, sinal, alvo = null }) {
  const receita = receitaDaPredefinicao(predefinicao)
  const extensao = receita.formato === 'tiff' ? 'tif' : receita.formato === 'jpeg' ? 'jpg' : receita.formato
  const nome = nomeDeSaida(receita.nome, { nome: semExtensao(foto.nome) }, { extensao })
  const bits = receita.formato === 'tiff' || receita.formato === 'png' ? 16 : 8
  const lado = receita.tamanho.tipo === 'lado' ? receita.tamanho.px : null
  const px = await sessao.exportarPixels(ajustes, { tela: receita.espaco, bits, lado, aoProgredir: (p) => aoProgredir?.(p * 0.85), sinal, look })
  if (sinal?.aborted) throw new DOMException('Exportação cancelada.', 'AbortError')
  aoProgredir?.(null)
  const n = px.largura * px.altura
  const dados = new Float32Array(n * 3)
  if (bits === 8) {
    for (let i = 0; i < n; i++) {
      dados[i * 3] = px.dados[i * 4] / 255
      dados[i * 3 + 1] = px.dados[i * 4 + 1] / 255
      dados[i * 3 + 2] = px.dados[i * 4 + 2] / 255
    }
  } else for (let i = 0; i < n * 3; i++) dados[i] = px.dados[i] / 65535
  const mascara = receita.marcaDagua ? await mascaraDe(receita.marcaDagua.texto) : undefined
  const saida = await gerarSaida({ largura: px.largura, altura: px.altura, dados }, receita, {
    exif: { ...foto.exif },
    foto: { estrelas: foto.estrelas, cor: foto.cor, marca: foto.marca },
    software: NOME,
    mascara,
    codificar,
  })
  if (sinal?.aborted) throw new DOMException('Exportação cancelada.', 'AbortError')
  aoProgredir?.(1)
  const blob = new Blob([saida.bytes], { type: saida.tipo })
  if (alvo) {
    const escrever = await alvo.createWritable()
    await escrever.write(blob)
    await escrever.close()
    return { nome: alvo.name || nome, bytes: saida.bytes.length, largura: saida.largura, altura: saida.altura, gravado: 'arquivo' }
  }
  const url = URL.createObjectURL(blob)
  const a = document.createElement('a')
  a.href = url
  a.download = nome
  a.hidden = true
  document.body.append(a)
  a.click()
  a.remove()
  setTimeout(() => URL.revokeObjectURL(url), 60_000)
  return { nome, bytes: saida.bytes.length, largura: saida.largura, altura: saida.altura, gravado: 'download' }
}

/** A folha: escolher a saída, ver o progresso, cancelar. */
export function FolhaExportar({ aberta, aoFechar, sessao, foto, ajustes, look }) {
  const [escolha, definirEscolha] = useState('entrega')
  const [estado, definirEstado] = useState({ fase: 'escolher' })
  const controle = useRef(null)

  const fechar = () => {
    controle.current?.abort()
    controle.current = null
    definirEstado({ fase: 'escolher' })
    aoFechar()
  }
  const comecar = async () => {
    if (!foto || !sessao) return
    const receita = receitaDaPredefinicao(escolha)
    const extensao = receita.formato === 'tiff' ? 'tif' : 'jpg'
    let alvo = null
    if (typeof window.showSaveFilePicker === 'function') {
      try {
        alvo = await window.showSaveFilePicker({
          suggestedName: nomeDeSaida(receita.nome, { nome: semExtensao(foto.nome) }, { extensao }),
          types: [{ description: receita.formato.toUpperCase(), accept: { [TIPOS_MIME[receita.formato]]: [`.${extensao}`] } }],
        })
      } catch (e) {
        if (e?.name === 'AbortError') return
        alvo = null
      }
    }
    const c = new AbortController()
    controle.current = c
    definirEstado({ fase: 'revelando', progresso: 0 })
    try {
      const r = await exportarFoto({
        sessao,
        foto,
        ajustes,
        look,
        predefinicao: escolha,
        alvo,
        sinal: c.signal,
        aoProgredir: (p) => definirEstado((e) => (e.fase === 'revelando' ? { ...e, progresso: p } : e)),
      })
      if (c.signal.aborted) return
      definirEstado({ fase: 'pronto', ...r })
      avisar(`${r.nome} · ${tamanho(r.bytes)}`)
    } catch (e) {
      if (e?.name === 'AbortError') return definirEstado({ fase: 'escolher' })
      definirEstado({ fase: 'erro', mensagem: e?.message || 'Não deu para exportar.' })
    } finally {
      if (controle.current === c) controle.current = null
    }
  }

  const f = estado.fase
  return html`<${Folha} aberta=${aberta} aoFechar=${fechar} titulo=${['Exportar', 'esta foto.']} largura=${520} classe="folha-exportar">
    ${
      f === 'escolher' || f === 'erro'
        ? html`<div class="rv-saidas" role="radiogroup" aria-label="Saída">
              ${PREDEFINICOES_DE_SAIDA.map(
                (p) => html`<button
                  type="button"
                  role="radio"
                  class="rv-saida"
                  aria-checked=${p.id === escolha ? 'true' : 'false'}
                  data-saida=${p.id}
                  onClick=${() => definirEscolha(p.id)}
                >
                  <strong>${p.nome}</strong><span>${p.descricao}</span>
                </button>`,
              )}
            </div>
            ${f === 'erro' ? html`<div class="rv-nota rv-nota--erro" role="alert">${estado.mensagem}</div>` : null}
            <div class="folha-pe">
              <button type="button" class="vidro" onClick=${fechar}>Cancelar</button>
              <button type="button" class="vidro vidro--tinta" data-exportar-ir onClick=${comecar}>Exportar</button>
            </div>`
        : f === 'revelando'
          ? html`<div class="rv-exportando">
              <${Progresso} valor=${estado.progresso} rotulo="Exportando" />
              <span class="apoio">${estado.progresso == null ? 'Gravando o arquivo…' : 'Revelando em resolução cheia…'}</span>
              <div
                class="folha-pe"><button
                type="button"
                class="vidro"
                data-exportar-cancelar
                onClick=${() => controle.current?.abort()}>Cancelar</button></div
              >
            </div>`
          : html`<div class="rv-exportando" data-pronto>
              <span class="rv-exportado">${estado.nome}</span>
              <span class="apoio">${estado.largura} × ${estado.altura} px · ${tamanho(estado.bytes)}</span>
              <div class="folha-pe"><button type="button" class="vidro vidro--tinta" onClick=${fechar}>Pronto</button></div>
            </div>`
    }
  <//>`
}

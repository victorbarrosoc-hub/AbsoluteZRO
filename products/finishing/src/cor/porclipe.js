// Revela · CST por clipe. O Synquei já exporta um relatório (.csv) com cada arquivo e o aparelho que gravou; a Revela
// lê esse relatório, sugere o log de cada câmera (a pessoa confirma) e gera um script para o DaVinci Resolve que põe a
// LUT de CST certa no nó 1 de cada clipe da timeline aberta. As LUTs vão dentro do script (comprimidas): um arquivo só.
//
// O que o relatório não diz: o perfil de log. O Synquei sabe a câmera (pelo cartão, pelo nome do arquivo ou pelo nome
// da pasta), não o perfil que estava ligado nela; por isso a sugestão é só ponto de partida e a escolha é de quem usa.

import { ENTRADAS } from './espacos.js'

/** Lê uma linha de CSV com aspas ("a, b" e "" dentro de aspas). */
function campos(linha) {
  const saida = []
  let atual = ''
  let aspas = false
  for (let i = 0; i < linha.length; i++) {
    const c = linha[i]
    if (aspas) {
      if (c === '"' && linha[i + 1] === '"') {
        atual += '"'
        i++
      } else if (c === '"') aspas = false
      else atual += c
    } else if (c === '"') aspas = true
    else if (c === ',' || c === ';') {
      saida.push(atual)
      atual = ''
    } else atual += c
  }
  saida.push(atual)
  return saida
}

/**
 * Relatório do Synquei (`arquivo,caminho,aparelho,tipo,…,codec_video,…`) → clipes de vídeo agrupados por aparelho.
 * Devolve `{ aparelhos: [{ nome, arquivos: [..], sugestao }], ignorados }`; lança erro se não for o relatório.
 */
export function lerRelatorioSynquei(texto) {
  const linhas = texto
    .replace(/^﻿/, '')
    .split(/\r?\n/)
    .filter((l) => l.trim())
  const cabeca = campos(linhas[0] ?? '').map((c) => c.trim().toLowerCase())
  const col = (nome) => cabeca.indexOf(nome)
  if (col('arquivo') < 0 || col('aparelho') < 0) throw new Error('Esse arquivo não é o relatório do Synquei (.csv).')
  const grupos = new Map()
  let ignorados = 0
  for (const linha of linhas.slice(1)) {
    const v = campos(linha)
    const arquivo = (v[col('arquivo')] ?? '').trim()
    // só vídeo leva CST: áudio (sem codec de vídeo) fica de fora
    const video = col('codec_video') < 0 || (v[col('codec_video')] ?? '').trim()
    if (!arquivo || !video) {
      ignorados++
      continue
    }
    const nome = (v[col('aparelho')] ?? '').trim() || 'Sem aparelho'
    if (!grupos.has(nome)) grupos.set(nome, { nome, arquivos: [], sugestao: sugerirEntrada(nome) })
    grupos.get(nome).arquivos.push(arquivo)
  }
  return { aparelhos: [...grupos.values()], ignorados }
}

// Câmera → log mais comum nela. Só um ponto de partida: a pessoa confirma na tela.
const SUGESTOES = [
  [/\bfx ?(3|30|6|9)\b|a7 ?s|a7 ?(iv|4|c|r)|zv-?e|fx-?\d|venice|burano|sony/i, 'sony-slog3-cine'],
  [/alexa|amira|arri/i, 'arri-logc3'],
  [/\bc ?(70|80|200|300|400|500)\b|r5 ?c|cinema eos|canon/i, 'canon-clog3'],
  [/\bgh ?[5-7]\b|\bs ?[15]h?\b|s5 ?ii|lumix|panasonic/i, 'panasonic-vlog'],
  [/bmpcc|pocket|ursa|pyxis|blackmagic|braw/i, 'bmd-gen5'],
  [/x-?h2s?|x-?t[45]|x-?s20|fuji/i, 'fuji-flog2'],
  [/\bz ?(6|8|9)\b|zf|nikon|zr\b/i, 'nikon-nlog'],
  [/dji|ronin|mavic|avata|osmo|air ?\d|mini ?\d|inspire/i, 'dji-dlog'],
  [/\bred\b|komodo|raptor|v-raptor/i, 'red-log3g10'],
]

/** Nome do aparelho (como o Synquei mostra) → id de ENTRADAS, ou '' quando não dá para supor (celular, GoPro…). */
export function sugerirEntrada(nome) {
  if (/iphone|gopro|celular|pixel|android|gravador|zoom|tascam|rode/i.test(nome)) return ''
  for (const [re, id] of SUGESTOES) if (re.test(nome)) return id
  return ''
}

const ascii = (s) =>
  s
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .replace(/[^\w.-]+/g, '-')

/**
 * Script do Resolve (Python). `grupos`: [{ entrada: id de ENTRADAS, arquivos: [...], lut: base64 do .cube comprimido
 * com deflate (zlib) }]; `saida`: nome legível da saída. Grupos sem entrada ficam de fora.
 */
export function scriptPorClipe(grupos, saida) {
  const luts = {}
  const clipes = {}
  for (const g of grupos) {
    if (!g.entrada) continue
    const nome = `Revela CST ${ascii(ENTRADAS.find((e) => e.id === g.entrada)?.nome ?? g.entrada)} para ${ascii(saida)}.cube`
    luts[nome] = g.lut
    for (const a of g.arquivos) clipes[a.toLowerCase()] = nome
  }
  const n = Object.keys(clipes).length
  return `# Revela · CST por clipe (gerado em revela.absolutezro.com a partir do relatório do Synquei).
# No Resolve: abra a timeline com os clipes e rode em Workspace › Scripts (ou cole no Console, em Py3).
# O que faz: grava as LUTs de CST da Revela em ~/Revela/LUT e põe a LUT certa no nó 1 de cada clipe da timeline cujo
# arquivo está no relatório (${n} arquivo(s)). Não mexe em mídia nem em clipe que não está no relatório.
import base64, os, sys, zlib

SAIDA = ${JSON.stringify(saida)}
LUTS = ${JSON.stringify(luts)}
CLIPES = ${JSON.stringify(clipes, null, 1)}


def abrir_resolve():
    try:
        return bmd.scriptapp("Resolve")  # noqa: F821 (existe dentro do Resolve)
    except NameError:
        import DaVinciResolveScript as dvr

        return dvr.scriptapp("Resolve")


resolve = abrir_resolve()
projeto = resolve.GetProjectManager().GetCurrentProject() if resolve else None
timeline = projeto.GetCurrentTimeline() if projeto else None
if not timeline:
    print("Revela: abra o projeto e a timeline com os clipes antes de rodar.")
    sys.exit(1)

pasta = os.path.join(os.path.expanduser("~"), "Revela", "LUT")
os.makedirs(pasta, exist_ok=True)
caminhos = {}
for nome, dados in LUTS.items():
    caminho = os.path.join(pasta, nome)
    with open(caminho, "wb") as f:
        f.write(zlib.decompress(base64.b64decode(dados)))
    caminhos[nome] = caminho
try:
    projeto.RefreshLUTList()
except Exception:
    pass


def por_lut(item, caminho):
    try:
        if item.SetLUT(1, caminho):
            return True
    except Exception:
        pass
    try:  # Resolve 19 e depois: pelo grafo de nós
        return bool(item.GetNodeGraph().SetLUT(1, caminho))
    except Exception:
        return False


feitos, falhas, fora = 0, [], set()
for faixa in range(1, (timeline.GetTrackCount("video") or 0) + 1):
    for item in timeline.GetItemListInTrack("video", faixa) or []:
        clipe = item.GetMediaPoolItem()
        nome = (clipe.GetClipProperty("File Name") or "").lower() if clipe else ""
        lut = CLIPES.get(nome)
        if not lut:
            if nome:
                fora.add(nome)
            continue
        if por_lut(item, caminhos[lut]):
            feitos += 1
        else:
            falhas.append(nome)

print("Revela: CST para %s em %d clipe(s). LUTs em %s" % (SAIDA, feitos, pasta))
if falhas:
    print("Não aplicou em: " + ", ".join(sorted(set(falhas))))
if fora:
    print("%d clipe(s) da timeline fora do relatório do Synquei ficaram como estavam." % len(fora))
`
}

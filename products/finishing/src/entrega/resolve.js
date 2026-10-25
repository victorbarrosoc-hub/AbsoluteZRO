// Gera o script (Python) que configura a exportação no DaVinci Resolve Studio para um destino.
//
// O script não chuta nomes internos do Resolve: procura o formato e o codec pelo nome nas listas que o próprio Resolve
// devolve (GetRenderFormats / GetRenderCodecs), aplica cada ajuste do Deliver um por um e diz no fim o que o Resolve
// recusou, para conferir à mão. Termina salvando um preset de render com o nome do destino.
//
// Como rodar: Resolve Studio aberto com o projeto, Workspace › Scripts (o arquivo na pasta de scripts do Resolve) ou o
// console. Loudness não tem chave na API: fica na lista do que conferir.

import { bitratePara } from './destinos.js'

const py = (v) => JSON.stringify(v) // string/número/bool válidos em Python, menos true/false/null
const pyBool = (b) => (b ? 'True' : 'False')

/** Nome do arquivo .py para o destino. */
export const nomeScript = (d) => `revela-entrega-${d.id}.py`

export function gerarScript(d) {
  const v = d.video
  const tabela = v.bitrate ? Object.fromEntries(Object.entries(v.bitrate).map(([h, [p, a]]) => [Number(h), [p, a]])) : null
  const conferir = [
    ...d.avisos,
    d.audio.loudness ? `Loudness: ${d.audio.loudness.alvo} ${d.audio.loudness.unidade} ±${d.audio.loudness.tolerancia} (medidor do Fairlight).` : null,
    `Cor: grade em ${d.cor.nome}; arquivo marcado ${d.cor.h273} (H.273).`,
    `Cadência: ${v.fps}. O render sai na cadência da timeline.`,
  ].filter(Boolean)

  return `# Revela · exportação para ${d.nome}
# Gerado pela Revela (Absolute ZRO). Fontes e data de verificação: ${d.fontes.map((f) => `${f.titulo} (${f.verificadoEm})`).join('; ')}
# Rode no DaVinci Resolve Studio com o projeto aberto: Workspace > Scripts, ou cole no console Python.

NOME = ${py('Revela · ' + d.nome)}
FORMATO = ${py(v.formato)}
CODEC = ${py(v.codec)}
LARGURA = ${v.largura ?? 'None'}
ALTURA = ${v.altura ?? 'None'}
BITRATE = ${tabela ? py(tabela).replace(/"(\d+)":/g, '$1:') : 'None'}  # kbit/s por altura: [24-30 fps, 48-60 fps]
AJUSTES = {
    "ColorSpaceTag": ${py(d.cor.resolve.colorSpaceTag)},
    "GammaTag": ${py(d.cor.resolve.gammaTag)},
    "AudioCodec": ${py(d.audio.codec)},
    "AudioSampleRate": ${d.audio.taxa},${d.audio.bits ? `\n    "AudioBitDepth": ${d.audio.bits},` : ''}${v.perfil ? `\n    "EncodingProfile": ${py(v.perfil)},` : ''}${v.otimizarRede ? `\n    "NetworkOptimization": ${pyBool(true)},` : ''}
}
CONFERIR = ${py(conferir)}


def _resolve():
    r = globals().get("resolve")
    if r:
        return r
    try:
        return app.GetResolve()  # noqa: F821 (existe dentro do Resolve)
    except Exception:
        import DaVinciResolveScript as dvr
        return dvr.scriptapp("Resolve")


def _norm(s):
    return "".join(c for c in str(s).lower() if c.isalnum())


def configurar():
    resolve = _resolve()
    projeto = resolve.GetProjectManager().GetCurrentProject()
    if not projeto:
        print("Abra um projeto no Resolve antes de rodar.")
        return False
    recusados = []

    formatos = projeto.GetRenderFormats() or {}
    formato = next((nome for nome, ext in formatos.items() if _norm(ext) == _norm(FORMATO)), None)
    codecs = projeto.GetRenderCodecs(formatos.get(formato, FORMATO)) if formato else {}
    codec = next((cod for desc, cod in (codecs or {}).items() if _norm(desc) == _norm(CODEC)), None)
    if codec is None:
        codec = next((cod for desc, cod in (codecs or {}).items() if _norm(CODEC) in _norm(desc)), None)
    if not formato or not codec or not projeto.SetCurrentRenderFormatAndCodec(formatos[formato], codec):
        print("Não achei", FORMATO, "/", CODEC, "neste Resolve. Codecs disponíveis:", list((codecs or {}).keys()))
        return False

    largura = LARGURA or int(float(projeto.GetSetting("timelineResolutionWidth") or 1920))
    altura = ALTURA or int(float(projeto.GetSetting("timelineResolutionHeight") or 1080))
    fps = float(str(projeto.GetSetting("timelineFrameRate") or "24").split()[0])
    ajustes = dict(AJUSTES, FormatWidth=largura, FormatHeight=altura)
    if BITRATE:
        faixas = sorted(BITRATE)
        faixa = next((h for h in faixas if h >= altura), faixas[-1])
        ajustes["VideoQuality"] = BITRATE[faixa][1 if fps > 30 else 0]

    for chave, valor in ajustes.items():
        if not projeto.SetRenderSettings({chave: valor}):
            recusados.append("%s = %s" % (chave, valor))

    salvo = projeto.SaveAsNewRenderPreset(NOME)
    print("Revela: exportação configurada para", NOME.split(" · ")[-1], "(%dx%d)" % (largura, altura))
    print("Preset salvo:" if salvo else "Preset não salvo (já existe um com esse nome?):", NOME)
    if recusados:
        print("O Resolve recusou estes ajustes; confira no Deliver:", ", ".join(recusados))
    print("Antes do render, confira:")
    for item in CONFERIR:
        print(" -", item)
    return True


configurar()
`
}

/** Bitrate mostrado na tela para uma resolução comum (1080p 24–30). */
export const bitrateResumo = (d) => (d.video.bitrate ? bitratePara(d, d.video.altura ?? 1080, 30) : null)

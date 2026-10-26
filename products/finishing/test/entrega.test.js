import assert from 'node:assert/strict'
import { execFileSync } from 'node:child_process'
import { mkdtempSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { after, test } from 'node:test'
import { DESTINOS, GRUPOS, VERIFICADO_EM, bitratePara, destino } from '../src/entrega/destinos.js'
import { gerarScript, nomeScript } from '../src/entrega/resolve.js'

const dir = mkdtempSync(join(tmpdir(), 'revela-entrega-'))
after(() => rmSync(dir, { recursive: true, force: true }))

test('todo destino tem fonte com link, tipo e data de verificação (regra do PRD)', () => {
  assert.ok(DESTINOS.length >= 8)
  for (const d of DESTINOS) {
    assert.ok(GRUPOS.includes(d.grupo), `${d.id}: grupo`)
    assert.ok(d.fontes.length > 0, `${d.id}: sem fonte`)
    for (const f of d.fontes) {
      assert.match(f.url, /^https:\/\//, `${d.id}: link`)
      assert.ok(['oficial', 'mercado'].includes(f.tipo), `${d.id}: tipo`)
      assert.equal(f.verificadoEm, VERIFICADO_EM)
    }
    assert.ok(d.cor.resolve.colorSpaceTag && d.cor.resolve.gammaTag, `${d.id}: tags de cor`)
    assert.equal(d.audio.taxa, 48000, `${d.id}: áudio em 48 kHz`)
  }
  // o que a plataforma publica é oficial; o que não publica fica como mercado
  for (const id of ['youtube', 'youtube-hdr', 'vimeo', 'tv-aberta', 'streaming']) assert.equal(destino(id).fontes[0].tipo, 'oficial', id)
  for (const id of ['reels', 'tiktok']) assert.equal(destino(id).fontes[0].tipo, 'mercado', id)
})

test('bitrate pela altura e pela cadência (tabela do YouTube)', () => {
  const yt = destino('youtube')
  assert.equal(bitratePara(yt, 1080, 24), 8000)
  assert.equal(bitratePara(yt, 1080, 60), 12000)
  assert.equal(bitratePara(yt, 2160, 25), 45000)
  assert.equal(bitratePara(yt, 900, 30), 8000) // entre faixas: a de cima
  assert.equal(bitratePara(yt, 4320, 30), 45000) // acima da tabela: a maior
  assert.equal(bitratePara(destino('master'), 1080, 24), null) // ProRes não tem bitrate
})

// Resolve de mentira: devolve listas parecidas com as do Resolve e anota o que o script pediu
const FALSO = `
import json, sys
anotado = {"formato": None, "ajustes": {}, "preset": None}
class Projeto:
    def GetRenderFormats(self): return {"MP4": "mp4", "QuickTime": "mov"}
    def GetRenderCodecs(self, f): return {"mp4": {"H.264": "H264", "H.265": "H265"}, "mov": {"Apple ProRes 422": "ProRes422", "Apple ProRes 422 HQ": "ProRes422HQ", "Apple ProRes 4444 XQ": "ProRes4444XQ"}}[f]
    def SetCurrentRenderFormatAndCodec(self, f, c): anotado["formato"] = [f, c]; return True
    def GetSetting(self, k): return {"timelineResolutionWidth": "3840", "timelineResolutionHeight": "2160", "timelineFrameRate": "24"}.get(k)
    def SetRenderSettings(self, d):
        k = list(d)[0]
        if k == "GammaTag" and d[k] == "ST2084": return False  # um ajuste recusado
        anotado["ajustes"].update(d); return True
    def SaveAsNewRenderPreset(self, n): anotado["preset"] = n; return True
class Gerente:
    def GetCurrentProject(self): return Projeto()
class Resolve:
    def GetProjectManager(self): return Gerente()
resolve = Resolve()
exec(compile(open(sys.argv[1], encoding="utf-8").read(), sys.argv[1], "exec"))
print("JSON" + json.dumps(anotado, ensure_ascii=False))
`

function rodar(id) {
  const d = destino(id)
  const arquivo = join(dir, nomeScript(d))
  writeFileSync(arquivo, gerarScript(d))
  writeFileSync(join(dir, 'falso.py'), FALSO)
  const saida = execFileSync('python3', [join(dir, 'falso.py'), arquivo], { encoding: 'utf8' })
  return { saida, anotado: JSON.parse(saida.slice(saida.indexOf('JSON') + 4)) }
}

test('script do Resolve: YouTube em 4K 24 escolhe H.264, bitrate de 2160p e tags BT.709', () => {
  const { saida, anotado } = rodar('youtube')
  assert.deepEqual(anotado.formato, ['mp4', 'H264'])
  assert.equal(anotado.ajustes.VideoQuality, 45000)
  assert.equal(anotado.ajustes.FormatWidth, 3840)
  assert.equal(anotado.ajustes.ColorSpaceTag, 'Rec.709')
  assert.equal(anotado.ajustes.GammaTag, 'Rec.709')
  assert.equal(anotado.ajustes.NetworkOptimization, true)
  assert.equal(anotado.preset, 'Revela · YouTube')
  assert.match(saida, /Preset salvo/)
})

test('script do Resolve: vertical força 1080×1920; TV aberta vai em ProRes 422 HQ com PCM 24 bits', () => {
  const reels = rodar('reels').anotado
  assert.deepEqual([reels.ajustes.FormatWidth, reels.ajustes.FormatHeight], [1080, 1920])
  assert.equal(reels.ajustes.VideoQuality, 12000)
  const tv = rodar('tv-aberta')
  assert.deepEqual(tv.anotado.formato, ['mov', 'ProRes422HQ']) // não confunde com o ProRes 422 comum
  assert.equal(tv.anotado.ajustes.AudioBitDepth, 24)
  assert.equal(tv.anotado.ajustes.VideoQuality, undefined)
  assert.match(tv.saida, /-23 LKFS ±2/)
})

test('script do Resolve: o que o Resolve recusar aparece para conferir à mão', () => {
  const { saida, anotado } = rodar('youtube-hdr')
  assert.deepEqual(anotado.formato, ['mp4', 'H265'])
  assert.equal(anotado.ajustes.EncodingProfile, 'Main10')
  assert.match(saida, /recusou estes ajustes; confira no Deliver: GammaTag = ST2084/)
})

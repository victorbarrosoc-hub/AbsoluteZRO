// CST por clipe: o relatório de verdade do Synquei (a mesma função que o Synquei usa para exportar) entra na Revela, e
// o script gerado roda num Resolve de mentira em Python, que confere em qual clipe cada LUT foi parar.
import assert from 'node:assert/strict'
import { execFileSync } from 'node:child_process'
import { mkdtempSync, readFileSync, readdirSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { test } from 'node:test'
import { deflateSync } from 'node:zlib'
import { toCsv } from '../../synquei/app/js/export/others.js'
import { assar, escreverCube, lerCube } from '../src/cor/cube.js'
import { criarCst } from '../src/cor/espacos.js'
import { lerRelatorioSynquei, scriptPorClipe, sugerirEntrada } from '../src/cor/porclipe.js'

const projeto = {
  devices: [
    { id: 'd1', label: 'FX30 · Aladim' },
    { id: 'd2', label: 'Zoom H6' },
    { id: 'd3', label: 'iPhone' },
    { id: 'd4', label: 'GH6, "B"' },
  ],
  sessions: [],
  clips: [
    { id: 'c1', status: 'ready', name: 'C0001.MP4', relPath: 'A/C0001.MP4', deviceId: 'd1', kind: 'video', duration: 12, video: { codec: 'h264', width: 3840, height: 2160, rate: { num: 24000, den: 1001 } } },
    { id: 'c2', status: 'ready', name: 'C0002.MP4', relPath: 'A/C0002.MP4', deviceId: 'd1', kind: 'video', duration: 8, video: { codec: 'h264', width: 3840, height: 2160, rate: { num: 24000, den: 1001 } } },
    { id: 'c3', status: 'ready', name: 'ZOOM0001.WAV', relPath: 'B/ZOOM0001.WAV', deviceId: 'd2', kind: 'audio', duration: 30, audio: { codec: 'pcm' } },
    { id: 'c4', status: 'ready', name: 'IMG_0001.MOV', relPath: 'C/IMG_0001.MOV', deviceId: 'd3', kind: 'video', duration: 5, video: { codec: 'hevc', width: 1920, height: 1080, rate: { num: 30, den: 1 } } },
    { id: 'c5', status: 'ready', name: 'P1000001.MOV', relPath: 'D/P1000001.MOV', deviceId: 'd4', kind: 'video', duration: 5, video: { codec: 'h264', width: 3840, height: 2160, rate: { num: 25, den: 1 } } },
  ],
}

test('relatório do Synquei: clipes de vídeo por aparelho, áudio de fora, log sugerido pela câmera', () => {
  const { aparelhos, ignorados } = lerRelatorioSynquei(toCsv(projeto))
  assert.equal(ignorados, 1) // o WAV do Zoom
  assert.deepEqual(
    aparelhos.map((a) => [a.nome, a.arquivos, a.sugestao]),
    [
      ['FX30 · Aladim', ['C0001.MP4', 'C0002.MP4'], 'sony-slog3-cine'],
      ['iPhone', ['IMG_0001.MOV'], ''],
      ['GH6, "B"', ['P1000001.MOV'], 'panasonic-vlog'],
    ],
  )
  assert.throws(() => lerRelatorioSynquei('nome,tamanho\na,1'), /relatório do Synquei/)
})

test('sugestão de log: câmeras conhecidas, celular e GoPro sem log', () => {
  for (const [nome, id] of [
    ['Sony A7S III', 'sony-slog3-cine'],
    ['FX3', 'sony-slog3-cine'],
    ['Canon C70', 'canon-clog3'],
    ['Lumix S5 II', 'panasonic-vlog'],
    ['BMPCC 6K', 'bmd-gen5'],
    ['Fujifilm X-H2S', 'fuji-flog2'],
    ['Nikon Z8', 'nikon-nlog'],
    ['DJI Mavic 3', 'dji-dlog'],
    ['RED Komodo', 'red-log3g10'],
    ['ARRI Alexa Mini', 'arri-logc3'],
    ['GoPro', ''],
    ['iPhone 15', ''],
    ['Câmera B', ''],
  ])
    assert.equal(sugerirEntrada(nome), id, nome)
})

test('script do Resolve: grava as LUTs e põe cada uma no nó 1 do clipe certo (Resolve de mentira)', () => {
  const dir = mkdtempSync(join(tmpdir(), 'revela-porclipe-'))
  try {
    const lut = (id) => deflateSync(escreverCube(assar(criarCst(id, 'rec709').aplicar, 17), id)).toString('base64')
    const script = scriptPorClipe(
      [
        { entrada: 'sony-slog3-cine', arquivos: ['C0001.MP4', 'C0002.MP4'], lut: lut('sony-slog3-cine') },
        { entrada: '', arquivos: ['IMG_0001.MOV'], lut: null },
        { entrada: 'panasonic-vlog', arquivos: ['P1000001.MOV'], lut: lut('panasonic-vlog') },
      ],
      'Rec.709 · Gama 2.4',
    )
    writeFileSync(join(dir, 'revela.py'), script)
    // um Resolve de mentira: timeline com 4 clipes (um fora do relatório) e o registro de cada SetLUT
    writeFileSync(
      join(dir, 'rodar.py'),
      `import builtins, json, sys
chamadas = []
class Clipe:
    def __init__(s, nome): s.nome = nome
    def GetClipProperty(s, k): return s.nome if k == "File Name" else ""
class Item:
    def __init__(s, nome): s.clipe = Clipe(nome)
    def GetMediaPoolItem(s): return s.clipe
    def SetLUT(s, no, caminho):
        chamadas.append([s.clipe.nome, no, caminho.split("/")[-1]]); return True
class Timeline:
    def GetTrackCount(s, t): return 2
    def GetItemListInTrack(s, t, i): return [Item("C0001.MP4"), Item("IMG_0001.MOV")] if i == 1 else [Item("c0002.mp4"), Item("P1000001.MOV"), Item("OUTRO.MOV")]
class Projeto:
    def GetCurrentTimeline(s): return Timeline()
    def RefreshLUTList(s): return True
class Gerente:
    def GetCurrentProject(s): return Projeto()
class Resolve:
    def GetProjectManager(s): return Gerente()
class Bmd:
    def scriptapp(s, n): return Resolve()
builtins.bmd = Bmd()
exec(open(sys.argv[1], encoding="utf-8").read())
print("CHAMADAS" + json.dumps(chamadas))
`,
    )
    const saida = execFileSync('python3', [join(dir, 'rodar.py'), join(dir, 'revela.py')], { env: { ...process.env, HOME: dir }, encoding: 'utf8' })
    const chamadas = JSON.parse(saida.split('CHAMADAS')[1])
    assert.deepEqual(
      chamadas.map(([nome, no, arq]) => [nome, no, arq.includes('Sony') ? 'sony' : 'panasonic']),
      [
        ['C0001.MP4', 1, 'sony'],
        ['c0002.mp4', 1, 'sony'],
        ['P1000001.MOV', 1, 'panasonic'],
      ],
    )
    assert.match(saida, /CST para Rec\.709 · Gama 2\.4 em 3 clipe\(s\)/)
    assert.match(saida, /2 clipe\(s\) da timeline fora do relatório/) // o do iPhone (sem log) e o OUTRO
    // as LUTs gravadas são .cube válidos, iguais ao que a Revela gerou
    const pasta = join(dir, 'Revela', 'LUT')
    const arquivos = readdirSync(pasta)
    assert.equal(arquivos.length, 2)
    for (const a of arquivos) assert.equal(lerCube(readFileSync(join(pasta, a), 'utf8')).tamanho, 17)
  } finally {
    rmSync(dir, { recursive: true, force: true })
  }
})

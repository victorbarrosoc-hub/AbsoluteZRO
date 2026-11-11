// Arquivar (09/11/2026): RAW → DNG pelo Adobe DNG Converter, vídeo → H.265 pelo ffmpeg, o resto copiado, numa pasta
// irmã "<pasta> · arquivo". O original nunca muda e nada é gravado por cima. src/arquivar/servico.js
import { test } from 'node:test'
import assert from 'node:assert/strict'
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { execFileSync } from 'node:child_process'
import { Arquivador, argsDng, argsVideo, candidatosDng, codificadorVideo, lerPasta, pastaDoArquivo } from '../src/arquivar/servico.js'

const tmp = (p = 'sobedesce-arq-') => fs.mkdtempSync(path.join(os.tmpdir(), p))
const ffmpeg = (() => {
  try {
    execFileSync('ffmpeg', ['-version'], { stdio: 'ignore' })
    return 'ffmpeg'
  } catch {
    return null
  }
})()

function escrever(raiz, rel, conteudo) {
  const f = path.join(raiz, ...rel.split('/'))
  fs.mkdirSync(path.dirname(f), { recursive: true })
  fs.writeFileSync(f, conteudo)
  return f
}

test('argumentos: os quatro níveis do DNG e do vídeo (H.265 com hvc1, LUT antes, Econômico até 1920)', () => {
  assert.deepEqual(argsDng('maxima', '/c/A.ARW', '/d'), ['-c', '-p1', '-d', '/d', '/c/A.ARW'])
  assert.deepEqual(argsDng('economico', '/c/A.ARW', '/d').slice(0, 3), ['-lossy', '-side', '2560'])
  assert.throws(() => argsDng('tudo', 'a', 'b'), /Nível de foto/)
  const v = argsVideo({ entrada: '/c/C0001.MP4', saida: '/d/C0001.mp4', nivel: 'alta', encoder: 'libx265', lut: '/tmp/lut-slog3.cube' })
  assert.equal(v[v.indexOf('-crf') + 1], '23')
  assert.equal(v[v.indexOf('-tag:v') + 1], 'hvc1')
  const vf = v[v.indexOf('-vf') + 1]
  assert.match(vf, /lut3d=file=/)
  assert.ok(vf.indexOf('lut3d') < vf.indexOf('format=yuv420p'))
  assert.match(argsVideo({ entrada: 'a', saida: 'b', nivel: 'economico', encoder: 'hevc_videotoolbox' }).join(' '), /hevc_videotoolbox -q:v 42 .*/)
  assert.match(
    argsVideo({ entrada: 'a', saida: 'b', nivel: 'economico', encoder: 'libx264' })[
      argsVideo({ entrada: 'a', saida: 'b', nivel: 'economico', encoder: 'libx264' }).indexOf('-vf') + 1
    ],
    /min\(1920/,
  )
  assert.deepEqual(argsVideo({ entrada: 'a', saida: 'b', nivel: 'maxima', encoder: 'libx265', inicio: 30, duracao: 8 }).slice(3, 9), [
    '-ss',
    '30',
    '-i',
    'a',
    '-t',
    '8',
  ])
  assert.equal(pastaDoArquivo('/hd/P/Diária 01'), '/hd/P/Diária 01 · arquivo')
  assert.ok(candidatosDng({ env: {}, platform: 'darwin' })[0].endsWith('Adobe DNG Converter.app/Contents/MacOS/Adobe DNG Converter'))
  assert.ok(candidatosDng({ env: { ProgramFiles: 'C:\\Program Files' }, platform: 'win32' })[0].endsWith('Adobe DNG Converter.exe'))
})

test('codificador: H.265 pela placa no Mac, senão libx265, senão H.264', async () => {
  const run = (lista) => async () => ({ stdout: lista.map((n) => ` V..... ${n}  x\n`).join('') })
  assert.equal(await codificadorVideo('ff', { platform: 'darwin', run: run(['libx264', 'libx265', 'hevc_videotoolbox']) }), 'hevc_videotoolbox')
  assert.equal(await codificadorVideo('ff', { platform: 'win32', run: run(['libx264', 'libx265', 'hevc_videotoolbox']) }), 'libx265')
  assert.equal(await codificadorVideo('ff', { platform: 'linux', run: run(['libx264']) }), 'libx264')
})

test(
  'arquivar de verdade: DNG, vídeo em H.265 (ou H.264), o resto copiado; original igual; de novo não grava por cima',
  { skip: !ffmpeg && 'sem ffmpeg' },
  async () => {
    const origem = path.join(tmp(), 'Diária 01')
    fs.mkdirSync(origem)
    execFileSync('ffmpeg', [
      '-hide_banner',
      '-loglevel',
      'error',
      '-f',
      'lavfi',
      '-i',
      'testsrc=size=640x360:rate=25:duration=3',
      '-f',
      'lavfi',
      '-i',
      'sine=duration=3',
      '-c:v',
      'mpeg4',
      '-q:v',
      '2',
      '-c:a',
      'aac',
      '-shortest',
      path.join(origem, 'C0001.MOV'),
    ])
    const raw = escrever(origem, 'Fotos/DSC0001.ARW', Buffer.alloc(200_000, 7))
    escrever(origem, 'C0001M01.XML', '<x/>')
    escrever(origem, 'GL010001.LRV', Buffer.alloc(10))
    const antes = fs.readFileSync(path.join(origem, 'C0001.MOV'))
    // DNG Converter falso: grava "<nome>.dng" com metade do tamanho na pasta de -d
    const dir = tmp('sobedesce-dngfalso-')
    const dng = path.join(dir, 'dng.sh')
    fs.writeFileSync(dng, '#!/bin/sh\nwhile [ "$1" != "-d" ]; do shift; done; d="$2"; f="$3"; b=$(basename "$f"); head -c 100000 "$f" > "$d/${b%.*}.dng"\n', {
      mode: 0o755,
    })
    const mudou = []
    const a = new Arquivador({ cacheDir: tmp(), motor: async () => ({ ffmpeg: { path: 'ffmpeg' } }), dng: async () => dng, onChange: () => mudou.push(1) })
    const plano = await a.planejar(origem)
    assert.deepEqual([plano.raw, plano.videos, plano.outros, plano.dng, plano.video], [1, 1, 1, true, true], 'LRV fica de fora')
    const teste = await a.testar({ origem, nivel: 'equilibrado', perfil: 'slog3' })
    assert.ok(teste.segundos > 2 && teste.depoisPorSeg > 0 && teste.razao > 0)
    await a.iniciar({ origem, nivelFoto: 'alta', nivelVideo: 'economico', perfil: 'slog3' })
    await assert.rejects(a.iniciar({ origem }), /Já tem um arquivo/)
    await a.rodando
    const destino = `${origem} · arquivo`
    assert.equal(fs.statSync(path.join(destino, 'Fotos', 'DSC0001.dng')).size, 100_000)
    assert.ok(fs.statSync(path.join(destino, 'C0001.mp4')).size > 0)
    assert.equal(fs.readFileSync(path.join(destino, 'C0001M01.XML'), 'utf8'), '<x/>')
    assert.ok(!fs.existsSync(path.join(destino, 'GL010001.LRV')))
    assert.deepEqual(
      fs.readdirSync(destino).filter((n) => n.includes('sobedesce')),
      [],
      'nada provisório sobrou',
    )
    assert.ok(fs.readFileSync(path.join(origem, 'C0001.MOV')).equals(antes), 'o original não muda')
    assert.equal(fs.statSync(raw).size, 200_000)
    const u = a.estado().ultimo
    assert.deepEqual([u.feitos, u.total, u.ja, u.erros.length], [3, 3, 0, 0])
    assert.ok(mudou.length >= 3)
    // de novo: tudo já está lá
    await a.iniciar({ origem, nivelFoto: 'alta', nivelVideo: 'economico' })
    await a.rodando
    assert.equal(a.estado().ultimo.ja, 3)
    await assert.rejects(a.planejar(destino), /já é uma pasta de arquivo/)
    // sem o DNG Converter: converter foto é recusado com o caminho para resolver
    const sem = new Arquivador({ cacheDir: tmp(), motor: async () => ({ ffmpeg: { path: 'ffmpeg' } }), dng: async () => null })
    await assert.rejects(sem.iniciar({ origem, nivelFoto: 'alta' }), /instale o Adobe DNG Converter/)
    const l = await lerPasta(origem)
    assert.equal(l.videos.length, 1)
  },
)

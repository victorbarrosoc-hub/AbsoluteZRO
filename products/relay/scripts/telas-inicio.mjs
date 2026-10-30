// As telas de verdade da página inicial (app/inicio/telas/): o próprio Relay no Chromium, no claro e no escuro, no
// computador (1440×900) e no iPhone (390×844). O arquivo de exemplo é um vídeo montado pelo ffmpeg a partir da foto da
// página (app/inicio/praia.webp); a conta é de mentira (Lia Produtora), servida aqui, e nada sai da máquina.
//
//   node scripts/telas-inicio.mjs            → regrava as telas em app/inicio/telas/*.webp
//
// Precisa do ffmpeg (com libwebp) e do Chromium do Playwright, como os testes.

import { execFileSync } from 'node:child_process'
import { mkdtempSync, readFileSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { chromium } from 'playwright'
import { servir } from './servir.mjs'
import { especificacaoDe, exportar, presetPersonalizado } from '../src/personalizado.js'
import { preset } from '../src/presets.js'

const RAIZ = fileURLToPath(new URL('..', import.meta.url))
const SAIDA = join(RAIZ, 'app/inicio/telas')
const tmp = mkdtempSync(join(tmpdir(), 'relay-telas-'))
const ff = (...a) => execFileSync('ffmpeg', ['-v', 'error', '-y', ...a], { stdio: 'pipe' })

// o arquivo de exemplo: 4 s em 4K a partir da foto, com um leve avanço da câmera e som
const VIDEO = 'praia-por-do-sol.mp4'
ff(
  '-loop',
  '1',
  '-i',
  join(RAIZ, 'app/inicio/praia.webp'),
  '-f',
  'lavfi',
  '-i',
  'sine=f=220:d=4:sample_rate=48000',
  '-filter_complex',
  "[0:v]scale=3840:2160:flags=lanczos,zoompan=z='1+0.0008*on':x='iw/2-(iw/zoom/2)':y='ih/2-(ih/zoom/2)':d=96:s=3840x2160:fps=24,format=yuv420p[v]",
  '-map',
  '[v]',
  '-map',
  '1:a',
  '-t',
  '4',
  '-c:v',
  'libx264',
  '-crf',
  '23',
  '-preset',
  'veryfast',
  '-c:a',
  'aac',
  '-color_primaries',
  'bt709',
  '-color_trc',
  'bt709',
  '-colorspace',
  'bt709',
  join(tmp, VIDEO),
)

// presets da pessoa: fichas de verdade, montadas pelo núcleo do Relay
const MEUS = [
  presetPersonalizado({ ...especificacaoDe(preset('reels')), nome: 'Reels da marca', fps: 23.976, fpsModo: 'constante' }, 'meu-reels-marca'),
  presetPersonalizado({ ...especificacaoDe(preset('youtube-4k')), nome: 'Entrega cliente 4K', codec: 'hevc' }, 'meu-entrega-4k'),
]

const EU = {
  ok: true,
  acesso: true,
  pessoa: {
    id: 'lia-exemplo',
    nome: 'Lia Produtora',
    email: 'lia@produtora.com',
    foto: null,
    conta: 'https://absolutezro.com/perfil',
    organizacao: 'org-exemplo',
    produtos: ['relay'],
  },
}
const HORA = 3_600_000
const agora = Date.now()
const conv = (id, nome, preset, icone, entrada, saida, largura, altura, quando, projeto = null) => ({
  id,
  quando: agora - quando,
  entrada: { nome, bytes: entrada, duracao: 154, video: largura > 0 },
  preset: { id: preset, nome: icone[1], icone: icone[0], meu: preset.startsWith('meu-') },
  saida: {
    nome: `${nome.replace(/\.[^.]+$/, '')} (${icone[1]}).${largura ? 'mp4' : 'mp3'}`,
    bytes: saida,
    largura,
    altura,
    codec: largura ? 'avc' : 'mp3',
    pasta: false,
  },
  segundos: 40,
  projeto,
})
const PAINEL = {
  ok: true,
  equipe: true,
  conversoes: [
    conv('c1', 'Verão · master.mov', 'reels', ['instagram', 'Reels · No Compress'], 4.1e9, 2.6e8, 1080, 1920, 0.2 * HORA, 'pj-verao'),
    conv('c2', 'Verão · master.mov', 'youtube-4k', ['youtube', 'YouTube 4K'], 4.1e9, 8.9e8, 3840, 2160, 0.25 * HORA, 'pj-verao'),
    conv('c3', 'Verão · master.mov', 'whatsapp', ['whatsapp', 'WhatsApp'], 4.1e9, 3.1e7, 1280, 720, 0.3 * HORA, 'pj-verao'),
    conv('c4', 'Entrevista.mov', 'linkedin', ['linkedin', 'LinkedIn'], 2.2e9, 1.4e8, 1920, 1080, 5 * HORA),
    conv('c5', 'Trilha final.wav', 'mp3', ['onda', 'MP3 320'], 1.6e8, 6.1e6, 0, 0, 26 * HORA),
    conv('c6', 'Bastidores.mov', 'tiktok', ['tiktok', 'TikTok'], 1.3e9, 1.1e8, 1080, 1920, 30 * HORA),
  ],
  projetos: [
    {
      id: 'pj-verao',
      nome: 'Campanha de verão',
      destinos: ['reels', 'youtube-4k', 'whatsapp'],
      criado: agora - 50 * HORA,
      atualizado: agora - 0.2 * HORA,
      meu: true,
      equipe: true,
    },
    {
      id: 'pj-podcast',
      nome: 'Podcast semanal',
      destinos: ['youtube-1080', 'shorts', 'mp3'],
      criado: agora - 90 * HORA,
      atualizado: agora - 26 * HORA,
      meu: true,
      equipe: false,
    },
  ],
  presets: MEUS.map((p, i) => ({ id: p.id, meu: true, equipe: i === 0, ficha: especificacaoDe(p) })),
}

const servidor = await servir({
  porta: Number(process.env.PORT) || 0,
  recursos: { revela: false }, // as telas mostram o que a produção mostra (sem a cor da Revela, desligada lá)
  extra: async (req, res) => {
    const u = new URL(req.url, 'http://x')
    const json = (o, s = 200) => (res.writeHead(s, { 'Content-Type': 'application/json' }), res.end(JSON.stringify(o)), true)
    if (u.pathname === '/api/zro/eu') return json(EU)
    if (u.pathname.startsWith('/api/zro/set')) return json({ ok: false }, 401)
    if (u.pathname === '/api/relay/painel') {
      if (req.method === 'GET') return json(PAINEL)
      for await (const _ of req);
      return json({ ok: true, projeto: null })
    }
    if (u.pathname === `/exemplo/${VIDEO}`) {
      res.writeHead(200, { 'Content-Type': 'video/mp4', 'Cross-Origin-Resource-Policy': 'same-origin' })
      res.end(readFileSync(join(tmp, VIDEO)))
      return true
    }
    return false
  },
})
const base = `http://127.0.0.1:${servidor.address().port}`
const navegador = await chromium.launch({ args: ['--enable-unsafe-swiftshader'] })

const APARELHOS = {
  mac: { viewport: { width: 1440, height: 900 }, deviceScaleFactor: 1.25 },
  iphone: { viewport: { width: 390, height: 844 }, deviceScaleFactor: 2, isMobile: true, hasTouch: true },
}

async function pagina(aparelho, tema) {
  const ctx = await navegador.newContext({ ...APARELHOS[aparelho], reducedMotion: 'reduce' })
  await ctx.addInitScript(
    ([tema, ficha]) => {
      try {
        localStorage.setItem('relay-tema', tema)
        if (!localStorage.getItem('relay-meus-presets')) localStorage.setItem('relay-meus-presets', JSON.stringify(ficha))
      } catch {}
    },
    [tema, exportar(MEUS)],
  )
  const p = await ctx.newPage()
  p.on('pageerror', (e) => console.error('erro na página:', e.message))
  return { ctx, p }
}

async function arquivoDeExemplo(p) {
  await p.evaluate(async (video) => {
    const blob = await (await fetch(`/exemplo/${video}`)).blob()
    const dt = new DataTransfer()
    dt.items.add(new File([blob], video, { type: 'video/mp4' }))
    const input = document.getElementById('arquivos')
    input.files = dt.files
    input.dispatchEvent(new Event('change', { bubbles: true }))
  }, VIDEO)
  await p.waitForSelector('.item[data-estado="pronto"]', { timeout: 60_000 })
  await p.waitForTimeout(800) // a miniatura
}

const gravar = async (p, nome, opcoes = {}) => {
  const png = join(tmp, `${nome}.png`)
  await p.screenshot({ path: png, ...opcoes })
  ff('-i', png, '-c:v', 'libwebp', '-quality', '82', '-compression_level', '6', join(SAIDA, `${nome}.webp`))
  console.log(`app/inicio/telas/${nome}.webp`)
}

for (const tema of ['claro', 'escuro']) {
  // conversor: um arquivo, três destinos
  for (const aparelho of ['mac', 'iphone']) {
    const { ctx, p } = await pagina(aparelho, tema)
    await p.goto(`${base}/converter?preset=youtube-4k`)
    await p.waitForFunction(() => window.relayPronto)
    await p.locator('.preset', { hasText: 'Reels · No Compress' }).click()
    await p.locator('.preset', { hasText: 'WhatsApp' }).click()
    await arquivoDeExemplo(p)
    // no computador, duas: os destinos escolhidos (topo) e o arquivo com as três saídas (fim); no iPhone, o fim
    if (aparelho === 'mac') {
      await p.evaluate(() => scrollTo(0, 0))
      await p.waitForTimeout(300)
      await gravar(p, `converter-mac-${tema}`)
    }
    await p.evaluate(() => scrollTo(0, document.body.scrollHeight))
    await p.waitForTimeout(300)
    await gravar(p, `fila-${aparelho}-${tema}`)
    await ctx.close()
  }

  // meus presets: o editor da ficha, aberto a partir do Reels
  {
    const { ctx, p } = await pagina('mac', tema)
    await p.goto(`${base}/converter?aba=Meus`)
    await p.waitForFunction(() => window.relayPronto)
    await p.locator('.preset', { hasText: 'Reels da marca' }).first().waitFor()
    await p.locator('.preset', { hasText: 'Reels da marca' }).locator('.personalizar').click()
    await p.waitForSelector('dialog.folha[open]')
    await p.evaluate(() => (document.activeElement?.blur(), getSelection().removeAllRanges()))
    await p.waitForTimeout(500)
    await gravar(p, `meus-mac-${tema}`)
    await ctx.close()
  }

  // painel da conta: recentes, números, projetos e presets
  for (const aparelho of ['mac', 'iphone']) {
    const { ctx, p } = await pagina(aparelho, tema)
    await p.goto(`${base}/painel`)
    await p.waitForFunction(() => window.painelPronto)
    await p.waitForTimeout(500)
    await gravar(p, `painel-${aparelho}-${tema}`)
    await ctx.close()
  }
}

await navegador.close()
servidor.close()
rmSync(tmp, { recursive: true, force: true })

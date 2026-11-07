// O RADION de ponta a ponta no Chromium, com três pessoas (modo local, Postgres de verdade, microfone falso do
// Chromium, que toca um bipe): Ana (dona, Direção) cria a diária, Bia entra pelo código e fica na Direção, Caio entra e
// fica na Câmera. Confere que a voz chega de verdade (nível do áudio recebido), que o canal de um setor só chega a quem
// o ouve, que o Geral chega a todos, que o aviso de set aparece na tela dos outros e o silêncio: Gravando cala o set
// (menos a Direção) até o Corta, e a dona silencia o Caio, que vê quem silenciou e pede a palavra.
import { after, before, test } from 'node:test'
import assert from 'node:assert/strict'
import postgres from 'postgres'
import { semPostgres, subirPostgres } from './banco-apoio.js'

let chromium = null
try {
  ;({ chromium } = await import('playwright'))
} catch {
  chromium = null
}
const pular = semPostgres || (!chromium && 'sem Playwright')
let pg, servidor, navegador, base

before(async () => {
  if (pular) return
  pg = await subirPostgres()
  const admin = postgres(pg.url, { max: 1, onnotice: () => {} })
  await admin.unsafe(`create role radio login password 'teste'; create role radio_app nologin; grant radio_app to radio with admin option; create schema radio authorization radio;`)
  await admin.end()
  const url = pg.url.replace('postgres://postgres@', 'postgres://radio:teste@')
  process.env.RADIO_DATABASE_URL = url
  process.env.RADIO_LOCAL = '1'
  delete process.env.ZRO_CLIENT_ID
  delete process.env.ZRO_CLIENT_SECRET
  await (await import('../scripts/migrar.mjs')).migrar(url)
  const { execFileSync } = await import('node:child_process')
  execFileSync(process.execPath, [new URL('../publicar.mjs', import.meta.url).pathname], { stdio: 'pipe' })
  const { servir } = await import('../scripts/servir.mjs')
  servidor = await servir({ porta: 0 })
  base = `http://localhost:${servidor.address().port}`
  navegador = await chromium.launch({
    args: ['--use-fake-device-for-media-stream', '--use-fake-ui-for-media-stream', '--autoplay-policy=no-user-gesture-required', '--disable-features=WebRtcHideLocalIpsWithMdns'],
  })
})
after(async () => {
  await navegador?.close()
  await new Promise((ok) => (servidor ? servidor.close(ok) : ok()))
  await (await import('../api/_banco.js')).fecharBanco()
  await pg?.fechar()
})

async function pessoa(nome, nav = navegador, antes = null) {
  const ctx = await nav.newContext({ permissions: ['microphone'] })
  if (antes) await antes(ctx)
  const page = await ctx.newPage()
  const erros = []
  page.on('pageerror', (e) => erros.push(String(e)))
  await page.goto(base)
  await page.fill('#local-nome', nome)
  await page.click('#local button')
  await page.waitForSelector('#pg-inicio:not([hidden])')
  return { page, erros }
}

/** Nível (RMS) do áudio que chega de outros aparelhos agora, somando todas as conexões. */
const nivel = (page) =>
  page.evaluate(async () => {
    const C = window.__medidor || (window.__medidor = new AudioContext())
    await C.resume()
    let maior = 0
    for (const a of document.querySelectorAll('audio')) {
      if (!a.srcObject) continue
      const fonte = C.createMediaStreamSource(a.srcObject)
      const an = C.createAnalyser()
      an.fftSize = 2048
      fonte.connect(an)
      await new Promise((ok) => setTimeout(ok, 350))
      const buf = new Float32Array(an.fftSize)
      an.getFloatTimeDomainData(buf)
      fonte.disconnect()
      maior = Math.max(maior, Math.sqrt(buf.reduce((s, v) => s + v * v, 0) / buf.length))
    }
    return maior
  })

const esperarNivel = async (page, acima, ms = 6000) => {
  const fim = Date.now() + ms
  let n = 0
  while (Date.now() < fim) {
    n = await nivel(page)
    if (acima ? n > 0.005 : n < 0.001) return n
  }
  return n
}

test('três pessoas: setor, canal por faixa, segurar e travar o TALK, deixar de ouvir, Todos e aviso', { skip: pular, timeout: 120000 }, async () => {
  const ana = await pessoa('Ana')
  await ana.page.click('.item[data-ir="diarias"]')
  await ana.page.fill('#criar-nome', 'Comercial')
  await ana.page.click('#criar button')
  await ana.page.waitForSelector('#noar:not([hidden])')
  const codigo = (await ana.page.textContent('#codigo')).trim()
  assert.match(codigo, /^[A-Z2-9]{6}$/)
  // quem criou já está na Direção: não pergunta o setor
  assert.equal(await ana.page.isVisible('#setor-folha'), false)

  const bia = await pessoa('Bia')
  await bia.page.goto(`${base}/?d=${codigo}`) // o link do QR
  await bia.page.waitForSelector('#setor-folha[open]')
  await bia.page.click('#setores [data-canal="direcao"]')
  const caio = await pessoa('Caio')
  await caio.page.click('.item[data-ir="diarias"]')
  await caio.page.fill('#entrar-codigo', codigo.toLowerCase())
  await caio.page.click('#entrar button')
  await caio.page.waitForSelector('#setor-folha[open]')
  await caio.page.click('#setores [data-canal="camera"]')

  for (const p of [bia, caio]) await p.page.waitForFunction(() => !document.getElementById('setor-folha').open)
  for (const p of [ana, bia, caio]) await p.page.click('#ligar-btn')
  // o seu setor vem logo depois do Geral, marcado "Seu"
  assert.deepEqual(await caio.page.$$eval('.canal', (fs) => fs.slice(0, 2).map((f) => f.dataset.canal)), ['geral', 'camera'])
  // a equipe fala no próprio setor, não no Geral
  assert.equal(await caio.page.isDisabled('[data-alvo="geral"]'), true)
  assert.equal((await caio.page.textContent('#alvo-nome')).trim(), 'Câmera')
  assert.equal(await caio.page.getAttribute('[data-ouvir="camera"]', 'aria-pressed'), 'true')
  assert.equal(await caio.page.getAttribute('[data-ouvir="direcao"]', 'aria-pressed'), 'false')

  // todos ligados com todos
  for (const p of [ana, bia, caio]) await p.page.waitForFunction(() => document.querySelectorAll('#pessoas .pessoa[data-estado="ligado"]').length === 3, null, { timeout: 30000 })
  assert.ok((await esperarNivel(bia.page, false)) < 0.001)

  const caixa = await (await ana.page.$('#ptt')).boundingBox()
  const segurar = async () => {
    await ana.page.mouse.move(caixa.x + caixa.width / 2, caixa.y + caixa.height / 2)
    await ana.page.mouse.down()
    await ana.page.waitForTimeout(400) // segurou: push-to-talk
  }

  // Ana fala para a Direção (segurando): Bia ouve, Caio (Câmera) não
  await ana.page.click('[data-alvo="direcao"]')
  assert.equal((await ana.page.textContent('#alvo-nome')).trim(), 'Direção')
  await segurar()
  assert.equal(await ana.page.getAttribute('#ptt', 'data-estado'), 'ptt')
  await bia.page.waitForFunction(() => document.getElementById('no-ar').textContent.includes('Ana'))
  assert.match(await bia.page.textContent('#no-ar'), /Ana · Direção/)
  await bia.page.waitForSelector('.canal[data-canal="direcao"].is-no-ar')
  assert.ok((await esperarNivel(bia.page, true)) > 0.005, 'Bia ouve a Ana')
  assert.ok((await esperarNivel(caio.page, false, 2500)) < 0.001, 'Caio (Câmera) não recebe a fala da Direção')
  await ana.page.mouse.up()
  assert.equal(await ana.page.getAttribute('#ptt', 'data-estado'), 'mudo')
  await bia.page.waitForFunction(() => document.getElementById('no-ar').textContent === '')
  assert.ok((await esperarNivel(bia.page, false)) < 0.001, 'soltou: silêncio')

  // um toque trava o TALK aberto no Geral: Caio ouve sem ninguém segurar; outro toque fecha
  await ana.page.click('[data-alvo="geral"]')
  await ana.page.click('#ptt')
  assert.equal(await ana.page.getAttribute('#ptt', 'data-estado'), 'aberto')
  assert.ok((await esperarNivel(caio.page, true)) > 0.005, 'Caio ouve no Geral com o TALK aberto')
  await ana.page.click('#ptt')
  assert.equal(await ana.page.getAttribute('#ptt', 'data-estado'), 'mudo')
  assert.ok((await esperarNivel(caio.page, false)) < 0.001)

  // Caio deixa de ouvir o Geral: a fala do Geral não chega mais a ele
  await caio.page.click('[data-ouvir="geral"]')
  assert.equal(await caio.page.getAttribute('[data-ouvir="geral"]', 'aria-pressed'), 'false')
  await ana.page.waitForTimeout(500)
  await segurar()
  assert.ok((await esperarNivel(bia.page, true)) > 0.005, 'Bia ainda ouve o Geral')
  assert.ok((await esperarNivel(caio.page, false, 2500)) < 0.001, 'Caio não ouve o Geral desligado')
  await ana.page.mouse.up()

  // Todos (Direção): chega a todo mundo, inclusive a quem desligou o Geral
  assert.equal(await caio.page.isHidden('#todos'), true)
  await ana.page.click('#todos')
  assert.equal((await ana.page.textContent('#alvo-nome')).trim(), 'Todos')
  await segurar()
  assert.ok((await esperarNivel(caio.page, true)) > 0.005, 'Todos chega ao Caio')
  await ana.page.mouse.up()

  await ana.page.click('#todos')
  // aviso de set: Ana manda Gravando, os outros veem; Caio (Câmera) não tem os botões
  assert.equal(await caio.page.isHidden('#avisos'), true)
  await ana.page.click('#avisos [data-aviso="acao"]')
  for (const p of [bia, caio]) {
    await p.page.waitForSelector('#aviso-tela:not([hidden])', { timeout: 5000 })
    assert.equal((await p.page.textContent('#aviso-texto')).trim(), 'Gravando')
  }
  // Gravando silencia o set: Caio não fala; Bia (Direção) segue falando
  await caio.page.waitForSelector('#eu-calado:not([hidden])', { timeout: 5000 })
  assert.equal(await caio.page.isDisabled('#ptt'), true)
  await bia.page.waitForSelector('#silencio-set:not([hidden])')
  assert.equal(await bia.page.isDisabled('#ptt'), false)
  // Corta reativa
  await ana.page.click('#aviso-tela')
  await ana.page.click('#avisos [data-aviso="corta"]')
  await caio.page.waitForSelector('#eu-calado', { state: 'hidden', timeout: 5000 })
  assert.equal(await caio.page.isDisabled('#ptt'), false)

  // a dona silencia o Caio pela lista de quem está no ar; ele vê quem foi e pede a palavra
  for (const p of [ana, caio]) if (await p.page.isVisible('#aviso-tela')) await p.page.click('#aviso-tela')
  await ana.page.click('#pessoas .pessoa:has-text("Caio")')
  await ana.page.click('#menu-pessoa .tempos button:has-text("Até eu reativar")')
  await caio.page.waitForSelector('#eu-calado:not([hidden])', { timeout: 5000 })
  assert.match(await caio.page.textContent('#eu-calado-titulo'), /Ana silenciou você/)
  await caio.page.click('#pedir-palavra')
  await ana.page.waitForSelector('#pessoas .pessoa[data-mao="1"]', { timeout: 5000 })
  await ana.page.click('#pessoas .pessoa:has-text("Caio")')
  await ana.page.click('#menu-pessoa .acao:has-text("Dar a palavra")')
  await caio.page.waitForSelector('#eu-calado', { state: 'hidden', timeout: 5000 })
  // a Bia (Direção, sem ser dona) não silencia ninguém: o menu dela não tem a opção
  await bia.page.click('#pessoas .pessoa:has-text("Caio")')
  assert.equal(await bia.page.locator('#menu-pessoa .tempos').count(), 0)

  for (const p of [ana, bia, caio]) assert.deepEqual(p.erros, [])
})

// Android (titular, 07/11/2026: no Android o som saía no alto-falante de ligação): lá o microfone só fica aberto
// enquanto a pessoa fala. Ligar pede a permissão e fecha; segurar abre, a voz chega; soltar fecha de novo.
test('Android: o microfone abre só durante a fala (fora dela, o som segue no viva-voz)', { skip: pular, timeout: 90000 }, async () => {
  const ctx = await navegador.newContext({
    permissions: ['microphone'],
    userAgent: 'Mozilla/5.0 (Linux; Android 14; Pixel 8) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/130.0.0.0 Mobile Safari/537.36',
  })
  // conta as trilhas do microfone que este aparelho abriu e quantas seguem vivas
  await ctx.addInitScript(() => {
    const pedir = navigator.mediaDevices.getUserMedia.bind(navigator.mediaDevices)
    window.__trilhas = []
    navigator.mediaDevices.getUserMedia = async (c) => {
      const m = await pedir(c)
      window.__trilhas.push(...m.getAudioTracks())
      return m
    }
  })
  const page = await ctx.newPage()
  const erros = []
  page.on('pageerror', (e) => erros.push(String(e)))
  await page.goto(base)
  await page.fill('#local-nome', 'Duda')
  await page.click('#local button')
  await page.waitForSelector('#pg-inicio:not([hidden])')
  const vivas = () => page.evaluate(() => window.__trilhas.filter((t) => t.readyState === 'live').length)

  await page.click('.item[data-ir="diarias"]')
  await page.fill('#criar-nome', 'Externa')
  await page.click('#criar button')
  await page.waitForSelector('#noar:not([hidden])')
  const codigo = (await page.textContent('#codigo')).trim()
  const edu = await pessoa('Edu')
  await edu.page.goto(`${base}/?d=${codigo}`)
  await edu.page.waitForSelector('#setor-folha[open]')
  await edu.page.click('#setores [data-canal="direcao"]')
  await edu.page.waitForFunction(() => !document.getElementById('setor-folha').open)

  await page.click('#ligar-btn')
  await edu.page.click('#ligar-btn')
  for (const p of [page, edu.page]) await p.waitForFunction(() => document.querySelectorAll('#pessoas .pessoa[data-estado="ligado"]').length === 2, null, { timeout: 30000 })
  // ligado e calado: a permissão foi dada, mas nenhum microfone aberto
  assert.equal((await page.evaluate(() => window.__trilhas.length)) >= 1, true)
  assert.equal(await vivas(), 0)

  await page.click('[data-alvo="direcao"]')
  const caixa = await (await page.$('#ptt')).boundingBox()
  await page.mouse.move(caixa.x + caixa.width / 2, caixa.y + caixa.height / 2)
  await page.mouse.down()
  await page.waitForTimeout(400)
  assert.equal(await page.getAttribute('#ptt', 'data-estado'), 'ptt')
  await page.waitForFunction(() => window.__trilhas.some((t) => t.readyState === 'live'))
  assert.ok((await esperarNivel(edu.page, true)) > 0.005, 'a voz do Android chega')

  await page.mouse.up()
  assert.equal(await page.getAttribute('#ptt', 'data-estado'), 'mudo')
  await page.waitForFunction(() => window.__trilhas.every((t) => t.readyState !== 'live'))
  assert.ok((await esperarNivel(edu.page, false)) < 0.001, 'soltou: a voz para')

  // um toque trava a fala aberta: o microfone abre; outro toque fecha
  await page.click('#ptt')
  await page.waitForFunction(() => window.__trilhas.some((t) => t.readyState === 'live'))
  await page.click('#ptt')
  await page.waitForFunction(() => window.__trilhas.every((t) => t.readyState !== 'live'))
  assert.deepEqual([...erros, ...edu.erros], [])
  await ctx.close()
})

// Pela voz (titular, 07/11/2026: "mãos livres", com lapela): nos Ajustes a pessoa escolhe "Pela voz" e a sensibilidade;
// o microfone abre sozinho quando o nível passa da marca (o bipe do microfone falso), um toque pausa e outro retoma.
test('pela voz: abre sozinho com o som do microfone, um toque pausa e outro retoma', { skip: pular, timeout: 90000 }, async () => {
  // um microfone que soa sem parar, como alguém falando na lapela: um tom gerado agora (nada de voz no repositório)
  const { mkdtempSync, writeFileSync, rmSync } = await import('node:fs')
  const { tmpdir } = await import('node:os')
  const { join } = await import('node:path')
  const pasta = mkdtempSync(join(tmpdir(), 'radion-tom-'))
  const wav = join(pasta, 'tom.wav')
  const taxa = 48000
  const amostras = taxa * 30
  const b = Buffer.alloc(44 + amostras * 2)
  b.write('RIFF', 0)
  b.writeUInt32LE(36 + amostras * 2, 4)
  b.write('WAVEfmt ', 8)
  b.writeUInt32LE(16, 16)
  b.writeUInt16LE(1, 20)
  b.writeUInt16LE(1, 22)
  b.writeUInt32LE(taxa, 24)
  b.writeUInt32LE(taxa * 2, 28)
  b.writeUInt16LE(2, 32)
  b.writeUInt16LE(16, 34)
  b.write('data', 36)
  b.writeUInt32LE(amostras * 2, 40)
  for (let i = 0; i < amostras; i++) b.writeInt16LE(Math.round(Math.sin((2 * Math.PI * 330 * i) / taxa) * 9000), 44 + i * 2)
  writeFileSync(wav, b)
  const outro = await chromium.launch({
    args: ['--use-fake-device-for-media-stream', '--use-fake-ui-for-media-stream', `--use-file-for-fake-audio-capture=${wav}`, '--autoplay-policy=no-user-gesture-required', '--disable-features=WebRtcHideLocalIpsWithMdns'],
  })
  after(async () => {
    await outro.close()
    rmSync(pasta, { recursive: true, force: true })
  })
  const fe = await pessoa('Fê', outro)
  await fe.page.click('.item[data-ir="ajustes"]')
  await fe.page.click('#aj-fala [data-fala="voz"]')
  assert.equal(await fe.page.isVisible('#aj-voz'), true)
  await fe.page.click('#aj-voz-sens [data-sens="alta"]')
  assert.equal(await fe.page.getAttribute('#aj-voz-sens [data-sens="alta"]', 'aria-selected'), 'true')
  assert.equal(await fe.page.evaluate(() => localStorage.getItem('rd_fala')), 'voz')

  await fe.page.click('.item[data-ir="diarias"]')
  await fe.page.fill('#criar-nome', 'Evento')
  await fe.page.click('#criar button')
  await fe.page.waitForSelector('#noar:not([hidden])')
  const codigo = (await fe.page.textContent('#codigo')).trim()
  const gil = await pessoa('Gil')
  await gil.page.goto(`${base}/?d=${codigo}`)
  await gil.page.waitForSelector('#setor-folha[open]')
  await gil.page.click('#setores [data-canal="direcao"]')
  await gil.page.waitForFunction(() => !document.getElementById('setor-folha').open)
  await fe.page.click('#ligar-btn')
  await gil.page.click('#ligar-btn')
  for (const p of [fe.page, gil.page]) await p.waitForFunction(() => document.querySelectorAll('#pessoas .pessoa[data-estado="ligado"]').length === 2, null, { timeout: 30000 })
  await fe.page.click('[data-alvo="direcao"]')

  // sem tocar em nada: o som do microfone abre a fala e a voz chega
  await fe.page.waitForFunction(() => document.getElementById('ptt').dataset.estado === 'ptt', null, { timeout: 15000 })
  assert.ok((await esperarNivel(gil.page, true)) > 0.005, 'pela voz, a voz chega')
  await gil.page.waitForFunction(() => document.getElementById('no-ar').textContent.includes('Fê'))

  // um toque pausa: fecha e não abre de novo sozinho
  await fe.page.click('#ptt')
  assert.equal(await fe.page.getAttribute('#ptt', 'data-estado'), 'mudo')
  assert.equal(await fe.page.evaluate(() => document.getElementById('ptt').hasAttribute('data-pausado')), true)
  await fe.page.waitForTimeout(1500)
  assert.equal(await fe.page.getAttribute('#ptt', 'data-estado'), 'mudo')
  assert.ok((await esperarNivel(gil.page, false)) < 0.001, 'pausado, a voz para')

  // outro toque retoma e a voz volta a abrir sozinha
  await fe.page.click('#ptt')
  await fe.page.waitForFunction(() => document.getElementById('ptt').dataset.estado === 'ptt', null, { timeout: 15000 })
  assert.deepEqual([...fe.erros, ...gil.erros], [])
})

// Microfone e som (titular, 07/11/2026: "fone Bluetooth + lapela"): nos Ajustes, a lista do que o aparelho tem; trocar o
// microfone com o rádio ligado passa a mandar o escolhido; a escolha fica guardada no aparelho.
test('microfone e som: lista dos aparelhos, troca com o rádio ligado e fica guardado', { skip: pular, timeout: 90000 }, async () => {
  // conta as trilhas do microfone que a página abre (o nome diz de qual aparelho)
  const hi = await pessoa('Hel', navegador, (ctx) =>
    ctx.addInitScript(() => {
      const pedir = navigator.mediaDevices.getUserMedia.bind(navigator.mediaDevices)
      window.__trilhas = []
      navigator.mediaDevices.getUserMedia = async (c) => {
        const m = await pedir(c)
        window.__trilhas.push(...m.getAudioTracks())
        return m
      }
    }),
  )
  const viva = () => hi.page.evaluate(() => window.__trilhas.filter((t) => t.readyState === 'live').map((t) => t.label))
  await hi.page.click('.item[data-ir="diarias"]')
  await hi.page.fill('#criar-nome', 'Show')
  await hi.page.click('#criar button')
  await hi.page.waitForSelector('#noar:not([hidden])')
  await hi.page.click('#ligar-btn')
  await hi.page.click('.item[data-ir="ajustes"]')
  await hi.page.waitForFunction(() => document.querySelectorAll('#aj-mic option').length > 2)
  const opcoes = await hi.page.$$eval('#aj-mic option', (os) => os.map((o) => [o.value, o.textContent]))
  assert.equal(opcoes[0][1], 'O do aparelho')
  const [id, nome] = opcoes[2]
  assert.ok(id && nome && !/^Microfone \d/.test(nome), 'com a permissão, os nomes de verdade')
  await hi.page.selectOption('#aj-mic', id)
  // a página passa a usar o escolhido e fecha o antigo (o rádio segue ligado)
  await hi.page.waitForFunction((n) => {
    const vivas = window.__trilhas.filter((t) => t.readyState === 'live')
    return vivas.length === 1 && vivas[0].label === n
  }, nome)
  assert.deepEqual(await viva(), [nome])
  assert.equal(await hi.page.evaluate(() => localStorage.getItem('rd_mic')), id)
  // de volta (outra visita): o rádio já liga com o microfone guardado
  await hi.page.reload()
  await hi.page.waitForSelector('#ligar:not([hidden])')
  await hi.page.click('#ligar-btn')
  await hi.page.waitForFunction((n) => window.__trilhas.some((t) => t.readyState === 'live' && t.label === n), nome)
  await hi.page.click('.item[data-ir="ajustes"]')
  await hi.page.waitForSelector('#pg-ajustes:not([hidden])')
  // o navegador pode ter trocado o id do aparelho na nova visita: a escolha segue pelo nome
  await hi.page.waitForFunction((n) => document.getElementById('aj-mic').selectedOptions[0]?.textContent === n, nome)
  // a saída: escolhe onde o navegador deixa (computador); senão, a dica de como trocar no celular
  const podeSaida = await hi.page.evaluate(() => !document.getElementById('aj-som-casa').hidden)
  assert.ok(podeSaida || (await hi.page.textContent('#aj-som-sub')).length > 10)
  assert.deepEqual(hi.erros, [])
})

// Foto sem piscar (titular, 07/11/2026: "bug na foto"): a lista da equipe é redesenhada a cada batida; quem tem foto
// aparece com ela desde o primeiro quadro de cada redesenho, nunca com as iniciais por cima.
test('fotos da equipe: o redesenho da lista não pisca as iniciais', { skip: pular, timeout: 90000 }, async () => {
  const ID = '5e7f3c1a-9b2d-4e6f-8a1c-2d3e4f5a6b7c'
  const png = Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNk+A8AAQUBAScY42YAAAAASUVORK5CYII=', 'base64')
  const ivo = await pessoa('Ivo', navegador, (ctx) =>
    ctx.route('https://absolutezro.com/api/v1/foto/**', (r) => r.fulfill({ status: 200, contentType: 'image/png', body: png })),
  )
  await ivo.page.click('.item[data-ir="diarias"]')
  await ivo.page.fill('#criar-nome', 'Clipe')
  await ivo.page.click('#criar button')
  await ivo.page.waitForSelector('#noar:not([hidden])')
  await ivo.page.click('#ligar-btn')
  // a foto da conta, como o login único grava (só o id público)
  const sql = postgres(pg.url, { max: 1, onnotice: () => {} })
  await sql`update radio.membros set foto = ${ID} where nome = 'Ivo'`
  await sql.end()
  await ivo.page.click('.item[data-ir="equipe"]')
  await ivo.page.waitForSelector('#pg-equipe .quem .av.av--foto', { timeout: 15000 })
  // daqui em diante, todo círculo que entra na lista já entra com a foto
  await ivo.page.evaluate(() => {
    window.__semFoto = 0
    window.__redesenhos = 0
    new MutationObserver((ms) => {
      for (const m of ms)
        for (const n of m.addedNodes) {
          if (!(n instanceof Element)) continue
          for (const av of [n, ...n.querySelectorAll('.av')]) {
            if (!av.classList?.contains('av') || !av.closest('.quem')) continue
            window.__redesenhos++
            if (!av.classList.contains('av--foto')) window.__semFoto++
          }
        }
    }).observe(document.getElementById('pg-equipe'), { childList: true, subtree: true })
  })
  await ivo.page.waitForFunction(() => window.__redesenhos >= 3, null, { timeout: 30000 })
  assert.equal(await ivo.page.evaluate(() => window.__semFoto), 0)
  assert.deepEqual(ivo.erros, [])
})

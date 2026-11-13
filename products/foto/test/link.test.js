// O link do cliente pela porta estreita, com as rotas de verdade (api/link/porta.js e api/galeria.js) num Postgres
// temporário e a pasta local de arquivos. Confere:
//   - token certo abre; token desconhecido, link revogado e link vencido dão a MESMA resposta em toda rota (e também
//     galeria encerrada e token malformado): não dá para saber qual é o caso;
//   - PIN: sem a prova só sai {"estado":"pin"}; errado conta no limite por link e IP e por link; trocar o PIN derruba
//     a prova antiga;
//   - escolher, desfazer, comentar, etiquetar, enviar; sem extras a galeria enche; depois de enviada trava até a
//     fotógrafa reabrir;
//   - limites por link e por IP (o IP só como HMAC do dia: nunca aparece no banco);
//   - escrita confere a origem; a imagem sai só por link vivo, com cache privado, e nada é listado;
//   - a página /g/<token> só para link vivo (sem o nome do produto); link morto recebe a página neutra, byte a byte.
// O papel do app não lê token nem hash de PIN: test/galerias.test.js (isolamento de foto.links).

import { after, before, beforeEach, test } from 'node:test'
import assert from 'node:assert/strict'
import { createHash } from 'node:crypto'
import { mkdtempSync, readFileSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { fileURLToPath } from 'node:url'
import postgres from 'postgres'
import { ASSINATURA, NOME } from '../app/nome.js'
import { semPostgres, subirPostgres } from './banco-apoio.js'

const RAIZ = fileURLToPath(new URL('..', import.meta.url))
const EXIGIR = process.env.FOTO_EXIGIR === '1'
const pular = semPostgres
const SEGREDO = 'segredo-de-teste-que-so-existe-aqui'
const SITE = 'foto.absolutezro.com'
const LIA = { sub: 'zro-lia', org: 'org-1' }
const IP = '203.0.113.7'
const OUTRO_IP = '198.51.100.23'
const NEUTRA = readFileSync(join(RAIZ, 'app/indisponivel.html'))

let pg, urlFoto, dono, banco, link, limite, arquivos, rotaPorta, rotaPagina, pasta

const sha256 = (b) => createHash('sha256').update(b).digest('hex')
function jpeg(semente, tamanho = 600) {
  const corpo = Buffer.alloc(tamanho - 24)
  for (let i = 0; i < corpo.length; i++) corpo[i] = (semente * 31 + i * 7) % 251
  return Buffer.concat([Buffer.from([0xff, 0xd8, 0xff, 0xe0, 0x00, 0x10]), Buffer.from('JFIF\0\x01\x01\0\0\x01\0\x01\0\0', 'latin1'), Buffer.from([0xff, 0xdb]), corpo, Buffer.from([0xff, 0xd9])])
}

const resposta = () => {
  const r = { statusCode: 0, headers: {}, bruto: Buffer.alloc(0), corpo: null }
  r.setHeader = (k, v) => (r.headers[k.toLowerCase()] = v)
  r.end = (c) => {
    r.bruto = c == null ? Buffer.alloc(0) : Buffer.from(c)
    try {
      r.corpo = JSON.parse(r.bruto.toString('utf8'))
    } catch {
      r.corpo = null
    }
  }
  return r
}
const cabecalhos = ({ ip = IP, cookie = '', origem = `https://${SITE}`, mais = {} } = {}) => ({ host: SITE, 'x-forwarded-proto': 'https', 'x-real-ip': ip, cookie, ...(origem ? { origin: origem } : {}), ...mais })
/** POST /api/link/<acao> com o corpo já lido (como na Vercel). */
async function porta(acao, corpo, opcoes) {
  const r = resposta()
  await rotaPorta({ method: 'POST', url: `/api/link/porta?acao=${acao}`, headers: cabecalhos(opcoes), body: corpo }, r)
  return r
}
/** GET da imagem (e de abrir por consulta). */
async function pegar(acao, consulta, opcoes = {}) {
  const r = resposta()
  await rotaPorta({ method: opcoes.metodo ?? 'GET', url: `/api/link/porta?acao=${acao}&${new URLSearchParams(consulta)}`, headers: cabecalhos({ ...opcoes, origem: null }) }, r)
  return r
}
async function pagina(token, arquivo, opcoes) {
  const r = resposta()
  await rotaPagina({ method: 'GET', url: `/api/galeria?t=${token}${arquivo ? `&f=${arquivo}` : ''}`, headers: cabecalhos({ ...opcoes, origem: null }) }, r)
  return r
}
/** O cookie da prova do PIN que a rota devolveu, pronto para mandar de volta. */
const provaDe = (r) => String(r.headers['set-cookie']?.[0] ?? '').split(';')[0]

/** Uma galeria publicada da Lia, com `n` fotos com arquivo na pasta. Devolve { id, fotos, token }. */
async function publicada({ n = 4, ficha = {}, pin = null, pilha = false } = {}) {
  const token = link.novoToken()
  const g = await banco.comoPessoa(LIA, async (tx) => {
    const [gal] = await tx`insert into foto.galerias ${tx({ nome: 'Casamento Ana & Rui', fotografo: 'Lia Fotografia', contratadas: 2, mensagem: 'Escolham com calma.', ...ficha })} returning id`
    const linhas = Array.from({ length: n }, (_, i) => {
      const b = jpeg(i + 1)
      return { galeria: gal.id, foto_id: `cat-${i + 1}`, nome: `IMG_${i + 1}.CR3`, ordem: i, grupo: pilha && i < 2 ? 'p1' : null, melhor: pilha && i === 1, largura: 1600, altura: 1067, tipo: 'image/jpeg', tamanho: b.length, sha256: sha256(b) }
    })
    const fotos = await tx`insert into foto.galeria_fotos ${tx(linhas)} returning id, ordem`
    await tx`update foto.galeria_fotos set enviada_em = now() where galeria = ${gal.id}`
    await tx`update foto.galerias set estado = 'publicada' where id = ${gal.id}`
    await tx`insert into foto.links ${tx({ galeria: gal.id, token_hash: link.hashToken(token), pin_hash: pin ? link.hashPin(pin) : null, expira_em: new Date(Date.now() + 7 * 86400000) })}`
    return { id: gal.id, fotos: fotos.sort((a, b) => a.ordem - b.ordem).map((f) => f.id) }
  })
  const arm = arquivos.armazenamento()
  for (let i = 0; i < n; i++) await arm.gravar(`g/${g.id}/${g.fotos[i]}`, jpeg(i + 1), 'image/jpeg')
  return { ...g, token }
}
/** Mexe em linhas que as guardas não deixam mexer (envelhecer um link): só o teste, como dono. */
const semGuardas = (fn) =>
  dono.begin(async (tx) => {
    await tx`alter table foto.links disable trigger links_guarda`
    await fn(tx)
    await tx`alter table foto.links enable trigger links_guarda`
  })

before(async () => {
  if (pular) return
  pg = await subirPostgres()
  const admin = postgres(pg.url, { max: 1, onnotice: () => {} })
  await admin.unsafe(`create role foto login password 'teste'; create role foto_app nologin; grant foto_app to foto with admin option; create schema foto authorization foto;`)
  await admin.end()
  urlFoto = pg.url.replace('postgres://postgres@', 'postgres://foto:teste@')
  pasta = mkdtempSync(join(tmpdir(), 'foto-arquivos-'))
  process.env.ZRO_CLIENT_ID = 'foto-web'
  process.env.ZRO_CLIENT_SECRET = SEGREDO
  process.env.FOTO_DATABASE_URL = urlFoto
  process.env.FOTO_ARQUIVOS_DIR = pasta
  for (const v of ['FOTO_LOCAL', 'FOTO_SITE', 'FOTO_S3_ENDPOINT', 'FOTO_S3_BUCKET', 'FOTO_S3_KEY_ID', 'FOTO_S3_SECRET', 'VERCEL']) delete process.env[v]
  await (await import('../scripts/migrar.mjs')).migrar(urlFoto)
  dono = postgres(urlFoto, { max: 2, onnotice: () => {} })
  banco = await import('../api/_banco.js')
  link = await import('../api/_link.js')
  limite = await import('../api/_limite.js')
  arquivos = await import('../api/_arquivos.js')
  rotaPorta = (await import('../api/link/porta.js')).default
  rotaPagina = (await import('../api/galeria.js')).default
})
beforeEach(async () => {
  if (!pular) await dono`delete from foto.limites`
})
after(async () => {
  await dono?.end({ timeout: 5 })
  await banco?.fecharBanco()
  await pg?.fechar()
  if (pasta) rmSync(pasta, { recursive: true, force: true })
  delete process.env.FOTO_DATABASE_URL
  delete process.env.FOTO_ARQUIVOS_DIR
})

test('Postgres é exigido no CI', { skip: !EXIGIR }, () => {
  assert.equal(semPostgres, false, 'FOTO_EXIGIR=1 e não há Postgres na máquina')
})

test('token, PIN e IP: 32 bytes em base64url, só o sha256 vai ao banco; scrypt com sal; prova assinada; IP só como HMAC do dia', { skip: pular }, () => {
  const t = link.novoToken()
  assert.match(t, /^[A-Za-z0-9_-]{43}$/)
  assert.equal(Buffer.from(t, 'base64url').length, 32)
  assert.notEqual(link.novoToken(), t)
  assert.equal(link.hashToken(t), sha256(t))
  for (const ruim of ['', 'curto', `${t}a`, t.slice(1), `${t.slice(0, 42)}/`, null, 42]) assert.equal(link.ehToken(ruim), false)
  // PIN: 4 a 8 dígitos; o mesmo PIN dá hashes diferentes (sal) e confere só com ele mesmo
  for (const ruim of ['123', '123456789', '12a4', '', ' 1234']) assert.throws(() => link.hashPin(ruim), /PIN/)
  const h = link.hashPin('2468')
  assert.match(h, /^s1\$[A-Za-z0-9_-]{22}\$[A-Za-z0-9_-]{43}$/)
  assert.notEqual(link.hashPin('2468'), h)
  assert.ok(link.pinConfere('2468', h))
  for (const errado of ['2469', '02468', '', null, '2468 ']) assert.equal(link.pinConfere(errado, h), false)
  assert.equal(link.pinConfere('2468', null), false)
  assert.equal(link.pinConfere('2468', 's2$a$b'), false)
  // prova do PIN: vale para aquele link e aquela versão, até vencer, e não aceita adulteração
  const id = '0b0e1c7e-9a1d-4a59-8b62-5d1f0c3a7e11'
  const p = link.prova(id, 3, Date.now() + 60000)
  assert.ok(link.provaConfere(p, id, 3))
  assert.equal(link.provaConfere(p, id, 4), false)
  assert.equal(link.provaConfere(p, '1b0e1c7e-9a1d-4a59-8b62-5d1f0c3a7e11', 3), false)
  assert.equal(link.provaConfere(link.prova(id, 3, Date.now() - 1), id, 3), false)
  assert.equal(link.provaConfere(p.replace(/\.\d+\.([^.]+)$/, `.${Date.now() + 9e9}.$1`), id, 3), false)
  assert.equal(link.provaConfere(`${p.slice(0, -1)}${p.endsWith('A') ? 'B' : 'A'}`, id, 3), false)
  assert.equal(link.provaConfere(undefined, id, 3), false)
  // IP: o mesmo IP no mesmo dia dá a mesma chave; outro dia ou outro IP, outra; o IP não aparece
  const hoje = new Date('2026-11-13T10:00:00Z')
  const a = link.ipHashDoDia(IP, hoje)
  assert.match(a, /^[0-9a-f]{32}$/)
  assert.equal(link.ipHashDoDia(IP, new Date('2026-11-13T23:59:00Z')), a)
  assert.notEqual(link.ipHashDoDia(IP, new Date('2026-11-14T00:00:01Z')), a)
  assert.notEqual(link.ipHashDoDia(OUTRO_IP, hoje), a)
  assert.equal(link.ipDe({ headers: { 'x-real-ip': IP, 'x-forwarded-for': '10.0.0.1, 10.0.0.2' } }), IP)
  assert.equal(link.ipDe({ headers: { 'x-forwarded-for': `${OUTRO_IP}, 10.0.0.2` } }), OUTRO_IP)
})

test('abrir: token certo devolve a galeria, as fotos e a seleção, sem nada do catálogo nem de quem publicou', { skip: pular }, async () => {
  const g = await publicada({ n: 4, pilha: true, ficha: { permite_extras: true, preco_extra: 'R$ 25 por foto', prazo: new Date('2030-01-15T12:00:00Z') } })
  const r = await porta('abrir', { token: g.token, contar: true })
  assert.equal(r.statusCode, 200)
  assert.equal(r.headers['cache-control'], 'no-store')
  const d = r.corpo
  assert.deepEqual([d.ok, d.estado], [true, 'ok'])
  assert.deepEqual(d.galeria, {
    nome: 'Casamento Ana & Rui',
    fotografo: 'Lia Fotografia',
    contratadas: 2,
    permiteExtras: true,
    precoExtra: 'R$ 25 por foto',
    prazo: d.galeria.prazo,
    mensagem: 'Escolham com calma.',
    marcaDagua: true,
    estado: 'publicada',
    travada: false,
  })
  assert.equal(new Date(d.galeria.prazo).toISOString(), '2030-01-15T12:00:00.000Z')
  assert.deepEqual(d.etiquetas, ['suavizar_pele', 'preto_e_branco', 'remover_objeto', 'clarear', 'recortar'])
  assert.deepEqual([d.escolhidas, d.extras, d.envio], [0, 0, null])
  assert.deepEqual(
    d.fotos.map((f) => f.id),
    g.fotos,
  )
  assert.deepEqual(d.fotos[1], { id: g.fotos[1], grupo: 'p1', melhor: true, largura: 1600, altura: 1067, v: sha256(jpeg(2)).slice(0, 12), mini: null, escolhida: false, comentario: null, etiquetas: [] })
  // nada do catálogo (id da foto, nome do arquivo), de quem publicou (sub, organização) nem do link (hashes)
  const texto = JSON.stringify(d)
  for (const segredo of ['cat-1', 'IMG_1', '.CR3', 'zro-lia', 'org-1', g.id, g.token, link.hashToken(g.token), 'token', 'chave']) assert.ok(!texto.includes(segredo), segredo)
  // contou a abertura; abrir sem `contar` (ou por GET) não conta
  await porta('abrir', { token: g.token })
  const porGet = await pegar('abrir', { t: g.token })
  assert.deepEqual([porGet.statusCode, porGet.corpo.estado, porGet.corpo.fotos.length], [200, 'ok', 4])
  const [l] = await dono`select aberturas, aberto_em is not null as aberto from foto.links where galeria = ${g.id}`
  assert.deepEqual({ ...l }, { aberturas: 1, aberto: true })
  // foto sem arquivo não aparece para o cliente
  await dono`update foto.galeria_fotos set enviada_em = null where id = ${g.fotos[3]}`
  assert.equal((await porta('abrir', { token: g.token })).corpo.fotos.length, 3)
})

test('porta estreita: token desconhecido, link revogado e link vencido são indistinguíveis em toda rota', { skip: pular }, async () => {
  const viva = await publicada()
  const revogada = await publicada()
  const vencida = await publicada()
  const encerrada = await publicada()
  const trocada = await publicada()
  await banco.comoPessoa(LIA, (tx) => tx`update foto.links set revogado_em = now() where galeria = ${revogada.id}`)
  await semGuardas((tx) => tx`update foto.links set criado_em = now() - interval '10 days', expira_em = now() - interval '1 second' where galeria = ${vencida.id}`)
  await banco.comoPessoa(LIA, (tx) => tx`update foto.galerias set estado = 'encerrada' where id = ${encerrada.id}`)
  await banco.comoPessoa(LIA, async (tx) => {
    await tx`update foto.links set revogado_em = now() where galeria = ${trocada.id}`
    await tx`insert into foto.links ${tx({ galeria: trocada.id, token_hash: link.hashToken(link.novoToken()), expira_em: new Date(Date.now() + 86400000) })}`
  })
  const mortos = { desconhecido: link.novoToken(), revogado: revogada.token, vencido: vencida.token, encerrada: encerrada.token, trocado: trocada.token, malformado: 'nao-e-um-token' }
  const foto = viva.fotos[0]
  const acoes = {
    abrir: (t) => porta('abrir', { token: t, contar: true }),
    abrirGet: (t) => pegar('abrir', { t }),
    pin: (t) => porta('pin', { token: t, pin: '1234' }),
    escolher: (t) => porta('escolher', { token: t, foto, escolhida: true }),
    comentar: (t) => porta('comentar', { token: t, foto, comentario: 'oi', etiquetas: [] }),
    enviar: (t) => porta('enviar', { token: t, nome: 'Ana' }),
    imagem: (t) => pegar('imagem', { t, f: foto }),
    imagemMini: (t) => pegar('imagem', { t, f: foto, v: 'mini' }),
    pagina: (t) => pagina(t),
    arquivoDaPagina: (t) => pagina(t, 'galeria.js'),
  }
  for (const [nome, chamar] of Object.entries(acoes)) {
    await dono`delete from foto.limites`
    const respostas = {}
    for (const [caso, token] of Object.entries(mortos)) {
      const r = await chamar(token)
      respostas[caso] = { status: r.statusCode, cabecalhos: r.headers, corpo: r.bruto.toString('base64') }
    }
    for (const caso of Object.keys(mortos)) assert.deepEqual(respostas[caso], respostas.desconhecido, `${nome}: ${caso} difere de desconhecido`)
    assert.equal(respostas.desconhecido.status, 404, nome)
    const corpo = Buffer.from(respostas.desconhecido.corpo, 'base64')
    if (nome.startsWith('imagem')) assert.equal(corpo.length, 0)
    else if (nome === 'pagina' || nome === 'arquivoDaPagina') assert.ok(corpo.equals(NEUTRA), `${nome}: a página neutra, byte a byte`)
    else assert.deepEqual(JSON.parse(corpo.toString('utf8')), { ok: false, erro: 'link' }, nome)
    // e o link vivo responde outra coisa
    await dono`delete from foto.limites`
    assert.notEqual((await chamar(viva.token)).statusCode, 404, `${nome}: vivo`)
  }
  // nada foi escrito nas galerias mortas
  assert.equal((await dono`select count(*)::int as n from foto.selecao where galeria in (${revogada.id}, ${vencida.id}, ${encerrada.id}, ${trocada.id})`)[0].n, 0)
  assert.equal((await dono`select coalesce(sum(aberturas), 0)::int as n from foto.links where galeria in (${revogada.id}, ${vencida.id}, ${encerrada.id}, ${trocada.id})`)[0].n, 0)
  // direto no banco, pelo papel do app sem pessoa: as funções da porta devolvem o mesmo para os três
  for (const caso of ['desconhecido', 'revogado', 'vencido']) {
    const th = link.hashToken(mortos[caso])
    const r = await link.comoLink(
      async (tx) =>
        (
          await tx`select foto.link_pin(${th}) as pin, foto.link_abrir(${th}, true, true) as abrir, foto.link_imagem(${th}, true, ${foto}::uuid) as imagem,
                          foto.link_escolher(${th}, true, ${foto}::uuid, true) as escolher, foto.link_comentar(${th}, true, ${foto}::uuid, 'x', null) as comentar, foto.link_enviar(${th}, true, 'Ana') as enviar`
        )[0],
    )
    assert.deepEqual({ ...r }, { pin: null, abrir: null, imagem: null, escolher: { erro: 'link' }, comentar: { erro: 'link' }, enviar: { erro: 'link' } }, caso)
  }
  // link_vivo devolve a linha inteira (com os hashes): o papel do app não chama
  await assert.rejects(
    link.comoLink((tx) => tx`select foto.link_vivo(${link.hashToken(viva.token)})`),
    /permission denied/,
  )
})

test('PIN: sem a prova só sai o pedido de PIN; errado conta por link e IP e por link; trocar o PIN derruba a prova', { skip: pular }, async () => {
  const g = await publicada({ pin: '2468' })
  const foto = g.fotos[0]
  // sem a prova: nada da galeria
  const fechado = await porta('abrir', { token: g.token, contar: true })
  assert.deepEqual([fechado.statusCode, fechado.corpo], [200, { ok: true, estado: 'pin' }])
  assert.deepEqual((await porta('escolher', { token: g.token, foto, escolhida: true })).corpo, { ok: false, erro: 'pin' })
  assert.equal((await porta('escolher', { token: g.token, foto, escolhida: true })).statusCode, 401)
  assert.deepEqual((await porta('comentar', { token: g.token, foto, comentario: 'oi' })).corpo, { ok: false, erro: 'pin' })
  assert.deepEqual((await porta('enviar', { token: g.token, nome: 'Ana' })).corpo, { ok: false, erro: 'pin' })
  assert.equal((await pegar('imagem', { t: g.token, f: foto })).statusCode, 404)
  assert.equal((await dono`select aberturas from foto.links where galeria = ${g.id}`)[0].aberturas, 0)
  // a página em si abre (é só a casca; o PIN é pedido nela)
  assert.equal((await pagina(g.token)).statusCode, 200)

  // errado: 401, sem cookie; certo: a prova (HttpOnly, 12 h)
  const errado = await porta('pin', { token: g.token, pin: '1111' })
  assert.deepEqual([errado.statusCode, errado.corpo, errado.headers['set-cookie']], [401, { ok: false, erro: 'pin' }, undefined])
  for (const ruim of ['', 'abcd', '24680000000', null, 2468.5]) assert.equal((await porta('pin', { token: g.token, pin: ruim }, { ip: OUTRO_IP })).statusCode, 401)
  const certo = await porta('pin', { token: g.token, pin: '2468' })
  assert.deepEqual([certo.statusCode, certo.corpo], [200, { ok: true }])
  const cookie = certo.headers['set-cookie'][0]
  assert.match(cookie, /^foto_pin_[0-9a-f]{16}=[^;]+; Path=\/; Max-Age=43200; HttpOnly; Secure; SameSite=Lax$/)
  assert.ok(!cookie.includes(g.token) && !cookie.includes('2468'))
  const prova = provaDe(certo)
  const aberto = await porta('abrir', { token: g.token, contar: true }, { cookie: prova })
  assert.deepEqual([aberto.corpo.estado, aberto.corpo.fotos.length], ['ok', 4])
  assert.equal((await pegar('imagem', { t: g.token, f: foto }, { cookie: prova })).statusCode, 200)
  assert.equal((await porta('escolher', { token: g.token, foto, escolhida: true }, { cookie: prova })).corpo.escolhidas, 1)
  // a prova de um link não abre outro
  const outra = await publicada({ pin: '2468' })
  const nomeDaOutra = link.nomeCookiePin(outra.token)
  assert.equal((await porta('abrir', { token: outra.token }, { cookie: `${nomeDaOutra}=${prova.split('=')[1]}` })).corpo.estado, 'pin')
  // trocar o PIN (a fotógrafa) derruba a prova antiga
  await banco.comoPessoa(LIA, (tx) => tx`update foto.links set pin_hash = ${link.hashPin('1357')} where galeria = ${g.id}`)
  assert.equal((await porta('abrir', { token: g.token }, { cookie: prova })).corpo.estado, 'pin')
  assert.equal((await porta('pin', { token: g.token, pin: '2468' })).statusCode, 401)
  // tirar o PIN: abre sem prova
  await banco.comoPessoa(LIA, (tx) => tx`update foto.links set pin_hash = null where galeria = ${g.id}`)
  assert.equal((await porta('abrir', { token: g.token })).corpo.estado, 'ok')

  // limite: 5 erradas a cada 15 min por link e IP; depois nem a certa entra daquele IP; outro IP ainda tenta
  await dono`delete from foto.limites`
  const h = await publicada({ pin: '2468' })
  for (let i = 0; i < 5; i++) assert.equal((await porta('pin', { token: h.token, pin: `000${i}` })).statusCode, 401, `errada ${i + 1}`)
  const barrado = await porta('pin', { token: h.token, pin: '2468' })
  assert.deepEqual([barrado.statusCode, barrado.corpo, barrado.headers['set-cookie']], [429, { ok: false, erro: 'limite' }, undefined])
  assert.equal((await porta('pin', { token: h.token, pin: '2468' }, { ip: OUTRO_IP })).statusCode, 200)
  // e 20 por link no total, venham de onde vierem
  for (let i = 0; i < 15; i++) assert.equal((await porta('pin', { token: h.token, pin: '0000' }, { ip: `192.0.2.${i + 1}` })).statusCode, 401)
  assert.equal((await porta('pin', { token: h.token, pin: '2468' }, { ip: '192.0.2.200' })).statusCode, 429)
  // o limite é do link: outro link segue normal
  assert.equal((await porta('pin', { token: outra.token, pin: '2468' }, { ip: '192.0.2.200' })).statusCode, 200)
  // a janela passa e volta a valer
  await dono`update foto.limites set em = em - interval '16 minutes' where chave like 'link-pin:%'`
  assert.equal((await porta('pin', { token: h.token, pin: '2468' })).statusCode, 200)
})

test('escolher, comentar e enviar: sem extras a galeria enche; depois de enviada trava; a fotógrafa reabre', { skip: pular }, async () => {
  const g = await publicada({ n: 4 })
  const [a, b, c, d] = g.fotos
  const escolher = (foto, escolhida) => porta('escolher', { token: g.token, foto, escolhida })
  assert.deepEqual((await escolher(a, true)).corpo, { ok: true, escolhida: true, escolhidas: 1, extras: 0 })
  assert.deepEqual((await escolher(a, true)).corpo, { ok: true, escolhida: true, escolhidas: 1, extras: 0 })
  assert.deepEqual((await escolher(b, true)).corpo, { ok: true, escolhida: true, escolhidas: 2, extras: 0 })
  // contratadas = 2 e sem extras: a terceira não entra; desfazer abre lugar
  const cheia = await escolher(c, true)
  assert.deepEqual([cheia.statusCode, cheia.corpo], [409, { ok: false, erro: 'cheia', escolhidas: 2 }])
  assert.deepEqual((await escolher(a, false)).corpo, { ok: true, escolhida: false, escolhidas: 1, extras: 0 })
  assert.deepEqual((await escolher(c, true)).corpo.escolhidas, 2)
  // formato e foto de outra galeria
  const outra = await publicada({ n: 1 })
  for (const corpo of [{ foto: 'x', escolhida: true }, { foto: a }, { foto: a, escolhida: 'sim' }, { escolhida: true }]) {
    const r = await porta('escolher', { token: g.token, ...corpo })
    assert.deepEqual([r.statusCode, r.corpo], [400, { ok: false, erro: 'formato' }])
  }
  const alheia = await escolher(outra.fotos[0], true)
  assert.deepEqual([alheia.statusCode, alheia.corpo], [400, { ok: false, erro: 'foto' }])
  assert.equal((await dono`select count(*)::int as n from foto.selecao where galeria = ${outra.id}`)[0].n, 0)

  // comentar e etiquetar (os dois de uma vez; vazio apaga); etiqueta fora da lista não entra
  const comentar = (foto, comentario, etiquetas) => porta('comentar', { token: g.token, foto, comentario, etiquetas })
  assert.deepEqual((await comentar(b, '  Tirar o fio atrás  ', ['remover_objeto', 'suavizar_pele', 'remover_objeto'])).corpo, { ok: true, comentario: 'Tirar o fio atrás', etiquetas: ['remover_objeto', 'suavizar_pele'] })
  assert.deepEqual((await comentar(d, 'Adorei, mas não vou levar', [])).corpo.ok, true)
  for (const [texto, etiquetas, erro] of [
    ['x'.repeat(501), [], 'texto'],
    ['oi', ['inventada'], 'etiquetas'],
    ['oi', ['Suavizar Pele'], 'etiquetas'],
    ['oi', 'suavizar_pele', 'etiquetas'],
    [42, [], 'formato'],
  ]) {
    const r = await comentar(b, texto, etiquetas)
    assert.deepEqual([r.statusCode, r.corpo], [400, { ok: false, erro }], erro)
  }
  assert.equal((await comentar(outra.fotos[0], 'oi', [])).corpo.erro, 'foto')
  assert.deepEqual((await comentar(b, '', null)).corpo, { ok: true, comentario: null, etiquetas: [] })
  await comentar(b, 'Tirar o fio atrás', ['remover_objeto'])
  // comentar não mexe na escolha
  const agora = (await porta('abrir', { token: g.token })).corpo
  assert.deepEqual(
    agora.fotos.map((f) => [f.escolhida, f.comentario, f.etiquetas]),
    [
      [false, null, []],
      [true, 'Tirar o fio atrás', ['remover_objeto']],
      [true, null, []],
      [false, 'Adorei, mas não vou levar', []],
    ],
  )

  // enviar: pede nome; trava a seleção
  for (const nome of ['', '   ', null, 42, 'x'.repeat(201)]) {
    const r = await porta('enviar', { token: g.token, nome })
    assert.deepEqual([r.statusCode, r.corpo], [400, { ok: false, erro: 'nome' }])
  }
  const enviada = await porta('enviar', { token: g.token, nome: '  Ana   <b>Cliente</b> ' })
  assert.equal(enviada.statusCode, 200)
  assert.deepEqual([enviada.corpo.ok, enviada.corpo.envio.nome, enviada.corpo.envio.escolhidas, enviada.corpo.envio.extras], [true, 'Ana b Cliente /b', 2, 0])
  const [envio] = await dono`select nome, escolhidas, extras, fotos, link is not null as com_link from foto.envios where galeria = ${g.id}`
  assert.deepEqual({ ...envio }, { nome: 'Ana b Cliente /b', escolhidas: 2, extras: 0, fotos: [b, c], com_link: true })
  assert.equal((await dono`select estado from foto.galerias where id = ${g.id}`)[0].estado, 'concluida')
  // travada: nada muda, nem escolha, nem comentário, nem outro envio; abrir mostra só leitura com o envio
  for (const r of [await escolher(a, true), await escolher(b, false), await comentar(a, 'mudei de ideia', []), await porta('enviar', { token: g.token, nome: 'Rui' })]) {
    assert.deepEqual([r.statusCode, r.corpo], [409, { ok: false, erro: 'travada' }])
  }
  const lida = (await porta('abrir', { token: g.token })).corpo
  assert.deepEqual([lida.galeria.estado, lida.galeria.travada, lida.escolhidas, lida.envio.nome], ['concluida', true, 2, 'Ana b Cliente /b'])
  assert.equal((await pegar('imagem', { t: g.token, f: a })).statusCode, 200)

  // a fotógrafa reabre: o cliente muda e envia de novo (fica o segundo envio; o primeiro continua registrado)
  await banco.comoPessoa(LIA, (tx) => tx`update foto.galerias set estado = 'reaberta' where id = ${g.id}`)
  const reaberta = (await porta('abrir', { token: g.token })).corpo
  assert.deepEqual([reaberta.galeria.estado, reaberta.galeria.travada, reaberta.envio.nome], ['reaberta', false, 'Ana b Cliente /b'])
  assert.deepEqual((await escolher(b, false)).corpo.escolhidas, 1)
  const segundo = await porta('enviar', { token: g.token, nome: 'Rui' })
  assert.deepEqual([segundo.corpo.envio.nome, segundo.corpo.envio.escolhidas], ['Rui', 1])
  assert.deepEqual(
    (await dono`select nome, escolhidas from foto.envios where galeria = ${g.id} order by enviado_em`).map((e) => [e.nome, e.escolhidas]),
    [
      ['Ana b Cliente /b', 2],
      ['Rui', 1],
    ],
  )
  assert.equal((await porta('abrir', { token: g.token })).corpo.envio.nome, 'Rui')

  // com extras: passa do contratado e conta as extras; nada escolhido não envia
  const comExtras = await publicada({ n: 4, ficha: { permite_extras: true, preco_extra: 'R$ 25 por foto' } })
  assert.deepEqual((await porta('enviar', { token: comExtras.token, nome: 'Ana' })).corpo, { ok: false, erro: 'vazia' })
  let ultima
  for (const f of comExtras.fotos) ultima = await porta('escolher', { token: comExtras.token, foto: f, escolhida: true })
  assert.deepEqual(ultima.corpo, { ok: true, escolhida: true, escolhidas: 4, extras: 2 })
  assert.deepEqual((await porta('enviar', { token: comExtras.token, nome: 'Ana' })).corpo.envio.extras, 2)
})

test('limites por link e por IP; o IP nunca vai para o banco', { skip: pular }, async () => {
  const g = await publicada({ n: 3 })
  const outra = await publicada({ n: 1 })
  const original = structuredClone(limite.REGRAS)
  try {
    // por link: enviar
    limite.REGRAS.linkEnviar.max = 2
    for (let i = 0; i < 2; i++) assert.equal((await porta('enviar', { token: g.token, nome: 'Ana' })).corpo.erro, 'vazia')
    const barrado = await porta('enviar', { token: g.token, nome: 'Ana' }, { ip: OUTRO_IP })
    assert.deepEqual([barrado.statusCode, barrado.corpo], [429, { ok: false, erro: 'limite' }])
    // o limite é daquele link: o outro envia
    assert.equal((await porta('enviar', { token: outra.token, nome: 'Ana' })).corpo.erro, 'vazia')
    // por link: escolher, comentar, abrir e imagem
    limite.REGRAS.linkEscolher.max = 3
    for (let i = 0; i < 3; i++) assert.equal((await porta('escolher', { token: g.token, foto: g.fotos[0], escolhida: i % 2 === 0 })).statusCode, 200)
    assert.equal((await porta('escolher', { token: g.token, foto: g.fotos[0], escolhida: true })).statusCode, 429)
    limite.REGRAS.linkComentar.max = 1
    assert.equal((await porta('comentar', { token: g.token, foto: g.fotos[0], comentario: 'a' })).statusCode, 200)
    assert.equal((await porta('comentar', { token: g.token, foto: g.fotos[0], comentario: 'b' })).statusCode, 429)
    limite.REGRAS.linkAbrir.max = 2
    for (let i = 0; i < 2; i++) assert.equal((await porta('abrir', { token: g.token })).statusCode, 200)
    assert.equal((await porta('abrir', { token: g.token })).statusCode, 429)
    assert.equal((await pegar('abrir', { t: g.token })).statusCode, 429)
    limite.REGRAS.linkImagem.max = 2
    for (let i = 0; i < 2; i++) assert.equal((await pegar('imagem', { t: g.token, f: g.fotos[i] })).statusCode, 200)
    const semImagem = await pegar('imagem', { t: g.token, f: g.fotos[2] })
    assert.deepEqual([semImagem.statusCode, semImagem.bruto.length], [429, 0])
    assert.equal((await pegar('imagem', { t: outra.token, f: outra.fotos[0] })).statusCode, 200)

    // por IP: imagens
    await dono`delete from foto.limites`
    Object.assign(limite.REGRAS, structuredClone(original))
    limite.REGRAS.linkImagemIp.max = 3
    for (let i = 0; i < 3; i++) assert.equal((await pegar('imagem', { t: g.token, f: g.fotos[i] })).statusCode, 200)
    assert.equal((await pegar('imagem', { t: outra.token, f: outra.fotos[0] })).statusCode, 429)
    assert.equal((await pegar('imagem', { t: outra.token, f: outra.fotos[0] }, { ip: OUTRO_IP })).statusCode, 200)

    // por IP: qualquer pedido de link
    await dono`delete from foto.limites`
    Object.assign(limite.REGRAS, structuredClone(original))
    limite.REGRAS.linkIp.max = 4
    for (let i = 0; i < 4; i++) assert.equal((await porta('abrir', { token: i % 2 ? g.token : outra.token })).statusCode, 200)
    for (const r of [await porta('abrir', { token: g.token }), await porta('escolher', { token: outra.token, foto: outra.fotos[0], escolhida: true }), await porta('pin', { token: g.token, pin: '1234' }), await pagina(g.token)]) {
      assert.equal(r.statusCode, 429)
    }
    assert.equal((await porta('abrir', { token: g.token }, { ip: OUTRO_IP })).statusCode, 200)

    // por IP: tentar tokens. Depois de 30 links mortos em uma hora, nem link bom abre daquele IP
    await dono`delete from foto.limites`
    Object.assign(limite.REGRAS, structuredClone(original))
    for (let i = 0; i < 30; i++) assert.equal((await porta('abrir', { token: i % 3 ? link.novoToken() : `torto-${i}` })).statusCode, 404)
    assert.equal((await porta('abrir', { token: link.novoToken() })).statusCode, 429)
    assert.equal((await porta('abrir', { token: g.token })).statusCode, 429)
    assert.equal((await pegar('imagem', { t: g.token, f: g.fotos[0] })).statusCode, 429)
    const paginaBarrada = await pagina(g.token)
    assert.equal(paginaBarrada.statusCode, 429)
    assert.ok(paginaBarrada.bruto.equals(NEUTRA))
    assert.equal((await porta('abrir', { token: g.token }, { ip: OUTRO_IP })).statusCode, 200)
    // passa a hora e o IP volta
    await dono`update foto.limites set em = em - interval '61 minutes'`
    assert.equal((await porta('abrir', { token: g.token })).statusCode, 200)

    // no banco só há chaves com o hash do token ou o HMAC do IP: nem IP, nem token
    await porta('pin', { token: g.token, pin: '0000' })
    const chaves = (await dono`select distinct chave from foto.limites`).map((l) => l.chave)
    assert.ok(chaves.length >= 3)
    for (const chave of chaves) {
      assert.match(chave, /^link-(ip|morto|imagem-ip):[0-9a-f]{32}$|^link-(abrir|pin|escolher|comentar|enviar|imagem):[0-9a-f]{64}(:[0-9a-f]{32})?$/, chave)
      for (const cru of [IP, OUTRO_IP, g.token, outra.token]) assert.ok(!chave.includes(cru))
    }
  } finally {
    Object.assign(limite.REGRAS, original)
  }
  // consumir: confere e registra de uma vez; estourou, não registra nada
  await dono`delete from foto.limites`
  const regra = { max: 2, janelaS: 60 }
  assert.equal(await limite.consumir([['t:a', regra]]), true)
  assert.equal(
    await limite.consumir([
      ['t:a', regra],
      ['t:b', regra],
    ]),
    true,
  )
  assert.equal(
    await limite.consumir([
      ['t:a', regra],
      ['t:b', regra],
    ]),
    false,
  )
  assert.deepEqual(
    (await dono`select chave, count(*)::int as n from foto.limites group by chave order by chave`).map((l) => [l.chave, l.n]),
    [
      ['t:a', 2],
      ['t:b', 1],
    ],
  )
  assert.equal(await limite.dentroDoLimite([['t:b', regra]]), true)
  assert.equal(await limite.dentroDoLimite([['t:a', regra]]), false)
})

test('escrita confere a origem; método errado, ação inventada e corpo torto não passam', { skip: pular }, async () => {
  const g = await publicada({ n: 2 })
  const corpo = { token: g.token, foto: g.fotos[0], escolhida: true }
  for (const opcoes of [{ origem: 'https://outro.exemplo' }, { origem: `http://${SITE}` }, { mais: { 'sec-fetch-site': 'cross-site' } }, { mais: { 'sec-fetch-site': 'same-site' } }]) {
    const r = await porta('escolher', corpo, opcoes)
    assert.deepEqual([r.statusCode, r.corpo], [403, { ok: false, erro: 'origem' }], JSON.stringify(opcoes))
  }
  assert.equal((await dono`select count(*)::int as n from foto.selecao where galeria = ${g.id}`)[0].n, 0)
  assert.equal((await porta('escolher', corpo, { mais: { 'sec-fetch-site': 'same-origin' } })).statusCode, 200)
  // escrita só por POST; imagem só por GET
  for (const acao of ['pin', 'escolher', 'comentar', 'enviar']) {
    const r = await pegar(acao, { t: g.token, token: g.token, foto: g.fotos[0], escolhida: 'true', nome: 'Ana', pin: '1234' })
    assert.deepEqual([r.statusCode, r.headers.allow], [405, 'POST'], acao)
  }
  const r = resposta()
  await rotaPorta({ method: 'POST', url: `/api/link/porta?acao=imagem&t=${g.token}&f=${g.fotos[0]}`, headers: cabecalhos(), body: {} }, r)
  assert.equal(r.statusCode, 405)
  for (const acao of ['inventada', '', 'porta', 'vivo']) assert.deepEqual((await porta(acao, corpo)).corpo, { ok: false, erro: 'link' })
  for (const torto of [[1, 2], 'texto', 7]) assert.equal((await porta('escolher', torto)).statusCode, 400)
})

test('imagem: só por link vivo, só da galeria do link, com cache privado; nada é listado', { skip: pular }, async () => {
  const g = await publicada({ n: 2 })
  const outra = await publicada({ n: 1 })
  const [a, b] = g.fotos
  const r = await pegar('imagem', { t: g.token, f: a })
  assert.equal(r.statusCode, 200)
  assert.ok(r.bruto.equals(jpeg(1)))
  assert.deepEqual(
    { tipo: r.headers['content-type'], tamanho: r.headers['content-length'], cache: r.headers['cache-control'], corp: r.headers['cross-origin-resource-policy'], como: r.headers['content-disposition'] },
    { tipo: 'image/jpeg', tamanho: '600', cache: 'private, no-cache', corp: 'same-origin', como: 'inline' },
  )
  assert.equal(r.headers.etag, `"${sha256(jpeg(1)).slice(0, 32)}"`)
  // com a versão certa no endereço (o que a página usa), o navegador guarda; com a errada, revalida
  const v = sha256(jpeg(1)).slice(0, 12)
  assert.equal((await pegar('imagem', { t: g.token, f: a, s: v })).headers['cache-control'], 'private, max-age=86400, immutable')
  assert.equal((await pegar('imagem', { t: g.token, f: a, s: 'abcdefabcdef' })).headers['cache-control'], 'private, no-cache')
  for (const cache of ['private, no-cache', 'private, max-age=86400, immutable']) assert.ok(!/public|s-maxage/.test(cache))
  // 304 pelo ETag; HEAD sem corpo
  const repetida = await pegar('imagem', { t: g.token, f: a }, { mais: { 'if-none-match': r.headers.etag } })
  assert.deepEqual([repetida.statusCode, repetida.bruto.length], [304, 0])
  const cabeca = await pegar('imagem', { t: g.token, f: a }, { metodo: 'HEAD' })
  assert.deepEqual([cabeca.statusCode, cabeca.bruto.length, cabeca.headers['content-length']], [200, 0, '600'])
  // miniatura: a que existir; sem ela, a prévia
  assert.ok((await pegar('imagem', { t: g.token, f: b, v: 'mini' })).bruto.equals(jpeg(2)))
  const mini = jpeg(77, 120)
  await arquivos.armazenamento().gravar(`g/${g.id}/${b}-m`, mini, 'image/jpeg')
  await dono`update foto.galeria_fotos set mini_tipo = 'image/jpeg', mini_tamanho = 120, mini_sha256 = ${sha256(mini)}, mini_enviada_em = now() where id = ${b}`
  const pequena = await pegar('imagem', { t: g.token, f: b, v: 'mini' })
  assert.ok(pequena.bruto.equals(mini))
  assert.equal(pequena.headers['content-length'], '120')
  assert.equal((await porta('abrir', { token: g.token })).corpo.fotos[1].mini, sha256(mini).slice(0, 12))
  // foto de outra galeria, id que não existe, id torto, sem id: 404 vazio, igual
  for (const f of [outra.fotos[0], '00000000-0000-4000-8000-000000000000', '../../etc/passwd', `g/${g.id}/${a}`, '']) {
    const x = await pegar('imagem', f === '' ? { t: g.token } : { t: g.token, f })
    assert.deepEqual([x.statusCode, x.bruto.length, x.headers['content-type']], [404, 0, undefined], f)
  }
  // registro sem arquivo no armazenamento: 404 (não inventa imagem)
  await arquivos.armazenamento().apagar(`g/${g.id}/${a}`)
  assert.equal((await pegar('imagem', { t: g.token, f: a })).statusCode, 404)
  // sem armazenamento configurado: 503 em todas as rotas do link
  const dir = process.env.FOTO_ARQUIVOS_DIR
  delete process.env.FOTO_ARQUIVOS_DIR
  try {
    for (const x of [await pegar('imagem', { t: g.token, f: b }), await porta('abrir', { token: g.token }), await porta('escolher', { token: g.token, foto: b, escolhida: true })]) {
      assert.deepEqual([x.statusCode, x.corpo], [503, { ok: false, erro: 'sem_armazenamento' }])
    }
  } finally {
    process.env.FOTO_ARQUIVOS_DIR = dir
  }
})

test('fechado: sem o login configurado (e fora do modo local) ou sem banco, o link não existe', { skip: pular }, async () => {
  const g = await publicada({ n: 1 })
  assert.equal((await porta('abrir', { token: g.token })).statusCode, 200)
  const guardado = { id: process.env.ZRO_CLIENT_ID, segredo: process.env.ZRO_CLIENT_SECRET, url: process.env.FOTO_DATABASE_URL }
  const conferir = async (motivo) => {
    for (const r of [await porta('abrir', { token: g.token }), await porta('pin', { token: g.token, pin: '1234' }), await porta('enviar', { token: g.token, nome: 'Ana' })]) {
      assert.deepEqual([r.statusCode, r.corpo], [404, { ok: false, erro: 'link' }], motivo)
    }
    const img = await pegar('imagem', { t: g.token, f: g.fotos[0] })
    assert.deepEqual([img.statusCode, img.corpo], [404, { ok: false, erro: 'link' }], motivo)
    const p = await pagina(g.token)
    assert.equal(p.statusCode, 404, motivo)
    assert.ok(p.bruto.equals(NEUTRA), motivo)
  }
  try {
    delete process.env.ZRO_CLIENT_ID
    delete process.env.ZRO_CLIENT_SECRET
    await conferir('sem login')
    // FOTO_LOCAL=1 só vale em localhost: no endereço oficial continua fechado
    process.env.FOTO_LOCAL = '1'
    await conferir('modo local fora de localhost')
    delete process.env.FOTO_LOCAL
    process.env.ZRO_CLIENT_ID = guardado.id
    process.env.ZRO_CLIENT_SECRET = guardado.segredo
    delete process.env.FOTO_DATABASE_URL
    await conferir('sem banco')
  } finally {
    delete process.env.FOTO_LOCAL
    process.env.ZRO_CLIENT_ID = guardado.id
    process.env.ZRO_CLIENT_SECRET = guardado.segredo
    process.env.FOTO_DATABASE_URL = guardado.url
  }
  assert.equal((await porta('abrir', { token: g.token })).statusCode, 200)
})

test('a página /g/<token>: só para link vivo, sem o nome nem o ícone do produto, assinada como Absolute ZRO', { skip: pular }, async () => {
  const g = await publicada({ n: 1 })
  const r = await pagina(g.token)
  assert.equal(r.statusCode, 200)
  assert.equal(r.headers['content-type'], 'text/html; charset=utf-8')
  assert.equal(r.headers['cache-control'], 'no-store')
  assert.equal(r.headers['referrer-policy'], 'no-referrer')
  const html = r.bruto.toString('utf8')
  assert.match(html, /<html lang="pt-BR" data-tema="claro">/)
  assert.match(html, /<title>Absolute ZRO<\/title>/)
  assert.match(html, /noindex, nofollow/)
  assert.ok(html.includes(`href="/g/${g.token}/galeria.css"`))
  assert.ok(html.includes(`src="/g/${g.token}/galeria.js"`))
  assert.ok(!html.includes('%'), 'sobrou marcador sem trocar')
  assert.doesNotMatch(html, /<script(?![^>]*\bsrc=)[^>]*>/, 'sem script inline (a CSP não deixa)')
  // o tema escolhido (cookie) já vem no HTML
  assert.match((await pagina(g.token, null, { cookie: 'foto_tema=escuro' })).bruto.toString('utf8'), /data-tema="escuro"/)
  // os arquivos da página: só os dela, só com link vivo, sempre revalidados
  const arquivosDaPagina = ['galeria.css', 'galeria.js', 'rede.js']
  for (const f of arquivosDaPagina) {
    const a = await pagina(g.token, f)
    assert.equal(a.statusCode, 200, f)
    assert.equal(a.headers['content-type'], f.endsWith('.css') ? 'text/css; charset=utf-8' : 'text/javascript; charset=utf-8')
    assert.equal(a.headers['cache-control'], 'private, no-cache')
    assert.ok(a.bruto.equals(readFileSync(join(RAIZ, 'galeria', f))))
    const de_novo = await pagina(g.token, f, { mais: { 'if-none-match': a.headers.etag } })
    assert.equal(de_novo.statusCode, 304)
  }
  for (const f of ['galeria.html', '../api/_zro.js', 'nome.js', '..%2Fapp%2Fnome.js', 'inexistente.js', '.env', 'GALERIA.JS']) {
    const a = await pagina(g.token, f)
    assert.equal(a.statusCode, 404, f)
    assert.ok(a.bruto.equals(NEUTRA), f)
  }
  // nada do que a página leva tem o nome, a assinatura ou o ícone do produto (ele não está lançado)
  for (const f of ['galeria.html', ...arquivosDaPagina]) {
    const texto = readFileSync(join(RAIZ, 'galeria', f), 'utf8')
    assert.ok(!texto.toLowerCase().includes(NOME.toLowerCase()), `${f} tem o nome do produto`)
    assert.ok(!texto.includes(ASSINATURA), `${f} tem a assinatura do produto`)
    assert.doesNotMatch(texto, /app\/marca|manifest|apple-touch-icon|nome\.js|rel="icon"/, f)
  }
  assert.match(readFileSync(join(RAIZ, 'galeria/galeria.js'), 'utf8'), /Absolute ZRO/)
  // só GET
  const post = resposta()
  await rotaPagina({ method: 'POST', url: `/api/galeria?t=${g.token}`, headers: cabecalhos() }, post)
  assert.equal(post.statusCode, 405)
})

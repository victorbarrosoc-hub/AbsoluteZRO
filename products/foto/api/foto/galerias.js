// Galerias de seleção: as rotas do FOTÓGRAFO. Todas passam por `rota()` (sessão liberada pelo gate, papel foto_app,
// RLS): a pessoa só vê e mexe nas galerias dela, na organização ativa. Contrato completo em docs/API.md.
//
// O vercel.json reescreve /api/foto/galerias/<id> e /api/foto/galerias/<id>/<acao> para ?id=<id>&acao=<acao>:
//
//   GET    /api/foto/galerias                      lista
//   POST   /api/foto/galerias                      cria (rascunho)
//   GET    /api/foto/galerias/<id>                 a ficha, as fotos e o link
//   PATCH  /api/foto/galerias/<id>                 altera a ficha
//   DELETE /api/foto/galerias/<id>                 apaga a galeria e os arquivos
//   POST   /api/foto/galerias/<id>/fotos           registra fotos em lote (até 500 por pedido; de novo = atualiza)
//   DELETE /api/foto/galerias/<id>/fotos           tira fotos (e os arquivos delas)
//   PUT    /api/foto/galerias/<id>/arquivo?foto=<id>&v=previa|mini    os bytes de uma prévia (ou da miniatura)
//   POST   /api/foto/galerias/<id>/publicar        publica: gera o link e devolve o endereço UMA vez
//   POST   /api/foto/galerias/<id>/link            troca o link (revoga o atual, devolve o endereço novo UMA vez)
//   PATCH  /api/foto/galerias/<id>/link            define ou remove o PIN; estende a validade
//   DELETE /api/foto/galerias/<id>/link            revoga
//   POST   /api/foto/galerias/<id>/reabrir         reabre a seleção enviada
//   POST   /api/foto/galerias/<id>/encerrar        encerra (o link morre)
//   GET    /api/foto/galerias/<id>/selecao         o que o cliente escolheu, em JSON e em lista de nomes
//
// Sem armazenamento configurado (api/_arquivos.js), tudo aqui responde 503 { erro: 'sem_armazenamento' }: nada de
// fingir que publicou. O token do link não fica legível no banco (só o sha256).

import { apagarArquivos, armazenamento, chavesDe, conferirPrevia, lerBytes, MAX_MINI, MAX_PREVIA, TIPOS_DE_IMAGEM } from '../_arquivos.js'
import { hashPin, hashToken, novoToken, PIN, UUID } from '../_link.js'
import { rota } from '../_rota.js'
import { pessoaDe } from '../_sessao.js'
import { consulta, json, origemPermitida } from '../_zro.js'

export const MAX_FOTOS_POR_PEDIDO = 500
export const VALIDADE_PADRAO_DIAS = 30
export const VALIDADE_MAXIMA_DIAS = 90
const ABERTAS = ['publicada', 'concluida', 'reaberta']
const EDITAVEIS = ['rascunho', 'publicada', 'reaberta']

const erro = (status, codigo, mais = {}) => ({ status, corpo: { ok: false, erro: codigo, ...mais } })
const nao = erro(404, 'nao_existe')
const limpar = (v) =>
  String(v)
    .replace(/[\u0000-\u001f\u007f]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()
const inteiro = (v, min, max) => Number.isInteger(v) && v >= min && v <= max

// ───────── o que entra ─────────

/** A ficha que veio no corpo, conferida. { campos } (nomes de coluna) ou { campo } com o nome do campo ruim. */
function lerFicha(corpo, { criar, pessoa }) {
  const campos = {}
  const tem = (k) => Object.hasOwn(corpo, k)
  const textoDe = (k, coluna, max, { obrigatorio = false, padrao } = {}) => {
    if (!tem(k)) {
      if (criar && padrao !== undefined) campos[coluna] = padrao
      else if (criar && obrigatorio) return k
      return null
    }
    const v = corpo[k]
    if (v == null || v === '') {
      if (obrigatorio) return k
      campos[coluna] = null
      return null
    }
    if (typeof v !== 'string' || v.length > max * 4) return k
    const t = limpar(v)
    if (!t ? obrigatorio : t.length > max) return k
    campos[coluna] = t || null
    return null
  }
  const boolDe = (k, coluna) => {
    if (!tem(k)) return null
    if (typeof corpo[k] !== 'boolean') return k
    campos[coluna] = corpo[k]
    return null
  }
  const ruim =
    textoDe('nome', 'nome', 120, { obrigatorio: true }) ||
    textoDe('fotografo', 'fotografo', 80, { obrigatorio: true, padrao: pessoa.nome }) ||
    textoDe('precoExtra', 'preco_extra', 60) ||
    textoDe('mensagem', 'mensagem', 280) ||
    boolDe('permiteExtras', 'permite_extras') ||
    boolDe('marcaDagua', 'marca_dagua')
  if (ruim) return { campo: ruim }
  if (tem('contratadas')) {
    if (!inteiro(corpo.contratadas, 1, 5000)) return { campo: 'contratadas' }
    campos.contratadas = corpo.contratadas
  } else if (criar) return { campo: 'contratadas' }
  if (tem('prazo')) {
    if (corpo.prazo == null || corpo.prazo === '') campos.prazo = null
    else {
      const d = typeof corpo.prazo === 'string' && corpo.prazo.length <= 40 ? new Date(corpo.prazo) : null
      if (!d || Number.isNaN(d.getTime()) || d.getFullYear() < 2020 || d.getFullYear() > 2100) return { campo: 'prazo' }
      campos.prazo = d
    }
  }
  return { campos }
}

/** Uma foto do lote, conferida. Devolve a linha (nomes de coluna) ou null. */
function lerFoto(f, i) {
  if (!f || typeof f !== 'object') return null
  const s = (v, max) => (typeof v === 'string' && v.length >= 1 && v.length <= max && !/[\u0000-\u001f\u007f]/.test(v) ? v : null)
  const arquivo = (a, maximo) =>
    a && typeof a === 'object' && TIPOS_DE_IMAGEM.includes(a.tipo) && inteiro(a.tamanho, 1, maximo) && typeof a.sha256 === 'string' && /^[0-9a-f]{64}$/.test(a.sha256) ? a : null
  const fotoId = s(f.fotoId, 120)
  const nome = s(f.nome, 255)
  const previa = arquivo(f, MAX_PREVIA)
  const grupo = f.grupo == null || f.grupo === '' ? null : s(f.grupo, 64)
  const ordem = f.ordem === undefined ? i : f.ordem
  if (!fotoId || !nome || !previa || grupo === null && f.grupo != null && f.grupo !== '') return null
  if (!inteiro(f.largura, 16, 8192) || !inteiro(f.altura, 16, 8192) || !inteiro(ordem, 0, 1000000)) return null
  if (f.melhor !== undefined && typeof f.melhor !== 'boolean') return null
  const mini = f.mini == null ? null : arquivo(f.mini, MAX_MINI)
  if (f.mini != null && !mini) return null
  return {
    foto_id: fotoId,
    nome,
    ordem,
    grupo,
    melhor: f.melhor === true,
    largura: f.largura,
    altura: f.altura,
    tipo: previa.tipo,
    tamanho: previa.tamanho,
    sha256: previa.sha256,
    mini_tipo: mini?.tipo ?? null,
    mini_tamanho: mini?.tamanho ?? null,
    mini_sha256: mini?.sha256 ?? null,
  }
}

/** Validade em dias (1 a 90) → a data. Ausente = `padrao` (null = não mexe). Ruim = undefined. */
function validadeDe(corpo, padrao) {
  if (corpo.validadeDias === undefined) return padrao == null ? null : new Date(Date.now() + padrao * 86400000)
  if (!inteiro(corpo.validadeDias, 1, VALIDADE_MAXIMA_DIAS)) return undefined
  return new Date(Date.now() + corpo.validadeDias * 86400000)
}

// ───────── o que sai ─────────

const linkDe = (l) => (l ? { ...l, vivo: new Date(l.expiraEm).getTime() > Date.now() } : null)

function fichaDe(g) {
  return {
    id: g.id,
    nome: g.nome,
    fotografo: g.fotografo,
    contratadas: g.contratadas,
    permiteExtras: g.permite_extras,
    precoExtra: g.preco_extra,
    prazo: g.prazo,
    estado: g.estado,
    marcaDagua: g.marca_dagua,
    mensagem: g.mensagem,
    criadaEm: g.criada_em,
    atualizadaEm: g.atualizada_em,
    publicadaEm: g.publicada_em,
    arquivosApagadosEm: g.arquivos_apagados_em,
    ...(g.n_fotos === undefined ? {} : { fotos: g.n_fotos, enviadas: g.n_enviadas, escolhidas: g.n_escolhidas, link: linkDe(g.link), envio: g.envio }),
  }
}

const fotoDe = (f) => ({
  id: f.id,
  fotoId: f.foto_id,
  nome: f.nome,
  ordem: f.ordem,
  grupo: f.grupo,
  melhor: f.melhor,
  largura: f.largura,
  altura: f.altura,
  tipo: f.tipo,
  tamanho: f.tamanho,
  sha256: f.sha256,
  enviada: f.enviada_em != null,
  mini: f.mini_sha256 ? { tipo: f.mini_tipo, tamanho: f.mini_tamanho, sha256: f.mini_sha256, enviada: f.mini_enviada_em != null } : null,
})

/** As galerias com as contagens, o link vivo (sem hash nenhum) e o último envio. `id` = uma só. */
const comResumo = (tx, id = null) => tx`
  select g.*,
         (select count(*)::int from foto.galeria_fotos f where f.galeria = g.id) as n_fotos,
         (select count(*)::int from foto.galeria_fotos f where f.galeria = g.id and f.enviada_em is not null) as n_enviadas,
         (select count(*)::int from foto.selecao s where s.galeria = g.id and s.escolhida) as n_escolhidas,
         (select jsonb_build_object('id', l.id, 'temPin', l.tem_pin, 'expiraEm', l.expira_em, 'aberturas', l.aberturas, 'abertoEm', l.aberto_em, 'criadoEm', l.criado_em)
            from foto.links l where l.galeria = g.id and l.revogado_em is null) as link,
         (select jsonb_build_object('nome', e.nome, 'em', e.enviado_em, 'escolhidas', e.escolhidas, 'extras', e.extras)
            from foto.envios e where e.galeria = g.id order by e.enviado_em desc, e.id limit 1) as envio
    from foto.galerias g
   where ${id ? tx`g.id = ${id}` : tx`true`}
   order by g.criada_em desc, g.id
   limit 200`

const umaGaleria = async (tx, id) => (UUID.test(String(id)) ? (await comResumo(tx, id))[0] : null) ?? null
const semExtensao = (nome) => nome.replace(/\.[A-Za-z0-9]{1,5}$/, '')

// ───────── as rotas ─────────

async function listar(tx) {
  return { status: 200, corpo: { ok: true, galerias: (await comResumo(tx)).map(fichaDe) } }
}

async function criar(tx, p, corpo) {
  const f = lerFicha(corpo, { criar: true, pessoa: p })
  if (f.campo) return erro(400, 'campo', { campo: f.campo })
  const [g] = await tx`insert into foto.galerias ${tx(f.campos)} returning id`
  return { status: 201, corpo: { ok: true, galeria: fichaDe(await umaGaleria(tx, g.id)) } }
}

async function ler(tx, id) {
  const g = await umaGaleria(tx, id)
  if (!g) return nao
  const fotos = await tx`select * from foto.galeria_fotos where galeria = ${g.id} order by ordem, nome, id`
  return { status: 200, corpo: { ok: true, galeria: fichaDe(g), fotos: fotos.map(fotoDe) } }
}

async function alterar(tx, p, corpo, id) {
  const g = await umaGaleria(tx, id)
  if (!g) return nao
  const f = lerFicha(corpo, { criar: false, pessoa: p })
  if (f.campo) return erro(400, 'campo', { campo: f.campo })
  if (Object.keys(f.campos).length) await tx`update foto.galerias set ${tx(f.campos)} where id = ${g.id}`
  return { status: 200, corpo: { ok: true, galeria: fichaDe(await umaGaleria(tx, g.id)) } }
}

async function apagar(tx, id, arm) {
  const g = await umaGaleria(tx, id)
  if (!g) return nao
  // primeiro os arquivos: se o armazenamento falhar, a galeria continua aqui para tentar de novo
  const fotos = await tx`select chave, enviada_em, mini_enviada_em from foto.galeria_fotos where galeria = ${g.id}`
  const arquivos = await apagarArquivos(arm, chavesDe(fotos))
  await tx`delete from foto.galerias where id = ${g.id}`
  return { status: 200, corpo: { ok: true, arquivos } }
}

async function registrarFotos(tx, corpo, id, arm) {
  const g = await umaGaleria(tx, id)
  if (!g) return nao
  if (!EDITAVEIS.includes(g.estado)) return erro(409, 'travada')
  if (!Array.isArray(corpo.fotos) || !corpo.fotos.length || corpo.fotos.length > MAX_FOTOS_POR_PEDIDO) return erro(400, 'campo', { campo: 'fotos' })
  const linhas = []
  for (let i = 0; i < corpo.fotos.length; i++) {
    const l = lerFoto(corpo.fotos[i], i)
    if (!l) return erro(400, 'campo', { campo: 'fotos', indice: i })
    linhas.push({ galeria: g.id, ...l })
  }
  if (new Set(linhas.map((l) => l.foto_id)).size !== linhas.length) return erro(400, 'campo', { campo: 'fotos', repetida: true })
  const ids = linhas.map((l) => l.foto_id)
  const antes = await tx`select foto_id, chave, mini_sha256 from foto.galeria_fotos where galeria = ${g.id} and foto_id = any(${ids}) and mini_enviada_em is not null`
  const r = await tx`
    insert into foto.galeria_fotos ${tx(linhas)}
    on conflict (galeria, foto_id) do update set
      nome = excluded.nome, ordem = excluded.ordem, grupo = excluded.grupo, melhor = excluded.melhor, largura = excluded.largura, altura = excluded.altura,
      tipo = excluded.tipo, tamanho = excluded.tamanho, sha256 = excluded.sha256,
      mini_tipo = excluded.mini_tipo, mini_tamanho = excluded.mini_tamanho, mini_sha256 = excluded.mini_sha256
    returning *`
  // miniatura que deixou de existir no registro sai do armazenamento
  const semMini = new Set(linhas.filter((l) => !l.mini_sha256).map((l) => l.foto_id))
  await apagarArquivos(
    arm,
    antes.filter((a) => semMini.has(a.foto_id)).map((a) => `${a.chave}-m`),
  )
  const porId = new Map(r.map((f) => [f.foto_id, f]))
  return { status: 200, corpo: { ok: true, fotos: ids.map((fid) => fotoDe(porId.get(fid))) } }
}

async function tirarFotos(tx, corpo, id, arm) {
  const g = await umaGaleria(tx, id)
  if (!g) return nao
  if (!EDITAVEIS.includes(g.estado)) return erro(409, 'travada')
  const ids = corpo.ids
  if (!Array.isArray(ids) || !ids.length || ids.length > MAX_FOTOS_POR_PEDIDO || ids.some((i) => !UUID.test(String(i)))) return erro(400, 'campo', { campo: 'ids' })
  const fotos = await tx`select id, chave, enviada_em, mini_enviada_em from foto.galeria_fotos where galeria = ${g.id} and id = any(${ids}::uuid[])`
  const arquivos = await apagarArquivos(arm, chavesDe(fotos))
  await tx`delete from foto.galeria_fotos where galeria = ${g.id} and id = any(${fotos.map((f) => f.id)}::uuid[])`
  return { status: 200, corpo: { ok: true, fotos: fotos.length, arquivos } }
}

async function gravarArquivo(tx, req, id, arm) {
  const q = consulta(req)
  const mini = q.get('v') === 'mini'
  const fotoId = q.get('foto')
  if (!UUID.test(String(id)) || !UUID.test(String(fotoId)) || !['previa', 'mini', null].includes(q.get('v'))) return nao
  const [f] = await tx`select f.*, g.estado from foto.galeria_fotos f join foto.galerias g on g.id = f.galeria where f.galeria = ${id} and f.id = ${fotoId}`
  if (!f) return nao
  if (!EDITAVEIS.includes(f.estado)) return erro(409, 'travada')
  if (mini && !f.mini_sha256) return erro(400, 'sem_mini')
  const esperado = mini ? { tipo: f.mini_tipo, tamanho: f.mini_tamanho, sha256: f.mini_sha256, maximo: MAX_MINI } : { tipo: f.tipo, tamanho: f.tamanho, sha256: f.sha256, maximo: MAX_PREVIA }
  const c = conferirPrevia(req.bytes, esperado)
  if (!c.ok) return erro(c.erro === 'grande' ? 413 : 400, c.erro)
  await arm.gravar(mini ? `${f.chave}-m` : f.chave, req.bytes, esperado.tipo)
  if (mini) await tx`update foto.galeria_fotos set mini_enviada_em = now() where id = ${f.id}`
  else await tx`update foto.galeria_fotos set enviada_em = now() where id = ${f.id}`
  return { status: 200, corpo: { ok: true, foto: f.id, variante: mini ? 'mini' : 'previa' } }
}

/** Cria o link da galeria e devolve o endereço (a única vez em que o token aparece). `corpo.pin` opcional. */
async function novoLink(tx, req, g, corpo) {
  if (corpo.pin != null && !PIN.test(String(corpo.pin))) return erro(400, 'campo', { campo: 'pin' })
  const expira = validadeDe(corpo, VALIDADE_PADRAO_DIAS)
  if (!expira) return erro(400, 'campo', { campo: 'validadeDias' })
  const token = novoToken()
  await tx`insert into foto.links ${tx({ galeria: g.id, token_hash: hashToken(token), pin_hash: corpo.pin != null ? hashPin(corpo.pin) : null, expira_em: expira })}`
  return { status: 201, corpo: { ok: true, endereco: `${origemPermitida(req)}/g/${token}`, galeria: fichaDe(await umaGaleria(tx, g.id)) } }
}

async function publicar(tx, req, corpo, id) {
  const g = await umaGaleria(tx, id)
  if (!g) return nao
  if (g.estado !== 'rascunho') return erro(409, 'estado', { estado: g.estado })
  if (!g.n_fotos) return erro(409, 'sem_fotos')
  if (g.n_enviadas < g.n_fotos) return erro(409, 'faltam_arquivos', { faltam: g.n_fotos - g.n_enviadas })
  if (corpo.pin != null && !PIN.test(String(corpo.pin))) return erro(400, 'campo', { campo: 'pin' })
  if (validadeDe(corpo, VALIDADE_PADRAO_DIAS) === undefined) return erro(400, 'campo', { campo: 'validadeDias' })
  await tx`update foto.galerias set estado = 'publicada' where id = ${g.id}`
  return novoLink(tx, req, g, corpo)
}

async function trocarLink(tx, req, corpo, id) {
  const g = await umaGaleria(tx, id)
  if (!g) return nao
  if (!ABERTAS.includes(g.estado)) return erro(409, 'estado', { estado: g.estado })
  if (corpo.pin != null && !PIN.test(String(corpo.pin))) return erro(400, 'campo', { campo: 'pin' })
  if (validadeDe(corpo, VALIDADE_PADRAO_DIAS) === undefined) return erro(400, 'campo', { campo: 'validadeDias' })
  await tx`update foto.links set revogado_em = now() where galeria = ${g.id} and revogado_em is null`
  return novoLink(tx, req, g, corpo)
}

async function alterarLink(tx, corpo, id) {
  const g = await umaGaleria(tx, id)
  if (!g) return nao
  if (!g.link) return erro(409, 'sem_link')
  const campos = {}
  if (Object.hasOwn(corpo, 'pin')) {
    if (corpo.pin != null && !PIN.test(String(corpo.pin))) return erro(400, 'campo', { campo: 'pin' })
    campos.pin_hash = corpo.pin == null ? null : hashPin(corpo.pin)
  }
  const expira = validadeDe(corpo, null)
  if (expira === undefined) return erro(400, 'campo', { campo: 'validadeDias' })
  if (expira) campos.expira_em = expira
  if (!Object.keys(campos).length) return erro(400, 'campo', { campo: 'pin' })
  await tx`update foto.links set ${tx(campos)} where id = ${g.link.id}`
  return { status: 200, corpo: { ok: true, galeria: fichaDe(await umaGaleria(tx, g.id)) } }
}

async function revogarLink(tx, id) {
  const g = await umaGaleria(tx, id)
  if (!g) return nao
  if (!g.link) return erro(409, 'sem_link')
  await tx`update foto.links set revogado_em = now() where id = ${g.link.id}`
  return { status: 200, corpo: { ok: true, galeria: fichaDe(await umaGaleria(tx, g.id)) } }
}

async function mudarEstado(tx, id, de, para) {
  const g = await umaGaleria(tx, id)
  if (!g) return nao
  if (!de.includes(g.estado)) return erro(409, 'estado', { estado: g.estado })
  await tx`update foto.galerias set estado = ${para} where id = ${g.id}`
  return { status: 200, corpo: { ok: true, galeria: fichaDe(await umaGaleria(tx, g.id)) } }
}

async function selecao(tx, id) {
  const g = await umaGaleria(tx, id)
  if (!g) return nao
  const linhas = await tx`
    select f.id, f.foto_id, f.nome, s.escolhida, s.comentario, s.etiquetas, s.atualizada_em
      from foto.selecao s join foto.galeria_fotos f on f.id = s.foto
     where s.galeria = ${g.id} and (s.escolhida or s.comentario is not null or cardinality(s.etiquetas) > 0)
     order by f.ordem, f.nome, f.id`
  const envios = await tx`select nome, enviado_em, escolhidas, extras from foto.envios where galeria = ${g.id} order by enviado_em desc, id`
  const escolhidas = linhas.filter((l) => l.escolhida)
  const nomes = escolhidas.map((l) => l.nome)
  const bases = nomes.map(semExtensao)
  return {
    status: 200,
    corpo: {
      ok: true,
      galeria: { id: g.id, nome: g.nome, estado: g.estado, contratadas: g.contratadas, permiteExtras: g.permite_extras, precoExtra: g.preco_extra },
      // `enviada` = a seleção está travada, com nome e data; antes disso é o que o cliente marcou até agora
      enviada: g.estado === 'concluida',
      envio: g.envio,
      envios: envios.map((e) => ({ nome: e.nome, em: e.enviado_em, escolhidas: e.escolhidas, extras: e.extras })),
      escolhidas: escolhidas.length,
      extras: Math.max(escolhidas.length - g.contratadas, 0),
      ids: escolhidas.map((l) => l.foto_id),
      fotos: linhas.map((l) => ({ id: l.id, fotoId: l.foto_id, nome: l.nome, escolhida: l.escolhida, comentario: l.comentario, etiquetas: l.etiquetas, atualizadaEm: l.atualizada_em })),
      listas: { nomes, lightroom: bases.join(', '), captureOne: bases.join('\n') },
    },
  }
}

// ───────── despacho ─────────

const partes = (req) => {
  const q = consulta(req)
  return { id: q.get('id'), acao: q.get('acao') }
}
/** Só com armazenamento: sem ele a galeria não existe de verdade. */
const comArquivos = (fn) => async (tx, p, corpo, req) => {
  const arm = armazenamento()
  if (!arm) return erro(503, 'sem_armazenamento')
  const { id, acao } = partes(req)
  if (id != null && !UUID.test(id)) return nao
  return (await fn({ tx, p, corpo, req, id, acao, arm })) ?? nao
}

const rotas = rota({
  GET: comArquivos(({ tx, id, acao }) => (!id ? listar(tx) : !acao ? ler(tx, id) : acao === 'selecao' ? selecao(tx, id) : null)),
  POST: comArquivos(({ tx, p, corpo, req, id, acao, arm }) => {
    if (!id) return acao ? null : criar(tx, p, corpo)
    if (acao === 'fotos') return registrarFotos(tx, corpo, id, arm)
    if (acao === 'publicar') return publicar(tx, req, corpo, id)
    if (acao === 'link') return trocarLink(tx, req, corpo, id)
    if (acao === 'reabrir') return mudarEstado(tx, id, ['concluida'], 'reaberta')
    if (acao === 'encerrar') return mudarEstado(tx, id, ABERTAS, 'encerrada')
    return null
  }),
  PATCH: comArquivos(({ tx, p, corpo, id, acao }) => (!id ? null : !acao ? alterar(tx, p, corpo, id) : acao === 'link' ? alterarLink(tx, corpo, id) : null)),
  PUT: comArquivos(({ tx, req, id, acao, arm }) => (id && acao === 'arquivo' ? gravarArquivo(tx, req, id, arm) : null)),
  DELETE: comArquivos(({ tx, corpo, id, acao, arm }) => (!id ? null : !acao ? apagar(tx, id, arm) : acao === 'fotos' ? tirarFotos(tx, corpo, id, arm) : acao === 'link' ? revogarLink(tx, id) : null)),
})

export default async function galerias(req, res) {
  try {
    // o corpo é lido aqui (rota() só lê JSON até 64 KB): os bytes da prévia, ou um JSON maior (lote de fotos)
    if (['POST', 'PUT', 'PATCH', 'DELETE'].includes(req.method) && pessoaDe(req)) {
      const q = consulta(req)
      if (req.method === 'PUT' && q.get('acao') === 'arquivo') {
        req.bytes = await lerBytes(req, q.get('v') === 'mini' ? MAX_MINI : MAX_PREVIA)
        req.body = {}
      } else if (req.body === undefined) {
        const b = await lerBytes(req, 512 * 1024)
        req.body = b.length ? JSON.parse(b.toString('utf8')) : {}
      }
    }
  } catch (e) {
    return e?.message === 'grande' ? json(res, 413, { ok: false, erro: 'grande' }) : json(res, 400, { ok: false, erro: 'corpo' })
  }
  try {
    return await rotas(req, res)
  } catch (e) {
    // as guardas do banco (db/migrations/0001): regra quebrada vira 409 com o código; valor fora da faixa, 400
    const regra = e?.code === 'P0001' && /^(galeria|fotos|link):([a-z_]+)$/.exec(String(e.message))
    if (regra) return json(res, 409, { ok: false, erro: regra[2] })
    if (e?.code === '23514' || e?.code === '22P02' || e?.code === '22001') return json(res, 400, { ok: false, erro: 'campo' })
    throw e
  }
}

// Eventos com busca por rosto: as rotas do FOTÓGRAFO. Todas por `rota()` (sessão liberada pelo gate, papel foto_app,
// RLS): a pessoa só vê e mexe nos eventos dela, na organização ativa. Contrato em docs/API.md. Estudo e regras em
// docs/estudo/rosto-em-evento.md e na regra 5 de docs/ARQUITETURA.md.
//
// O vercel.json reescreve /api/foto/eventos/<id> e /api/foto/eventos/<id>/<acao> para ?id=<id>&acao=<acao>:
//
//   GET    /api/foto/eventos                   lista, com as contagens
//   POST   /api/foto/eventos                   cria (rascunho): nome, data, modo, prazoDias, marcaDagua, galeria?, aviso
//   GET    /api/foto/eventos/<id>              a ficha, as fotos, o link e as contagens
//   PATCH  /api/foto/eventos/<id>              altera a ficha (o modo só no rascunho; o prazo estende uma vez)
//   DELETE /api/foto/eventos/<id>              apaga o evento, as prévias e tudo o que é dele
//   POST   /api/foto/eventos/<id>/fotos        registra fotos em lote (até 500 por pedido; de novo = atualiza)
//   DELETE /api/foto/eventos/<id>/fotos        tira fotos (e os arquivos e os rostos delas)
//   PUT    /api/foto/eventos/<id>/arquivo?foto=<id>&v=previa|mini   os bytes de uma prévia com marca-d'água
//   POST   /api/foto/eventos/<id>/rostos       os rostos de uma foto: na busca aberta, os vetores (int8); com
//                                              consentimento, só quantos (os vetores ficam no computador)
//   GET    /api/foto/eventos/<id>/pessoas      com consentimento: quem pediu para ser achado (1 a 3 vetores cada)
//   POST   /api/foto/eventos/<id>/ligacoes     com consentimento: as ligações foto ↔ pessoa que o computador achou
//   POST   /api/foto/eventos/<id>/publicar     publica e devolve o endereço UMA vez
//   POST   /api/foto/eventos/<id>/link         troca o link (o endereço novo UMA vez)
//   PATCH  /api/foto/eventos/<id>/link         define ou tira o PIN
//   POST   /api/foto/eventos/<id>/encerrar     encerra: o link morre e as assinaturas somem na hora
//   GET    /api/foto/eventos/<id>/pedidos      os pedidos de foto dos visitantes
//
// Sem armazenamento configurado (api/_arquivos.js): 503 { erro: 'sem_armazenamento' }.

import { apagarArquivos, armazenamento, chavesDe, conferirPrevia, lerBytes, MAX_MINI, MAX_PREVIA, TIPOS_DE_IMAGEM } from '../_arquivos.js'
import { textoAceito } from '../_evento.js'
import { hashPin, hashToken, novoToken, PIN, UUID } from '../_link.js'
import { rota } from '../_rota.js'
import { pessoaDe } from '../_sessao.js'
import { consulta, json, origemPermitida } from '../_zro.js'
import { paraBase64, vetorDeTexto } from '../../src/rosto/assinatura.js'

export const MAX_FOTOS_POR_PEDIDO = 500
export const PRAZO_PADRAO_DIAS = 14
export const PRAZO_MAXIMO_DIAS = 30
const MODOS = ['consentimento', 'aberta']

const erro = (status, codigo, mais = {}) => ({ status, corpo: { ok: false, erro: codigo, ...mais } })
const nao = erro(404, 'nao_existe')
const limpar = (v) =>
  String(v)
    .replace(/[\u0000-\u001f\u007f]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()
const inteiro = (v, min, max) => Number.isInteger(v) && v >= min && v <= max

// ───────── o que entra ─────────

/** A ficha que veio no corpo, conferida: { campos } ou { campo } com o nome ruim. */
function lerFicha(corpo, { criar }) {
  const campos = {}
  const tem = (k) => Object.hasOwn(corpo, k)
  if (tem('nome') || criar) {
    if (typeof corpo.nome !== 'string' || corpo.nome.length > 480) return { campo: 'nome' }
    const t = limpar(corpo.nome)
    if (!t || t.length > 120) return { campo: 'nome' }
    campos.nome = t
  }
  if (tem('data')) {
    if (corpo.data == null || corpo.data === '') campos.data = null
    else if (typeof corpo.data !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(corpo.data) || Number.isNaN(new Date(`${corpo.data}T12:00:00Z`).getTime())) return { campo: 'data' }
    else campos.data = corpo.data
  }
  if (tem('modo')) {
    if (!MODOS.includes(corpo.modo)) return { campo: 'modo' }
    campos.modo = corpo.modo
  } else if (criar) campos.modo = 'consentimento'
  if (tem('prazoDias')) {
    if (!inteiro(corpo.prazoDias, 1, PRAZO_MAXIMO_DIAS)) return { campo: 'prazoDias' }
    campos.prazo = new Date(Date.now() + corpo.prazoDias * 86400000)
  } else if (criar) campos.prazo = new Date(Date.now() + PRAZO_PADRAO_DIAS * 86400000)
  if (tem('marcaDagua')) {
    if (typeof corpo.marcaDagua !== 'boolean') return { campo: 'marcaDagua' }
    campos.marca_dagua = corpo.marcaDagua
  }
  if (criar && tem('galeria') && corpo.galeria != null) {
    if (!UUID.test(String(corpo.galeria))) return { campo: 'galeria' }
    campos.galeria = corpo.galeria
  }
  // o aceite do aviso (texto de src/rosto/textos.js): a versão que a tela mostrou
  if (tem('aviso')) {
    if (corpo.aviso == null) {
      campos.aviso_versao = null
      campos.aviso_sha256 = null
    } else {
      const t = textoAceito(corpo.aviso, 'ativacaoAberta', 'ativacaoConsentimento')
      if (!t) return { campo: 'aviso' }
      campos.aviso_versao = t.versao
      campos.aviso_sha256 = t.sha
    }
  }
  return { campos }
}

function lerFoto(f, i) {
  if (!f || typeof f !== 'object') return null
  const s = (v, max) => (typeof v === 'string' && v.length >= 1 && v.length <= max && !/[\u0000-\u001f\u007f]/.test(v) ? v : null)
  const arquivo = (a, maximo) =>
    a && typeof a === 'object' && TIPOS_DE_IMAGEM.includes(a.tipo) && inteiro(a.tamanho, 1, maximo) && typeof a.sha256 === 'string' && /^[0-9a-f]{64}$/.test(a.sha256)
      ? a
      : null
  const fotoId = s(f.fotoId, 120)
  const nome = s(f.nome, 255)
  const previa = arquivo(f, MAX_PREVIA)
  const ordem = f.ordem === undefined ? i : f.ordem
  if (!fotoId || !nome || !previa || !inteiro(f.largura, 16, 8192) || !inteiro(f.altura, 16, 8192) || !inteiro(ordem, 0, 1000000)) return null
  const mini = f.mini == null ? null : arquivo(f.mini, MAX_MINI)
  if (f.mini != null && !mini) return null
  return {
    foto_id: fotoId,
    nome,
    ordem,
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

// ───────── o que sai ─────────

const linkDe = (l) => (l ? { id: l.id, temPin: l.tem_pin, aberturas: l.aberturas, abertoEm: l.aberto_em, criadoEm: l.criado_em } : null)

function fichaDe(e) {
  return {
    id: e.id,
    nome: e.nome,
    data: e.data ? new Date(e.data).toISOString().slice(0, 10) : null,
    modo: e.modo,
    estado: e.estado,
    prazo: e.prazo,
    prorrogado: e.prorrogado,
    marcaDagua: e.marca_dagua,
    galeria: e.galeria,
    aviso: e.aviso_versao ? { versao: e.aviso_versao, em: e.aviso_em } : null,
    criadoEm: e.criado_em,
    publicadoEm: e.publicado_em,
    encerradoEm: e.encerrado_em,
    vetoresApagadosEm: e.vetores_apagados_em,
    arquivosApagadosEm: e.arquivos_apagados_em,
    contagens: {
      fotos: e.n_fotos,
      enviadas: e.n_enviadas,
      processadas: e.n_processadas,
      rostos: e.n_rostos,
      guardados: e.n_guardados,
      buscas: e.n_buscas,
      cadastros: e.n_cadastros,
      remocoes: e.n_remocoes,
      pessoas: e.n_pessoas,
      pendentes: e.n_pendentes,
      ligacoes: e.n_ligacoes,
      pedidos: e.n_pedidos,
    },
    link: linkDe(e.link),
  }
}

const fotoDe = (f) => ({
  id: f.id,
  fotoId: f.foto_id,
  nome: f.nome,
  ordem: f.ordem,
  largura: f.largura,
  altura: f.altura,
  tipo: f.tipo,
  tamanho: f.tamanho,
  sha256: f.sha256,
  enviada: f.enviada_em != null,
  mini: f.mini_sha256 ? { tipo: f.mini_tipo, tamanho: f.mini_tamanho, sha256: f.mini_sha256, enviada: f.mini_enviada_em != null } : null,
  rostos: f.rostos,
  rostosEm: f.rostos_em,
})

const comResumo = (tx, id = null) => tx`
  select e.*,
         (select count(*)::int from foto.evento_fotos f where f.evento = e.id) as n_fotos,
         (select count(*)::int from foto.evento_fotos f where f.evento = e.id and f.enviada_em is not null) as n_enviadas,
         (select count(*)::int from foto.evento_fotos f where f.evento = e.id and f.rostos_em is not null) as n_processadas,
         (select coalesce(sum(f.rostos), 0)::int from foto.evento_fotos f where f.evento = e.id) as n_rostos,
         foto.evento_rostos_contar(e.id) as n_guardados,
         (select coalesce(sum(b.buscas), 0)::int from foto.evento_buscas b where b.evento = e.id) as n_buscas,
         (select coalesce(sum(b.cadastros), 0)::int from foto.evento_buscas b where b.evento = e.id) as n_cadastros,
         (select coalesce(sum(b.remocoes), 0)::int from foto.evento_buscas b where b.evento = e.id) as n_remocoes,
         (select count(*)::int from foto.evento_pessoas p where p.evento = e.id) as n_pessoas,
         (select count(*)::int from foto.evento_pessoas p where p.evento = e.id and (p.processado_em is null or p.processado_em < p.atualizado_em)) as n_pendentes,
         (select count(*)::int from foto.evento_ligacoes l where l.evento = e.id) as n_ligacoes,
         (select count(*)::int from foto.evento_pedidos d where d.evento = e.id) as n_pedidos,
         (select jsonb_build_object('id', l.id, 'tem_pin', l.tem_pin, 'aberturas', l.aberturas, 'aberto_em', l.aberto_em, 'criado_em', l.criado_em)
            from foto.evento_links l where l.evento = e.id and l.revogado_em is null) as link
    from foto.eventos e
   where ${id ? tx`e.id = ${id}` : tx`true`}
   order by e.criado_em desc, e.id
   limit 200`

const umEvento = async (tx, id) => (UUID.test(String(id)) ? (await comResumo(tx, id))[0] : null) ?? null

// ───────── as rotas ─────────

async function listar(tx) {
  return { status: 200, corpo: { ok: true, eventos: (await comResumo(tx)).map(fichaDe) } }
}

async function registrarAtivacao(tx, e, versao) {
  const t = textoAceito(versao, 'ativacaoAberta', 'ativacaoConsentimento')
  if (t) await tx`insert into foto.evento_consentimentos ${tx({ evento: e, tipo: 'ativacao', resultado: 'aceitou', versao: t.versao, sha256_texto: t.sha })}`
}

async function criar(tx, corpo) {
  const f = lerFicha(corpo, { criar: true })
  if (f.campo) return erro(400, 'campo', { campo: f.campo })
  const [e] = await tx`insert into foto.eventos ${tx(f.campos)} returning id`
  if (f.campos.aviso_versao) await registrarAtivacao(tx, e.id, f.campos.aviso_versao)
  return { status: 201, corpo: { ok: true, evento: fichaDe(await umEvento(tx, e.id)) } }
}

async function ler(tx, id) {
  const e = await umEvento(tx, id)
  if (!e) return nao
  const fotos = await tx`select * from foto.evento_fotos where evento = ${e.id} order by ordem, nome, id`
  return { status: 200, corpo: { ok: true, evento: fichaDe(e), fotos: fotos.map(fotoDe) } }
}

async function alterar(tx, corpo, id) {
  const e = await umEvento(tx, id)
  if (!e) return nao
  const f = lerFicha(corpo, { criar: false })
  if (f.campo) return erro(400, 'campo', { campo: f.campo })
  if (Object.keys(f.campos).length) await tx`update foto.eventos set ${tx(f.campos)} where id = ${e.id}`
  if (f.campos.aviso_versao && f.campos.aviso_versao !== e.aviso_versao) await registrarAtivacao(tx, e.id, f.campos.aviso_versao)
  return { status: 200, corpo: { ok: true, evento: fichaDe(await umEvento(tx, e.id)) } }
}

async function apagar(tx, id, arm) {
  const e = await umEvento(tx, id)
  if (!e) return nao
  const fotos = await tx`select chave, enviada_em, mini_enviada_em from foto.evento_fotos where evento = ${e.id}`
  const arquivos = await apagarArquivos(arm, chavesDe(fotos))
  await tx`delete from foto.eventos where id = ${e.id}`
  return { status: 200, corpo: { ok: true, arquivos } }
}

async function registrarFotos(tx, corpo, id, arm) {
  const e = await umEvento(tx, id)
  if (!e) return nao
  if (e.estado === 'encerrado') return erro(409, 'encerrado')
  if (!Array.isArray(corpo.fotos) || !corpo.fotos.length || corpo.fotos.length > MAX_FOTOS_POR_PEDIDO) return erro(400, 'campo', { campo: 'fotos' })
  const linhas = []
  for (let i = 0; i < corpo.fotos.length; i++) {
    const l = lerFoto(corpo.fotos[i], i)
    if (!l) return erro(400, 'campo', { campo: 'fotos', indice: i })
    linhas.push({ evento: e.id, ...l })
  }
  if (new Set(linhas.map((l) => l.foto_id)).size !== linhas.length) return erro(400, 'campo', { campo: 'fotos', repetida: true })
  const ids = linhas.map((l) => l.foto_id)
  const antes = await tx`select foto_id, chave from foto.evento_fotos where evento = ${e.id} and foto_id = any(${ids}) and mini_enviada_em is not null`
  const r = await tx`
    insert into foto.evento_fotos ${tx(linhas)}
    on conflict (evento, foto_id) do update set
      nome = excluded.nome, ordem = excluded.ordem, largura = excluded.largura, altura = excluded.altura,
      tipo = excluded.tipo, tamanho = excluded.tamanho, sha256 = excluded.sha256,
      mini_tipo = excluded.mini_tipo, mini_tamanho = excluded.mini_tamanho, mini_sha256 = excluded.mini_sha256
    returning *`
  const semMini = new Set(linhas.filter((l) => !l.mini_sha256).map((l) => l.foto_id))
  await apagarArquivos(
    arm,
    antes.filter((a) => semMini.has(a.foto_id)).map((a) => `${a.chave}-m`),
  )
  const porId = new Map(r.map((f) => [f.foto_id, f]))
  return { status: 200, corpo: { ok: true, fotos: ids.map((fid) => fotoDe(porId.get(fid))) } }
}

async function tirarFotos(tx, corpo, id, arm) {
  const e = await umEvento(tx, id)
  if (!e) return nao
  if (e.estado === 'encerrado') return erro(409, 'encerrado')
  const ids = corpo.ids
  if (!Array.isArray(ids) || !ids.length || ids.length > MAX_FOTOS_POR_PEDIDO || ids.some((i) => !UUID.test(String(i)))) return erro(400, 'campo', { campo: 'ids' })
  const fotos = await tx`select id, chave, enviada_em, mini_enviada_em from foto.evento_fotos where evento = ${e.id} and id = any(${ids}::uuid[])`
  const arquivos = await apagarArquivos(arm, chavesDe(fotos))
  await tx`delete from foto.evento_fotos where evento = ${e.id} and id = any(${fotos.map((f) => f.id)}::uuid[])`
  return { status: 200, corpo: { ok: true, fotos: fotos.length, arquivos } }
}

async function gravarArquivo(tx, req, id, arm) {
  const q = consulta(req)
  const mini = q.get('v') === 'mini'
  const fotoId = q.get('foto')
  if (!UUID.test(String(id)) || !UUID.test(String(fotoId)) || !['previa', 'mini', null].includes(q.get('v'))) return nao
  const [f] = await tx`select f.*, e.estado from foto.evento_fotos f join foto.eventos e on e.id = f.evento where f.evento = ${id} and f.id = ${fotoId}`
  if (!f) return nao
  if (f.estado === 'encerrado') return erro(409, 'encerrado')
  if (mini && !f.mini_sha256) return erro(400, 'sem_mini')
  const esperado = mini
    ? { tipo: f.mini_tipo, tamanho: f.mini_tamanho, sha256: f.mini_sha256, maximo: MAX_MINI }
    : { tipo: f.tipo, tamanho: f.tamanho, sha256: f.sha256, maximo: MAX_PREVIA }
  const c = conferirPrevia(req.bytes, esperado)
  if (!c.ok) return erro(c.erro === 'grande' ? 413 : 400, c.erro)
  await arm.gravar(mini ? `${f.chave}-m` : f.chave, req.bytes, esperado.tipo)
  if (mini) await tx`update foto.evento_fotos set mini_enviada_em = now() where id = ${f.id}`
  else await tx`update foto.evento_fotos set enviada_em = now() where id = ${f.id}`
  return { status: 200, corpo: { ok: true, foto: f.id, variante: mini ? 'mini' : 'previa' } }
}

/**
 * Os rostos de uma foto. Busca aberta: { foto, rostos: [{ v (base64 int8), largura, nota (0..1), colado, perfil }] }
 * vão para foto.evento_rostos pela função do dono (o papel do app não lê nem escreve a tabela). Com consentimento:
 * { foto, quantos } (o vetor fica no computador).
 */
async function gravarRostos(tx, corpo, id) {
  const e = await umEvento(tx, id)
  if (!e) return nao
  if (e.estado === 'encerrado') return erro(409, 'encerrado')
  if (!UUID.test(String(corpo.foto))) return erro(400, 'campo', { campo: 'foto' })
  const [f] = await tx`select id from foto.evento_fotos where evento = ${e.id} and id = ${corpo.foto}`
  if (!f) return nao
  if (e.modo === 'consentimento') {
    if (corpo.rostos !== undefined) return erro(409, 'modo')
    if (!inteiro(corpo.quantos, 0, 200)) return erro(400, 'campo', { campo: 'quantos' })
    await tx`update foto.evento_fotos set rostos = ${corpo.quantos}, rostos_em = now() where id = ${f.id}`
    return { status: 200, corpo: { ok: true, gravados: 0 } }
  }
  if (!Array.isArray(corpo.rostos) || corpo.rostos.length > 200) return erro(400, 'campo', { campo: 'rostos' })
  const lista = []
  for (const r of corpo.rostos) {
    if (!r || typeof r !== 'object' || !vetorDeTexto(r.v) || !(r.largura >= 1 && r.largura <= 8192) || !(r.nota >= 0 && r.nota <= 1)) return erro(400, 'campo', { campo: 'rostos' })
    lista.push({ v: r.v, largura: Math.round(r.largura), nota: Math.round(r.nota * 100), colado: r.colado === true, perfil: r.perfil === true })
  }
  const [{ r }] = await tx`select foto.evento_rostos_gravar(${f.id}, ${JSON.stringify(lista)}::text::jsonb) as r`
  if (r.erro) return erro(r.erro === 'nao_existe' ? 404 : r.erro === 'formato' ? 400 : 409, r.erro)
  return { status: 200, corpo: { ok: true, gravados: r.gravados, barrados: r.barrados } }
}

const vetorParaTexto = (b) => (b ? paraBase64(new Uint8Array(b)) : null)

/** Com consentimento: quem pediu, com os vetores, para o computador comparar. `?desde=` só os novos ou mudados. */
async function pessoas(tx, req, id) {
  const e = await umEvento(tx, id)
  if (!e) return nao
  if (e.modo !== 'consentimento') return erro(409, 'modo')
  const linhas = await tx`select id, v1, v2, v3, criado_em, atualizado_em, processado_em from foto.evento_pessoas where evento = ${e.id} order by criado_em, id`
  return {
    status: 200,
    corpo: {
      ok: true,
      pessoas: linhas.map((p) => ({
        id: p.id,
        vetores: [p.v1, p.v2, p.v3].filter(Boolean).map(vetorParaTexto),
        atualizadoEm: p.atualizado_em,
        processadoEm: p.processado_em,
        pendente: !p.processado_em || p.processado_em < p.atualizado_em,
      })),
    },
  }
}

/** As ligações que o computador achou: troca as das pessoas listadas e marca as pessoas como processadas. */
async function ligacoes(tx, corpo, id) {
  const e = await umEvento(tx, id)
  if (!e) return nao
  if (e.modo !== 'consentimento') return erro(409, 'modo')
  if (e.estado !== 'publicado') return erro(409, 'estado', { estado: e.estado })
  const { pessoas: quem, ligacoes: lista } = corpo
  if (!Array.isArray(quem) || !quem.length || quem.length > 2000 || quem.some((p) => !UUID.test(String(p)))) return erro(400, 'campo', { campo: 'pessoas' })
  if (!Array.isArray(lista) || lista.length > 20000) return erro(400, 'campo', { campo: 'ligacoes' })
  const alvo = new Set(quem)
  const linhas = []
  for (const l of lista) {
    if (!l || !alvo.has(l.pessoa) || !UUID.test(String(l.foto)) || !['eu', 'talvez'].includes(l.faixa)) return erro(400, 'campo', { campo: 'ligacoes' })
    linhas.push({ pessoa: l.pessoa, foto: l.foto, evento: e.id, faixa: l.faixa })
  }
  const existem = await tx`select id from foto.evento_pessoas where evento = ${e.id} and id = any(${quem}::uuid[])`
  const vivas = new Set(existem.map((p) => p.id))
  await tx`delete from foto.evento_ligacoes where evento = ${e.id} and pessoa = any(${[...vivas]}::uuid[])`
  // quem desistiu no meio do caminho já não está: as ligações dela não entram
  const validas = linhas.filter((l) => vivas.has(l.pessoa))
  if (validas.length) await tx`insert into foto.evento_ligacoes ${tx(validas)} on conflict (pessoa, foto) do update set faixa = excluded.faixa`
  await tx`update foto.evento_pessoas set processado_em = now() where evento = ${e.id} and id = any(${[...vivas]}::uuid[])`
  return { status: 200, corpo: { ok: true, pessoas: vivas.size, ligacoes: validas.length } }
}

async function novoLink(tx, req, e, corpo) {
  if (corpo.pin != null && !PIN.test(String(corpo.pin))) return erro(400, 'campo', { campo: 'pin' })
  const token = novoToken()
  await tx`insert into foto.evento_links ${tx({ evento: e.id, token_hash: hashToken(token), pin_hash: corpo.pin != null ? hashPin(corpo.pin) : null })}`
  return { status: 201, corpo: { ok: true, endereco: `${origemPermitida(req)}/e/${token}`, evento: fichaDe(await umEvento(tx, e.id)) } }
}

async function publicar(tx, req, corpo, id) {
  const e = await umEvento(tx, id)
  if (!e) return nao
  if (e.estado !== 'rascunho') return erro(409, 'estado', { estado: e.estado })
  if (!e.n_fotos) return erro(409, 'sem_fotos')
  if (e.n_enviadas < e.n_fotos) return erro(409, 'faltam_arquivos', { faltam: e.n_fotos - e.n_enviadas })
  if (e.modo === 'aberta' && !e.aviso_versao) return erro(409, 'sem_aviso')
  if (corpo.pin != null && !PIN.test(String(corpo.pin))) return erro(400, 'campo', { campo: 'pin' })
  await tx`update foto.eventos set estado = 'publicado' where id = ${e.id}`
  return novoLink(tx, req, e, corpo)
}

async function trocarLink(tx, req, corpo, id) {
  const e = await umEvento(tx, id)
  if (!e) return nao
  if (e.estado !== 'publicado') return erro(409, 'estado', { estado: e.estado })
  if (corpo.pin != null && !PIN.test(String(corpo.pin))) return erro(400, 'campo', { campo: 'pin' })
  await tx`update foto.evento_links set revogado_em = now() where evento = ${e.id} and revogado_em is null`
  return novoLink(tx, req, e, corpo)
}

async function alterarLink(tx, corpo, id) {
  const e = await umEvento(tx, id)
  if (!e) return nao
  if (!e.link) return erro(409, 'sem_link')
  if (!Object.hasOwn(corpo, 'pin') || (corpo.pin != null && !PIN.test(String(corpo.pin)))) return erro(400, 'campo', { campo: 'pin' })
  await tx`update foto.evento_links set pin_hash = ${corpo.pin == null ? null : hashPin(corpo.pin)} where id = ${e.link.id}`
  return { status: 200, corpo: { ok: true, evento: fichaDe(await umEvento(tx, e.id)) } }
}

async function encerrar(tx, id) {
  const e = await umEvento(tx, id)
  if (!e) return nao
  if (e.estado !== 'publicado') return erro(409, 'estado', { estado: e.estado })
  await tx`update foto.eventos set estado = 'encerrado' where id = ${e.id}`
  return { status: 200, corpo: { ok: true, evento: fichaDe(await umEvento(tx, e.id)) } }
}

async function pedidos(tx, id) {
  const e = await umEvento(tx, id)
  if (!e) return nao
  const lista = await tx`
    select d.id, d.nome, d.contato, d.criado_em,
           coalesce((select jsonb_agg(jsonb_build_object('id', f.id, 'fotoId', f.foto_id, 'nome', f.nome) order by f.ordem, f.nome)
                       from foto.evento_fotos f where f.id = any(d.fotos)), '[]'::jsonb) as fotos
      from foto.evento_pedidos d where d.evento = ${e.id} order by d.criado_em desc, d.id`
  return { status: 200, corpo: { ok: true, pedidos: lista.map((d) => ({ id: d.id, nome: d.nome, contato: d.contato, em: d.criado_em, fotos: d.fotos })) } }
}

// ───────── despacho ─────────

const comArquivos = (fn) => async (tx, p, corpo, req) => {
  const arm = armazenamento()
  if (!arm) return erro(503, 'sem_armazenamento')
  const q = consulta(req)
  const id = q.get('id')
  const acao = q.get('acao')
  if (id != null && !UUID.test(id)) return nao
  return (await fn({ tx, p, corpo, req, id, acao, arm })) ?? nao
}

const rotas = rota({
  GET: comArquivos(({ tx, req, id, acao }) =>
    !id ? listar(tx) : !acao ? ler(tx, id) : acao === 'pessoas' ? pessoas(tx, req, id) : acao === 'pedidos' ? pedidos(tx, id) : null,
  ),
  POST: comArquivos(({ tx, corpo, req, id, acao, arm }) => {
    if (!id) return acao ? null : criar(tx, corpo)
    if (acao === 'fotos') return registrarFotos(tx, corpo, id, arm)
    if (acao === 'rostos') return gravarRostos(tx, corpo, id)
    if (acao === 'ligacoes') return ligacoes(tx, corpo, id)
    if (acao === 'publicar') return publicar(tx, req, corpo, id)
    if (acao === 'link') return trocarLink(tx, req, corpo, id)
    if (acao === 'encerrar') return encerrar(tx, id)
    return null
  }),
  PATCH: comArquivos(({ tx, corpo, id, acao }) => (!id ? null : !acao ? alterar(tx, corpo, id) : acao === 'link' ? alterarLink(tx, corpo, id) : null)),
  PUT: comArquivos(({ tx, req, id, acao, arm }) => (id && acao === 'arquivo' ? gravarArquivo(tx, req, id, arm) : null)),
  DELETE: comArquivos(({ tx, corpo, id, acao, arm }) => (!id ? null : !acao ? apagar(tx, id, arm) : acao === 'fotos' ? tirarFotos(tx, corpo, id, arm) : null)),
})


export default async function eventos(req, res) {
  try {
    if (['POST', 'PUT', 'PATCH', 'DELETE'].includes(req.method) && pessoaDe(req)) {
      const q = consulta(req)
      if (req.method === 'PUT' && q.get('acao') === 'arquivo') {
        req.bytes = await lerBytes(req, q.get('v') === 'mini' ? MAX_MINI : MAX_PREVIA)
        req.body = {}
      } else if (req.body === undefined) {
        const b = await lerBytes(req, 2 * 1024 * 1024)
        req.body = b.length ? JSON.parse(b.toString('utf8')) : {}
      }
    }
  } catch (e) {
    return e?.message === 'grande' ? json(res, 413, { ok: false, erro: 'grande' }) : json(res, 400, { ok: false, erro: 'corpo' })
  }
  try {
    return await rotas(req, res)
  } catch (e) {
    const regra = e?.code === 'P0001' && /^(evento|fotos|link|ligacao):([a-z_]+)$/.exec(String(e.message))
    if (regra) return json(res, 409, { ok: false, erro: regra[2] })
    if (e?.code === '23514' || e?.code === '22P02' || e?.code === '22001' || e?.code === '22007' || e?.code === '22008') return json(res, 400, { ok: false, erro: 'campo' })
    if (e?.code === '23503') return json(res, 400, { ok: false, erro: 'campo' })
    throw e
  }
}

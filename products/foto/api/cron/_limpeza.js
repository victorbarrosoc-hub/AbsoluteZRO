// A limpeza agendada (api/cron/limpar.js, uma vez por dia pelo vercel.json). Roda pela conexão do servidor (dono do
// schema), nunca como pessoa. Cada etapa é idempotente: o que já foi limpo não entra de novo, e rodar duas vezes seguidas
// não muda nada na segunda. Uma etapa que falha não segura as outras; o resumo diz qual falhou.
//
//   galerias   sem link vivo há 30 dias: as prévias saem e a galeria encerra (limparVencidas, api/_arquivos.js)
//   eventos    prazo vencido: vetores, pedidos de busca, ligações e remoções somem; as prévias dos encerrados saem
//              (limparEventos, api/_evento.js). Roda mesmo sem armazenamento: apagar biometria não depende dele
//   rascunhos  galeria em rascunho com prévias enviadas e parada há 14 dias: as prévias saem, a ficha e as fotos
//              registradas ficam (a tela oferece "Enviar as que faltam")
//   avisos     lidos há 30 dias, ou criados há 180, saem

import { apagarArquivos, armazenamento, chavesDe, limparVencidas } from '../_arquivos.js'
import { banco } from '../_banco.js'
import { limparEventos } from '../_evento.js'

export const DIAS = { galeria: 30, rascunho: 14, avisoLido: 30, aviso: 180 }

/** Rascunhos parados há `dias` com prévias no armazenamento: os arquivos saem. Devolve { rascunhos, arquivos }. */
export async function limparRascunhos({ dias = DIAS.rascunho, arm = armazenamento() } = {}) {
  if (!arm) return { rascunhos: 0, arquivos: 0 }
  if (!Number.isInteger(dias) || dias < 1 || dias > 3650) throw new Error('limparRascunhos: dias inválido')
  const sql = banco()
  const parados = await sql`
    select g.id
      from foto.galerias g
      join lateral (
        select max(greatest(f.criada_em, coalesce(f.enviada_em, f.criada_em), coalesce(f.mini_enviada_em, f.criada_em))) as fim,
               bool_or(f.enviada_em is not null or f.mini_enviada_em is not null) as com_arquivo
          from foto.galeria_fotos f where f.galeria = g.id) v on true
     where g.estado = 'rascunho' and v.com_arquivo and greatest(g.atualizada_em, v.fim) < now() - make_interval(days => ${dias})
     order by g.criada_em`
  let rascunhos = 0
  let arquivos = 0
  for (const { id } of parados) {
    // trava a galeria e confere de novo: quem publicou ou enviou no meio do caminho fica de fora
    const n = await sql.begin(async (tx) => {
      const [g] = await tx`select id from foto.galerias where id = ${id} and estado = 'rascunho' for update`
      if (!g) return null
      const fotos = await tx`
        select chave, enviada_em, mini_enviada_em
          from foto.galeria_fotos
         where galeria = ${id} and (enviada_em is not null or mini_enviada_em is not null)
           and greatest(criada_em, coalesce(enviada_em, criada_em), coalesce(mini_enviada_em, criada_em)) < now() - make_interval(days => ${dias})`
      if (!fotos.length) return null
      const apagados = await apagarArquivos(arm, chavesDe(fotos))
      await tx`update foto.galeria_fotos set enviada_em = null, mini_enviada_em = null where galeria = ${id} and chave = any(${fotos.map((f) => f.chave)})`
      return apagados
    })
    if (n === null) continue
    rascunhos += 1
    arquivos += n
  }
  return { rascunhos, arquivos }
}

/** Avisos velhos saem. Devolve quantos. */
export async function limparAvisos({ lidos = DIAS.avisoLido, todos = DIAS.aviso } = {}) {
  const r = await banco()`
    delete from foto.avisos
     where (lido_em is not null and lido_em < now() - make_interval(days => ${lidos})) or criado_em < now() - make_interval(days => ${todos})
    returning id`
  return r.length
}

/**
 * Todas as etapas. Devolve { ok, galerias, eventos, rascunhos, avisos, arquivos, semArmazenamento, falhas: [etapa] }:
 * só contagens, nada de quem nem de qual.
 */
export async function limpar({ arm = armazenamento(), log = console } = {}) {
  const r = { ok: true, galerias: 0, eventos: 0, rascunhos: 0, avisos: 0, arquivos: 0, semArmazenamento: !arm, falhas: [] }
  const etapa = async (nome, fn) => {
    try {
      await fn()
    } catch (e) {
      r.falhas.push(nome)
      log.error(`limpar: ${nome} falhou (${String(e?.code || e?.name || 'erro').slice(0, 40)})`)
    }
  }
  await etapa('galerias', async () => {
    if (!arm) return
    const g = await limparVencidas({ dias: DIAS.galeria, arm })
    r.galerias = g.galerias
    r.arquivos += g.arquivos
  })
  await etapa('eventos', async () => {
    const e = await limparEventos({ arm })
    r.eventos = e.eventos
    r.arquivos += e.arquivos
  })
  await etapa('rascunhos', async () => {
    const x = await limparRascunhos({ arm })
    r.rascunhos = x.rascunhos
    r.arquivos += x.arquivos
  })
  await etapa('avisos', async () => {
    r.avisos = await limparAvisos()
  })
  r.ok = !r.falhas.length
  return r
}

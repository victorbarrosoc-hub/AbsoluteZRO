// Limite de tentativas (tabela foto.limites, db/migrations/0001): conta as linhas de uma chave numa janela de tempo.
// Só o dono do schema lê e escreve (o papel foto_app não tem permissão nenhuma na tabela): estas funções rodam pela
// conexão do servidor, fora de `comoPessoa`. Mesmo desenho do Maestro (products/maestro/src/lib/auth/limite.ts).
//
// Chaves do link do cliente (api/_link.js): `link-ip:<hmac do ip no dia>`, `link-morto:<hmac>`, `link-abrir:<hash do
// token>`, `link-pin:<hash>` e `link-pin:<hash>:<hmac>`, `link-escolher:<hash>`, `link-comentar:<hash>`,
// `link-enviar:<hash>`, `link-imagem:<hash>` e `link-imagem-ip:<hmac>`. O IP nunca é guardado.
// Limpeza preguiçosa do que tem mais de um dia. (Os JSON vão como texto e viram jsonb no banco: o postgres.js
// codificaria de novo um parâmetro que já é jsonb.)

import { banco } from './_banco.js'

/** { max, janelaS }: no máximo `max` registros da chave em `janelaS` segundos. Os testes baixam `max` para conferir. */
export const REGRAS = {
  /** Qualquer pedido de link (menos imagem) por IP: tentar tokens não compensa. */
  linkIp: { max: 1200, janelaS: 3600 },
  /** Link que não existe: 30 por hora por IP; depois nem link bom abre por um tempo. */
  linkMortoIp: { max: 30, janelaS: 3600 },
  /** Abrir a galeria: 240 por hora por link. */
  linkAbrir: { max: 240, janelaS: 3600 },
  /** PIN errado: 5 a cada 15 minutos por link e IP; 20 por link no total. */
  linkPinIp: { max: 5, janelaS: 900 },
  linkPin: { max: 20, janelaS: 900 },
  /** Escolher ou desfazer: 3.000 por hora por link. Comentar: 600. Enviar: 20. */
  linkEscolher: { max: 3000, janelaS: 3600 },
  linkComentar: { max: 600, janelaS: 3600 },
  linkEnviar: { max: 20, janelaS: 3600 },
  /** Imagens: 20.000 por hora por link e 6.000 por IP (uma galeria tem até 1.500 fotos, em duas medidas). */
  linkImagem: { max: 20000, janelaS: 3600 },
  linkImagemIp: { max: 6000, janelaS: 3600 },
}

const pares = (lista) => JSON.stringify(lista.map(([chave, regra]) => ({ chave: String(chave).slice(0, 200), max: regra.max, janela: regra.janelaS })))

/** true = todas as chaves ainda cabem. `lista`: [[chave, regra], ...]. Não registra nada. */
export async function dentroDoLimite(lista) {
  if (!lista.length) return true
  const [r] = await banco()`
    select coalesce(bool_and((select count(*) from foto.limites l where l.chave = p.chave and l.em > now() - make_interval(secs => p.janela)) < p.max), true) as ok
      from jsonb_to_recordset(${pares(lista)}::text::jsonb) as p(chave text, max integer, janela integer)`
  return r.ok === true
}

/** Registra uma tentativa em cada chave. */
export async function registrarTentativa(...chaves) {
  const lista = chaves.filter(Boolean).map((c) => String(c).slice(0, 200))
  if (!lista.length) return
  const sql = banco()
  await sql`insert into foto.limites (chave) select jsonb_array_elements_text(${JSON.stringify(lista)}::text::jsonb)`
  if (Math.random() < 0.02) await sql`delete from foto.limites where em < now() - interval '1 day'`
}

/** Confere e registra de uma vez (um pedido só ao banco): true = coube e ficou registrado; false = nada foi registrado. */
export async function consumir(lista) {
  if (!lista.length) return true
  const [r] = await banco()`
    with p as (select * from jsonb_to_recordset(${pares(lista)}::text::jsonb) as p(chave text, max integer, janela integer)),
         cabe as (select coalesce(bool_and((select count(*) from foto.limites l where l.chave = p.chave and l.em > now() - make_interval(secs => p.janela)) < p.max), true) as ok from p),
         novo as (insert into foto.limites (chave) select p.chave from p, cabe where cabe.ok returning 1)
    select cabe.ok from cabe`
  return r.ok === true
}

/**
 * Central única de instalação (ADR 0049, titular, 01/11/2026): todo app de computador da Absolute ZRO se instala e se
 * atualiza só pela central "Absolute ZRO" (apps/hub-desktop), como no Creative Cloud. Este módulo decide, no servidor,
 * o que cada conta pode instalar e baixar. A tela só mostra o que daqui sai.
 *
 * - Gate de lançamento (ADR 0023) primeiro: produto fechado para a pessoa no canal (`desktop` para listar, `download`
 *   para baixar) não aparece nem baixa (404), com qualquer plano.
 * - Depois o direito (PRD §5.2, `authorize`): identidade → organização ativa → vínculo → entitlement vigente do produto.
 *   Produto de **uso livre** (está no plano grátis vigente, "Conta Absolute ZRO") vale para toda conta e baixa sem
 *   sessão, como antes (os apps já instalados se atualizam por essas rotas). Os outros pedem a sessão da central e o
 *   produto no plano da organização; sem ele, o app aparece bloqueado com o plano que o inclui.
 * - Plano cancelado: o entitlement acaba, o app vira bloqueado (a central não atualiza) e nada é apagado do computador.
 * - Lançado OU admin (titular, 01/11/2026): AEON, Revela, NOSSOM e Rift Motion só aparecem e baixam para admin de
 *   plataforma, que instala tudo. Cartão bloqueado por plano só existe para app lançado.
 *
 * Sem `server-only`: os testes de integração chamam direto (tests/integration/meus-apps.test.ts), com `usoLivre`
 * injetável para simular produto pago (hoje todo app de computador está no plano grátis).
 */
import { productAccessFor } from '@zro/billing'
import { authorize } from '@zro/core'
import type { Authenticated } from '@zro/auth'
import type { Database, Queryable } from '@zro/db'
import { isDomainError } from '@zro/observability'
import { appDesktop, appNoCatalogo, APPS_DESKTOP, type AppNoCatalogo, type Deps } from './desktop-apps'
import { ehAdmin, SO_PARA_ADMIN } from './downloads'

/** Os ids que o download confere para esta pessoa: todos para admin; senão, os liberados pelo gate. */
export const liberadosParaBaixar = (auth: Authenticated | null, liberados: ReadonlySet<string>): ReadonlySet<string> =>
  ehAdmin(auth) ? new Set(APPS_DESKTOP.map((a) => a.id)) : liberados

export const PLANOS_URL = 'https://absolutezro.com/planos'

/** Produtos que toda conta usa (plano grátis vigente). Só os que dão a ferramenta (features vazias = adicional). */
export async function produtosDeUsoLivre(tx: Queryable): Promise<Set<string>> {
  const rows = await tx`
    select distinct pp.product_id from zro.plan_products pp join zro.plans p on p.id = pp.plan_id
    where p.kind = 'free' and p.status = 'active' and p.code = 'conta-absolute-zro'
      and (pp.features is null or cardinality(pp.features) > 0)`
  return new Set(rows.map((r) => r.product_id as string))
}

/** O plano à venda que inclui cada produto: o pacote mais em conta primeiro ("Absolute ZRO Completo"), depois o avulso. */
export async function planosQueIncluem(tx: Queryable, ids: string[]): Promise<Map<string, string>> {
  if (!ids.length) return new Map()
  const rows = await tx`
    select pp.product_id, p.name from zro.plan_products pp join zro.plans p on p.id = pp.plan_id
    where p.status = 'active' and p.kind <> 'free' and pp.product_id = any(${ids}::text[])
      and (pp.features is null or cardinality(pp.features) > 0)
    order by pp.product_id, (p.kind = 'bundle') desc, p.price_cents asc nulls last, p.name`
  const out = new Map<string, string>()
  for (const r of rows) if (!out.has(r.product_id as string)) out.set(r.product_id as string, r.name as string)
  return out
}

export type DireitoDesktop = { id: string; nome: string; direito: 'liberado' | 'bloqueado'; plano: string | null }

export type Opcoes = Deps & { usoLivre?: ReadonlySet<string> }

/**
 * Os apps de computador como esta conta vê (painel do app e /api/v1/desktop/meus-apps): lançado OU admin.
 * - Admin de plataforma: todos os apps de computador do catálogo, liberados (instala tudo, inclusive os não lançados).
 * - Os outros: só os lançados (gate aberto ao público e no canal desktop), fora AEON, Revela, NOSSOM e Rift Motion
 *   (SO_PARA_ADMIN, nem bloqueados). Liberado = no plano da organização ou de uso livre; senão, bloqueado com o plano.
 */
export async function direitosDesktop(
  db: Database,
  actor: { userId: string; orgId: string },
  opts: Opcoes & { admin?: boolean } = {},
): Promise<DireitoDesktop[]> {
  if (opts.admin) return APPS_DESKTOP.map((a) => ({ id: a.id, nome: a.nome, direito: 'liberado' as const, plano: null }))
  const access = await db.asUser(actor, (tx) => productAccessFor(tx, actor.orgId, { channel: 'desktop' }))
  const livres = opts.usoLivre ?? (await db.asSystem('central: uso livre', (tx) => produtosDeUsoLivre(tx)))
  const visiveis = access.filter(
    (a) =>
      appDesktop(a.productId) &&
      !SO_PARA_ADMIN.has(a.productId) &&
      a.release.open &&
      a.release.allowed &&
      (a.access === 'contracted' || a.access === 'available'),
  )
  const bloqueados = visiveis.filter((a) => a.access !== 'contracted' && !livres.has(a.productId)).map((a) => a.productId)
  const planos = await db.asSystem('central: plano que inclui', (tx) => planosQueIncluem(tx, bloqueados))
  return visiveis.map((a) => {
    const bloqueado = bloqueados.includes(a.productId)
    return {
      id: a.productId,
      nome: appDesktop(a.productId)!.nome,
      direito: bloqueado ? 'bloqueado' : 'liberado',
      plano: bloqueado ? (planos.get(a.productId) ?? null) : null,
    }
  })
}

export type AppBloqueado = {
  id: string
  nome: string
  /** Nome do plano que inclui o app ("Absolute ZRO Completo"); null = nenhum à venda agora. */
  plano: string | null
  planos: string
  /** Só para a central saber se o app está neste computador (mostra bloqueado, não apaga). Sem arquivos. */
  mac: { bundle: string }
  windows: { exe: string; nomeNoSistema: string }
}

export type MeusApps = { versao: 2; apps: AppNoCatalogo[]; bloqueados: AppBloqueado[] }

/** GET /api/v1/desktop/meus-apps: só o que a conta pode instalar (versão mais nova e arquivos) e o que está bloqueado. */
export async function meusApps(db: Database, auth: Authenticated | null, opts: Opcoes = {}): Promise<MeusApps> {
  const actor = await authorize(db, auth)
  const direitos = await direitosDesktop(db, actor, { ...opts, admin: ehAdmin(auth) })
  const liberados = direitos.filter((d) => d.direito === 'liberado')
  const apps = await Promise.all(liberados.map((d) => appNoCatalogo(appDesktop(d.id)!, opts)))
  const bloqueados = direitos
    .filter((d) => d.direito === 'bloqueado')
    .map((d) => {
      const a = appDesktop(d.id)!
      return {
        id: a.id,
        nome: a.nome,
        plano: d.plano,
        planos: PLANOS_URL,
        mac: { bundle: a.mac.bundle },
        windows: { exe: a.windows.exe, nomeNoSistema: a.windows.nomeNoSistema },
      }
    })
  return { versao: 2, apps, bloqueados }
}

export type AcessoAoDownload = 'ok' | 'fechado' | 'entrar' | 'sem-direito'

/**
 * Pode baixar este arquivo de /baixar/app/<id>/<arquivo>? `versao.json` (só o aviso de versão nova dos apps já
 * instalados) e instaladores de uso livre: só o gate do canal download, como antes. Instalador de app pago: sessão
 * (a da central) e `authorize` com o produto no canal download, conferido aqui, nunca só na tela.
 */
export async function acessoAoDownload(
  db: Database,
  auth: Authenticated | null,
  id: string,
  arquivo: string,
  liberados: ReadonlySet<string>,
  opts: { usoLivre?: ReadonlySet<string> } = {},
): Promise<AcessoAoDownload> {
  if (!APPS_DESKTOP.some((a) => a.id === id)) return 'fechado'
  // admin de plataforma instala tudo (lançado OU admin)
  if (ehAdmin(auth)) return 'ok'
  if (!liberados.has(id)) return 'fechado'
  if (arquivo === 'versao.json') return 'ok'
  // não lançado: só admin, nem com a lista de acesso do gate
  if (SO_PARA_ADMIN.has(id)) return 'fechado'
  const livres = opts.usoLivre ?? (await db.asSystem('central: uso livre', (tx) => produtosDeUsoLivre(tx)))
  if (livres.has(id)) return 'ok'
  if (!auth) return 'entrar'
  try {
    await authorize(db, auth, { product: { id, channel: 'download' } })
    return 'ok'
  } catch (e) {
    if (isDomainError(e) && e.code === 'product_closed') return 'fechado'
    if (isDomainError(e)) return 'sem-direito'
    throw e
  }
}

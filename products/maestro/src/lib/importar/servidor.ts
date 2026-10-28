/**
 * Importar planilha no banco (drizzle/0016). Dois passos, sempre como a pessoa (`asUser`, RLS):
 *   1. `previaNoBanco`: lê o que já existe (só leitura) e diz o que cada linha faria: criar, atualizar ou nada (igual).
 *   2. `confirmarImportacao`: refaz tudo a partir do mesmo arquivo (o sha256 precisa ser o da prévia), grava numa
 *      transação e deixa o relatório em `maestro.importacoes`. Linha com erro é pulada (e vai para o relatório).
 * Idempotente: casa por e-mail, código, patrimônio, série ou nome; reimportar o mesmo arquivo não cria nada de novo.
 * Atualizar só preenche o que a planilha traz (célula vazia não apaga nada). Só administração e gestão (o banco confere
 * no relatório; a tela nem oferece). Sem "server-only": os testes chamam direto.
 */
import { createHash } from "node:crypto";
import { sql, type SQL } from "drizzle-orm";
import { getBanco, type Contexto, type Tx } from "@/lib/db/client";
import { falha, traduzirPg, type Res } from "@/lib/crm/comum";
import { proximoCodigo } from "@/lib/crm/projetos";
import { normalizar, previa as previaPura, type LinhaLida, type Mapa, type Previa, type TipoImport } from "./csv";

export type Acao = "criar" | "atualizar" | "igual" | "erro";
export type LinhaDaPrevia = LinhaLida & { acao: Acao; id?: string; mudam?: string[] };
export type PreviaNoBanco = Omit<Previa, "linhas"> & { linhas: LinhaDaPrevia[]; sha256: string; contagem: Record<Acao, number> };
export type Relatorio = { id: string; criados: number; atualizados: number; iguais: number; ignorados: number; erros: { linha: number; erro: string }[] };

export const sha256 = (t: string) => createHash("sha256").update(t, "utf8").digest("hex");

/** Coluna do banco de cada campo da planilha (nomes fixos: entram no SQL como identificadores). */
const COLUNAS: Record<TipoImport, Record<string, string>> = {
  clientes: { nome: "name", empresa: "company", contato: "contact_name", email: "email", whatsapp: "whatsapp", status: "status", observacoes: "notes" },
  projetos: { titulo: "title", cliente_id: "client_id", status: "status", inicio: "start_date", prazo: "due_date", briefing: "briefing" },
  freelas: {
    nome: "nome",
    email: "email",
    whatsapp: "whatsapp",
    cidade: "cidade",
    instagram: "instagram",
    funcoes: "funcoes",
    nichos: "nichos",
    notas: "notas",
    zro_sub: "zro_sub",
  },
  equipamentos: {
    nome: "nome",
    chave: "chave",
    categoria: "categoria",
    marca: "marca",
    modelo: "modelo",
    serie: "serie",
    patrimonio: "patrimonio",
    valor: "valor_cents",
    compra: "compra_em",
    local: "local",
    notas: "notas",
  },
};
const TABELA: Record<TipoImport, string> = { clientes: "clients", projetos: "projects", freelas: "freelas", equipamentos: "equipamentos" };

type Existente = { id: string } & Record<string, unknown>;

/** O que já existe, indexado pelas chaves de casamento. */
async function carregar(tx: Tx, tipo: TipoImport): Promise<{ porChave: Map<string, Existente>; clientes: Map<string, string> }> {
  const porChave = new Map<string, Existente>();
  const clientes = new Map<string, string>();
  const pos = (k: string, e: Existente) => {
    if (!porChave.has(k)) porChave.set(k, e);
  };
  if (tipo === "clientes" || tipo === "projetos") {
    const r = (await tx.execute(sql`
      select id, name as nome, company as empresa, contact_name as contato, email, whatsapp, status, notes as observacoes
        from maestro.clients where deleted_at is null order by created_at`)) as unknown as Existente[];
    for (const c of r) {
      clientes.set(normalizar(String(c.nome)), c.id);
      if (tipo === "clientes") {
        if (c.email) pos(`email:${String(c.email).toLowerCase()}`, c);
        pos(`nome:${normalizar(String(c.nome))}`, c);
      }
    }
  }
  if (tipo === "projetos") {
    const r = (await tx.execute(sql`
      select id, code as codigo, title as titulo, client_id::text as cliente_id, status, start_date::text as inicio, due_date::text as prazo, briefing
        from maestro.projects where deleted_at is null order by created_at`)) as unknown as Existente[];
    for (const p of r) {
      pos(`codigo:${p.codigo}`, p);
      pos(`titulo:${normalizar(String(p.titulo))}`, p);
    }
  }
  if (tipo === "freelas") {
    const r = (await tx.execute(sql`
      select id, nome, email, whatsapp, cidade, instagram, funcoes, nichos, notas, zro_sub::text as zro_sub from maestro.freelas order by created_at`)) as unknown as Existente[];
    for (const f of r) {
      if (f.email) pos(`email:${String(f.email).toLowerCase()}`, f);
      pos(`nome:${normalizar(String(f.nome))}`, f);
    }
  }
  if (tipo === "equipamentos") {
    const r = (await tx.execute(sql`
      select id, nome, chave, categoria, marca, modelo, serie, patrimonio, valor_cents::float8 as valor, compra_em::text as compra, local, notas
        from maestro.equipamentos where dono = 'produtora' order by created_at`)) as unknown as Existente[];
    for (const e of r) {
      if (e.patrimonio) pos(`patrimonio:${normalizar(String(e.patrimonio))}`, e);
      if (e.serie) pos(`serie:${normalizar(String(e.serie))}`, e);
      // pelo nome só o que não tem patrimônio nem série (duas câmeras iguais com etiqueta são duas)
      if (!e.patrimonio && !e.serie) pos(`nome:${e.chave}`, e);
    }
  }
  return { porChave, clientes };
}

const igual = (a: unknown, b: unknown) => {
  if (Array.isArray(a) || Array.isArray(b)) return JSON.stringify(a ?? []) === JSON.stringify(b ?? []);
  if (typeof a === "number" || typeof b === "number") return Number(a) === Number(b);
  return String(a ?? "") === String(b ?? "");
};

/** Quem casa com a linha: a chave dela; se for e-mail/código/patrimônio sem par, tenta pelo nome (ou título). */
function casar(tipo: TipoImport, l: LinhaLida, porChave: Map<string, Existente>): Existente | undefined {
  if (!l.chave) return undefined;
  const direto = porChave.get(l.chave);
  if (direto) return direto;
  const d = l.dados;
  if (tipo === "projetos" && d.titulo) return porChave.get(`titulo:${normalizar(String(d.titulo))}`);
  if (tipo === "equipamentos" && d.chave) {
    const s = d.serie ? porChave.get(`serie:${normalizar(String(d.serie))}`) : undefined;
    return s ?? porChave.get(`nome:${d.chave}`);
  }
  if ((tipo === "clientes" || tipo === "freelas") && d.nome) {
    const e = porChave.get(`nome:${normalizar(String(d.nome))}`);
    // pelo nome só se o que existe não tem outro e-mail (dois "João" diferentes não viram um)
    return e && (!e.email || !d.email || String(e.email).toLowerCase() === d.email) ? e : undefined;
  }
  return undefined;
}

function decidir(tipo: TipoImport, l: LinhaLida, existentes: Awaited<ReturnType<typeof carregar>>): LinhaDaPrevia {
  if (l.erros.length) return { ...l, acao: "erro" };
  const dados = { ...l.dados };
  if (tipo === "projetos") {
    const nomeCliente = dados.cliente ? normalizar(String(dados.cliente)) : null;
    const cid = nomeCliente ? existentes.clientes.get(nomeCliente) : null;
    if (nomeCliente && !cid) return { ...l, erros: [`Cliente "${dados.cliente}" não existe: importe os clientes antes`], acao: "erro" };
    dados.cliente_id = cid ?? null;
  }
  const e = casar(tipo, l, existentes.porChave);
  if (!e) return { ...l, dados, acao: "criar" };
  const mudam = Object.keys(COLUNAS[tipo]).filter((k) => {
    const v = dados[k];
    if (v == null || (Array.isArray(v) && !v.length)) return false;
    return !igual(v, e[k]);
  });
  return { ...l, dados, acao: mudam.length ? "atualizar" : "igual", id: e.id, mudam };
}

function contar(linhas: LinhaDaPrevia[]): Record<Acao, number> {
  const c: Record<Acao, number> = { criar: 0, atualizar: 0, igual: 0, erro: 0 };
  for (const l of linhas) c[l.acao]++;
  return c;
}

async function previaNaTx(tx: Tx, tipo: TipoImport, texto: string, mapa?: unknown): Promise<Res<{ previa: PreviaNoBanco }>> {
  const p = previaPura(tipo, texto, mapa);
  if (!p.ok) return falha("arquivo", p.mensagem);
  const existentes = await carregar(tx, tipo);
  // Duas linhas do arquivo que casam com o mesmo cadastro: vale a primeira.
  const usados = new Set<string>();
  const linhas = p.previa.linhas.map((l) => {
    const d = decidir(tipo, l, existentes);
    if (d.id) {
      if (usados.has(d.id)) return { ...d, acao: "erro" as const, erros: ["Casa com o mesmo cadastro de outra linha"] };
      usados.add(d.id);
    }
    return d;
  });
  return { ok: true as const, previa: { ...p.previa, linhas, sha256: sha256(texto), contagem: contar(linhas) } };
}

/** Passo 1: a prévia (nada é gravado). */
export async function previaNoBanco(ctx: Contexto, tipo: TipoImport, texto: string, mapa?: unknown): Promise<Res<{ previa: PreviaNoBanco }>> {
  return getBanco().asUser(ctx, (tx) => previaNaTx(tx, tipo, texto, mapa));
}

const valorSql = (tipo: TipoImport, k: string, v: unknown): SQL => {
  if (Array.isArray(v)) return sql`${`{${v.map((x) => `"${String(x).replace(/["\\]/g, "")}"`).join(",")}}`}::text[]`;
  if (k === "inicio" || k === "prazo" || k === "compra") return sql`${v}::date`;
  if (k === "zro_sub" || k === "cliente_id") return sql`${v}::uuid`;
  return sql`${v}`;
};

/** Passo 2: grava o que a prévia mostrou e deixa o relatório. `sha` precisa ser o da prévia (o mesmo arquivo). */
export async function confirmarImportacao(
  ctx: Contexto,
  o: { tipo: TipoImport; texto: string; mapa: Mapa; sha: string; arquivo: string },
): Promise<Res<{ relatorio: Relatorio }>> {
  if (sha256(o.texto) !== o.sha) return falha("mudou", "O arquivo mudou desde a prévia. Confira de novo.");
  try {
    return await getBanco().asUser(ctx, async (tx) => {
      const [eu] = (await tx.execute(sql`select maestro.has_role(${ctx.orgId}::uuid, array['admin', 'gestor']) as pode`)) as unknown as { pode: boolean }[];
      if (!eu?.pode) return falha("sem_permissao", "Só administração e gestão importam planilhas.");
      const p = await previaNaTx(tx, o.tipo, o.texto, o.mapa);
      if (!p.ok) return p;
      const pv = p.previa;
      if (pv.faltando.length) return falha("mapa", `Escolha a coluna de: ${pv.faltando.join(", ")}.`);
      const cols = COLUNAS[o.tipo];
      const tabela = sql.raw(`maestro.${TABELA[o.tipo]}`);
      for (const l of pv.linhas) {
        if (l.acao === "criar") {
          const d = { ...l.dados };
          if (o.tipo === "clientes") d.status = d.status ?? "ativo";
          if (o.tipo === "projetos") d.status = d.status ?? "active";
          const ks = Object.keys(cols).filter((k) => d[k] != null && !(Array.isArray(d[k]) && !(d[k] as unknown[]).length));
          const extra: [string, SQL][] = [["org_id", sql`${ctx.orgId}::uuid`]];
          if (o.tipo === "clientes" || o.tipo === "projetos") extra.push(["created_by", sql`${ctx.sub}::uuid`]);
          if (o.tipo === "projetos") {
            extra.push(["code", sql`${(d.codigo as string | null) ?? (await proximoCodigo(tx, ctx.orgId))}`], ["link_status", sql`'pending'`]);
          }
          if (o.tipo === "equipamentos") extra.push(["dono", sql`'produtora'`]);
          const nomes = [...extra.map(([c]) => c), ...ks.map((k) => cols[k])];
          const valores = [...extra.map(([, v]) => v), ...ks.map((k) => valorSql(o.tipo, k, d[k]))];
          await tx.execute(sql`insert into ${tabela} (${sql.raw(nomes.join(", "))}) values (${sql.join(valores, sql`, `)})`);
        } else if (l.acao === "atualizar" && l.id && l.mudam?.length) {
          const sets = l.mudam.map((k) => sql`${sql.raw(cols[k])} = ${valorSql(o.tipo, k, l.dados[k])}`);
          await tx.execute(sql`update ${tabela} set ${sql.join(sets, sql`, `)} where id = ${l.id}`);
        }
      }
      const c = pv.contagem;
      const erros = pv.linhas
        .filter((l) => l.acao === "erro")
        .slice(0, 200)
        .map((l) => ({ linha: l.n, erro: l.erros.join("; ").slice(0, 300) }));
      const [r] = (await tx.execute(sql`
        insert into maestro.importacoes (org_id, tipo, arquivo, sha256, linhas, criados, atualizados, iguais, ignorados, erros, mapa, feita_por)
        values (${ctx.orgId}, ${o.tipo}, ${o.arquivo.slice(0, 200) || "planilha.csv"}, ${o.sha}, ${pv.linhas.length}, ${c.criar}, ${c.atualizar}, ${c.igual},
                ${c.erro}, ${JSON.stringify(erros)}::jsonb, ${JSON.stringify(pv.mapa)}::jsonb, ${ctx.sub})
        returning id`)) as unknown as { id: string }[];
      await tx.execute(sql`
        insert into maestro.audit_log (org_id, actor_sub, action, target_type, target_id, metadata)
        values (${ctx.orgId}, ${ctx.sub}, 'importar.confirmar', 'importacao', ${r.id}, ${JSON.stringify({ tipo: o.tipo, ...c })}::jsonb)`);
      return {
        ok: true as const,
        relatorio: { id: r.id, criados: c.criar, atualizados: c.atualizar, iguais: c.igual, ignorados: c.erro, erros },
      };
    });
  } catch (e) {
    return traduzirPg(e);
  }
}

export type ImportacaoFeita = {
  id: string;
  tipo: TipoImport;
  arquivo: string;
  em: string;
  criados: number;
  atualizados: number;
  iguais: number;
  ignorados: number;
};

export async function historicoDeImportacoes(ctx: Contexto): Promise<ImportacaoFeita[]> {
  return getBanco().asUser(ctx, async (tx) => {
    const r = (await tx.execute(sql`
      select id, tipo, arquivo, feita_em, criados, atualizados, iguais, ignorados from maestro.importacoes order by feita_em desc limit 10`)) as unknown as Record<
      string,
      unknown
    >[];
    return r.map((x) => ({
      id: x.id as string,
      tipo: x.tipo as TipoImport,
      arquivo: x.arquivo as string,
      em: new Date(x.feita_em as string).toISOString(),
      criados: Number(x.criados),
      atualizados: Number(x.atualizados),
      iguais: Number(x.iguais),
      ignorados: Number(x.ignorados),
    }));
  });
}

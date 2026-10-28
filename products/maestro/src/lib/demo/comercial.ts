/**
 * Demonstração da marca, dos pedidos, do aceite e do kit dos freelas (fases 11, 14 e o pedido do titular de 28/10/2026).
 * Tudo inventado: pessoas fictícias, e-mails @exemplo.com, nenhum telefone, o logo é um monograma desenhado aqui (só
 * formas, sem texto nem arte de terceiros). Pelos mesmos caminhos de verdade: o logo passa por `prepararLogo`, o pedido
 * vira orçamento por `gerarOrcamentoDoPedidoNaTx`, o link por `gerarLinkDoOrcamentoNaTx` e o aceite pela porta
 * estreita (`maestro.orcamento_link_aceitar`), como se o cliente tivesse aberto o link. Completa, nunca duplica.
 */
import { sql } from "drizzle-orm";
import sharp from "sharp";
import type { Contexto, Tx } from "@/lib/db/client";
import { hashToken } from "@/lib/auth/cripto";
import { somarDias } from "@/lib/dinheiro";
import { gravarEquipFreela, marcarEquipNaEscalaNaTx, type CategoriaEquipFreela } from "@/lib/freelas/equipamentos";
import { prepararLogo } from "@/lib/marca/logo";
import { gerarLinkDoOrcamentoNaTx } from "@/lib/orcamento/link";
import { criarLinkDePedidoNaTx, gerarOrcamentoDoPedidoNaTx } from "@/lib/pedidos/equipe";
import { lerConfig, type RespostasPedido } from "@/lib/pedidos/formulario";

/* ───────────── marca ───────────── */

export const MARCA_DEMO = {
  nome: "Produtora Exemplo",
  cnpj: "00.000.000/0001-00",
  email: "contato@exemplo.com",
  endereco: "Rua dos Exemplos, 100 · São Paulo, SP",
  assinatura: "Equipe Produtora Exemplo · Direção de produção",
  cor: "#0f7b5f",
};

/** O monograma fictício: um "P" em traço sobre um quadrado arredondado, e a centelha de um quadro. Só formas. */
export function svgDoLogoDemo(cor = MARCA_DEMO.cor): string {
  return `<svg xmlns="http://www.w3.org/2000/svg" width="480" height="480" viewBox="0 0 120 120">
  <rect x="4" y="4" width="112" height="112" rx="30" fill="#1d1d1f"/>
  <path d="M42 92V30h22a17 17 0 0 1 0 34H42" fill="none" stroke="#ffffff" stroke-width="11" stroke-linecap="round" stroke-linejoin="round"/>
  <circle cx="86" cy="86" r="9" fill="${cor}"/>
</svg>`;
}

export async function logoDemo(): Promise<Buffer> {
  return sharp(Buffer.from(svgDoLogoDemo())).png().toBuffer();
}

/** A marca de exemplo: só para a administração (o banco confere) e só se a organização não tem marca própria. */
export async function montarMarca(tx: Tx, ctx: Contexto): Promise<boolean> {
  const [adm] = (await tx.execute(sql`select maestro.has_role(${ctx.orgId}::uuid, array['admin']) as ok`)) as unknown as { ok: boolean }[];
  if (!adm?.ok) return false;
  const [m] = (await tx.execute(sql`select demo, logo_sha256 from maestro.org_marca where org_id = ${ctx.orgId}`)) as unknown as {
    demo: boolean;
    logo_sha256: string | null;
  }[];
  if (m && (!m.demo || m.logo_sha256)) return false;
  const logo = await prepararLogo(await logoDemo());
  if (!logo.ok) return false;
  const d = MARCA_DEMO;
  await tx.execute(sql`
    insert into maestro.org_marca (org_id, logo, logo_mime, logo_sha256, logo_largura, logo_altura, cor, nome, cnpj, email, endereco, assinatura, demo, updated_by)
    values (${ctx.orgId}, ${logo.bytes}, ${logo.mime}, ${logo.sha256}, ${logo.largura}, ${logo.altura}, ${d.cor}, ${d.nome}, ${d.cnpj}, ${d.email},
            ${d.endereco}, ${d.assinatura}, true, ${ctx.sub})
    on conflict (org_id) do update set logo = excluded.logo, logo_mime = excluded.logo_mime, logo_sha256 = excluded.logo_sha256,
           logo_largura = excluded.logo_largura, logo_altura = excluded.logo_altura, cor = excluded.cor, nome = excluded.nome, cnpj = excluded.cnpj,
           email = excluded.email, endereco = excluded.endereco, assinatura = excluded.assinatura, demo = true`);
  return true;
}

/* ───────────── pedidos ───────────── */

export type PedidoDemo = {
  nome: string;
  empresa: string | null;
  email: string;
  modelo: string;
  nicho: string;
  vars: Record<string, number>;
  inicio?: number;
  fim?: number;
  local: string;
  investimento: string;
  ideia: string;
  dia: number;
  fim_: "novo" | "orcado" | "aceito" | "recusado";
};

export const PEDIDOS_DEMO: PedidoDemo[] = [
  {
    nome: "Marina Campos",
    empresa: "Doceria Flor de Sal",
    email: "marina@exemplo.com",
    modelo: "Pacote de reels",
    nicho: "corporativo",
    vars: { videos: 8, diarias: 1 },
    local: "São Paulo, SP",
    investimento: "5-15k",
    ideia: "Reels mensais com a produção dos doces e os bastidores da loja.",
    dia: 0,
    fim_: "novo",
  },
  {
    nome: "Tiago Ramos",
    empresa: null,
    email: "tiago.lara@exemplo.com",
    modelo: "Casamento",
    nicho: "casamento",
    vars: { diarias: 1, videos: 2 },
    inicio: 62,
    fim: 62,
    local: "Campos do Jordão, SP",
    investimento: "15-40k",
    ideia: "Casamento ao ar livre para 120 convidados. Queremos o filme e um teaser para o Instagram.",
    dia: -1,
    fim_: "novo",
  },
  {
    nome: "Renato Alves",
    empresa: "Clínica Ortovida",
    email: "renato@exemplo.com",
    modelo: "Filme institucional",
    nicho: "corporativo",
    vars: { diarias: 2, videos: 3 },
    inicio: 25,
    fim: 26,
    local: "Campinas, SP",
    investimento: "15-40k",
    ideia: "Institucional da unidade nova, com depoimentos de pacientes e da equipe.",
    dia: -2,
    fim_: "novo",
  },
  {
    nome: "Beatriz Nogueira",
    empresa: "Studio Equilíbrio Pilates",
    email: "beatriz@exemplo.com",
    modelo: "Pacote de reels",
    nicho: "corporativo",
    vars: { videos: 6, diarias: 1 },
    local: "São Paulo, SP",
    investimento: "5-15k",
    ideia: "Seis reels por mês: aulas, alunos e dicas rápidas.",
    dia: -5,
    fim_: "orcado",
  },
  {
    nome: "Fernando Lima",
    empresa: "Vinícola Altos da Serra",
    email: "fernando@exemplo.com",
    modelo: "Filme institucional",
    nicho: "corporativo",
    vars: { diarias: 2, videos: 2 },
    inicio: 20,
    fim: 21,
    local: "Bento Gonçalves, RS",
    investimento: "15-40k",
    ideia: "Filme da vindima com a família fundadora e um corte curto para as redes.",
    dia: -9,
    fim_: "aceito",
  },
  {
    nome: "Paulo Mendes",
    empresa: "Academia Força Total",
    email: "paulo@exemplo.com",
    modelo: "Pacote de reels",
    nicho: "corporativo",
    vars: { videos: 4 },
    local: "Guarulhos, SP",
    investimento: "ate-5k",
    ideia: "Vídeos curtos para a campanha de matrícula.",
    dia: -14,
    fim_: "recusado",
  },
];

const protocoloDemo = (i: number) => `DEMO${String(i + 1).padStart(4, "0")}`;

/**
 * Os pedidos de exemplo: três novos, um já orçado (com o link enviado), um aceito pelo link (que virou projeto e
 * parcelas no Financeiro) e um recusado. Se uma demonstração antiga perdeu os orçamentos, refaz os pedidos sem
 * duplicar cliente nem projeto (reaproveita os de exemplo pelo nome).
 */
export async function montarPedidos(tx: Tx, ctx: Contexto, hoje: string): Promise<number> {
  const [orfao] = (await tx.execute(sql`
    select exists (select 1 from maestro.pedidos where demo and status in ('em_orcamento', 'virou_projeto') and orcamento_id is null) as tem`)) as unknown as {
    tem: boolean;
  }[];
  const [tem] = (await tx.execute(sql`select exists (select 1 from maestro.pedidos where demo) as tem`)) as unknown as { tem: boolean }[];
  if (tem.tem && !orfao.tem) return 0;
  await tx.execute(sql`delete from maestro.pedidos where demo`);
  const [podeLink] = (await tx.execute(sql`select maestro.has_role(${ctx.orgId}::uuid, array['admin', 'gestor']) as ok`)) as unknown as { ok: boolean }[];
  if (!podeLink?.ok) return 0;

  let linkId: string | null = null;
  const [ativo] = (await tx.execute(sql`select id from maestro.links_publicos where tipo = 'pedido' and revogado_em is null`)) as unknown as { id: string }[];
  if (ativo) linkId = ativo.id;
  else {
    const r = await criarLinkDePedidoNaTx(tx, ctx, lerConfig({ boasVindas: "Conte o que você precisa. A gente responde em até um dia útil." }), true);
    if (r.ok) {
      const [l] = (await tx.execute(sql`select id from maestro.links_publicos where token_hash = ${hashToken(r.token)}`)) as unknown as { id: string }[];
      linkId = l?.id ?? null;
    }
  }
  const modelos = (await tx.execute(sql`select id, nome from maestro.orcamento_modelos where ativo`)) as unknown as { id: string; nome: string }[];
  const clientes = (await tx.execute(sql`select id, name from maestro.clients where demo and deleted_at is null`)) as unknown as { id: string; name: string }[];
  const projetos = (await tx.execute(sql`select id, title from maestro.projects where demo and deleted_at is null`)) as unknown as {
    id: string;
    title: string;
  }[];

  let n = 0;
  for (const [i, p] of PEDIDOS_DEMO.entries()) {
    const modelo = modelos.find((m) => m.nome === p.modelo);
    const respostas: RespostasPedido = {
      ...(modelo ? { modelo: modelo.id } : {}),
      tipo: p.modelo,
      nicho: p.nicho,
      vars: p.vars,
      ...(p.inicio != null ? { inicio: somarDias(hoje, p.inicio) } : {}),
      ...(p.fim != null ? { fim: somarDias(hoje, p.fim) } : {}),
      local: p.local,
      investimento: p.investimento,
      ideia: p.ideia,
    };
    const quem = p.empresa ?? p.nome;
    const clienteId = clientes.find((c) => c.name === quem)?.id ?? null;
    const [r] = (await tx.execute(sql`
      insert into maestro.pedidos (org_id, link_id, protocolo, status, nome, empresa, email, respostas, consentimento_em, cliente_id, demo, created_at)
      values (${ctx.orgId}, ${linkId}, ${protocoloDemo(i)}, ${p.fim_ === "recusado" ? "recusado" : "novo"}, ${p.nome}, ${p.empresa}, ${p.email},
              ${JSON.stringify(respostas)}::jsonb, ${`${somarDias(hoje, p.dia)}T13:${String(10 + i).padStart(2, "0")}:00Z`}, ${clienteId}, true,
              ${`${somarDias(hoje, p.dia)}T13:${String(10 + i).padStart(2, "0")}:00Z`})
      on conflict (org_id, protocolo) do nothing
      returning id`)) as unknown as { id: string }[];
    if (!r) continue;
    n++;
    if (p.fim_ !== "orcado" && p.fim_ !== "aceito") continue;
    const g = await gerarOrcamentoDoPedidoNaTx(tx, ctx, r.id, somarDias(hoje, p.dia + 1));
    if (!g.ok) continue;
    // Projeto de exemplo que já existia (demonstração completada): o aceite só o reaproveita.
    const titulo = (
      (await tx.execute(sql`select titulo from maestro.orcamentos where id = ${g.orcamentoId}`)) as unknown as {
        titulo: string;
      }[]
    )[0].titulo;
    const projeto = projetos.find((x) => x.title === titulo);
    if (projeto) await tx.execute(sql`update maestro.orcamentos set projeto_id = ${projeto.id} where id = ${g.orcamentoId}`);
    const link = await gerarLinkDoOrcamentoNaTx(tx, ctx, g.orcamentoId, 2, hoje);
    if (!link.ok || p.fim_ !== "aceito") continue;
    // O "cliente" aceita pela porta estreita, como se tivesse aberto o link.
    const [ac] = (await tx.execute(
      sql`select maestro.orcamento_link_aceitar(${hashToken(link.token)}, ${JSON.stringify({ nome: p.nome, aceite: true })}::jsonb) as r`,
    )) as unknown as { r: { ok?: boolean; erro?: string } }[];
    if (!ac.r.ok) throw new Error(`demonstração: aceite recusado (${ac.r.erro})`);
    // O projeto que nasceu do aceite é de exemplo: numeração DEMO e nunca liga ao HUB.
    const [pj] = (await tx.execute(sql`
      select p.id, p.code from maestro.orcamentos q join maestro.projects p on p.id = q.projeto_id where q.id = ${g.orcamentoId}`)) as unknown as {
      id: string;
      code: string;
    }[];
    if (pj && !pj.code.startsWith("DEMO-")) {
      const ano = hoje.slice(0, 4);
      const [mx] = (await tx.execute(sql`
        select coalesce(max(substring(code from '^DEMO-[0-9]{4}-([0-9]{3,5})$')::int), 0) as n from maestro.projects where code like ${`DEMO-${ano}-%`}`)) as unknown as {
        n: number;
      }[];
      await tx.execute(sql`
        update maestro.projects set code = ${`DEMO-${ano}-${String(Number(mx.n) + 1).padStart(3, "0")}`}, link_status = 'unlinked', start_date = ${somarDias(hoje, p.inicio ?? 20)},
               due_date = ${somarDias(hoje, (p.fim ?? 21) + 20)}
         where id = ${pj.id}`);
    }
  }
  return n;
}

/* ───────────── kit dos freelas ───────────── */

type ItemKit = [CategoriaEquipFreela, string | null, string, number, number | null, string?];

/** O kit de cada freela (marca, modelo, quantidade, diária de aluguel em centavos). Modelos reais de mercado, valores inventados. */
export const KITS_DEMO: Record<string, ItemKit[]> = {
  "Rafael Moura": [
    ["camera", "Sony", "FX6", 1, 45_000, "Com dois cartões CFexpress"],
    ["lente", "Sigma", "18-35mm f/1.8", 1, 8_000],
    ["drone", "DJI", "Mavic 3 Classic", 1, 35_000, "Piloto com registro na ANAC"],
    ["estabilizador", "DJI", "RS 3 Pro", 1, 10_000],
  ],
  "Lívia Andrade": [
    ["monitor", "ASUS", "ProArt PA279CV", 1, null, "Calibrado para cor"],
    ["acessorio", "Blackmagic", "Speed Editor", 1, null],
  ],
  "Caio Bastos": [
    ["audio", "Sound Devices", "MixPre-6 II", 1, 12_000],
    ["audio", "Sennheiser", "MKH 416", 1, 6_000],
    ["audio", "Rode", "Wireless PRO (par)", 2, 5_000],
  ],
  "Marina Teles": [
    ["camera", "Canon", "EOS R5", 1, 30_000],
    ["lente", "Canon", "RF 24-70mm f/2.8", 1, 9_000],
    ["luz", "Godox", "AD600 Pro", 2, 7_000],
  ],
  "Diego Furtado": [
    ["camera", "Sony", "FX30", 1, 25_000],
    ["lente", "Sony", "16-35mm f/4 PZ", 1, 6_000],
  ],
  "Tiago Lacerda": [["drone", "DJI", "Mini 4 Pro", 1, 25_000, "Com 3 baterias"]],
  "Gustavo Viana": [["acessorio", "Apple", "MacBook Pro M3", 1, null, "Edição no local (sameday)"]],
  "Renata Alves": [
    ["camera", "Blackmagic", "Pocket 6K Pro", 1, 22_000],
    ["luz", "Aputure", "Amaran 200x S", 2, 6_000],
    ["estabilizador", "Zhiyun", "Crane 4", 1, 8_000],
  ],
  "Bruno Quintela": [["audio", "Zoom", "F8n Pro", 1, 10_000]],
  "Helena Prado": [["acessorio", "Wacom", "Intuos Pro", 1, null]],
  "Felipe Couto": [["monitor", "Eizo", "ColorEdge CS2740", 1, null]],
};

/** Monta os kits nos freelas de exemplo e marca o que o Rafael leva na diária da fazenda (aluguel no a pagar). */
export async function montarKits(tx: Tx, ctx: Contexto): Promise<number> {
  const freelas = (await tx.execute(sql`select id, nome from maestro.freelas where demo`)) as unknown as { id: string; nome: string }[];
  let n = 0;
  const doRafael: string[] = [];
  for (const f of freelas) {
    for (const [categoria, marca, modelo, quantidade, diaria, obs] of KITS_DEMO[f.nome] ?? []) {
      const id = await gravarEquipFreela(
        tx,
        ctx,
        f.id,
        { categoria, marca, modelo, quantidade, diariaCents: diaria, observacao: obs ?? null, ativo: true },
        undefined,
        true,
      );
      n++;
      if (id && f.nome === "Rafael Moura" && (categoria === "camera" || categoria === "drone")) doRafael.push(id);
    }
  }
  const [esc] = (await tx.execute(sql`
    select e.id from maestro.escalas e join maestro.eventos ev on ev.id = e.evento_id join maestro.freelas f on f.id = e.freela_id
     where e.demo and ev.titulo = 'Safra 2027: fazenda' and f.nome = 'Rafael Moura' limit 1`)) as unknown as { id: string }[];
  if (esc && doRafael.length) await marcarEquipNaEscalaNaTx(tx, ctx, esc.id, doRafael, true);
  return n;
}

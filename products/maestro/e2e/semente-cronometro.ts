/**
 * A semente do cronômetro (e2e/cronometro.spec.ts, drizzle/0038), chamada pelo e2e/preparar.ts com o banco migrado:
 * a produtora de demonstração inteira (cards e clientes fictícios), os tipos de vídeo nos cards, previstos em alguns, e
 * tempo fictício: 12 semanas de vídeos já entregues (`demo-tp-*`, para o painel por tipo) e a semana atual da Diana e
 * do Rafa (para o Resumo). Durações sorteadas por um gerador com semente fixa: a mesma semente, a mesma tela.
 */
import type { Contexto } from "../src/lib/db/client";

const H = 3_600_000;
const M = 60_000;

/** Gerador com semente (mulberry32): capturas iguais a cada rodada. */
function acaso(semente: number) {
  let a = semente >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/** Faixa típica de cada tipo (p25–p75 aproximados, em horas) para os vídeos fictícios. */
const PERFIL: Record<string, { de: number; ate: number; n: number }> = {
  Reels: { de: 1.4, ate: 3.0, n: 14 },
  "YouTube longo": { de: 4.8, ate: 8.2, n: 7 },
  Institucional: { de: 3.1, ate: 5.6, n: 6 },
  Casamento: { de: 7.5, ate: 11.5, n: 4 },
  Motion: { de: 2.4, ate: 4.2, n: 6 },
  "Corte de podcast": { de: 0.7, ate: 1.5, n: 9 },
};

const TEMAS: Record<string, string[]> = {
  Reels: ["Reels do cardápio", "Reels: bastidores", "Reels da promoção", "Reels: depoimento", "Reels do lançamento"],
  "YouTube longo": ["Ep. do canal", "Vlog da obra", "Tour pela fábrica"],
  Institucional: ["Filme institucional", "Vídeo de boas-vindas", "Manifesto da marca"],
  Casamento: ["Filme do casamento", "Teaser do casamento"],
  Motion: ["Vinheta animada", "Lettering da campanha", "Abertura animada"],
  "Corte de podcast": ["Corte do podcast", "Clipe do episódio"],
};

function tipoPeloTema(tema: string): string {
  const t = tema.toLowerCase();
  if (/reels|stories|carrossel|post/.test(t)) return "Reels";
  if (/ep\.|document|trailer|aftermovie|técnico/.test(t)) return "YouTube longo";
  if (/anima|abertura|outdoor/.test(t)) return "Motion";
  if (/podcast/.test(t)) return "Corte de podcast";
  return "Institucional";
}

export async function sementeDoCronometro(ctx: Contexto, outro: string) {
  const { getBanco } = await import("../src/lib/db/client");
  const { sql: q } = await import("drizzle-orm");
  const { diaLocal, inicioDoDia, segundaDaSemana, somarDias } = await import("../src/lib/tempo/calculo");
  const r = acaso(31102026);
  const agora = Date.now();
  await getBanco().asSystem("e2e: semente do cronômetro", async (tx) => {
    const tipos = (await tx.execute(q`select id, nome from maestro.tipos_video where org_id = ${ctx.orgId}`)) as unknown as { id: string; nome: string }[];
    const tipo = Object.fromEntries(tipos.map((t) => [t.nome, t.id]));
    const cards = (await tx.execute(
      q`select id, dados ->> 'tema' as tema, coluna, cliente from maestro.cards where org_id = ${ctx.orgId} and apagado_em is null order by id`,
    )) as unknown as { id: string; tema: string; coluna: string; cliente: string | null }[];
    const clientes = [...new Set(cards.map((c) => c.cliente).filter((x): x is string => !!x))];
    // o tipo em cada card da demonstração, e o previsto nos que estão em produção
    for (const c of cards) {
      const nome = tipoPeloTema(c.tema);
      const prev = ["fazendo", "revisao", "afazer"].includes(c.coluna) ? Math.round(((PERFIL[nome].de + PERFIL[nome].ate) / 2) * 12) * 5 : null;
      await tx.execute(q`
        update maestro.cards set dados = dados || ${JSON.stringify({ tipo: tipo[nome], ...(prev ? { previsto: prev } : {}) })}::jsonb
         where org_id = ${ctx.orgId} and id = ${c.id}`);
    }
    const sessao = async (sub: string, card: string, inicio: number, ms: number) => {
      if (inicio + ms > agora - M) return;
      await tx.execute(q`
        insert into maestro.tempo_registros (org_id, zro_sub, card_id, inicio, fim, origem, modo)
        values (${ctx.orgId}, ${sub}, ${card}, ${new Date(inicio).toISOString()}, ${new Date(inicio + ms).toISOString()}, 'cronometro', ${r() < 0.3 ? "pomodoro" : "livre"})`);
    };
    // 12 semanas de vídeos entregues por tipo (o painel "Tempo")
    let n = 0;
    for (const [nome, p] of Object.entries(PERFIL)) {
      for (let i = 0; i < p.n; i++) {
        n++;
        const id = `demo-tp-${String(n).padStart(3, "0")}`;
        const entregue = agora - (8 + r() * 76) * 24 * H;
        const tema = `${TEMAS[nome][i % TEMAS[nome].length]} ${i + 1}`;
        const cliente = clientes[Math.floor(r() * clientes.length)] ?? null;
        const dados = { tema, coluna: "entregue", cliente, tipo: tipo[nome], demo: true, criadoEm: entregue - 6 * 24 * H, colunaEm: Math.round(entregue) };
        await tx.execute(q`insert into maestro.cards (org_id, id, dados) values (${ctx.orgId}, ${id}, ${JSON.stringify(dados)}::jsonb)`);
        // total sorteado em volta da faixa típica (às vezes um pouco fora, como na vida)
        const total = (p.de + (p.ate - p.de) * (r() * 1.3 - 0.15)) * H;
        const partes = 1 + Math.floor(r() * 3);
        for (let k = 0; k < partes; k++) {
          const ms = total / partes;
          const dia = entregue - (partes - k) * 24 * H;
          const inicio = inicioDoDia(diaLocal(dia)) + (9 + Math.floor(r() * 6)) * H;
          await sessao(k % 2 && outro ? outro : ctx.sub, id, inicio, ms);
        }
      }
    }
    // a semana atual: a Diana em cards de produção, de segunda até hoje, e o Rafa em alguns
    const hoje = diaLocal(agora);
    const segunda = segundaDaSemana(hoje);
    const emProducao = cards.filter((c) => ["fazendo", "revisao", "aprovacao", "aprovado"].includes(c.coluna));
    for (let d = 0; d < 7; d++) {
      const dia = somarDias(segunda, d);
      if (dia > hoje) break;
      const fimDeSemana = d >= 5;
      const blocos = fimDeSemana ? (dia === hoje ? 2 : 0) : 2 + Math.floor(r() * 3);
      let hora = inicioDoDia(dia) + 9 * H + Math.floor(r() * 40) * M;
      for (let b = 0; b < blocos; b++) {
        const c = emProducao[(d * 3 + b) % emProducao.length];
        const ms = (35 + Math.floor(r() * 110)) * M;
        await sessao(ctx.sub, c.id, hora, ms);
        if (outro && r() < 0.5) await sessao(outro, emProducao[(d + b + 2) % emProducao.length].id, hora + 20 * M, ms * 0.8);
        hora += ms + (10 + Math.floor(r() * 50)) * M;
      }
    }
  });
}

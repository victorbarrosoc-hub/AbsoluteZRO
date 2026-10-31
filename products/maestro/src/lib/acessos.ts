/**
 * O que cada pessoa vê no Maestro (pedido do titular, 29/10/2026: "o Administrador da conta tem o controle de quem tem
 * que função dentro da plataforma… uma aba do financeiro, só algumas pessoas podem ver"). Mapa em docs/permissoes.md.
 *
 * Duas camadas, as duas no banco (drizzle/0027_acessos.sql):
 * 1. O papel (src/lib/papeis.ts) vem da Absolute ZRO a cada login e decide quem escreve, quem remove e quem só lê.
 * 2. As **áreas sensíveis** abaixo: cada papel tem um padrão e a administração liga ou desliga por pessoa
 *    (`maestro.acessos`). A administração vê tudo, sempre (não dá para trancar a conta por engano).
 *
 * A regra vale no banco: `maestro.pode(org, area)` (security definer) entra nas políticas de RLS das tabelas de cada
 * área e mascara as colunas de dinheiro nas tabelas mistas (escala, inventário, freela). Esta cópia em TypeScript só
 * decide o que a tela mostra; `tests/acessos.test.mts` confere que as duas tabelas de padrão são iguais.
 *
 * A "Função na produtora" (`members.funcao`: editor, câmera…) é só um rótulo e não muda nada daqui.
 * Sem "server-only": o servidor, a tela e os testes usam.
 */
import type { Papel } from "./papeis";

export const AREAS = ["financeiro", "orcamentos", "contratos", "diarias", "dados_equipe", "inventario_valores"] as const;
export type Area = (typeof AREAS)[number];
export type Acessos = Readonly<Record<Area, boolean>>;

/** Nome curto e uma dica (vai no `title`, não na tela: pouco texto). */
export const AREA: Record<Area, { nome: string; dica: string }> = {
  financeiro: { nome: "Financeiro", dica: "Contas, caixa, metas e pagamentos." },
  orcamentos: { nome: "Orçamentos e preços", dica: "Valores, custos, margens, tabela de preços e links de orçamento." },
  contratos: { nome: "Contratos", dica: "Contratos aceitos, com documento e endereço do cliente." },
  diarias: { nome: "Diárias e cachês", dica: "Quanto cada pessoa da equipe recebe, na escala e no kit." },
  dados_equipe: { nome: "Dados da equipe", dica: "CPF, PIX, e-mail e WhatsApp dos freelas." },
  inventario_valores: { nome: "Valores do inventário", dica: "Quanto vale cada equipamento." },
};

const TUDO: Acessos = { financeiro: true, orcamentos: true, contratos: true, diarias: true, dados_equipe: true, inventario_valores: true };
const NADA: Acessos = { financeiro: false, orcamentos: false, contratos: false, diarias: false, dados_equipe: false, inventario_valores: false };

/**
 * O padrão de cada papel (o mesmo de `maestro.area_padrao` no banco). Escolhas mais seguras, a confirmar com o titular
 * (docs/permissoes.md, "Perguntas"): a gestão NÃO vê o Financeiro sem a administração ligar; equipe e leitura não veem
 * dinheiro nenhum nem dados pessoais da equipe.
 */
export const PADRAO: Readonly<Record<Papel, Acessos>> = {
  admin: TUDO,
  gestor: { ...TUDO, financeiro: false },
  equipe: NADA,
  leitura: NADA,
};

/** Ajustes guardados de uma pessoa (só o que difere do padrão; qualquer outra chave é ignorada). */
export type AjustesDeAcesso = Partial<Record<Area, boolean>> | null | undefined;

export function ehArea(v: unknown): v is Area {
  return typeof v === "string" && (AREAS as readonly string[]).includes(v);
}

/** O acesso final: administração vê tudo; os outros, o padrão do papel com os ajustes da administração por cima. */
export function acessosDe(papel: Papel, ajustes?: AjustesDeAcesso): Acessos {
  if (papel === "admin") return TUDO;
  const base = PADRAO[papel] ?? NADA;
  const out = { ...base };
  for (const a of AREAS) {
    const v = ajustes?.[a];
    if (typeof v === "boolean") out[a] = v;
  }
  return out;
}

/** Só quem pode mudar o acesso dos outros: a administração (o banco confere de novo). */
export function podeMudarAcessos(papel: Papel): boolean {
  return papel === "admin";
}

/** A pessoa vê todas as áreas? (a demonstração preenche todas, então só quem vê tudo carrega.) */
export function veTudo(a: Acessos): boolean {
  return AREAS.every((k) => a[k]);
}

/** As áreas ligadas, na ordem da lista (para o resumo "Financeiro · Contratos"). */
export function areasLigadas(a: Acessos): Area[] {
  return AREAS.filter((k) => a[k]);
}

/** Resumo de uma linha para a lista de pessoas. */
export function resumoDoAcesso(papel: Papel, a: Acessos): string {
  if (papel === "admin") return "Tudo";
  const n = areasLigadas(a).length;
  if (n === 0) return "Sem valores";
  if (n === AREAS.length) return "Tudo";
  return n === 1 ? AREA[areasLigadas(a)[0]].nome : `${n} áreas`;
}

/** O que muda em relação ao padrão (o que a tabela `maestro.acessos` guarda). */
export function diferencaDoPadrao(papel: Papel, a: Acessos): Partial<Record<Area, boolean>> {
  const base = PADRAO[papel];
  const out: Partial<Record<Area, boolean>> = {};
  for (const k of AREAS) if (a[k] !== base[k]) out[k] = a[k];
  return out;
}

/** A sessão (ou quem tiver `acessos`) vê esta área? Só decide a tela; o banco confere de novo. */
export function pode(s: { acessos: Acessos }, area: Area): boolean {
  return s.acessos[area] === true;
}

/* ───────────── Criação (roteiros e fluxos) ───────────── */

/**
 * Criação não é área sensível: é um nível por papel (`maestro.pode_criacao` no banco, drizzle/0027), para a frente
 * Criação trocar a regra própria por esta. ver = todos da organização; editar = administração, gestão e equipe; enviar
 * para fora (cliente) = administração e gestão. Ajuste por pessoa: ainda não (fica para quando a Criação pedir).
 */
export const NIVEIS_CRIACAO = ["ver", "editar", "enviar"] as const;
export type NivelCriacao = (typeof NIVEIS_CRIACAO)[number];

export const CRIACAO_PADRAO: Readonly<Record<Papel, Readonly<Record<NivelCriacao, boolean>>>> = {
  admin: { ver: true, editar: true, enviar: true },
  gestor: { ver: true, editar: true, enviar: true },
  equipe: { ver: true, editar: true, enviar: false },
  leitura: { ver: true, editar: false, enviar: false },
};

/** O papel pode isto na Criação? Só decide a tela; o banco confere com `maestro.pode_criacao`. */
export function podeCriacao(s: { papel: Papel }, nivel: NivelCriacao): boolean {
  return CRIACAO_PADRAO[s.papel]?.[nivel] === true;
}

/* ───────────── Entregas (versões de entrega pelo Relay) ───────────── */

/**
 * "Gerar versões com o Relay" (src/lib/relay/entregaveis.ts) também é um nível por papel, não área sensível (não
 * mostra dinheiro): ver = todos que veem o card (o acesso por cliente vale); pedir (gerar, conferir e cancelar) =
 * administração, gestão e equipe, porque entregar o arquivo certo ao cliente é trabalho de quem produz; leitura só
 * acompanha o que foi guardado e nunca pergunta ao SOBEDESCE. O banco confere os mesmos papéis nas políticas de
 * `maestro.entregaveis` (drizzle/0034) e `tests/relay.test.mts` compara. Além do papel, a organização precisa do
 * SOBEDESCE (fila, Drive e ffmpeg) e do Relay no plano (`disponibilidade` em entregaveis.ts; o HUB confere de novo).
 */
export const NIVEIS_ENTREGAS = ["ver", "pedir"] as const;
export type NivelEntregas = (typeof NIVEIS_ENTREGAS)[number];

export const ENTREGAS_PADRAO: Readonly<Record<Papel, Readonly<Record<NivelEntregas, boolean>>>> = {
  admin: { ver: true, pedir: true },
  gestor: { ver: true, pedir: true },
  equipe: { ver: true, pedir: true },
  leitura: { ver: true, pedir: false },
};

/** O papel pode isto nas entregas? Só decide a tela e a ação; o banco confere de novo pelas políticas da 0034. */
export function podeEntregas(s: { papel: Papel }, nivel: NivelEntregas): boolean {
  return ENTREGAS_PADRAO[s.papel]?.[nivel] === true;
}

/** Os papéis que pedem (a mesma lista das políticas de escrita de `maestro.entregaveis`). */
export const PAPEIS_PEDIR_ENTREGAS: readonly Papel[] = (["admin", "gestor", "equipe", "leitura"] as const).filter((p) => podeEntregas({ papel: p }, "pedir"));

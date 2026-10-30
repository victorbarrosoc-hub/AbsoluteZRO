/**
 * Quem pode o quê na Criação (plano da Criação §7). ÚNICO ponto de decisão na tela e nas rotas; o banco confere de novo
 * (políticas de `drizzle/0030_roteiros.sql` e a função `maestro.roteiro_versao_salvar`).
 *
 * PROVISÓRIO: enquanto o acesso por área (outra frente, "Quem vê o quê": `drizzle/0027_acessos.sql`,
 * `src/lib/acessos.ts` com `pode(sessao, área)` e `maestro.pode(org, área)` no banco, quando entrarem na main) não tem
 * a área `criacao`, decide pelo papel fixo da organização:
 *   ver    = todos (admin, gestor, equipe, leitura);
 *   editar = `podeEscrever` (admin, gestor, equipe): criar, mudar, salvar versão, mandar para a lixeira;
 *   enviar = admin e gestor (o mesmo corte do link de aprovação): mandar ao cliente, criar link de exportação, mudar o
 *            estado (o gatilho `roteiros_guarda_estado` confere no banco).
 * Quando a área existir, troque o corpo destas três funções pela checagem da área (ex.: ver = `pode(sessao, "criacao")`;
 * editar e enviar = a área mais o papel de hoje) e as políticas do banco pela equivalente (`maestro.pode(org_id,
 * 'criacao')` numa política `roteiros_area`), numa migração nova. Quem chama continua chamando estas três.
 */
import { type Acesso, temProduto } from "@/lib/auth/acesso";
import { type Papel, podeEscrever } from "@/lib/papeis";

export const podeVerCriacao = (_papel: Papel): boolean => true;
export const podeEditarCriacao = (papel: Papel): boolean => podeEscrever(papel);
export const podeEnviarCriacao = (papel: Papel): boolean => papel === "admin" || papel === "gestor";

/** Id do AEON (edição) em zro_products e zro_release. */
export const PRODUTO_AEON = "ai-edit";

/**
 * "Para o AEON" (o arquivo `maestro.roteiro/1`) só aparece quando o AEON está ABERTO para a pessoa: a claim
 * `zro_release["ai-edit"]` diz "released" ou "allowed" (sem a claim = fechado, como as listas da família) e a
 * organização tem o produto. Hoje o AEON está em desenvolvimento (gate fechado): ninguém vê. Quando o HUB abrir, a
 * opção aparece sozinha no próximo login ou releitura do perfil. Mais o papel de quem envia (admin e gestão).
 */
export function podeMandarParaAeon(s: Acesso & { papel: Papel }): boolean {
  const r = s.release?.[PRODUTO_AEON];
  return podeEnviarCriacao(s.papel) && (r === "released" || r === "allowed") && temProduto(s, PRODUTO_AEON);
}

/** Os papéis do banco (mesma regra), para as políticas e os testes. */
export const PAPEIS_EDITAR_CRIACAO: readonly Papel[] = ["admin", "gestor", "equipe"];
export const PAPEIS_ENVIAR_CRIACAO: readonly Papel[] = ["admin", "gestor"];

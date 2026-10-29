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
import { type Papel, podeEscrever } from "@/lib/papeis";

export const podeVerCriacao = (_papel: Papel): boolean => true;
export const podeEditarCriacao = (papel: Papel): boolean => podeEscrever(papel);
export const podeEnviarCriacao = (papel: Papel): boolean => papel === "admin" || papel === "gestor";

/** Os papéis do banco (mesma regra), para as políticas e os testes. */
export const PAPEIS_EDITAR_CRIACAO: readonly Papel[] = ["admin", "gestor", "equipe"];
export const PAPEIS_ENVIAR_CRIACAO: readonly Papel[] = ["admin", "gestor"];

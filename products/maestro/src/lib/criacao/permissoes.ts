/**
 * Quem pode o quê na Criação (plano da Criação §7). ÚNICO ponto de decisão na tela e nas rotas da Criação; o banco
 * confere de novo (políticas de `drizzle/0030_roteiros.sql` e a função `maestro.roteiro_versao_salvar`).
 *
 * A regra é a capacidade `criacao` do acesso por área (`podeCriacao` em `src/lib/acessos.ts`, igual a
 * `maestro.pode_criacao` no banco, drizzle/0027): ver = todos; editar = administração, gestão e equipe (criar, mudar,
 * salvar versão, lixeira); enviar = administração e gestão (Enviar, mudar o estado; o gatilho `roteiros_guarda_estado`
 * confere no banco). Quem chama continua chamando estas três.
 */
import { podeCriacao } from "@/lib/acessos";
import { type Acesso, temProduto } from "@/lib/auth/acesso";
import type { Papel } from "@/lib/papeis";

export const podeVerCriacao = (papel: Papel): boolean => podeCriacao({ papel }, "ver");
export const podeEditarCriacao = (papel: Papel): boolean => podeCriacao({ papel }, "editar");
export const podeEnviarCriacao = (papel: Papel): boolean => podeCriacao({ papel }, "enviar");
/**
 * Apagar de vez da lixeira (roteiro e fluxo): administração e gestão, os mesmos de "enviar" (as políticas de remoção da
 * 0030/0031 dizem o mesmo). Mandar para a lixeira e tirar dela é de quem edita (`podeEditarCriacao`).
 */
export const podeApagarDeVezCriacao = (papel: Papel): boolean => podeCriacao({ papel }, "enviar");

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

/** Id do TPeasy em zro_products e zro_release. */
export const PRODUTO_TPEASY = "tpeasy";

/**
 * "Para o TPeasy" direto (Criação F8): a versão vai pela Absolute ZRO para a caixa de entrada do TPeasy da pessoa (ou de
 * alguém da organização que usa o TPeasy). Só com o TPeasy no plano da organização e aberto no gate (`temProduto`), e
 * para quem envia (admin e gestão). O HUB confere tudo de novo (`authorize`, TPeasy no plano). Sem o TPeasy, a folha
 * continua com Compartilhar, Copiar, .txt e o backup, e diz por que não há o envio direto.
 */
export function podeMandarParaTpeasy(s: Acesso & { papel: Papel }): boolean {
  return podeEnviarCriacao(s.papel) && temProduto(s, PRODUTO_TPEASY);
}

/** Os papéis que editam e que enviam (a mesma regra das políticas da 0030; `tests/roteiro.test.mts` confere). */
const PAPEIS: readonly Papel[] = ["admin", "gestor", "equipe", "leitura"];
export const PAPEIS_EDITAR_CRIACAO: readonly Papel[] = PAPEIS.filter(podeEditarCriacao);
export const PAPEIS_ENVIAR_CRIACAO: readonly Papel[] = PAPEIS.filter(podeEnviarCriacao);

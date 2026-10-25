// Número do build do app de desktop: GITHUB_RUN_NUMBER + SOBEDESCE_BUILD_BASE.
//
// O SOBEDESCE saiu do repositório baixadordodrive (último build publicado: b379) para o AbsoluteZRO, onde a contagem de
// execuções do GitHub Actions recomeça do 1. O aviso "Nova versão" do app compara números de build: sem a base, o
// primeiro build daqui (b1) pareceria mais velho que o b379 instalado e ninguém seria avisado. O workflow da raiz
// (.github/workflows/sobedesce-desktop.yml) define SOBEDESCE_BUILD_BASE=1000, então o primeiro build daqui é o b1001.
// Sem GITHUB_RUN_NUMBER (na sua máquina): 0, versão de desenvolvimento.

/** Build a partir das variáveis de ambiente; 0 quando não há GITHUB_RUN_NUMBER válido. */
export function numeroDoBuild(env = process.env) {
  const execucao = Number.parseInt(env.GITHUB_RUN_NUMBER || '', 10)
  if (!Number.isSafeInteger(execucao) || execucao <= 0) return 0
  const base = Number.parseInt(env.SOBEDESCE_BUILD_BASE || '0', 10)
  return execucao + (Number.isSafeInteger(base) && base > 0 ? base : 0)
}

/**
 * O que as páginas públicas divulgam (página inicial, /baixar). Sem `server-only` para os testes
 * (tests/integration/divulgacao.test.ts).
 *
 * Só o que está no ar para qualquer um, no site ou nos downloads: estado `released`/`public_beta` no gate de lançamento
 * (zro.product_release, ADR 0023) com o canal web ou download aberto. O resto não aparece nem como "Em breve" (decisão
 * do titular, 30/10/2026: "Quando for pro ar, aí divulga"). Não há lista à mão: quando a migration abre o gate de um
 * produto (como a 0032 fez com o Relay), ele entra sozinho em todas essas páginas.
 */
export type EstadoPublico = { state: string; canais: { web: boolean; download: boolean } }

export const divulgado = (r: EstadoPublico) => (r.state === 'released' || r.state === 'public_beta') && (r.canais.web || r.canais.download)

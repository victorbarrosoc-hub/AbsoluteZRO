/**
 * A tela de entrada da área logada: a conta (Drives, computadores, enviar), a tarefa do SOBEDESCE (titular, 29/10/2026;
 * Plano de Integração §7–8: "a tarefa principal do aplicativo vem primeiro"). A Z nunca é a entrada: fica num anel
 * discreto no cabeçalho (components/conta/abas.tsx › LinkZ) e em /z, que continua valendo como link direto.
 * Quem só entrou (volta padrão, "/conta") cai na conta; quem pediu uma página (inclusive /z) volta para ela.
 */
export const INICIO = "/conta";
export function destinoDeEntrada(volta: string): string {
  return volta === "/conta" ? INICIO : volta;
}

/**
 * Parâmetro `volta` (para onde ir depois de entrar). Só caminho interno:
 * começa com "/", não com "//" nem "/\", sem esquema, sem quebra de linha.
 */
export function voltaSegura(valor: unknown, padrao = "/conta"): string {
  if (typeof valor !== "string") return padrao;
  const v = valor.trim();
  if (!v.startsWith("/") || v.startsWith("//") || v.startsWith("/\\") || v.length > 512) return padrao;
  if (/[\u0000-\u001f\u007f\\]/.test(v)) return padrao;
  try {
    // Resolvido contra uma base qualquer, precisa continuar na mesma origem.
    const base = "https://sobedesce.invalid";
    const u = new URL(v, base);
    if (u.origin !== base) return padrao;
    // Voltar para o próprio login ou para o sair daria volta em círculo.
    if (["/entrar", "/criar-conta", "/sair", "/esqueci-a-senha", "/nova-senha"].includes(u.pathname)) return padrao;
    return u.pathname + u.search + u.hash;
  } catch {
    return padrao;
  }
}

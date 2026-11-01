/**
 * Os erros de /entrar que só a conta antiga resolve: a Absolute ZRO achou uma conta SOBEDESCE de antes com o mesmo
 * e-mail, sem vínculo (lib/zro/contas.ts nunca liga pelo e-mail sozinha), ou a entrada antiga falhou (senha, Google de
 * entrar). Só com eles as portas antigas aparecem.
 */
export function pedeContaAntiga(erro: string | undefined): boolean {
  return erro === "zro_email_em_uso" || erro === "senha" || erro === "credenciais" || (typeof erro === "string" && erro.startsWith("google_") && erro !== "google_recusado" && erro !== "google_sem_conta");
}

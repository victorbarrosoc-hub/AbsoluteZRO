// O balão da navegação do estúdio (o mesmo desenho do SOBEDESCE e do HUB): quantas coisas esperam a pessoa.
// Só o estado real que o estúdio já tem (`pendingJob`, vindo de /api/audio/jobs e do mapeamento local), nada de
// número de fachada. Fica em "Meus projetos" (e "Projetos" na barra do celular) porque é lá que o aviso do pedido
// aparece com o botão que resolve. Início, Estúdio, Conta e Planos não têm o que dependa da pessoa; o painel de
// administração não ganha balão.
//
// Espera a pessoa:
// - resultado da restauração pronto para salvar (status `completed`);
// - envio incompleto (status `uploading`): só ela retoma ou cancela;
// - pedido em andamento sem o áudio neste aparelho (sem `projectId`): precisa "Recuperar áudio deste pedido".
// Na fila, confirmando o envio ou restaurando com o áudio aqui: o trabalho é do servidor, não dela.

export type PendingCloudJob = { status: string; projectId?: string } | null;

export type StudioPending = { projects: { count: number; title: string } };

export function studioPending(job: PendingCloudJob): StudioPending {
  if (!job) return { projects: { count: 0, title: '' } };
  const title =
    job.status === 'completed'
      ? 'Resultado da restauração pronto para salvar'
      : job.status === 'uploading'
        ? 'Envio incompleto: retome ou cancele o pedido'
        : !job.projectId
          ? 'Pedido de restauração sem o áudio neste aparelho: recupere para acompanhar'
          : '';
  return { projects: { count: title ? 1 : 0, title } };
}

/** O número do balão: até 99, depois "99+". */
export function badgeLabel(count: number): string {
  return count > 99 ? '99+' : String(count);
}

/** O nome para leitor de tela: "1 pendência", "3 pendências". */
export function badgeAria(count: number): string {
  return `${count} ${count === 1 ? 'pendência' : 'pendências'}`;
}

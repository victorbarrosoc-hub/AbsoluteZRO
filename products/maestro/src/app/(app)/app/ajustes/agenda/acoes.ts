"use server";
/**
 * Agenda: o endereço .ics de cada pessoa (gerar, trocar, desligar) e o Google Agenda pelas Conexões da Absolute ZRO
 * (ligar, tipos, sincronizar agora). Cada um mexe só no próprio; o banco confere de novo.
 */
import { revalidatePath } from "next/cache";
import { exigirAcessoNaAcao } from "@/lib/auth/acao";
import { gerarAssinatura, revogarAssinatura } from "@/lib/agenda/feed";
import { sincronizarDepois } from "@/lib/agenda/depois";
import { esvaziarFila, salvarPrefs, sincronizarTudo } from "@/lib/agenda/sincronia";

export type EstadoAgenda = { url?: string; mensagem?: string; aviso?: string; em?: number } | undefined;

export async function gerarAssinaturaAcao(_: EstadoAgenda, __: FormData): Promise<EstadoAgenda> {
  const s = await exigirAcessoNaAcao();
  const r = await gerarAssinatura({ sub: s.sub, orgId: s.orgId });
  if (!r.ok) return { mensagem: r.mensagem };
  revalidatePath("/app/ajustes/agenda");
  return { url: r.url, em: Date.now() };
}

export async function revogarAssinaturaAcao(_: EstadoAgenda, __: FormData): Promise<EstadoAgenda> {
  const s = await exigirAcessoNaAcao();
  const r = await revogarAssinatura({ sub: s.sub, orgId: s.orgId });
  if (!r.ok) return { mensagem: r.mensagem };
  revalidatePath("/app/ajustes/agenda");
  return { aviso: "Endereço desligado. O calendário para de atualizar.", em: Date.now() };
}

export type EstadoGoogleForm = { mensagem?: string; aviso?: string; em?: number } | undefined;

/** Google Agenda: liga/desliga e escolhe os tipos. Depois da resposta, a fila sai para o Google. */
export async function salvarGoogleAcao(_: EstadoGoogleForm, fd: FormData): Promise<EstadoGoogleForm> {
  const s = await exigirAcessoNaAcao();
  const ligado = fd.get("ligado") === "on";
  const r = await salvarPrefs({ sub: s.sub, orgId: s.orgId }, { ligado, tipos: fd.getAll("tipo").map(String) });
  if (!r.ok) return { mensagem: r.mensagem, em: Date.now() };
  sincronizarDepois(s);
  revalidatePath("/app/ajustes/agenda");
  return { aviso: ligado ? "Ligado. Indo para o Google." : "Desligado. O que foi sai do Google.", em: Date.now() };
}

const MENSAGEM_PAROU: Record<string, string> = {
  sem_conexao: "Conecte o Google Agenda na sua conta Absolute ZRO.",
  app_desligado: "O Maestro está desligado nas Conexões da sua conta.",
  reconectar_zro: "Entre de novo com a Absolute ZRO para sincronizar.",
  erro: "A Absolute ZRO não respondeu agora. Tentamos de novo sozinhos.",
};

/** "Sincronizar agora": tudo de novo para a fila e uma rodada já (o resto segue depois da resposta). */
export async function sincronizarAgoraAcao(_: EstadoGoogleForm, __: FormData): Promise<EstadoGoogleForm> {
  const s = await exigirAcessoNaAcao();
  await sincronizarTudo({ sub: s.sub, orgId: s.orgId });
  const r = await esvaziarFila({ id: s.id, sub: s.sub, orgId: s.orgId });
  sincronizarDepois(s);
  revalidatePath("/app/ajustes/agenda");
  if (r.parou && r.parou !== "ok") return { mensagem: MENSAGEM_PAROU[r.parou] ?? MENSAGEM_PAROU.erro, em: Date.now() };
  const n = r.enviados + r.apagados;
  return { aviso: n ? `${n} ${n === 1 ? "item atualizado" : "itens atualizados"} no Google.` : "Tudo em dia.", em: Date.now() };
}

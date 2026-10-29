/** Peças pequenas da tela do Roteiro (servidor e navegador): selo do estado, alvo, medidor e "há 2 h". */
import type { Alvo } from "@/lib/criacao/roteiro/modelo";
import { formatarTempo, medidor } from "@/lib/criacao/roteiro/tempo";
import type { EstadoRoteiro } from "@/lib/criacao/roteiro/nomes";

/** Cor do selo pelo estado (o texto do selo é sempre grafite/branco; só o ponto e o fundo tingem). */
export const STATUS_DO_ESTADO: Record<EstadoRoteiro, string> = {
  rascunho: "rascunho",
  com_cliente: "enviado",
  aprovado: "aprovado",
  ajuste: "aviso",
};

/** "alvo 1:30–3:00", "alvo 0:30" ou "" sem alvo. */
export function textoAlvo(alvo: Alvo | null): string {
  if (!alvo) return "";
  return alvo.min === alvo.max ? `alvo ${formatarTempo(alvo.max)}` : `alvo ${formatarTempo(alvo.min)}–${formatarTempo(alvo.max)}`;
}

/** O medidor (0–1) e o estado para o CSS (`data-estado`): abaixo, no_alvo, acima, sem_alvo. */
export function barra(totalSeg: number, alvo: Alvo | null) {
  const m = medidor(totalSeg, alvo);
  return {
    fracao: m.fracao,
    estado: m.estado,
    titulo: alvo ? `${formatarTempo(totalSeg)} de ${textoAlvo(alvo).replace("alvo ", "")}` : formatarTempo(totalSeg),
  };
}

/** "agora", "há 5 min", "há 2 h", "ontem", "12/10". */
export function quando(iso: string, agora = Date.now()): string {
  // `updated_at::text` do Postgres: "2026-10-29 14:00:00.12+00"
  const t = Date.parse(iso.replace(" ", "T").replace(/([+-]\d\d)$/, "$1:00"));
  if (!Number.isFinite(t)) return "";
  const min = Math.round((agora - t) / 60_000);
  if (min < 1) return "agora";
  if (min < 60) return `há ${min} min`;
  const h = Math.round(min / 60);
  if (h < 24) return `há ${h} h`;
  if (h < 48) return "ontem";
  const d = new Date(t);
  return `${String(d.getDate()).padStart(2, "0")}/${String(d.getMonth() + 1).padStart(2, "0")}`;
}

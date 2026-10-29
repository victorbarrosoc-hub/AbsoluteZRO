"use client";
/**
 * Drive pelo SOBEDESCE no player da equipe (plano v2 §4.1, fase 8): com o SOBEDESCE no plano, a versão do Drive toca num
 * <video> pelo service worker do Maestro (/drive-sw.js → Google com o token curto da pessoa, repassando o Range), então
 * o tempo e o timecode são de verdade, até em arquivo privado. Sem o SOBEDESCE (ou sem o Drive conectado), o player
 * segue como antes (chave de API do Maestro ou iframe).
 */
import { createContext, type ReactNode } from "react";
import { contaQueVe, urlDeMidia } from "@/components/arquivos/drive-cliente";

export type ResolverDrive = (driveId: string) => Promise<string | null>;
export const DriveEquipe = createContext<ResolverDrive | null>(null);

const resolvidos = new Map<string, Promise<string | null>>();

async function resolver(driveId: string): Promise<string | null> {
  let p = resolvidos.get(driveId);
  if (!p) {
    p = (async () => {
      // Qual conta conectada vê o arquivo (a equipe pode ter o vídeo em Drives diferentes); sem achar, tenta a primeira.
      const v = await contaQueVe(driveId).catch(() => null);
      const f = v?.arquivo;
      return urlDeMidia({ id: driveId, name: f?.name ?? "video.mp4", mimeType: f?.mimeType ?? "video/mp4", size: f?.size ?? null }, v?.conta ?? "");
    })().catch(() => null);
    resolvidos.set(driveId, p);
    void p.then((u) => u === null && resolvidos.delete(driveId));
  }
  return p;
}

export function ComDriveDaEquipe({ ligado, children }: { ligado: boolean; children: ReactNode }) {
  return <DriveEquipe.Provider value={ligado ? resolver : null}>{children}</DriveEquipe.Provider>;
}

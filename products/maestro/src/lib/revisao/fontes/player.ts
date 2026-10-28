/**
 * Do banco para o player: a chave de API do Google só do Maestro (MAESTRO_GOOGLE_API_KEY, opcional; autorizada pelo
 * titular em 28/10/2026) transforma o link do Drive num <video> com tempo automático. Sem a chave, ou com arquivo de
 * resourcekey, fica o iframe do Google. A chave é pública por natureza (vai na URL do <video>) e deve ser restrita no
 * Google Cloud à Drive API e ao domínio do Maestro; nunca vai para o repositório.
 */
import { urlDriveStream } from "./detectar";

export function chaveGoogle(): string | null {
  const v = process.env.MAESTRO_GOOGLE_API_KEY?.trim();
  return v && /^[A-Za-z0-9_-]{20,80}$/.test(v) ? v : null;
}

export function streamDoDrive(fonte: string, driveId: string | null, driveChave: string | null): string | null {
  if (fonte !== "drive" || !driveId || driveChave) return null;
  const chave = chaveGoogle();
  return chave ? urlDriveStream(driveId, chave) : null;
}

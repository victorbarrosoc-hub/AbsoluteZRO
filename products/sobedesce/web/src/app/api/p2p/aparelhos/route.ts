import { respostaP2pDescontinuado } from "@/lib/p2p/descontinuado";

/** Descontinuado (lib/p2p/descontinuado.ts): responde na hora, sem sessão nem banco, para os apps antigos recuarem. */
export const GET = () => respostaP2pDescontinuado();

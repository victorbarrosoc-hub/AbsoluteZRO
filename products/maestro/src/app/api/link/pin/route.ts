/** PIN do link do cliente: confere (scrypt, 5 tentativas a cada 15 min por link e IP) e devolve o cookie da prova. */
import { rotaPin } from "@/lib/revisao/rotas";

export const POST = rotaPin;

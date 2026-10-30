/**
 * O estado de uma área fechada para a pessoa (src/lib/acessos.ts). A navegação já esconde a área; isto só aparece para
 * quem chega pelo endereço digitado ou por um link antigo. O servidor não carrega nada da área antes de mostrar isto.
 */
import { AREA, type Area } from "@/lib/acessos";
import { EstadoVazio } from "./vazio";

export function SemArea({ area }: { area: Area }) {
  return <EstadoVazio icone="cadeado" titulo={`${AREA[area].nome}: sem acesso`} apoio="A administração libera em Ajustes → Pessoas." />;
}

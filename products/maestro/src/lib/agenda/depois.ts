/**
 * Esvazia a fila do Google Agenda da pessoa DEPOIS da resposta (`after()` do Next): o salvar já terminou e foi
 * confirmado; a sincronia não atrasa a tela e nunca desfaz o que foi salvo. Fora de um pedido do Next (testes) não faz
 * nada. Sessão sem tokens da Absolute ZRO: nem tenta.
 */
import { after } from "next/server";
import type { Sessao } from "@/lib/auth/sessao";
import { esvaziarFila } from "./sincronia";

export function sincronizarDepois(s: Pick<Sessao, "id" | "sub" | "orgId" | "temTokens">): void {
  if (!s.temTokens) return;
  try {
    after(() =>
      esvaziarFila({ id: s.id, sub: s.sub, orgId: s.orgId }).then(
        () => undefined,
        () => undefined,
      ),
    );
  } catch {
    // Fora do escopo de um pedido (testes, scripts): a fila espera a próxima vez.
  }
}

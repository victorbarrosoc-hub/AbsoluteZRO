import { sairParaOutraConta, USAR_OUTRA_CONTA } from "@/lib/site";

/**
 * "Usar outra conta": link discreto embaixo do Entrar. Um POST sem campos que sai do Maestro (revoga o acesso) e volta
 * ao login único com prompt=login, para a Absolute ZRO pedir a conta em vez de reaproveitar a que está aberta lá.
 * Funciona sem JavaScript. Não aparece em Criar conta (lá é prompt=create).
 */
export function UsarOutraConta({ volta }: { volta?: string }) {
  return (
    <form method="post" action={sairParaOutraConta(volta)} className="outra-conta">
      <button type="submit" className="outra-conta__botao" data-usar-outra-conta>
        {USAR_OUTRA_CONTA}
      </button>
    </form>
  );
}

import { Enviar } from "@/components/conta/enviar";
import { acaoSair } from "../acoes";

export function BotaoSair() {
  return (
    <form action={acaoSair}>
      <Enviar variant="secondary" ocupado="Saindo…">
        Sair da conta
      </Enviar>
    </form>
  );
}

/** "Sair" pequeno, no canto da tela de ligar a Absolute ZRO (lib/zro/ligar.ts). */
export function SairDiscreto() {
  return (
    <form action={acaoSair}>
      <Enviar variant="ghost" size="sm" className="text-ink-2" ocupado="Saindo…">
        Sair
      </Enviar>
    </form>
  );
}

import { LockKeyhole } from "lucide-react";
import { BotaoZro } from "@/components/conta/zro";
import { Moldura } from "@/components/conta/moldura";
import { buttonClasses } from "@/components/ui/button";
import { FERRAMENTAS_ZRO, MENSAGEM_SEM_ACESSO } from "@/lib/zro/acesso";
import { BotaoSair } from "./conta/sair";

/**
 * Conta ligada à Absolute ZRO sem a SOBEDESCE liberada pelo admin de lá (lib/zro/acesso.ts): a pessoa está logada,
 * mas as funções da conta ficam fechadas. "Já liberaram" religa pela Absolute ZRO, que traz a lista nova de produtos.
 */
export function SemAcessoZro({ volta }: { volta: string }) {
  return (
    <Moldura estreita icone={<LockKeyhole />} titulo="Acesso ainda não liberado" subtitulo={MENSAGEM_SEM_ACESSO}>
      <a href={FERRAMENTAS_ZRO} className={buttonClasses({ variant: "primary", size: "lg", className: "w-full" })}>
        Ver na Absolute ZRO
      </a>
      <p className="mt-3 text-center text-[13px] leading-relaxed text-pretty text-ink-3">Quem libera é o admin da sua organização.</p>
      <BotaoZro modo="vincular" volta={volta} className="mt-8 w-full">
        Já liberaram? Atualizar
      </BotaoZro>
      <div className="mt-8 flex justify-center">
        <BotaoSair />
      </div>
    </Moldura>
  );
}

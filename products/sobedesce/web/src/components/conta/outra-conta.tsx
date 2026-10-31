import { buttonClasses } from "@/components/ui/button";
import { cn } from "@/lib/cn";
import { BOTAO_ENTRAR_NESSA_CONTA, CAMINHO_TROCAR_CONTA, LINK_USAR_OUTRA_CONTA } from "@/lib/zro/ligar";

/**
 * "Usar outra conta": link discreto que faz a Absolute ZRO pedir a conta de novo (prompt=login), em vez de reaproveitar
 * a sessão aberta lá. `href`: o /api/zro/entrar do modo da tela, com &trocar=1.
 */
export function UsarOutraConta({ href, className }: { href: string; className?: string }) {
  return (
    <a href={href} className={cn("toque rounded-full text-[14px] text-ink-2 underline-offset-4 hover:text-ink hover:underline", className)} data-usar-outra-conta>
      {LINK_USAR_OUTRA_CONTA}
    </a>
  );
}

/**
 * "Entrar nessa conta" (lib/zro/outra-conta.ts): um POST sem campos. O servidor só troca a sessão com o selo que o
 * callback guardou; `email` é o da Absolute ZRO que acabou de entrar, para a pessoa saber para onde vai.
 */
export function EntrarNessaConta({ email, className }: { email: string; className?: string }) {
  return (
    <form method="post" action={CAMINHO_TROCAR_CONTA} className={cn("grid w-full justify-items-center gap-2", className)} data-entrar-nessa-conta>
      <button type="submit" className={buttonClasses({ variant: "primary", size: "lg", className: "w-full sm:w-auto sm:min-w-[300px]" })}>
        {BOTAO_ENTRAR_NESSA_CONTA}
      </button>
      <p className="text-[13px] text-ink-3">{email}</p>
    </form>
  );
}

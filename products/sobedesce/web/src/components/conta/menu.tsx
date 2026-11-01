import Link from "next/link";
import { LogOut, Shield, Upload } from "lucide-react";
import { buttonClasses } from "@/components/ui/button";
import { LinkZ } from "./abas";
import { BotaoSet } from "./aba-set";
import { CENTRAL_ZRO } from "@/lib/site";

/**
 * Ações da área logada, à direita do cabeçalho: enviar (o uso principal), usar no computador (pela Absolute ZRO) e sair. `admin`: link para /admin.
 * `sair`: false onde a página já tem o próprio "Sair da conta" (em /conta), para não ter dois.
 */
export function MenuConta({ admin = false, sair = true, naZ = false }: { admin?: boolean; sair?: boolean; naZ?: boolean } = {}) {
  return (
    <nav aria-label="Plataforma" className="flex items-center gap-1.5 sm:gap-2">
      <Link href="/app/" className={buttonClasses({ variant: "primary", size: "sm" })}>
        <Upload aria-hidden="true" />
        Enviar
      </Link>
      {/* o Set (aparece quando responde) e a Z, discretos, ao lado das ações; nunca a primeira tela (aba-set.tsx, abas.tsx) */}
      <BotaoSet />
      <LinkZ atual={naZ} />
      {admin ? (
        <Link href="/admin" className={buttonClasses({ variant: "ghost", size: "sm", className: "px-3" })} aria-label="Admin">
          <Shield aria-hidden="true" />
          <span className="hidden sm:inline">Admin</span>
        </Link>
      ) : null}
      <span className="hidden sm:contents">
        <a href={CENTRAL_ZRO} className={buttonClasses({ variant: "ghost", size: "sm" })} title="Use no computador com a Absolute ZRO">
          No computador
        </a>
      </span>
      {sair ? (
        <Link href="/sair" className={buttonClasses({ variant: "ghost", size: "sm", className: "px-3" })} aria-label="Sair">
          <LogOut aria-hidden="true" />
          <span className="hidden sm:inline">Sair</span>
        </Link>
      ) : null}
    </nav>
  );
}

import Link from "next/link";
import { LogOut, Shield, Upload } from "lucide-react";
import { buttonClasses } from "@/components/ui/button";
import { LinkZ } from "./abas";

/**
 * Ações da área logada, à direita do cabeçalho: enviar (o uso principal), baixar o app e sair. `admin`: link para /admin.
 * `sair`: false onde a página já tem o próprio "Sair da conta" (em /conta), para não ter dois.
 */
export function MenuConta({ admin = false, sair = true, naZ = false }: { admin?: boolean; sair?: boolean; naZ?: boolean } = {}) {
  return (
    <nav aria-label="Plataforma" className="flex items-center gap-1.5 sm:gap-2">
      <Link href="/app/" className={buttonClasses({ variant: "primary", size: "sm" })}>
        <Upload aria-hidden="true" />
        Enviar
      </Link>
      {/* a Z, discreta: um anel ao lado das ações, nunca a primeira tela (abas.tsx › LinkZ) */}
      <LinkZ atual={naZ} />
      {admin ? (
        <Link href="/admin" className={buttonClasses({ variant: "ghost", size: "sm", className: "px-3" })} aria-label="Admin">
          <Shield aria-hidden="true" />
          <span className="hidden sm:inline">Admin</span>
        </Link>
      ) : null}
      <span className="hidden sm:contents">
        <Link href="/#baixar" className={buttonClasses({ variant: "ghost", size: "sm" })}>
          Baixar app
        </Link>
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

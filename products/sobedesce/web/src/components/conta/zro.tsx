import { buttonClasses } from "@/components/ui/button";
import { cn } from "@/lib/cn";

/** Símbolo da Absolute ZRO, versão flat oficial (26/10/2026): uma cor só, herda a cor do texto. */
export function LogoZro({ className }: { className?: string }) {
  return (
    <svg className={cn("size-5 shrink-0", className)} viewBox="0 0 100 100" fill="currentColor" aria-hidden="true" focusable="false">
      <path d="M74.00 40.02C75.00 47.51 77.33 49.00 94.82 50.00C77.33 51.00 75.00 52.49 74.00 59.98C73.00 52.49 70.67 51.00 53.18 50.00C70.67 49.00 73.00 47.51 74.00 40.02Z" />
      <path fillRule="evenodd" d="M9.70 50.00a34.30 34.30 0 1 0 68.60 0a34.30 34.30 0 1 0 -68.60 0ZM18.30 50.00a25.70 25.70 0 1 0 51.40 0a25.70 25.70 0 1 0 -51.40 0Z" />
    </svg>
  );
}

/**
 * Link para o login único da Absolute ZRO (navegação de página inteira: <a>, não <Link>).
 * "entrar": entra na conta SOBEDESCE ligada (ou cria uma). "criar": o mesmo, abrindo direto a tela de criar conta
 * da Absolute ZRO. "vincular": liga a Absolute ZRO à conta aberta.
 */
export function BotaoZro({
  modo,
  volta,
  children,
  variant = "secondary",
  size = "lg",
  className,
}: {
  modo: "entrar" | "criar" | "vincular";
  volta?: string;
  children: React.ReactNode;
  variant?: "primary" | "secondary";
  size?: "sm" | "md" | "lg";
  className?: string;
}) {
  const q = new URLSearchParams({ modo });
  if (volta) q.set("volta", volta);
  return (
    <a href={`/api/zro/entrar?${q}`} className={buttonClasses({ variant, size, className: cn(className) })}>
      <LogoZro className="size-[18px]!" />
      {children}
    </a>
  );
}

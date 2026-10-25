import Image from "next/image";
import { buttonClasses } from "@/components/ui/button";
import { cn } from "@/lib/cn";

/** O "O" da Absolute ZRO (arte oficial da marca, sem redesenho). */
export function LogoZro({ className }: { className?: string }) {
  return <Image src="/absolute-zro-o.webp" alt="" aria-hidden width={20} height={18} unoptimized className={cn("rounded-[4px] bg-black p-[1px]", className)} />;
}

/**
 * Link para o login único da Absolute ZRO (navegação de página inteira: <a>, não <Link>).
 * "entrar": entra na conta SOBEDESCE ligada (ou cria uma). "vincular": liga a Absolute ZRO à conta aberta.
 */
export function BotaoZro({
  modo,
  volta,
  children,
  variant = "secondary",
  size = "lg",
  className,
}: {
  modo: "entrar" | "vincular";
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

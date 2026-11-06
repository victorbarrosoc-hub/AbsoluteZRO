import { cn } from "@/lib/cn";

/** O símbolo: duas barras, uma que sobe (violeta) e outra que desce (azul). */
export function LogoMark({ className }: { className?: string }) {
  return (
    <svg viewBox="0 0 24 24" className={cn("size-6", className)} aria-hidden="true">
      <rect x="0.5" y="0.5" width="23" height="23" rx="7" fill="#111113" />
      <path d="M9 6.5v8" stroke="#9B85FF" strokeWidth="3.6" strokeLinecap="round" />
      <path d="M15 9.5v8" stroke="#3D9CFF" strokeWidth="3.6" strokeLinecap="round" />
    </svg>
  );
}

export function Logo({ className }: { className?: string }) {
  return (
    <span className={cn("inline-flex items-center gap-2", className)}>
      <LogoMark />
      {/* O nome: SOBE pesado, DESCE fino, mesma cor (o contraste é só de peso). */}
      <span className="font-display text-[15px] tracking-[0.015em] text-ink">
        <b className="font-extrabold">SOBE</b>
        <span className="font-light">DESCE</span>
      </span>
    </span>
  );
}

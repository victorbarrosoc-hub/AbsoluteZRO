import { Cloud, HardDrive, Laptop, Monitor, Smartphone } from "lucide-react";

/**
 * Ficha de compatibilidade no topo da home: onde roda e com o que conversa, em ícones. Só o que o app faz hoje
 * (README e electron-builder.yml): .dmg universal, instalador do Windows, o app do celular pelo navegador, o Drive
 * (inclusive drives compartilhados) e qualquer cartão ou HD plugado no computador.
 */
const ITENS = [
  { icon: Laptop, nome: "Mac", sub: "Apple Silicon e Intel" },
  { icon: Monitor, nome: "Windows", sub: "10 e 11" },
  { icon: Smartphone, nome: "iPhone e Android", sub: "No navegador" },
  { icon: Cloud, nome: "Google Drive", sub: "Inclusive compartilhados" },
  { icon: HardDrive, nome: "Cartões e HDs", sub: "Qualquer câmera" },
] as const;

export function CompatStrip() {
  return (
    <ul aria-label="Funciona com" className="mx-auto mt-10 grid max-w-[22rem] grid-cols-2 gap-x-4 gap-y-4 sm:flex sm:max-w-none sm:flex-wrap sm:justify-center sm:gap-x-6 lg:mt-12 lg:justify-start">
      {ITENS.map((it) => (
        <li key={it.nome} className="flex items-center gap-2.5" title={`${it.nome} · ${it.sub}`}>
          <span className="grid size-9 place-items-center rounded-xl bg-surface-2 ring-1 ring-line">
            <it.icon className="size-[18px] text-ink" aria-hidden="true" />
          </span>
          <span className="grid text-left leading-tight">
            <span className="text-[13px] font-semibold text-ink">{it.nome}</span>
            <span className="text-[12px] text-ink-2">{it.sub}</span>
          </span>
        </li>
      ))}
    </ul>
  );
}

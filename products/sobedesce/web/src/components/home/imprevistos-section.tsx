import { BatteryLow, FileCheck2, HardDriveDownload, ListRestart, RefreshCcw, Unplug } from "lucide-react";
import { Card } from "./feature-card";
import { Container, SectionHeading } from "./section";

/**
 * "E se…": o que o SOBEDESCE faz quando o cartão dá trabalho (Cartões, Backup Automático). Cada cartão é um imprevisto
 * real do set e o que acontece, em uma linha. A bateria e o contador zerado vêm da 0.3.13 do app de computador
 * (src/backup/imprevistos.js); o resto já existia (docs/BACKUP-AUTOMATICO.md).
 */
const CASOS = [
  { icone: Unplug, titulo: "O cartão saiu no meio.", texto: "Espete de novo: continua de onde parou." },
  { icone: RefreshCcw, titulo: "O mesmo cartão, de novo.", texto: "Só o que é novo passa." },
  { icone: BatteryLow, titulo: "A bateria acabou gravando.", texto: "Avisa qual clipe ficou pela metade, antes de formatar." },
  { icone: ListRestart, titulo: "A câmera zerou a numeração.", texto: "Nada por cima: o repetido vai para uma pasta à parte." },
  { icone: HardDriveDownload, titulo: "O HD desconectou.", texto: "Espera ele voltar e segue sozinho." },
  { icone: FileCheck2, titulo: "Fechou tudo no meio da cópia.", texto: "Nada fica pela metade: o arquivo só ganha o nome depois de conferido." },
] as const;

export function ImprevistosSection() {
  return (
    <section id="e-se" aria-labelledby="e-se-titulo" className="scroll-mt-14 pb-20 sm:pb-28 2xl:pb-40">
      <Container>
        <SectionHeading id="e-se-titulo" eyebrow="E se…" tone="down" title="Pensado para o pior dia do set." />
        <ul className="mt-12 grid gap-4 sm:mt-16 sm:grid-cols-2 sm:gap-5 lg:grid-cols-3 2xl:gap-8">
          {CASOS.map((c, i) => (
            <li key={c.titulo} className="min-w-0">
              <Card className="grid h-full content-start gap-4" delay={i * 0.04}>
                <span className="grid size-11 place-items-center rounded-full bg-down/10 text-down-text" aria-hidden="true">
                  <c.icone className="size-5" strokeWidth={1.8} />
                </span>
                <div className="grid gap-1.5">
                  <h3 className="font-display text-[21px] leading-tight font-semibold tracking-[-0.02em] text-ink 2xl:text-[25px]">{c.titulo}</h3>
                  <p className="text-[16px] leading-[1.5] text-ink-2 2xl:text-[18px]">{c.texto}</p>
                </div>
              </Card>
            </li>
          ))}
        </ul>
      </Container>
    </section>
  );
}

/* eslint-disable @next/next/no-img-element -- anel e estrela com recorte alfa, posicionados à mão (sem otimização) */
import { ArrowUpRight, CircleCheck, MessageSquare, Sparkle, UserRound } from "lucide-react";
import { buttonClasses } from "@/components/ui/button";
import { Reveal } from "./motion";
import { Container } from "./section";

const FICHAS = [
  { icon: UserRound, texto: "Mesma conta", dica: "A mesma conta Absolute ZRO que você já usa." },
  { icon: MessageSquare, texto: "Conversas reunidas", dica: "Guardadas por plataforma e reunidas em absolutezro.com/ia." },
  { icon: CircleCheck, texto: "Você confere antes", dica: "Nenhuma ação sem você conferir." },
  { icon: Sparkle, texto: "1 crédito por resposta", dica: "Usa os créditos de IA do seu plano." },
] as const;

/**
 * O Z, a IA do ecossistema Absolute ZRO. Ainda não está dentro do SOBEDESCE: a seção diz que está chegando e leva a
 * absolutezro.com/ia. Anel e estrela em public/z; a estrela fica sobre o tubo, às 3 horas (globals.css, .z-estrela).
 */
export function ZSection() {
  return (
    <section id="z" aria-labelledby="z-titulo" className="scroll-mt-14 pb-20 sm:pb-28 2xl:pb-40">
      <Container>
        <Reveal className="mx-auto grid max-w-5xl items-center justify-items-center gap-8 rounded-[32px] bg-surface px-5 py-8 text-center ring-1 ring-line sm:grid-cols-[auto_1fr] sm:justify-items-start sm:gap-14 sm:p-14 sm:text-left">
          <div className="relative mr-[15%] aspect-square w-[116px] sm:mr-[13%] sm:w-[176px]" aria-hidden="true">
            <img className="absolute inset-0 size-full select-none" src="/z/anel.webp" alt="" width={560} height={560} loading="lazy" />
            <img className="z-estrela absolute select-none" src="/z/estrela.webp" alt="" width={400} height={400} loading="lazy" />
          </div>
          <div className="grid justify-items-center sm:justify-items-start">
            <p className="mb-4 inline-flex items-center gap-2 rounded-full px-3 py-1.5 text-[13px] font-semibold text-ink-2 ring-1 ring-line">
              <i className="size-[7px] rounded-full bg-up" aria-hidden="true" />
              Chegando ao SOBEDESCE
            </p>
            <h2 id="z-titulo" className="font-display text-[30px] leading-[1.08] font-semibold tracking-[-0.03em] text-balance text-ink sm:text-[44px]">
              Z. Uma IA para todo o ecossistema.
            </h2>
            <p className="mt-3 text-[17px] leading-[1.5] text-pretty text-ink-2 sm:text-[19px]">
              Vai acompanhar cada descarga conferida e ajudar a seguir para a sincronia e a edição.
            </p>
            <ul className="mt-6 mb-7 flex flex-wrap justify-center gap-1.5 sm:justify-start sm:gap-2" aria-label="Como o Z funciona">
              {FICHAS.map(({ icon: Icone, texto, dica }) => (
                <li key={texto} title={dica} className="inline-flex items-center gap-1.5 rounded-full bg-surface-2 px-2.5 py-1.5 text-[12.5px] font-semibold text-ink sm:px-3 sm:text-[13.5px]">
                  <Icone className="size-4 text-ink-2" aria-hidden="true" />
                  {texto}
                </li>
              ))}
            </ul>
            <a href="https://absolutezro.com/ia" rel="noopener" className={buttonClasses({ variant: "secondary", size: "md" })}>
              Conhecer o Z
              <ArrowUpRight aria-hidden="true" />
            </a>
          </div>
        </Reveal>
      </Container>
    </section>
  );
}

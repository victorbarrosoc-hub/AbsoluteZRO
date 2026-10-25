import Link from "next/link";
import { ArrowRight } from "lucide-react";
import { FluxoDemo } from "@/components/precos/fluxo-demo";
import { Reveal } from "./motion";
import { Container, SectionHeading } from "./section";

/** Produtora + Synquei: do cartão à timeline, com a mesma animação da página de preços. */
export function SynqueiSection() {
  return (
    <section
      id="synquei"
      aria-labelledby="synquei-titulo"
      className="scroll-mt-14 pb-20 sm:pb-28 2xl:pb-40"
    >
      <Container>
        <SectionHeading
          id="synquei-titulo"
          eyebrow="Produtora + Synquei"
          tone="up"
          title="Espetou o cartão. Abriu o DaVinci. Já está tudo lá."
        >
          <p>
            O SOBEDESCE copia o cartão para os HDs e confere cada arquivo. O
            Synquei sincroniza câmeras e gravador pelo som e manda para o
            DaVinci, em pastas por diária, câmera, dono e cartão. Só entra o que
            é novo.
          </p>
        </SectionHeading>
        <Reveal
          className="mx-auto mt-12 grid max-w-[1280px] gap-6 sm:mt-16"
          delay={0.06}
        >
          <FluxoDemo />
          <Link
            href="/precos"
            className="inline-flex w-fit items-center gap-1.5 justify-self-center text-[15px] font-medium text-up-text hover:underline"
          >
            Ver planos e preços
            <ArrowRight className="size-4" aria-hidden="true" />
          </Link>
        </Reveal>
      </Container>
    </section>
  );
}

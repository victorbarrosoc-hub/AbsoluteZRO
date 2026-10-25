import type { Metadata } from "next";
import { Planos } from "@/components/precos/planos";
import { SiteFooter } from "@/components/site/footer";
import { SiteHeader } from "@/components/site/header";

export const metadata: Metadata = {
  title: "Preços: Grátis, Pro, Produtora e Produtora + Synquei",
  description:
    "Grátis para começar, Pro para quem entrega arquivo pesado, Produtora com o Backup Automático do set e Produtora + Synquei para ir do cartão à timeline. Durante o beta, tudo liberado.",
  alternates: { canonical: "/precos" },
};

export default function PrecosPage() {
  return (
    <>
      <SiteHeader />
      <main className="px-5 pt-14 pb-24 sm:px-8 sm:pt-20 sm:pb-32">
        <div className="mx-auto max-w-[1280px]">
          <header className="max-w-[720px]">
            <h1 className="font-display text-[38px] leading-[1.05] font-semibold tracking-[-0.03em] text-ink sm:text-[52px]">Do primeiro envio ao set inteiro</h1>
            <p className="mt-5 text-[17px] leading-relaxed text-pretty text-ink-2 sm:text-[19px]">
              Comece grátis. Quando o cartão precisar passar sozinho, conferido, a Produtora faz isso por você. E se a edição é no mesmo dia, o Synquei entrega tudo
              sincronizado no DaVinci.
            </p>
          </header>
          <Planos />
        </div>
      </main>
      <SiteFooter />
    </>
  );
}

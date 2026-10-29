/* eslint-disable @next/next/no-img-element -- anel e estrela com recorte alfa, posicionados à mão (sem otimização) */
import { ArrowRight, ArrowUpRight, CircleCheck, MessageSquare, Sparkle, UserRound } from 'lucide-react'
import Link from 'next/link'
import { buttonClasses } from '@/components/ui/button'
import { Reveal } from './motion'
import { Container } from './section'

const FICHAS = [
  { icon: UserRound, texto: 'Mesma conta', dica: 'A mesma conta Absolute ZRO que você já usa.' },
  { icon: MessageSquare, texto: 'Conversas reunidas', dica: 'Guardadas por plataforma e reunidas em absolutezro.com/ia.' },
  { icon: CircleCheck, texto: 'Você confere antes', dica: 'Nenhuma ação sem você conferir.' },
  { icon: Sparkle, texto: '1 crédito por resposta', dica: 'Usa os créditos de IA do seu plano.' },
] as const

/**
 * A Z, a IA do ecossistema Absolute ZRO. Desde 27/10/2026 ela tem aba própria, a primeira da área logada (/z,
 * components/conta/painel-z.tsx, repasse em lib/zro/ia.ts): a seção diz que está no SOBEDESCE e leva à aba;
 * "Conhecer a Z" fica como segunda ação.
 * Anel e estrela em public/z; a estrela fica sobre o tubo, às 3 horas, e contorna o anel como a Z do HUB (globals.css,
 * .z-orbita e .z-estrela). No celular o anel fica no centro da coluna; a estrela passa por fora, na margem do cartão.
 */
export function ZSection() {
  return (
    <section id="z" aria-labelledby="z-titulo" className="scroll-mt-14 pb-20 sm:pb-28 2xl:pb-40">
      <Container>
        <Reveal className="mx-auto grid max-w-5xl items-center justify-items-center gap-8 rounded-[32px] bg-surface px-5 py-8 text-center ring-1 ring-line sm:grid-cols-[auto_1fr] sm:justify-items-start sm:gap-14 sm:p-14 sm:text-left">
          <div className="z-cena relative aspect-square w-[128px] sm:mr-[13%] sm:w-[176px]" aria-hidden="true">
            <img className="absolute inset-0 size-full select-none" src="/z/anel.webp" alt="" width={560} height={560} loading="lazy" />
            <span className="z-orbita absolute inset-0">
              <img className="z-estrela absolute select-none" src="/z/estrela.webp" alt="" width={400} height={400} loading="lazy" />
            </span>
          </div>
          <div className="grid justify-items-center sm:justify-items-start">
            <p className="mb-4 inline-flex items-center gap-2 rounded-full px-3 py-1.5 text-[13px] font-semibold text-ink-2 ring-1 ring-line">
              <i className="size-[7px] rounded-full bg-up" aria-hidden="true" />
              Agora no SOBEDESCE
            </p>
            <h2 id="z-titulo" className="font-display text-[30px] leading-[1.08] font-semibold tracking-[-0.03em] text-balance text-ink sm:text-[44px]">
              Z. Uma IA para todo o ecossistema.
            </h2>
            <p className="mt-3 text-[17px] leading-[1.5] text-pretty text-ink-2 sm:text-[19px]">Tira dúvidas sobre descargas e entregas, numa aba só dela.</p>
            <ul className="mt-6 mb-7 flex flex-wrap justify-center gap-1.5 sm:justify-start sm:gap-2" aria-label="Como a Z funciona">
              {FICHAS.map(({ icon: Icone, texto, dica }) => (
                <li
                  key={texto}
                  title={dica}
                  className="inline-flex items-center gap-1.5 rounded-full bg-surface-2 px-2.5 py-1.5 text-[12.5px] font-semibold text-ink sm:px-3 sm:text-[13.5px]"
                >
                  <Icone className="size-4 text-ink-2" aria-hidden="true" />
                  {texto}
                </li>
              ))}
            </ul>
            <div className="flex flex-wrap justify-center gap-3 sm:justify-start">
              <Link href="/z" className={buttonClasses({ variant: 'primary', size: 'md' })}>
                Conversar com a Z
                <ArrowRight aria-hidden="true" />
              </Link>
              <a href="https://absolutezro.com/ia" rel="noopener" className={buttonClasses({ variant: 'secondary', size: 'md' })}>
                Conhecer a Z
                <ArrowUpRight aria-hidden="true" />
              </a>
            </div>
          </div>
        </Reveal>
      </Container>
    </section>
  )
}

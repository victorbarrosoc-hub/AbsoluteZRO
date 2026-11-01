import Link from 'next/link'
import { ArrowRight, Smartphone } from 'lucide-react'
import { CentralZro } from '@/components/central-zro'
import { buttonClasses } from '@/components/ui/button'
import { cn } from '@/lib/cn'
import { ROTAS } from '@/lib/site'
import { Reveal } from './motion'
import { Container, SectionHeading } from './section'

/**
 * Onde usar: no computador, só pela central Absolute ZRO (01/11/2026; nada de instalador no site), e no celular pelo
 * navegador. O cartão do sistema do visitante ganha destaque (data-plat no contêiner da página).
 */
export function PlatformsSection() {
  return (
    <section id="plataformas" aria-labelledby="plataformas-titulo" className="scroll-mt-14 bg-surface-2 py-20 sm:py-28 2xl:py-40">
      {/* endereço antigo (/#baixar) cai aqui também */}
      <span id="baixar" className="block scroll-mt-14" aria-hidden="true" />
      <Container>
        <SectionHeading id="plataformas-titulo" eyebrow="Plataformas" title="Onde você estiver." />

        <div className="mx-auto mt-12 grid max-w-5xl gap-4 sm:mt-16 sm:gap-5 md:grid-cols-[3fr_2fr] xl:max-w-none 2xl:gap-8">
          <Reveal
            className={cn(
              'rounded-[24px] bg-surface p-6 ring-1 ring-line sm:p-8',
              'group-data-[plat=mac]/plat:ring-2 group-data-[plat=mac]/plat:ring-ink group-data-[plat=windows]/plat:ring-2 group-data-[plat=windows]/plat:ring-ink',
            )}
          >
            <CentralZro />
          </Reveal>
          <Reveal
            delay={0.06}
            className={cn(
              'grid content-start gap-6 rounded-[24px] bg-surface p-6 ring-1 ring-line sm:p-8',
              'group-data-[plat=ios]/plat:ring-2 group-data-[plat=ios]/plat:ring-ink group-data-[plat=android]/plat:ring-2 group-data-[plat=android]/plat:ring-ink',
            )}
          >
            <span className="grid size-12 place-items-center rounded-2xl bg-surface-2">
              <Smartphone className="size-6 text-ink" aria-hidden="true" />
            </span>
            <div className="grid gap-1">
              <h3 className="font-display text-[22px] font-semibold tracking-[-0.02em] text-ink">iPhone e Android</h3>
              <p className="text-[14px] text-ink-2">Pelo navegador, sem instalar</p>
            </div>
            <Link href={ROTAS.celular} className={buttonClasses({ variant: 'secondary', size: 'md', className: 'w-full' })}>
              Abrir no celular
              <ArrowRight aria-hidden="true" />
            </Link>
          </Reveal>
        </div>
      </Container>
    </section>
  )
}

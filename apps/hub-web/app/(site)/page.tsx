import Link from 'next/link'
import { Card, Pill, ProductMark } from '@zro/ui'
import { CycleO } from '@/components/cycle-o'
import { publicCatalog } from '@/lib/data/catalog'

export const dynamic = 'force-dynamic'

const STAGE: Record<string, { label: string; tone: 'ok' | 'accent' | 'faint' }> = {
  active: { label: 'Disponível', tone: 'ok' },
  beta: { label: 'Beta', tone: 'accent' },
  coming_soon: { label: 'Em desenvolvimento', tone: 'faint' },
  disabled: { label: 'Desativada', tone: 'faint' },
}

export default async function Landing() {
  const { products } = await publicCatalog()
  return (
    <>
      <section className="hero" aria-labelledby="hero-title">
        <div className="hero__text">
          <p className="zro-eyebrow">Ecossistema audiovisual</p>
          <h1 className="hero__title" id="hero-title">
            Da oportunidade à entrega.
            <span className="zro-serif">Um só fluxo.</span>
          </h1>
          <p className="hero__lead">
            Um login para contratar, roteirizar, fazer backup, organizar, editar, tratar o som e entregar. Cada ferramenta mantém o seu jeito; o HUB liga as
            etapas pelo mesmo projeto.
          </p>
          <div className="row">
            <Link className="zro-btn zro-btn--primary" href="/criar-conta">
              Criar conta Absolute ZRO
            </Link>
            <Link className="zro-btn zro-btn--ghost" href="/planos">
              Ver planos
            </Link>
          </div>
        </div>
        <div className="hero__art" role="img" aria-label="Eclipse azul sobre fundo preto, o O da marca" />
      </section>

      <section className="section" id="ciclo" aria-labelledby="ciclo-title">
        <div className="section__head">
          <p className="zro-eyebrow">Ciclo do O</p>
          <h2 id="ciclo-title">Comece em qualquer ponto do círculo.</h2>
          <p>A ordem é sugestão, não obrigação. Use uma ferramenta só ou o ciclo inteiro; o projeto guarda o que cada etapa entregou.</p>
        </div>
        <Card tone="stage">
          <CycleO
            labelledBy="ciclo-title"
            title="Ciclo do O"
            subtitle="7 etapas, 1 projeto"
            steps={products.map((p) => ({
              key: p.id as string,
              name: p.name as string,
              role: p.role_in_flow as string,
              state: p.stage === 'coming_soon' ? 'unavailable' : 'ready',
              label: STAGE[p.stage as string]?.label,
              note: `${p.role_in_flow}${p.stage === 'coming_soon' ? ' · em desenvolvimento' : ''}`,
            }))}
          />
        </Card>
      </section>

      <section className="section" id="ferramentas" aria-labelledby="ferr-title">
        <div className="section__head">
          <p className="zro-eyebrow">Ferramentas</p>
          <h2 id="ferr-title">Sete marcas, uma conta.</h2>
          <p>Ferramentas em desenvolvimento aparecem como tal: nada de recurso de fachada.</p>
        </div>
        <div className="grid">
          {products.map((p) => (
            <Card key={p.id as string}>
              <div className="product-card">
                <ProductMark productId={p.id as string} name={p.name as string} size={40} />
                <div className="product-card__body">
                  <h3>
                    {p.name as string}
                    {p.provisional_name ? <span className="zro-faint"> · nome provisório</span> : null}
                  </h3>
                  <p className="zro-mute">{p.role_in_flow as string}</p>
                </div>
                <div className="product-card__foot">
                  <Pill tone={STAGE[p.stage as string]?.tone ?? 'faint'}>{STAGE[p.stage as string]?.label ?? (p.stage as string)}</Pill>
                </div>
              </div>
            </Card>
          ))}
        </div>
      </section>

      <section className="beam" aria-labelledby="beam-title">
        <p className="zro-eyebrow">Absolute ZRO HUB</p>
        <h2 id="beam-title">
          Seus dados, seus acessos. <span className="zro-serif">Nada além do contratado.</span>
        </h2>
        <p className="zro-mute">Permissões conferidas no servidor em toda ação. Arquivos originais nunca são apagados ou sobrescritos pelo HUB.</p>
        <div>
          <Link className="zro-btn zro-btn--primary" href="/criar-conta">
            Começar
          </Link>
        </div>
      </section>
    </>
  )
}

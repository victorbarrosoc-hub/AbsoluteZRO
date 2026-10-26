import Link from 'next/link'
import type { CSSProperties } from 'react'
import { ProductMark } from '@zro/ui'
import { BrandSymbol } from '@/components/brand-symbol'
import { publicCatalog } from '@/lib/data/catalog'

export const dynamic = 'force-dynamic'

/** Uma linha por ferramenta, curta, na faixa logo abaixo do topo. */
const LINE: Record<string, string> = {
  'carro-do-freela': 'Equipe e oportunidades',
  tpeasy: 'Teleprompter',
  sobedesce: 'Cópia e backup conferidos',
  synquei: 'Organização e sincronia',
  'ai-edit': 'Edição com IA',
  nossom: 'Tratamento de som',
  finishing: 'Cor e entrega',
}

/** Site oficial quando o catálogo ainda não tem o endereço (Revela e AEON já estão no ar nos subdomínios). */
const SITE: Record<string, string> = {
  'ai-edit': 'https://aeon.absolutezro.com',
  finishing: 'https://revela.absolutezro.com',
}

export default async function Landing() {
  const { products } = await publicCatalog()
  // Cada palavra sobe na sua vez; o espaço fica fora do bloco para não sumir.
  const words = (text: string, from: number) =>
    text.split(' ').flatMap((w, i) => [
      i > 0 ? ' ' : '',
      <span key={w + i} className="phero__word" style={{ '--i': from + i } as CSSProperties}>
        {w}
      </span>,
    ])
  return (
    <>
      {/* Topo de cinema: a paisagem em preto e branco com o símbolo esculpido em metal sobre a rocha (Higgsfield, fiel à marca). */}
      <section className="phero" aria-labelledby="hero-title">
        <div className="phero__scene">
          <picture>
            <source media="(max-width: 700px)" srcSet="/brand/home-paisagem-sm.webp" />
            <img
              className="phero__photo"
              src="/brand/home-paisagem.webp"
              alt="O símbolo da Absolute ZRO, um anel com a centelha, em metal sobre uma rocha diante do mar"
              width={2400}
              height={1357}
              fetchPriority="high"
            />
          </picture>
        </div>
        <div className="phero__text">
          <h1 className="phero__title" id="hero-title">
            <span className="phero__thin">{words('O futuro começa', 0)}</span>
            <span className="phero__bold">{words('do zero.', 3)}</span>
          </h1>
          <p className="phero__lead">Ferramentas e pessoas para todas as etapas da produção audiovisual. Do briefing à entrega final.</p>
          <div className="phero__ctas">
            <Link className="glass-btn glass-btn--ink" href="#ecossistema">
              Conheça o ecossistema
            </Link>
            <Link className="glass-btn" href="/planos">
              Ver planos
            </Link>
          </div>
        </div>
        <ul className="phero__side" aria-hidden="true">
          <li>Pessoas</li>
          <li>Ferramentas</li>
          <li>Fluxo</li>
          <li>Resultado</li>
        </ul>
      </section>

      {/* As ferramentas numa faixa só, discreta: ícone, nome e uma linha. */}
      <section className="pstrip" id="ecossistema" aria-label="Ferramentas">
        <ul className="pstrip__list">
          {products.map((p, i) => {
            const id = p.id as string
            const name = p.name as string
            const site = (p.external_url as string | null) || SITE[id] || null
            const inner = (
              <>
                <ProductMark productId={id} name={name} size={40} />
                <span className="pstrip__text">
                  <span className="pstrip__name">{name}</span>
                  <span className="pstrip__line">{LINE[id] ?? (p.role_in_flow as string)}</span>
                </span>
                <span className="pstrip__go" aria-hidden="true">
                  ›
                </span>
              </>
            )
            return (
              <li key={id} style={{ '--i': i } as CSSProperties}>
                {site ? (
                  <a className="pstrip__card" href={site} target="_blank" rel="noopener noreferrer">
                    {inner}
                    <span className="zro-sr-only"> (abre o site oficial em nova aba)</span>
                  </a>
                ) : (
                  <span className="pstrip__card">{inner}</span>
                )}
              </li>
            )
          })}
        </ul>
        <p className="pstrip__rule" aria-hidden="true">
          <span>Ferramentas que se conectam</span>
          <i />
          <span>Um ecossistema completo</span>
        </p>
      </section>

      {/* O plano que abre tudo. */}
      <section className="pcycle reveal" aria-labelledby="ciclo-title">
        <div className="pcycle__text">
          <h2 id="ciclo-title" className="pcycle__title">
            O Ciclo do O
          </h2>
          <p className="pcycle__lead">Acesso a todo o ecossistema com uma única assinatura.</p>
        </div>
        <div className="pcycle__rings" aria-hidden="true">
          {[0, 1, 2, 3].map((i) => (
            <i key={i} style={{ '--i': i } as CSSProperties} />
          ))}
        </div>
        <Link className="glass-btn pcycle__cta" href="/planos">
          Conheça o plano completo
        </Link>
      </section>

      {/* O painel de verdade: telas reais do HUB. */}
      <section className="section section--center" aria-labelledby="hub-title">
        <div className="section__head section__head--wide reveal">
          <h2 id="hub-title" className="display-2 atitle">
            <span className="atitle__thin">Tudo num painel.</span>
            <span className="atitle__bold">No computador e no celular.</span>
          </h2>
        </div>
        <div className="showcase">
          <figure className="ahero__product ahero__product--claro">
            <img src="/brand/produto-hub-claro.webp" alt="O HUB da Absolute ZRO aberto num MacBook e num iPhone" width={2400} height={1500} loading="lazy" />
          </figure>
          <figure className="ahero__product ahero__product--escuro">
            <img src="/brand/produto-hub-escuro.webp" alt="O HUB da Absolute ZRO aberto num MacBook e num iPhone" width={2400} height={1500} loading="lazy" />
          </figure>
        </div>
      </section>

      <section className="closing reveal" aria-labelledby="closing-title">
        <BrandSymbol className="closing__mark bsym--scroll" />
        <h2 id="closing-title" className="display-2 atitle">
          <span className="atitle__thin">Seus dados, seus acessos.</span>
          <span className="atitle__bold">Nada além do contratado.</span>
        </h2>
        <p className="closing__lead">Permissões conferidas no servidor em toda ação. Arquivos originais nunca são apagados ou sobrescritos pelo HUB.</p>
        <div className="closing__ctas">
          <Link className="glass-btn glass-btn--ink" href="/criar-conta">
            Começar do zero
          </Link>
          <Link className="glass-btn" href="/planos">
            Ver planos
          </Link>
        </div>
      </section>
    </>
  )
}

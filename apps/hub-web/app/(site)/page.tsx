import Link from 'next/link'
import type { ReactNode } from 'react'
import type { CSSProperties } from 'react'
import { Pill, ProductMark, ZroSymbol } from '@zro/ui'
import { productColor } from '@/components/app-tile'
import { BrandSymbol } from '@/components/brand-symbol'
import { MotionGate } from '@/components/motion-gate'
import { PointerTilt } from '@/components/pointer-tilt'
import { publicCatalog } from '@/lib/data/catalog'
import { hasDesktopInstaller } from '@/lib/downloads'

export const dynamic = 'force-dynamic'

const STAGE: Record<string, { label: string; tone: 'ok' | 'accent' | 'faint' }> = {
  active: { label: 'Disponível', tone: 'ok' },
  beta: { label: 'Beta', tone: 'accent' },
  coming_soon: { label: 'Em desenvolvimento', tone: 'faint' },
  disabled: { label: 'Desativada', tone: 'faint' },
}

/** Frase de cada marca, na voz dela. */
const TAGLINE: Record<string, string> = {
  'carro-do-freela': 'Quem está livre, em cada data.',
  tpeasy: 'Fale olhando para a câmera.',
  sobedesce: 'Cada cartão copiado e conferido.',
  synquei: 'Solta o cartão. Sai sincronizado.',
  'ai-edit': 'A IA propõe. Você aprova.',
  nossom: 'Seu som, em outra escala.',
  finishing: 'Revela a cor que você quer.',
}

const bars = (n: number, seed: number) =>
  Array.from({ length: n }, (_, i) => 18 + Math.round(Math.abs(Math.sin((i + 1) * seed) * 0.6 + Math.sin((i + 3) * seed * 0.37) * 0.4) * 82))

/** Telas reais de cada app (capturas públicas de 25/10/2026 em MacBook e iPhone; ver scripts/marca/README.md). */
const SHOT: Record<string, string> = {
  'carro-do-freela': 'O Carro do Freela aberto num MacBook e num iPhone',
  tpeasy: 'O TPeasy aberto num MacBook e num iPhone',
  sobedesce: 'O SOBEDESCE aberto num MacBook e num iPhone',
  synquei: 'O Synquei aberto num MacBook e num iPhone',
  nossom: 'O NOSSOM aberto num MacBook e num iPhone',
}

function Lane({ id, name, status, children, tone }: { id: string; name: string; status: string; children: ReactNode; tone?: 'live' | 'done' | 'soon' }) {
  return (
    <li className={`suite__lane suite__lane--${tone ?? 'done'}`} style={productColor(id)}>
      <span className="suite__who">
        <ProductMark productId={id} name={name} size={26} />
        <span>{name}</span>
      </span>
      <span className="suite__track">{children}</span>
      <span className="suite__status">{status}</span>
    </li>
  )
}

export default async function Landing() {
  const { products } = await publicCatalog()
  // Cada palavra sobe na sua vez; o espaço fica fora do bloco para não sumir.
  const words = (text: string, from: number) =>
    text.split(' ').flatMap((w, i) => [
      i > 0 ? ' ' : '',
      <span key={w + i} className="shero__word" style={{ '--i': from + i } as CSSProperties}>
        {w}
      </span>,
    ])
  return (
    <>
      {/* O símbolo é a peça principal (pedido do titular, 26/10/2026): desenha-se, pisca a estrela e segue o ponteiro. */}
      <section className="shero" aria-labelledby="hero-title">
        <PointerTilt className="shero__stage" max={12}>
          <span className="shero__halo" aria-hidden="true" />
          <BrandSymbol className="shero__symbol" title="Absolute ZRO" />
        </PointerTilt>
        <div className="shero__text">
          <h1 className="ahero__title shero__title" id="hero-title">
            <span className="ahero__thin">{words('O futuro começa', 0)}</span>
            <span className="ahero__bold">{words('do zero.', 3)}</span>
          </h1>
          <p className="ahero__lead shero__lead">Uma conta. Todas as ferramentas.</p>
          <div className="ahero__ctas shero__ctas">
            <Link className="glass-btn glass-btn--ink" href="/criar-conta">
              Criar conta
            </Link>
            <Link className="glass-btn" href="#ferramentas">
              Ver as ferramentas
            </Link>
          </div>
        </div>
        <span className="shero__cue" aria-hidden="true" />
      </section>

      {/* O produto de verdade: telas reais do HUB, uma foto para cada tema. Entra crescendo com a rolagem. */}
      <section className="showcase" aria-label="O HUB no MacBook e no iPhone">
        <figure className="ahero__product ahero__product--claro">
          <img src="/brand/produto-hub-claro.webp" alt="O HUB da Absolute ZRO aberto num MacBook e num iPhone" width={2400} height={1500} />
        </figure>
        <figure className="ahero__product ahero__product--escuro">
          <img src="/brand/produto-hub-escuro.webp" alt="O HUB da Absolute ZRO aberto num MacBook e num iPhone" width={2400} height={1500} loading="lazy" />
        </figure>
      </section>

      {/* Ciclo do O: as ferramentas entram em órbita do anel enquanto a página rola. */}
      <section className="zorbit" id="ciclo" aria-labelledby="ciclo-title">
        <div className="zorbit__sticky">
          <h2 id="ciclo-title" className="zro-sr-only">
            Ciclo do O
          </h2>
          <div className="zorbit__ring" style={{ '--n': products.length } as CSSProperties}>
            <ZroSymbol className="zorbit__symbol" size={240} />
            <ul className="zorbit__apps" aria-label="Ferramentas do Ciclo do O">
              {products.map((p, i) => (
                <li
                  key={p.id as string}
                  className="zorbit__app"
                  style={{ '--a': `${(i * 360) / products.length - 90}deg`, '--i': i } as CSSProperties}
                  title={`${p.name as string} · ${p.role_in_flow as string}`}
                >
                  <span className="zorbit__chip">
                    <ProductMark productId={p.id as string} name={p.name as string} size={58} />
                  </span>
                  <span className="zorbit__name">{p.name as string}</span>
                </li>
              ))}
            </ul>
          </div>
          <div className="zorbit__captions">
            <p className="zorbit__cap zorbit__cap--1 atitle">
              <span className="atitle__thin">{products.length} ferramentas.</span>
            </p>
            <p className="zorbit__cap zorbit__cap--2 atitle">
              <span className="atitle__thin">Um só</span> <span className="atitle__bold">ecossistema.</span>
            </p>
            <p className="zorbit__cap zorbit__cap--3 atitle">
              <span className="atitle__thin">Comece em</span> <span className="atitle__bold">qualquer ponto.</span>
            </p>
          </div>
        </div>
      </section>

      <section className="aproject reveal" aria-labelledby="projeto-title">
        <div className="section__head section__head--center">
          <h2 id="projeto-title" className="display-2 atitle">
            <span className="atitle__thin">Um projeto.</span> <span className="atitle__bold">Todas as etapas.</span>
          </h2>
          <p>Do job à entrega, cada ferramenta faz a sua parte e o projeto guarda o que ela entregou.</p>
        </div>
        <MotionGate className="suite" as="div">
          <div className="suite__head">
            <span className="suite__label">Exemplo · Show de lançamento</span>
            <span className="suite__live">
              <span className="suite__dot" />
              Sincronizando
            </span>
          </div>
          <ol className="suite__lanes" aria-label="Exemplo de projeto passando pelas ferramentas">
            <Lane id="carro-do-freela" name="Carro do Freela" status="Equipe fechada">
              <span className="suite__chip">Câmera</span>
              <span className="suite__chip">Som</span>
              <span className="suite__chip">Drone</span>
            </Lane>
            <Lane id="tpeasy" name="TPeasy" status="Roteiro v3">
              <span className="suite__lines">
                <i />
                <i />
                <i />
              </span>
            </Lane>
            <Lane id="sobedesce" name="SOBEDESCE" status="2 cópias conferidas">
              <span className="suite__fill" />
            </Lane>
            <Lane id="synquei" name="Synquei" status="Sincronizando" tone="live">
              <span className="suite__wave">
                {bars(36, 1.3).map((h, i) => (
                  <i key={i} style={{ height: `${h}%` }} />
                ))}
              </span>
            </Lane>
            <Lane id="nossom" name="NOSSOM" status="Próxima etapa" tone="soon">
              <span className="suite__ghost" />
            </Lane>
          </ol>
          <div className="suite__foot">
            <span>
              <strong>Um projeto</strong>
              Tudo que cada etapa entregou
            </span>
            <span>
              <strong>Prova real</strong>
              Checksum por destino, nada de “parece que foi”
            </span>
          </div>
        </MotionGate>
      </section>

      <section className="section section--center" id="ferramentas" aria-labelledby="ferr-title">
        <div className="section__head section__head--wide reveal">
          <p className="zro-eyebrow">Ferramentas</p>
          <h2 id="ferr-title" className="display-2 atitle">
            <span className="atitle__thin">Sete marcas.</span>
            <span className="atitle__bold">Uma conta.</span>
          </h2>
          <p>Cada uma com a própria cara. Em desenvolvimento aparece como tal: nada de recurso de fachada.</p>
        </div>
        <PointerTilt className="tiles" selector=".tile" max={4}>
          {/* Primeiro o que já tem tela de verdade; em desenvolvimento fica junto, no fim. */}
          {[...products.filter((p) => SHOT[p.id as string]), ...products.filter((p) => !SHOT[p.id as string])].map((p) => {
            const id = p.id as string
            const name = p.name as string
            const shot = SHOT[id]
            const site = p.external_url as string | null
            const stage = STAGE[p.stage as string]
            return (
              <article key={id} className={`tile reveal${shot ? '' : ' tile--soon'}`} style={productColor(id)} aria-labelledby={`tile-${id}`}>
                <div className="tile__text">
                  <ProductMark productId={id} name={name} size={shot ? 52 : 44} />
                  <p className="tile__name">
                    {name}
                    {p.provisional_name ? <span className="zro-faint"> · nome provisório</span> : null}
                  </p>
                  <h3 id={`tile-${id}`} className="tile__title">
                    {TAGLINE[id] ?? (p.role_in_flow as string)}
                  </h3>
                  <p className="tile__lead">{p.role_in_flow as string}</p>
                  <div className="tile__links">
                    {stage && <Pill tone={stage.tone}>{stage.label}</Pill>}
                    {site && p.stage !== 'coming_soon' && (
                      <a className="more-link" href={site} target="_blank" rel="noopener noreferrer">
                        Saiba mais<span aria-hidden="true"> ›</span>
                        <span className="zro-sr-only"> sobre {name} (abre o site oficial em nova aba)</span>
                      </a>
                    )}
                    {hasDesktopInstaller(id) && (
                      <Link className="more-link" href={`/baixar#app-${id}`}>
                        Baixar<span aria-hidden="true"> ›</span>
                        <span className="zro-sr-only"> {name}</span>
                      </Link>
                    )}
                  </div>
                </div>
                {shot && (
                  <div className="tile__shot">
                    <img className="tile__img tile__img--claro" src={`/brand/produto-${id}-claro.webp`} alt={shot} width={1600} height={971} loading="lazy" />
                    <img className="tile__img tile__img--escuro" src={`/brand/produto-${id}-escuro.webp`} alt="" width={1600} height={971} loading="lazy" />
                  </div>
                )}
              </article>
            )
          })}
        </PointerTilt>
      </section>

      <section className="get-apps reveal" aria-labelledby="get-apps-title">
        <div className="get-apps__marks" aria-hidden="true">
          {['sobedesce', 'synquei', 'nossom', 'tpeasy'].map((id) => (
            <ProductMark key={id} productId={id} name={id} size={64} />
          ))}
        </div>
        <h2 id="get-apps-title" className="display-3 atitle">
          <span className="atitle__thin">Instale uma vez.</span>
          <span className="atitle__bold">Entre com a mesma conta.</span>
        </h2>
        <p className="get-apps__lead">SOBEDESCE, Synquei e NOSSOM para Mac e Windows. TPeasy no iPhone. Tudo num lugar só.</p>
        <Link className="glass-btn" href="/baixar">
          Ver downloads
        </Link>
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

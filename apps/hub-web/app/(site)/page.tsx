import Link from 'next/link'
import type { CSSProperties } from 'react'
import { ProductMark, ZroSymbol } from '@zro/ui'
import { productColor } from '@/components/app-tile'
import { BrandSymbol } from '@/components/brand-symbol'
import { AppExplorer, type ExplorerApp } from '@/components/app-explorer'
import { PointerTilt } from '@/components/pointer-tilt'
import { publicCatalog } from '@/lib/data/catalog'
import { hasDesktopInstaller } from '@/lib/downloads'

export const dynamic = 'force-dynamic'

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

/** O que cada uma faz hoje, em três linhas curtas (só o que existe no produto). */
const FEATURES: Record<string, string[]> = {
  'carro-do-freela': ['Agenda de quem está livre', 'Comunidade de freelas', 'Oportunidades e contratação'],
  tpeasy: ['Teleprompter no iPhone', 'Roteiro sempre à mão', 'Ritmo e tamanho no seu controle'],
  sobedesce: ['Cópia de cartões com checksum', 'Backup em disco e na nuvem', 'Mac, Windows e celular'],
  synquei: ['Sincroniza áudio e vídeo', 'Organiza o material por câmera', 'Mac e Windows'],
  'ai-edit': ['Transcrição e legenda', 'Cortes e zoom propostos para aprovar', 'Timeline para Premiere, Final Cut e DaVinci'],
  nossom: ['Voz limpa no próprio aparelho', 'Efeitos sonoros', 'O áudio não sai do seu computador'],
  finishing: ['LUT a partir de um frame', 'Looks lado a lado', 'Entregas para YouTube, Reels e TikTok'],
}

/** Verbo de cada etapa na linha do job à entrega. */
const VERB: Record<string, string> = {
  'carro-do-freela': 'Escalar a equipe',
  tpeasy: 'Gravar com roteiro',
  sobedesce: 'Copiar e conferir',
  synquei: 'Sincronizar',
  'ai-edit': 'Editar',
  nossom: 'Tratar o som',
  finishing: 'Dar cor e entregar',
}

/** Site oficial quando o catálogo ainda não tem o endereço (Revela e AEON já estão no ar nos subdomínios). */
const SITE: Record<string, string> = {
  'ai-edit': 'https://aeon.absolutezro.com',
  finishing: 'https://revela.absolutezro.com',
}

/** Telas reais (capturas públicas em MacBook e iPhone; ver scripts/marca/README.md). */
const SHOT = new Set(['carro-do-freela', 'tpeasy', 'sobedesce', 'synquei', 'nossom'])

export default async function Landing() {
  const { products } = await publicCatalog()
  const apps: ExplorerApp[] = products.map((p) => {
    const id = p.id as string
    return {
      id,
      name: p.name as string,
      tagline: TAGLINE[id] ?? (p.role_in_flow as string),
      role: p.role_in_flow as string,
      features: FEATURES[id] ?? [],
      site: (p.external_url as string | null) || SITE[id] || null,
      download: hasDesktopInstaller(id),
      shot: SHOT.has(id),
      color: productColor(id),
    }
  })
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
          <ul className="shero__apps home-mark" aria-label="Ferramentas">
            {products.map((p, i) => (
              <li key={p.id as string} style={{ '--i': i } as CSSProperties}>
                <a href={`#app-${p.id as string}`} title={p.name as string}>
                  <ProductMark productId={p.id as string} name={p.name as string} size={44} />
                  <span className="zro-sr-only">{p.name as string}</span>
                </a>
              </li>
            ))}
          </ul>
        </div>
      </section>

      {/* A órbita: as ferramentas giram em volta do O, sem parar. Cada ícone abre a ferramenta no explorador. */}
      <section className="zorbit home-mark" aria-labelledby="orbita-title">
        <h2 id="orbita-title" className="display-2 atitle reveal">
          <span className="atitle__thin">{products.length} ferramentas.</span>
          <span className="atitle__bold">Um só ecossistema.</span>
        </h2>
        <div className="zorbit__ring" style={{ '--n': products.length } as CSSProperties}>
          <ZroSymbol className="zorbit__symbol" size={240} />
          <ul className="zorbit__apps" aria-label="Ferramentas da Absolute ZRO">
            {products.map((p, i) => (
              <li key={p.id as string} className="zorbit__app" style={{ '--a': `${(i * 360) / products.length - 90}deg` } as CSSProperties}>
                <a className="zorbit__chip" href={`#app-${p.id as string}`} title={p.name as string}>
                  <ProductMark productId={p.id as string} name={p.name as string} size={64} />
                  <span className="zro-sr-only">{p.name as string}</span>
                </a>
              </li>
            ))}
          </ul>
        </div>
        <p className="zorbit__hint">Toque num ícone para conhecer.</p>
      </section>

      {/* Explorador: escolha a ferramenta e veja o que ela faz. */}
      <section className="section section--center" id="ferramentas" aria-labelledby="ferr-title">
        <div className="section__head section__head--wide reveal">
          <h2 id="ferr-title" className="display-2 atitle">
            <span className="atitle__thin">Cada uma com a sua força.</span>
            <span className="atitle__bold">Todas com a mesma conta.</span>
          </h2>
        </div>
        <AppExplorer apps={apps} />
      </section>

      {/* Do job à entrega: a linha se desenha com a rolagem e cada etapa entra na sua vez. */}
      <section className="section section--center" id="ciclo" aria-labelledby="ciclo-title">
        <div className="section__head section__head--wide reveal">
          <h2 id="ciclo-title" className="display-2 atitle">
            <span className="atitle__thin">Do job</span>
            <span className="atitle__bold">à entrega.</span>
          </h2>
          <p>Cada etapa numa ferramenta. O projeto passa de uma para a outra.</p>
        </div>
        <div className="flow home-mark">
          <ol className="flow__track" style={{ '--n': products.length } as CSSProperties}>
            {products.map((p, i) => (
              <li key={p.id as string} className="flow__step" style={{ '--i': i } as CSSProperties}>
                <a href={`#app-${p.id as string}`} title={p.name as string}>
                  <ProductMark productId={p.id as string} name={p.name as string} size={60} />
                </a>
                <span className="flow__verb">{VERB[p.id as string] ?? (p.role_in_flow as string)}</span>
                <span className="flow__name">{p.name as string}</span>
              </li>
            ))}
          </ol>
        </div>
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

      <section className="section section--center" aria-label="Em números">
        <div className="facts">
          <div className="fact">
            <span className="fact__n">1</span>
            <span className="fact__l">conta para todas as ferramentas</span>
          </div>
          <div className="fact">
            <span className="fact__n">{products.length}</span>
            <span className="fact__l">ferramentas, do job à entrega</span>
          </div>
          <div className="fact">
            <span className="fact__n">4</span>
            <span className="fact__l">lugares: Mac, Windows, iPhone e navegador</span>
          </div>
          <div className="fact">
            <span className="fact__n">0</span>
            <span className="fact__l">arquivos originais apagados pelo HUB</span>
          </div>
        </div>
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

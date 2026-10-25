import Link from 'next/link'
import type { CSSProperties, ReactNode } from 'react'
import { Pill, ProductMark } from '@zro/ui'
import { productColor } from '@/components/app-tile'
import { CycleO } from '@/components/cycle-o'
import { Icon } from '@/components/icons'
import { MotionGate } from '@/components/motion-gate'
import { publicCatalog } from '@/lib/data/catalog'

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
  'ai-edit': 'Decupagem e montagem assistida.',
  nossom: 'Seu som, em outra escala.',
  finishing: 'Revela a cor que você quer.',
}

const bars = (n: number, seed: number) =>
  Array.from({ length: n }, (_, i) => 18 + Math.round(Math.abs(Math.sin((i + 1) * seed) * 0.6 + Math.sin((i + 3) * seed * 0.37) * 0.4) * 82))

/** Mini-demonstrações em CSS puro: nenhuma renderização por frame, todas param fora da tela e com "reduzir movimento". */
function Demo({ id }: { id: string }) {
  switch (id) {
    case 'carro-do-freela':
      return (
        <div className="demo on-dark demo--agenda" aria-hidden="true">
          {['Câmera', 'Som', 'Drone', 'Cor', 'Foto', 'Edição'].map((f, i) => (
            <span key={f} className={i % 3 === 1 ? 'is-busy' : 'is-free'} style={{ ['--d' as string]: `${i * 0.18}s` }}>
              {f}
            </span>
          ))}
        </div>
      )
    case 'tpeasy':
      return (
        <div className="demo on-dark demo--prompter" aria-hidden="true">
          <div className="demo--prompter__roll">
            {['Grandes ideias', 'merecem ser ditas', 'com clareza.', '[pausa]', 'O texto anda', 'no ritmo da voz.', 'Grandes ideias', 'merecem ser ditas'].map(
              (t, i) => (
                <p key={i} className={t.startsWith('[') ? 'is-cue' : undefined}>
                  {t}
                </p>
              ),
            )}
          </div>
        </div>
      )
    case 'sobedesce':
      return (
        <div className="demo on-dark demo--updown" aria-hidden="true">
          <span className="demo--updown__bar demo--updown__bar--a" />
          <span className="demo--updown__bar demo--updown__bar--b" />
          <ul>
            <li>
              <Icon name="check" /> HD externo
            </li>
            <li>
              <Icon name="check" /> Google Drive
            </li>
          </ul>
        </div>
      )
    case 'synquei':
      return (
        <div className="demo on-dark demo--lanes" aria-hidden="true">
          {[0.9, 1.7, 2.3].map((s, i) => (
            <div
              key={i}
              className="demo--lanes__lane"
              style={{ ['--off' as string]: `${[28, -18, 40][i]}%`, ['--c' as string]: ['#3987e5', '#a98bff', '#1baf7a'][i] }}
            >
              <div className="demo--lanes__clip">
                {bars(26, s).map((h, j) => (
                  <i key={j} style={{ height: `${h}%` }} />
                ))}
              </div>
            </div>
          ))}
        </div>
      )
    case 'nossom':
      return (
        <div className="demo on-dark demo--chrome" aria-hidden="true">
          <svg viewBox="0 0 300 90" preserveAspectRatio="none">
            <defs>
              <linearGradient id="chrome-line" x1="0" x2="1">
                <stop offset="0" stopColor="#5aa9ff" stopOpacity="0" />
                <stop offset="0.4" stopColor="#dcefff" />
                <stop offset="0.7" stopColor="#5aa9ff" />
                <stop offset="1" stopColor="#5aa9ff" stopOpacity="0" />
              </linearGradient>
            </defs>
            <path className="demo--chrome__a" d="M0 45 C 40 10, 70 80, 110 45 S 180 10, 220 45 S 280 75, 300 40" />
            <path className="demo--chrome__b" d="M0 50 C 50 80, 80 20, 130 50 S 200 80, 240 45 S 285 25, 300 55" />
          </svg>
        </div>
      )
    default:
      return (
        <div className="demo on-dark demo--soon" aria-hidden="true">
          <span />
          <span />
          <span />
        </div>
      )
  }
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
  return (
    <>
      <section className="hero" aria-labelledby="hero-title">
        <div className="hero__text">
          <p className="zro-eyebrow">Ecossistema audiovisual</p>
          <h1 className="hero__title" id="hero-title">
            Da oportunidade à entrega.
          </h1>
          <p className="hero__lead">
            Contratar, roteirizar, copiar, sincronizar, editar, tratar o som e entregar. Cada ferramenta com o seu jeito, um projeto ligando tudo.
          </p>
          <div className="row">
            <Link className="zro-btn zro-btn--primary zro-btn--large" href="/criar-conta">
              Criar conta
            </Link>
            <Link className="zro-btn zro-btn--large" href="#ciclo">
              Ver o Ciclo do O
              <Icon name="arrow" />
            </Link>
          </div>
          <p className="zro-faint">Um login para o HUB. Sua mídia não é enviada nem movida.</p>
        </div>

        <MotionGate className="suite on-dark" as="div">
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

      <section className="logos reveal" aria-label="Ferramentas da família">
        {products.map((p) => (
          <span key={p.id as string} className="logos__item">
            <ProductMark productId={p.id as string} name={p.name as string} size={30} />
            {p.name as string}
          </span>
        ))}
      </section>

      <section className="section section--center reveal" id="ciclo" aria-labelledby="ciclo-title">
        <div className="section__head">
          <p className="zro-eyebrow">Ciclo do O</p>
          <h2 id="ciclo-title" className="display-2">
            Comece em qualquer ponto do círculo.
          </h2>
          <p>A ordem é sugestão, não obrigação. Use uma ferramenta só ou o ciclo inteiro: o projeto guarda o que cada etapa entregou.</p>
        </div>
        <div className="zro-card zro-card--stage cycle-stage">
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
        </div>
      </section>

      <section className="section section--center" id="ferramentas" aria-labelledby="ferr-title">
        <div className="section__head reveal">
          <p className="zro-eyebrow">Ferramentas</p>
          <h2 id="ferr-title" className="display-2">
            Sete marcas.
            <br />
            Uma conta.
          </h2>
          <p>Cada uma com a própria cara. Em desenvolvimento aparece como tal: nada de recurso de fachada.</p>
        </div>
        <div className="bento">
          {products.map((p) => {
            const id = p.id as string
            const soon = p.stage === 'coming_soon'
            return (
              <MotionGate key={id} className={`chapter reveal${soon ? ' chapter--soon' : ''}`} as="div">
                <article style={productColor(id) as CSSProperties} className="chapter__inner">
                  <div className="chapter__glow" aria-hidden="true" />
                  <header className="chapter__head">
                    <ProductMark productId={id} name={p.name as string} size={44} />
                    <Pill tone={STAGE[p.stage as string]?.tone ?? 'faint'}>{STAGE[p.stage as string]?.label ?? (p.stage as string)}</Pill>
                  </header>
                  <div className="chapter__text">
                    <p className="chapter__name">
                      {p.name as string}
                      {p.provisional_name ? <span className="zro-faint"> · nome provisório</span> : null}
                    </p>
                    <h3>{TAGLINE[id] ?? (p.role_in_flow as string)}</h3>
                    <p className="zro-mute">{p.role_in_flow as string}</p>
                  </div>
                  <Demo id={id} />
                </article>
              </MotionGate>
            )
          })}
        </div>
      </section>

      <section className="get-apps reveal" aria-labelledby="get-apps-title">
        <div className="get-apps__marks" aria-hidden="true">
          {['sobedesce', 'synquei', 'nossom'].map((id) => (
            <ProductMark key={id} productId={id} name={id} size={52} />
          ))}
        </div>
        <div className="get-apps__text">
          <h2 id="get-apps-title">Instale no seu computador.</h2>
          <p className="zro-mute">SOBEDESCE, Synquei e NOSSOM para Mac e Windows. TPeasy no iPhone. Tudo num lugar só.</p>
        </div>
        <Link className="zro-btn zro-btn--primary" href="/baixar">
          <Icon name="download" />
          Ver downloads
        </Link>
      </section>

      <section className="beam reveal on-dark" aria-labelledby="beam-title">
        <p className="zro-eyebrow">Absolute ZRO HUB</p>
        <h2 id="beam-title" className="display-2">
          Seus dados, seus acessos.
          <br />
          Nada além do contratado.
        </h2>
        <p className="zro-mute">Permissões conferidas no servidor em toda ação. Arquivos originais nunca são apagados ou sobrescritos pelo HUB.</p>
        <div>
          <Link className="zro-btn zro-btn--primary zro-btn--large" href="/criar-conta">
            Começar do zero
          </Link>
        </div>
      </section>
    </>
  )
}

import type { Metadata } from 'next'
import Link from 'next/link'
import type { LimiteDoCatalogo, OfertaPacote, Preco } from '@zro/billing'
import { ProductMark } from '@zro/ui'
import { productColor } from '@/components/app-tile'
import { AvulsoSeletor } from '@/components/avulso-seletor'
import { ofertaPublica } from '@/lib/data/catalog'
import { brl } from '@/lib/labels'
import { stripeConfig } from '@/lib/stripe'

export const metadata: Metadata = { title: 'Planos', alternates: { canonical: '/planos' } }
export const dynamic = 'force-dynamic'

const NIVEIS = [
  ['zero', 'Zero'],
  ['orbita', 'Órbita'],
  ['absoluto', 'Absoluto'],
] as const

/** Um número do catálogo como etiqueta: sem limite, sim/não, ou o número com a unidade. */
function valor(l: LimiteDoCatalogo, v: number | null) {
  if (l.tipo === 'recurso') return v ? '✓' : '—'
  if (v == null) return 'Sem limite'
  return `${v.toLocaleString('pt-BR')}${l.unidade ?? ''}${l.periodo === 'mes' ? '/mês' : ''}`
}

/** Preço do ciclo: o anual mostra o que dá por mês e quanto economiza. */
function Precos({ mes, ano }: { mes: Preco | null; ano: Preco | null }) {
  return (
    <>
      <div className="tier__price when-month">
        {mes ? (
          <>
            <span className="tier__amount">{brl(mes.centavos)}</span>
            <span className="tier__per">/mês</span>
          </>
        ) : (
          <span className="tier__per">Só anual</span>
        )}
      </div>
      <div className="tier__price when-year">
        {ano ? (
          <>
            <span className="tier__amount">{brl(ano.centavos)}</span>
            <span className="tier__per">/ano</span>
          </>
        ) : (
          <span className="tier__per">Só mensal</span>
        )}
      </div>
      <p className="tier__sub when-month">{mes && ano ? `ou ${brl(ano.centavos)} por ano` : ' '}</p>
      <p className="tier__sub when-year">
        {mes && ano ? (
          <>
            {brl(Math.round(ano.centavos / 12))}/mês · <strong>economize {brl(mes.centavos * 12 - ano.centavos)}</strong>
          </>
        ) : (
          ' '
        )}
      </p>
    </>
  )
}

function Z({ n }: { n: number | null }) {
  if (n == null) return null
  return (
    <p className="tier__credits" title="Cada mensagem da Z conta uma. A franquia renova todo mês.">
      <strong>{n.toLocaleString('pt-BR')}</strong>
      <span>mensagens da Z por mês</span>
    </p>
  )
}

/**
 * Planos (ADR 0039/0040): Zero grátis, Órbita e Absoluto em todos os apps lançados, o Avulso (Absoluto num app) e as
 * recargas da Z. Mensal/Anual é um par de rádios só em CSS (globals.css, .pricing). Com as chaves do Stripe, os botões
 * levam a assinar em Sua conta › Plano; sem elas, a venda fica fechada e o caminho é começar no Zero.
 * O que muda em cada app sai do catálogo de limites (o mesmo de GET /api/v1/limites). As fases não aparecem.
 */
export default async function Planos() {
  const { oferta, limites, nomes } = await ofertaPublica()
  const vendas = stripeConfig() !== null
  const nomeDe = (id: string) => nomes[id] ?? id
  const economia = (p: { mes: Preco | null; ano: Preco | null }) =>
    p.mes && p.ano ? Math.round(((p.mes.centavos * 12 - p.ano.centavos) / (p.mes.centavos * 12)) * 100) : 0
  const melhor = Math.max(0, ...oferta.pacotes.map(economia), ...oferta.avulsos.map(economia))
  const gratis = oferta.anual_em_meses && oferta.anual_em_meses < 12 ? 12 - oferta.anual_em_meses : 0
  const avulso = oferta.avulsos[0] ?? null
  const appsDoCatalogo = Object.keys(limites)
  const assinar = (p: OfertaPacote, ciclo: 'mes' | 'ano') => (vendas ? `/perfil/plano?plano=${p.plano}&ciclo=${ciclo}#assinar` : '/criar-conta')

  return (
    <section className="section section--page section--center pricing" aria-labelledby="planos-title">
      <div className="section__head section__head--wide">
        <p className="zro-eyebrow">Planos</p>
        <h1 id="planos-title" className="display-2 atitle">
          <span className="atitle__thin">Comece do zero.</span>
          <span className="atitle__bold">Vá até o Absoluto.</span>
        </h1>
        <p>Uma conta, todos os apps. Mude quando quiser.</p>
      </div>
      {!vendas && (
        <p className="pricing__livre" role="note">
          <strong>Comece no Zero.</strong> Todos os apps, de graça.
        </p>
      )}

      <fieldset className="cobranca">
        <legend className="zro-sr-only">Cobrança</legend>
        <input className="zro-sr-only" type="radio" name="ciclo" id="ciclo-mensal" defaultChecked />
        <label htmlFor="ciclo-mensal">Mensal</label>
        <input className="zro-sr-only" type="radio" name="ciclo" id="ciclo-anual" />
        <label htmlFor="ciclo-anual">
          Anual
          {gratis > 0 ? <span className="cobranca__save">{gratis} meses grátis</span> : melhor > 0 && <span className="cobranca__save">até −{melhor}%</span>}
        </label>
      </fieldset>

      <div className="tiers tiers--quatro">
        {oferta.zero && (
          <article className="tier" aria-labelledby="tier-zero">
            <header className="tier__head">
              <h2 id="tier-zero">{oferta.zero.nome}</h2>
              <p className="tier__tag">{oferta.zero.descricao}</p>
            </header>
            <div className="tier__price">
              <span className="tier__amount">R$ 0</span>
              <span className="tier__per">para sempre</span>
            </div>
            <p className="tier__sub"> </p>
            <Z n={oferta.zero.z} />
            <AppsIcones apps={oferta.zero.apps} nomeDe={nomeDe} />
            <Link className="glass-btn tier__cta" href="/criar-conta">
              Criar conta
            </Link>
          </article>
        )}

        {oferta.pacotes.map((p) => {
          const destaque = p.plano === 'orbita'
          return (
            <article key={p.plano} className={`tier${destaque ? ' tier--featured' : ''}`} aria-labelledby={`tier-${p.plano}`}>
              <header className="tier__head">
                <h2 id={`tier-${p.plano}`}>{p.nome}</h2>
                <p className="tier__tag">{p.descricao}</p>
              </header>
              <Precos mes={p.mes} ano={p.ano} />
              <Z n={p.z} />
              <AppsIcones apps={p.apps} nomeDe={nomeDe} />
              {(['mes', 'ano'] as const).map((ciclo) => (
                <Link
                  key={ciclo}
                  className={`glass-btn tier__cta ${ciclo === 'mes' ? 'when-month' : 'when-year'}${destaque ? ' glass-btn--ink' : ''}`}
                  href={assinar(p, ciclo)}
                >
                  {vendas ? `Assinar ${p.nome}` : 'Começar no Zero'}
                </Link>
              ))}
            </article>
          )
        })}

        {avulso?.mes && (
          <article className="tier tier--avulso" aria-labelledby="tier-avulso">
            <header className="tier__head">
              <h2 id="tier-avulso">Avulso</h2>
              <p className="tier__tag">Só o app que você usa, inteiro.</p>
            </header>
            <AvulsoSeletor
              apps={oferta.avulsos.map((a) => ({ id: a.app, name: a.nome, color: productColor(a.app) }))}
              mes={avulso.mes.centavos}
              ano={avulso.ano?.centavos ?? null}
              z={avulso.z}
              vendas={vendas}
            />
          </article>
        )}
      </div>

      {oferta.recargas.length > 0 && (
        <div className="tier-free recargas" aria-labelledby="recargas-title">
          <div>
            <h2 id="recargas-title">Mais Z quando precisar</h2>
            <p className="zro-mute">Valem 12 meses. Só gastam depois da franquia do mês.</p>
          </div>
          <ul className="recargas__lista" aria-label="Recargas da Z">
            {oferta.recargas.map((r) => (
              <li key={r.code}>
                <strong>+{r.mensagens.toLocaleString('pt-BR')}</strong>
                <span>{brl(r.centavos)}</span>
              </li>
            ))}
          </ul>
        </div>
      )}

      {appsDoCatalogo.length > 0 && (
        <details className="pricing__more pricing__compare">
          <summary>O que muda em cada app</summary>
          <div className="compare">
            {appsDoCatalogo.map((app) => (
              <section key={app} className="compare__app" aria-labelledby={`cmp-${app}`}>
                <h3 id={`cmp-${app}`} className="compare__nome">
                  <ProductMark productId={app} name={nomeDe(app)} size={28} />
                  {nomeDe(app)}
                </h3>
                <table className="compare__tabela">
                  <thead>
                    <tr>
                      <th scope="col">
                        <span className="zro-sr-only">Recurso</span>
                      </th>
                      {NIVEIS.map(([id, nome]) => (
                        <th key={id} scope="col">
                          {nome}
                        </th>
                      ))}
                    </tr>
                  </thead>
                  <tbody>
                    {Object.entries(limites[app]!).map(([chave, l]) => (
                      <tr key={chave}>
                        <th scope="row">{l.rotulo}</th>
                        {NIVEIS.map(([id]) => (
                          <td key={id}>{valor(l, l.valores[id])}</td>
                        ))}
                      </tr>
                    ))}
                  </tbody>
                </table>
              </section>
            ))}
          </div>
          <p>O Avulso é o Absoluto no app escolhido.</p>
        </details>
      )}
    </section>
  )
}

function AppsIcones({ apps, nomeDe }: { apps: string[]; nomeDe: (id: string) => string }) {
  if (!apps.length) return null
  return (
    <div className="tier__apps">
      <p className="tier__label">{apps.length} apps</p>
      <ul aria-label="Apps incluídos">
        {apps.map((id) => (
          <li key={id} title={nomeDe(id)}>
            <ProductMark productId={id} name={nomeDe(id)} size={34} />
            <span className="zro-sr-only">{nomeDe(id)}</span>
          </li>
        ))}
      </ul>
    </div>
  )
}

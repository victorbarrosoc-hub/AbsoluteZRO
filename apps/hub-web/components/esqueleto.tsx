/**
 * Esqueletos com a forma da tela de verdade (titular, 29/10/2026: o Início mostrava blocos cinza de outro formato e o
 * conteúdo "pulava" por cima). Cada esqueleto usa as mesmas classes e os mesmos elementos de texto da tela real, com
 * uma barra no lugar das palavras: a altura de cada linha é a da fonte real, e a troca não mexe em nada (CLS ≈ 0).
 *
 * Comportamento (app/globals.css, bloco "esqueleto", e o script de app/layout.tsx):
 * - o esqueleto só aparece depois de 320 ms (o mesmo tempo que a troca de tela espera pelo conteúdo, em
 *   components/movimento.tsx, e acima dos 300 ms que o React segura o conteúdo depois de um fallback): com o servidor
 *   rápido, ninguém vê cinza;
 * - quando chegou a aparecer, o conteúdo entra por cima dele numa dissolvência curta, sem salto;
 * - com "reduzir movimento", a troca é seca.
 * `data-esqueleto` marca a raiz de cada esqueleto (é o que o script e a troca de tela procuram).
 */
import type { CSSProperties, ReactNode } from 'react'
import { ZroSymbol } from '@zro/ui'

/** Uma linha de texto ainda por vir, do tamanho da fonte do elemento onde está. */
export function Linha({ w }: { w: string }) {
  return <span className="esq-linha" style={{ '--w': w } as CSSProperties} aria-hidden="true" />
}

function Raiz({ className, rotulo, children }: { className?: string; rotulo: string; children: ReactNode }) {
  return (
    <div className={className} data-esqueleto="" aria-busy="true">
      <p className="zro-sr-only" role="status">
        {rotulo}
      </p>
      {children}
    </div>
  )
}

function CartaoPainel() {
  return (
    <div className="zro-card esq-painel">
      <div className="zro-card__head">
        <h2 className="zro-card__title">
          <Linha w="9rem" />
        </h2>
      </div>
      <p>
        <Linha w="70%" />
      </p>
      <p>
        <Linha w="45%" />
      </p>
    </div>
  )
}

/** Números, painéis e apps do Início: o miolo, sem a raiz (serve aos dois esqueletos abaixo). */
function MioloPaineis() {
  const stat = (dica: boolean, i: number) => (
    <div className="zro-card" key={i}>
      <div className="zro-stat">
        <span className="zro-stat__label">
          <Linha w="7rem" />
        </span>
        <span className="zro-stat__value">
          <Linha w="2ch" />
        </span>
        {dica && (
          <span className="zro-stat__hint">
            <Linha w="8rem" />
          </span>
        )}
      </div>
    </div>
  )
  return (
    <>
      <div className="stats">{[false, true, false, true].map(stat)}</div>
      <div className="grid grid--2">
        <CartaoPainel />
        <CartaoPainel />
        <CartaoPainel />
        <CartaoPainel />
      </div>
      <section className="section">
        <div className="section-bar">
          <h2>
            <Linha w="6rem" />
          </h2>
          <span className="esq-ver">
            <Linha w="5.5rem" />
          </span>
        </div>
        <div className="app-grid">
          {[0, 1, 2, 3, 4, 5, 6, 7].map((i) => (
            <div className="app-tile app-tile--compact esq-tile" key={i}>
              <span className="esq-icone esq-marca" aria-hidden="true" />
              <div className="app-tile__body">
                <h3>
                  <Linha w="6rem" />
                </h3>
                <p>
                  <Linha w="85%" />
                </p>
              </div>
            </div>
          ))}
        </div>
      </section>
    </>
  )
}

/** Números, painéis e apps do Início (a parte que vem do banco depois do topo). */
export function EsqueletoPaineis() {
  return (
    <Raiz className="inicio-paineis" rotulo="Carregando os painéis…">
      <MioloPaineis />
    </Raiz>
  )
}

/** O topo do Início: saudação, palco com a órbita e os quatro atalhos. */
function TopoInicio() {
  return (
    <>
      <header className="greet">
        <p className="zro-eyebrow">
          <Linha w="11rem" />
        </p>
        <h1>
          <Linha w="6.5ch" />
        </h1>
        <p className="zro-mute">
          <Linha w="22rem" />
        </p>
      </header>
      <section className="zro-card zro-card--stage home-hero">
        <div className="orbit">
          <div className="orbit__ring" aria-hidden="true" />
          <div className="orbit__core" aria-hidden="true">
            <ZroSymbol size={64} />
          </div>
        </div>
        <div className="home-hero__text">
          <p className="zro-eyebrow">
            <Linha w="7rem" />
          </p>
          <h2 className="home-hero__title">
            <Linha w="80%" />
          </h2>
          <p className="zro-mute">
            <Linha w="90%" />
          </p>
          <div className="row">
            <span className="esq-botao" aria-hidden="true" />
          </div>
        </div>
      </section>
      <div className="quick">
        {[0, 1, 2, 3].map((i) => (
          <div className="quick__tile" key={i}>
            <span className="quick__icon esq-icone" aria-hidden="true" />
            <span className="quick__text">
              <strong>
                <Linha w="7rem" />
              </strong>
              <span>
                <Linha w="9rem" />
              </span>
            </span>
          </div>
        ))}
      </div>
    </>
  )
}

/** O Início inteiro, antes da primeira resposta do servidor (app/(hub)/inicio/loading.tsx). */
export function EsqueletoInicio() {
  return (
    <Raiz className="page" rotulo="Carregando o início…">
      <TopoInicio />
      <div className="inicio-paineis">
        <MioloPaineis />
      </div>
    </Raiz>
  )
}

/** Telas da área logada em geral: o cabeçalho de página e uma grade de cartões. */
export function EsqueletoPagina() {
  return (
    <Raiz className="page" rotulo="Carregando…">
      <header className="page-head">
        <div className="page-head__text">
          <h1>
            <Linha w="9ch" />
          </h1>
          <p>
            <Linha w="24rem" />
          </p>
        </div>
      </header>
      <div className="grid">
        {[0, 1, 2].map((i) => (
          <div className="zro-card esq-cartao" key={i}>
            <h2 className="zro-card__title">
              <Linha w="8rem" />
            </h2>
            <p>
              <Linha w="75%" />
            </p>
            <p>
              <Linha w="50%" />
            </p>
          </div>
        ))}
      </div>
    </Raiz>
  )
}

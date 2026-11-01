import '@fontsource-variable/figtree';
import { ZroSymbol } from './zro-symbol';

/** Para onde a pessoa vai: a Absolute ZRO. */
export const HUB_URL = 'https://absolutezro.com';

/**
 * Página neutra (titular, 01/11/2026: app não lançado não aparece em lugar nenhum, nem como "em desenvolvimento"): o
 * que o estúdio mostra, no mesmo endereço, a uma conta sem acesso enquanto o produto está fechado. Sem marca, nome ou
 * explicação do app: o símbolo da Absolute ZRO pequeno, "Página indisponível.", uma linha e a ida para a Absolute ZRO.
 * As páginas do site nem chegam aqui: o proxy manda para absolutezro.com. Sempre HTTP 200 e sem dado interno.
 */
export default function EmDesenvolvimento({
  entrar,
  aviso,
}: {
  /** Só na tela de entrar: a porta discreta para a conta autorizada (`/api/zro/entrar?volta=…`). */
  entrar?: string | null;
  /** Aviso curto da volta da Absolute ZRO (`?erro=`), quando houver. */
  aviso?: string | null;
}) {
  return (
    <main className="zro-dev">
      <section className="zro-dev__card" aria-labelledby="zro-dev-titulo">
        <a className="zro-dev__zro" href="https://absolutezro.com" aria-label="Absolute ZRO">
          <ZroSymbol size={22} />
        </a>
        <h1 className="zro-dev__titulo" id="zro-dev-titulo">
          <span>Página</span> <strong>indisponível.</strong>
        </h1>
        <p className="zro-dev__apoio">O que você procura não está aqui.</p>
        <a className="glass-btn glass-btn--ink" href={HUB_URL}>
          Ir para a Absolute ZRO
        </a>
        {entrar && (
          <a className="zro-dev__entrar" href={entrar}>
            <ZroSymbol size={15} />
            Entrar com Absolute ZRO
          </a>
        )}
        {aviso && (
          <p className="zro-dev__aviso" role="alert">
            {aviso}
          </p>
        )}
      </section>
    </main>
  );
}

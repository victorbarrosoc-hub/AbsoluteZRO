import '@fontsource-variable/figtree';
import { Brand } from './brand';
import { ZroSymbol } from './zro-symbol';

/** Para onde a pessoa volta: o HUB da Absolute ZRO. */
export const HUB_URL = 'https://absolutezro.com/inicio';

/**
 * Página institucional "Em desenvolvimento" (PRD §5 e §6, Etapa B, 28/10/2026): o que qualquer rota negada do
 * NOSSOM mostra enquanto o produto está fechado ao público. Símbolo da Absolute ZRO pequeno (assinatura), o NOSSOM,
 * título curto em Figtree Light × ExtraBold, uma linha de apoio e "Voltar ao HUB" em vidro escuro. Tema claro por
 * padrão, escuro pelo sistema. Sempre HTTP 200 e sem nenhum dado interno (nem o e-mail de quem entrou).
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
        <span className="zro-dev__nossom">
          <Brand />
        </span>
        <h1 className="zro-dev__titulo" id="zro-dev-titulo">
          <span>Em</span> <strong>desenvolvimento.</strong>
        </h1>
        <p className="zro-dev__apoio">O NOSSOM ainda não está aberto. Em breve, no Absolute ZRO.</p>
        <a className="glass-btn glass-btn--ink" href={HUB_URL}>
          Voltar ao HUB
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

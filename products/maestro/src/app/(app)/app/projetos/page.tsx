import { exigirAcessoNaPagina } from "@/lib/auth/pagina";
import { EstadoVazio } from "@/components/vazio";

export const metadata = { title: "Projetos" };

/** Projetos por cliente, ligados sozinhos ao projeto da Absolute ZRO ao nascer (etapa 3). Chega na etapa 1. */
export default async function Projetos() {
  await exigirAcessoNaPagina("/app/projetos");
  return (
    <div className="pagina">
      <header className="pagina__cabeca">
        <h1 className="atitle">
          <strong>Projetos.</strong>
        </h1>
        <p className="apoio">Código, prazo e cards; cada projeto nasce ligado ao projeto da Absolute ZRO.</p>
      </header>
      <EstadoVazio icone="projetos" titulo="Nenhum projeto ainda" apoio="Os projetos chegam na próxima etapa, já com o vínculo à Absolute ZRO." />
    </div>
  );
}

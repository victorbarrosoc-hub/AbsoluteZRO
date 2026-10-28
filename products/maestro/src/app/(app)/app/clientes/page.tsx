import { exigirAcessoNaPagina } from "@/lib/auth/pagina";
import { EstadoVazio } from "@/components/vazio";

export const metadata = { title: "Clientes" };

/** Clientes da organização, com quem aprova por eles. O cadastro chega na etapa 1. */
export default async function Clientes() {
  await exigirAcessoNaPagina("/app/clientes");
  return (
    <div className="pagina">
      <header className="pagina__cabeca">
        <h1 className="atitle">
          <strong>Clientes.</strong>
        </h1>
        <p className="apoio">Cada cliente com quem aprova por ele, os projetos e os links ativos.</p>
      </header>
      <EstadoVazio icone="clientes" titulo="Nenhum cliente ainda" apoio="O cadastro de clientes chega na próxima etapa." />
    </div>
  );
}

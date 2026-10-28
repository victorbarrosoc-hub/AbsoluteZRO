import { exigirAcessoNaPagina } from "@/lib/auth/pagina";
import { EstadoVazio } from "@/components/vazio";

export const metadata = { title: "Aprovações" };

/** Lotes para o cliente decidir, num passo só (texto e peça juntos), por link com validade. Chega na etapa 2. */
export default async function Aprovacoes() {
  await exigirAcessoNaPagina("/app/aprovacoes");
  return (
    <div className="pagina">
      <header className="pagina__cabeca">
        <h1 className="atitle">
          Suas <strong>aprovações.</strong>
        </h1>
        <p className="apoio">O cliente decide pelo link, sem conta: aprova ou pede ajuste, peça a peça.</p>
      </header>
      <EstadoVazio icone="aprovacoes" titulo="Nenhum lote ainda" apoio="Quando os cards chegarem ao Quadro, os lotes para o cliente nascem aqui." />
    </div>
  );
}

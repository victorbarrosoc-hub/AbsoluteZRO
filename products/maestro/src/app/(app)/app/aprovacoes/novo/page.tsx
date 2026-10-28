import { exigirAcessoNaPagina } from "@/lib/auth/pagina";
import { podeEscrever } from "@/lib/papeis";
import { cardsDisponiveis, clientesAtivos } from "@/lib/revisao/equipe";
import { NovoLote } from "@/components/revisao/novo-lote";
import { EstadoVazio } from "@/components/vazio";
import { criarLoteAcao } from "../acoes";
import "../../../../revisao.css";

export const metadata = { title: "Novo lote" };

export default async function NovoLotePagina({ searchParams }: PageProps<"/app/aprovacoes/novo">) {
  const sessao = await exigirAcessoNaPagina("/app/aprovacoes/novo");
  const ctx = { sub: sessao.sub, orgId: sessao.orgId };
  const [clientes, cards] = await Promise.all([clientesAtivos(ctx), cardsDisponiveis(ctx)]);
  const sp = await searchParams;
  const cliente = typeof sp.cliente === "string" ? sp.cliente : "";
  return (
    <div className="pagina pagina--estreita">
      <header className="pagina__cabeca">
        <h1 className="atitle">
          Novo <strong>lote.</strong>
        </h1>
        <p className="apoio">As peças que o cliente vai decidir juntas.</p>
      </header>
      {!podeEscrever(sessao.papel) ? (
        <EstadoVazio icone="aprovacoes" titulo="Só leitura" apoio="Seu papel nesta organização não cria lotes." />
      ) : !clientes.length ? (
        <EstadoVazio icone="clientes" titulo="Cadastre um cliente antes" apoio="O lote é sempre de um cliente." />
      ) : (
        <NovoLote acao={criarLoteAcao} clientes={clientes} cards={cards} clienteInicial={cliente} />
      )}
    </div>
  );
}

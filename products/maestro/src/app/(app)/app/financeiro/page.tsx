import Link from "next/link";
import { exigirAcessoNaPagina } from "@/lib/auth/pagina";
import { brl, ehMes, hojeBr, mesPorExtenso, somarMeses } from "@/lib/dinheiro";
import { gerarRecorrencias, listarLancamentos } from "@/lib/financeiro/servidor";
import { podeVerDinheiro } from "@/lib/papeis";
import { Busca } from "@/components/busca";
import { Pilulas } from "@/components/crm";
import { CabecaFinanceiro, LinhaLancamento, NovoLancamento, SemDinheiro } from "@/components/financeiro";
import { Icone } from "@/components/icones";
import { Cifra, Cifras } from "@/components/painel";

export const metadata = { title: "Financeiro" };

/** Lançamentos do mês: entradas e saídas pelo vencimento, filtros, resumo e o mês ao lado. */
export default async function Financeiro({ searchParams }: PageProps<"/app/financeiro">) {
  const sessao = await exigirAcessoNaPagina("/app/financeiro");
  if (!podeVerDinheiro(sessao.papel))
    return (
      <div className="pagina">
        <CabecaFinanceiro ativa="/app/financeiro" />
        <SemDinheiro />
      </div>
    );
  const sp = await searchParams;
  const ctx = { sub: sessao.sub, orgId: sessao.orgId };
  const hoje = hojeBr();
  // Abrir o Financeiro confere o mês: o que as recorrências ainda não lançaram entra agora (sem repetir).
  await gerarRecorrencias(ctx).catch(() => null);
  const todos = sp.mes === "todos";
  const mes = ehMes(sp.mes) ? sp.mes : hoje.slice(0, 7);
  const tipo = sp.tipo === "entrada" || sp.tipo === "saida" ? sp.tipo : undefined;
  const status = ["pendente", "parcial", "atrasado", "pago"].includes(String(sp.status)) ? (sp.status as "pendente") : undefined;
  const q = typeof sp.q === "string" ? sp.q : "";
  const r = await listarLancamentos(ctx, { mes: todos ? null : mes, tipo, status, busca: q }, hoje);
  const href = (mud: Record<string, string | undefined>) => {
    const u = new URLSearchParams();
    const base = { mes: todos ? "todos" : mes, tipo, status, q, ...mud };
    for (const [k, v] of Object.entries(base)) if (v && !(k === "mes" && v === hoje.slice(0, 7))) u.set(k, v);
    const t = u.toString();
    return t ? `/app/financeiro?${t}` : "/app/financeiro";
  };

  return (
    <div className="pagina">
      <CabecaFinanceiro ativa="/app/financeiro" acao={<NovoLancamento />} />
      <div className="mes-nav">
        <Link className="q-icone-btn" href={href({ mes: somarMeses(mes, -1) })} aria-label="Mês anterior">
          <Icone nome="voltar" size={16} />
        </Link>
        <strong>{todos ? "Todos os meses" : mesPorExtenso(mes)}</strong>
        <Link className="q-icone-btn" href={href({ mes: somarMeses(mes, 1) })} aria-label="Próximo mês">
          <Icone nome="seta" size={16} />
        </Link>
        {todos || mes !== hoje.slice(0, 7) ? (
          <Link className="secao__link" href={href({ mes: hoje.slice(0, 7) })}>
            Hoje
          </Link>
        ) : (
          <Link className="secao__link" href={href({ mes: "todos" })}>
            Todos
          </Link>
        )}
      </div>
      <Cifras>
        <Cifra rotulo="Entrou" valor={brl(r.resumo.entrada.pago)} apoio={`a receber ${brl(r.resumo.entrada.aberto)}`} tom="ok" />
        <Cifra rotulo="Saiu" valor={brl(r.resumo.saida.pago)} apoio={`a pagar ${brl(r.resumo.saida.aberto)}`} />
        <Cifra
          rotulo="Saldo previsto"
          valor={`${r.resumo.saldoPrevisto < 0 ? "− " : ""}${brl(Math.abs(r.resumo.saldoPrevisto))}`}
          apoio={`realizado ${brl(r.resumo.saldoRealizado)}`}
          tom={r.resumo.saldoPrevisto < 0 ? "perigo" : undefined}
        />
        {r.resumo.entrada.atrasado + r.resumo.saida.atrasado > 0 ? (
          <Cifra
            rotulo="Atrasado"
            valor={brl(r.resumo.entrada.atrasado + r.resumo.saida.atrasado)}
            apoio={`receber ${brl(r.resumo.entrada.atrasado)}`}
            tom="aviso"
          />
        ) : null}
      </Cifras>
      <div className="filtros">
        <Busca placeholder="Buscar descrição, projeto, cliente ou freela" />
        <Pilulas
          ativo={tipo ?? "todos"}
          itens={[
            { valor: "todos", nome: `Tudo ${r.contaTipo.todos}`, href: href({ tipo: undefined }) },
            { valor: "entrada", nome: `Entradas ${r.contaTipo.entrada}`, href: href({ tipo: "entrada" }) },
            { valor: "saida", nome: `Saídas ${r.contaTipo.saida}`, href: href({ tipo: "saida" }) },
          ]}
        />
        <Pilulas
          ativo={status ?? "todos"}
          itens={[
            { valor: "todos", nome: "Qualquer status", href: href({ status: undefined }) },
            { valor: "pendente", nome: `Pendentes ${r.contaStatus.pendente}`, href: href({ status: "pendente" }) },
            { valor: "atrasado", nome: `Atrasados ${r.contaStatus.atrasado}`, href: href({ status: "atrasado" }) },
            { valor: "pago", nome: `Pagos ${r.contaStatus.pago}`, href: href({ status: "pago" }) },
          ]}
        />
      </div>
      {r.lancamentos.length ? (
        <ul className="lista" aria-label="Lançamentos">
          {r.lancamentos.map((l) => (
            <LinhaLancamento key={l.id} l={l} />
          ))}
        </ul>
      ) : (
        <p className="nada">Nada lançado {todos ? "ainda" : `em ${mesPorExtenso(mes)}`} com esse filtro.</p>
      )}
    </div>
  );
}

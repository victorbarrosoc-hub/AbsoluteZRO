import { exigirAcessoNaPagina } from "@/lib/auth/pagina";
import { referenciasDoQuadro } from "@/lib/quadro/servidor";
import { painelPorTipo, podeCronometrar, podeVerTempoDoTime } from "@/lib/tempo/servidor";
import { podeEditarColunas } from "@/lib/papeis";
import { PainelDeTempo } from "@/components/tempo/tipos";
import "../../../tempo.css";

export const metadata = { title: "Tempo" };

/**
 * Tempo por tipo de vídeo (drizzle/0038): quanto cada categoria leva, só com vídeos concluídos e o tempo que a pessoa
 * vê (o dela; administração e gestão, o do time ou de uma pessoa). Filtros por período, cliente e pessoa.
 */
export default async function PaginaTempo() {
  const sessao = await exigirAcessoNaPagina("/app/tempo");
  const ctx = { sub: sessao.sub, orgId: sessao.orgId };
  const time = podeVerTempoDoTime(sessao.papel);
  const [refs, r] = await Promise.all([referenciasDoQuadro(ctx), painelPorTipo(ctx, sessao.papel, { periodo: "90d", quem: time ? "time" : "eu" })]);
  return (
    <PainelDeTempo
      inicial={r.ok ? r.painel : null}
      clientes={refs.clientes}
      pessoas={time ? refs.pessoas.map((p) => ({ sub: p.sub, nome: p.nome })) : []}
      tipos={refs.tipos}
      time={time}
      podeMudarTipos={podeCronometrar(sessao.papel)}
      podeArquivarTipos={podeEditarColunas(sessao.papel)}
    />
  );
}

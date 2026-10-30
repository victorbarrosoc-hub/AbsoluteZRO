import { notFound } from "next/navigation";
import { exigirAcessoNaPagina } from "@/lib/auth/pagina";
import { podeEditarCriacao, podeEnviarCriacao, podeMandarParaAeon } from "@/lib/criacao/permissoes";
import { listarVersoes, obterRoteiro, opcoesDeVinculo } from "@/lib/criacao/roteiro/servidor";
import { VISTAS, type Vista } from "@/lib/criacao/roteiro/vistas";
import { referenciasDoQuadro } from "@/lib/quadro/servidor";
import { EditorRoteiro } from "@/components/criacao/roteiro/editor";

export const metadata = { title: "Roteiro" };

/**
 * O editor do Roteiro: as quatro vistas do mesmo documento, gravação sozinha com `rev`, versões, impressão e "Enviar"
 * (administração e gestão; a opção do AEON só com o produto aberto para a pessoa no gate do HUB).
 */
export default async function PaginaRoteiro({ params, searchParams }: PageProps<"/app/criacao/roteiros/[id]">) {
  const { id } = await params;
  const sp = await searchParams;
  const s = await exigirAcessoNaPagina(`/app/criacao/roteiros/${id}`);
  const ctx = { sub: s.sub, orgId: s.orgId };
  const r = await obterRoteiro(ctx, id);
  if (!r || r.apagado) notFound();
  const edita = podeEditarCriacao(s.papel);
  const [versoes, opcoes, refs] = await Promise.all([
    listarVersoes(ctx, id),
    edita ? opcoesDeVinculo(ctx) : Promise.resolve({ projetos: [], cards: [] }),
    referenciasDoQuadro(ctx),
  ]);
  const vista: Vista = VISTAS.some((v) => v.k === sp.vista) ? (sp.vista as Vista) : "literario";
  const nomes = Object.fromEntries(refs.pessoas.map((p) => [p.sub, p.nome.split(" ")[0]]));
  return (
    <EditorRoteiro
      inicial={r}
      versoes={versoes}
      opcoes={opcoes}
      editavel={edita}
      podeEstado={podeEnviarCriacao(s.papel)}
      podeEnviar={podeEnviarCriacao(s.papel)}
      aeon={podeMandarParaAeon(s)}
      vistaInicial={vista}
      eu={s.sub}
      nomes={nomes}
    />
  );
}

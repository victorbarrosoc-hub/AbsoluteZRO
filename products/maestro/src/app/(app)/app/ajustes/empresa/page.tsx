import Link from "next/link";
import { exigirAcessoNaPagina } from "@/lib/auth/pagina";
import { UFS } from "@/lib/orcamento/deslocamento";
import { lerEmpresa } from "@/lib/organizacao";
import { CabecaForm, Formulario, type DefCampo } from "@/components/form";
import { Icone } from "@/components/icones";
import { salvarEmpresaAcao } from "./acoes";

export const metadata = { title: "Empresa" };

const CAMPOS: DefCampo[] = [
  { nome: "razao", rotulo: "Razão social", max: 200, largo: true, dica: "Nome, CNPJ, contato e logo ficam em Marca." },
  { nome: "instagram", rotulo: "Instagram", max: 60 },
  { nome: "site", rotulo: "Site", max: 200 },
  { nome: "cidade", rotulo: "Cidade base", max: 120, dica: "Origem do deslocamento." },
  {
    nome: "uf",
    rotulo: "UF",
    tipo: "select",
    opcoes: [{ valor: "", nome: "—" }, ...Object.entries(UFS).map(([uf, v]) => ({ valor: uf, nome: `${uf} · ${v.estado}` }))],
    dica: "Preço da gasolina da ANP.",
  },
  { nome: "lat", rotulo: "Latitude da base", tipo: "numero", max: 12, dica: "Opcional: rota automática." },
  { nome: "lon", rotulo: "Longitude da base", tipo: "numero", max: 12 },
  { nome: "validadeDias", rotulo: "Validade do orçamento (dias)", tipo: "numero", max: 3 },
  { nome: "condicoes", rotulo: "Condições padrão", tipo: "area", largo: true, max: 4000, dica: "Uma por linha. Entram em todo orçamento novo." },
  { nome: "fechamento", rotulo: "Fechamento do timbrado", tipo: "area", linhas: 2, largo: true, max: 500 },
];

/**
 * Ajustes → Empresa: razão social, redes, cidade base da calculadora e o padrão do orçamento. Nome, CNPJ, contato,
 * endereço, logo e cor ficam em Ajustes → Marca (drizzle/0011). Só administração muda.
 */
export default async function Empresa() {
  const s = await exigirAcessoNaPagina("/app/ajustes/empresa");
  const e = await lerEmpresa({ sub: s.sub, orgId: s.orgId });
  const inicial = Object.fromEntries(
    Object.entries(e)
      .filter(([k]) => k !== "nomeOrg")
      .map(([k, v]) => [k, v == null ? "" : String(v)]),
  );
  return (
    <div className="pagina pagina--estreita">
      <CabecaForm
        voltar="/app/ajustes"
        titulo={
          <>
            Sua <strong>empresa.</strong>
          </>
        }
      >
        <p className="apoio">{s.papel === "admin" ? "Sai no timbrado de todo orçamento." : "Só a administração muda estes dados."}</p>
      </CabecaForm>
      {s.papel === "admin" ? (
        <Formulario acao={salvarEmpresaAcao} campos={CAMPOS} inicial={inicial} rotulo="Salvar" voltar="/app/ajustes" />
      ) : (
        <section className="ficha">
          <dl>
            <dt>Nome no timbrado</dt>
            <dd>{e.fantasia ?? e.nomeOrg}</dd>
            <dt>Cidade base</dt>
            <dd>{[e.cidade, e.uf].filter(Boolean).join(", ") || "—"}</dd>
          </dl>
          <Link className="glass-btn glass-btn--sm" href="/app/ajustes">
            <Icone nome="voltar" size={15} /> Voltar
          </Link>
        </section>
      )}
    </div>
  );
}

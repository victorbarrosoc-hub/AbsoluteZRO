import Link from "next/link";
import { exigirAcessoNaPagina } from "@/lib/auth/pagina";
import { UFS } from "@/lib/orcamento/deslocamento";
import { lerEmpresa } from "@/lib/organizacao";
import { CabecaForm, Formulario, type DefCampo } from "@/components/form";
import { Icone } from "@/components/icones";
import { salvarEmpresaAcao } from "./acoes";

export const metadata = { title: "Empresa" };

const CAMPOS: DefCampo[] = [
  { nome: "fantasia", rotulo: "Nome no timbrado", max: 120, largo: true, dica: "Sem ele, vale o nome da organização." },
  { nome: "razao", rotulo: "Razão social", max: 200 },
  { nome: "cnpj", rotulo: "CNPJ", max: 20 },
  { nome: "endereco", rotulo: "Endereço", max: 300, largo: true },
  { nome: "email", rotulo: "E-mail", tipo: "email", max: 254 },
  { nome: "telefone", rotulo: "Telefone", tipo: "tel", max: 30 },
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

/** Ajustes → Empresa: os dados que saem no timbrado e a cidade base da calculadora. Só administração muda. */
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

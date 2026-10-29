import { exigirAcessoNaPagina } from "@/lib/auth/pagina";
import { hojeBr } from "@/lib/dinheiro";
import { lerModeloVigente, listarVersoes } from "@/lib/contrato/servidor";
import { lerEmpresa } from "@/lib/organizacao";
import { podeVerDinheiro } from "@/lib/papeis";
import { CabecaForm } from "@/components/form";
import { EditorContrato } from "@/components/contrato/editor";
import { Icone } from "@/components/icones";

export const metadata = { title: "Contrato" };

const quando = (iso: string) =>
  new Date(iso).toLocaleString("pt-BR", {
    day: "2-digit",
    month: "2-digit",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
    timeZone: "America/Sao_Paulo",
  });

/**
 * Ajustes → Contrato: o modelo de contrato de prestação de serviços audiovisuais que vai junto com o orçamento
 * ("Enviar contrato junto"). Administração escreve; gestão lê. Cada "Salvar" é uma versão nova; o histórico fica.
 */
export default async function PaginaContrato() {
  const s = await exigirAcessoNaPagina("/app/ajustes/contrato");
  const ctx = { sub: s.sub, orgId: s.orgId };
  const titulo = (
    <>
      Seu <strong>contrato.</strong>
    </>
  );
  if (!podeVerDinheiro(s.papel))
    return (
      <div className="pagina">
        <CabecaForm voltar="/app/ajustes" titulo={titulo}>
          <p className="apoio">Só administração e gestão veem o contrato.</p>
        </CabecaForm>
      </div>
    );
  const [vigente, versoes, empresa] = await Promise.all([lerModeloVigente(ctx), listarVersoes(ctx), lerEmpresa(ctx)]);
  const admin = s.papel === "admin";
  return (
    <div className="pagina pagina--larga">
      <CabecaForm voltar="/app/ajustes" titulo={titulo}>
        <p className="apoio">
          {admin ? "Vai junto com o orçamento; o cliente aceita pelo link." : "Só a administração muda o contrato."}{" "}
          <span className="sutil">{vigente.versao ? `Versão ${vigente.versao}` : "Modelo base do Maestro"}</span>
        </p>
      </CabecaForm>
      <EditorContrato
        texto={vigente.texto}
        config={vigente.config}
        contratada={{
          nome: empresa.fantasia ?? empresa.nomeOrg,
          razao: empresa.razao,
          cnpj: empresa.cnpj,
          endereco: empresa.endereco,
          email: empresa.email,
          telefone: empresa.telefone,
        }}
        hoje={hojeBr()}
        podeMudar={admin}
      />
      {versoes.length ? (
        <details className="ficha ct-versoes">
          <summary>
            <Icone nome="relogio" size={16} /> Versões ({versoes.length})
          </summary>
          <ol>
            {versoes.map((v) => (
              <li key={v.versao}>
                <b>v{v.versao}</b> {v.padrao ? <span className="selo">modelo base</span> : null}
                <span className="sutil">
                  {quando(v.em)}
                  {v.quem ? ` · ${v.quem}` : ""}
                </span>
              </li>
            ))}
          </ol>
        </details>
      ) : null}
    </div>
  );
}

import { exigirAcessoNaPagina } from "@/lib/auth/pagina";
import { podeEscrever } from "@/lib/papeis";
import { HUB_URL } from "@/lib/site";
import { projetosComPasta, temArquivos } from "@/lib/sobedesce/arquivos";
import { Icone } from "@/components/icones";
import { TelaArquivos } from "@/components/arquivos/tela";
import { EstadoVazio } from "@/components/vazio";
import "../../../arquivos.css";

export const metadata = { title: "Arquivos" };

const SOBEDESCE = (process.env.MAESTRO_SOBEDESCE_URL?.trim() || "https://sobedesce.com").replace(/\/$/, "");

/**
 * Arquivos (plano v2 §5): o Google Drive da pessoa pelo SOBEDESCE. Sem o SOBEDESCE no plano, o cadeado e o caminho
 * para os planos (a rota do token também nega, 403). Com ele, o navegador do Drive e os projetos com a pasta deles.
 */
export default async function Arquivos() {
  const sessao = await exigirAcessoNaPagina("/app/arquivos");
  if (!temArquivos(sessao))
    return (
      <div className="pagina">
        <header className="pagina__cabeca">
          <h1 className="atitle">
            Seus <strong>arquivos.</strong>
          </h1>
        </header>
        <EstadoVazio
          icone="cadeado"
          titulo="Arquivos faz parte dos planos com SOBEDESCE"
          apoio="O Drive da equipe, aqui dentro, com as pastas de cada projeto."
        >
          <div className="vazio__acoes">
            <a className="glass-btn glass-btn--ink" href={`${HUB_URL}/planos`}>
              Ver planos
            </a>
            <a className="glass-btn" href={SOBEDESCE} target="_blank" rel="noreferrer noopener">
              <Icone nome="externo" size={15} /> Conhecer o SOBEDESCE
            </a>
          </div>
        </EstadoVazio>
      </div>
    );
  const projetos = await projetosComPasta(sessao);
  return (
    <div className="pagina pagina--arquivos">
      <header className="pagina__cabeca">
        <h1 className="atitle">
          Seus <strong>arquivos.</strong>
        </h1>
      </header>
      <TelaArquivos projetos={projetos} escreve={podeEscrever(sessao.papel)} sobedesce={SOBEDESCE} />
    </div>
  );
}

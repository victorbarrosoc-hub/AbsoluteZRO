import { exigirAcessoNaPagina } from "@/lib/auth/pagina";
import { NOME_DO_PAPEL } from "@/lib/papeis";
import { emissor } from "@/lib/zro/config";
import { Icone } from "@/components/icones";
import { Avatar, BotaoSair } from "@/components/shell";
import { SeletorDeTema } from "@/components/tema";

export const metadata = { title: "Ajustes" };

/**
 * Ajustes: a conta (perfil único: nome, e-mail e foto se editam na Absolute ZRO), a organização e o papel, o tema.
 * Equipe, revisor/função e ajustes da organização chegam com o Quadro (etapa 1).
 */
export default async function Ajustes() {
  const s = await exigirAcessoNaPagina("/app/ajustes");
  return (
    <div className="pagina">
      <header className="pagina__cabeca">
        <h1 className="atitle">
          <strong>Ajustes.</strong>
        </h1>
        <p className="apoio">Sua conta é a conta Absolute ZRO; o papel vem da organização de lá.</p>
      </header>
      <div className="fichas">
        <section className="ficha" aria-label="Conta">
          <div className="ficha__pessoa">
            <Avatar sessao={s} grande />
            <div>
              <strong>{s.nome ?? s.email}</strong>
              <span className="sutil">{s.email}</span>
            </div>
          </div>
          <div className="acoes">
            <a className="glass-btn glass-btn--sm" href={`${emissor()}/perfil`} target="_blank" rel="noreferrer">
              <Icone nome="externo" size={15} /> Editar na conta Absolute ZRO
            </a>
            <BotaoSair />
          </div>
        </section>
        <section className="ficha" aria-label="Organização">
          <dl>
            <dt>Organização</dt>
            <dd>{s.orgNome}</dd>
            <dt>Seu papel</dt>
            <dd>
              {NOME_DO_PAPEL[s.papel]}
              {s.hubRole ? <span className="sutil"> · {s.hubRole} na Absolute ZRO</span> : null}
            </dd>
            <dt>Tema</dt>
            <dd>
              <SeletorDeTema />
            </dd>
          </dl>
        </section>
      </div>
    </div>
  );
}

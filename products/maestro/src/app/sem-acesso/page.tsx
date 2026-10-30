import { redirect } from "next/navigation";
import { MENSAGEM_SEM_ACESSO, temAcesso } from "@/lib/auth/acesso";
import { exigirSessaoNaPagina } from "@/lib/auth/pagina";
import { produtorasDoFreela } from "@/lib/freelas/area";
import { FERRAMENTAS_ZRO, HUB_URL, ROTAS } from "@/lib/site";
import { MaestroSimbolo, ZroSimbolo } from "@/components/marca";
import { Avatar, BotaoSair } from "@/components/shell";

export const metadata = { title: "Sem acesso" };

/**
 * A pessoa entrou, mas a organização dela ainda não tem o Maestro (zro_products). Uma saída: pedir na Absolute ZRO.
 * Com o gate de lançamento, esta é a tela de "ainda fechado" também (temAcesso decide, lib/auth/acesso.ts).
 */
export default async function SemAcesso() {
  const sessao = await exigirSessaoNaPagina(ROTAS.semAcesso);
  if (temAcesso(sessao)) redirect(ROTAS.app);
  // Freela ligado em alguma produtora (drizzle/0037): "Seus trabalhos".
  if ((await produtorasDoFreela(sessao.sub).catch(() => [])).length) redirect(ROTAS.trabalhos);
  return (
    <div className="abertura">
      <main id="conteudo" className="abertura__miolo">
        <MaestroSimbolo width={160} className="abertura__simbolo" title="Maestro" />
        <h1 className="atitle">
          Sua conta ainda não tem <strong>acesso ao Maestro.</strong>
        </h1>
        <p className="apoio" title={MENSAGEM_SEM_ACESSO}>
          Peça na sua conta Absolute ZRO. Assim que liberar, é só entrar de novo.
        </p>
        <div className="conta conta--inteira" title={sessao.orgNome}>
          <span className="conta__nome">
            {sessao.nome ?? sessao.email} · {sessao.orgNome}
          </span>
          <Avatar sessao={sessao} />
        </div>
        <div className="acoes acoes--centro">
          <a className="glass-btn glass-btn--ink" href={FERRAMENTAS_ZRO}>
            Ver ferramentas na Absolute ZRO
          </a>
          <BotaoSair className="glass-btn" />
        </div>
        <a className="sutil" href={`/api/zro/entrar?volta=${encodeURIComponent(ROTAS.app)}`}>
          Já liberaram? Entrar de novo
        </a>
      </main>
      <footer className="abertura__rodape">
        <a href={HUB_URL}>
          <ZroSimbolo size={18} /> Absolute ZRO
        </a>
      </footer>
    </div>
  );
}

import { redirect } from "next/navigation";
import { temAcesso } from "@/lib/auth/acesso";
import { sessaoDaPagina } from "@/lib/auth/pagina";
import { voltaSegura } from "@/lib/http";
import { mensagemDeErro } from "@/lib/mensagens";
import { HUB_URL, ROTAS } from "@/lib/site";
import { zroConfigurado } from "@/lib/zro/config";
import { MaestroSimbolo, ZroSimbolo } from "@/components/marca";

export const metadata = { title: "Entrar" };

/** Entrar com Absolute ZRO (conta única, ADR 0014): "Criar conta" é o mesmo login com prompt=create. */
export default async function Entrar({ searchParams }: { searchParams: Promise<{ erro?: string; volta?: string }> }) {
  const q = await searchParams;
  const volta = voltaSegura(q.volta, ROTAS.app);
  const sessao = await sessaoDaPagina();
  if (sessao) redirect(temAcesso(sessao) ? volta : ROTAS.semAcesso);
  const erro = mensagemDeErro(q.erro);
  const configurado = zroConfigurado();
  const ida = (modo?: "criar") => `/api/zro/entrar?${new URLSearchParams({ ...(modo ? { modo } : {}), volta })}`;
  return (
    <div className="abertura">
      <main id="conteudo" className="abertura__miolo">
        <MaestroSimbolo width={160} className="abertura__simbolo" title="Maestro" />
        <h1 className="atitle">
          Entrar com <strong>Absolute ZRO.</strong>
        </h1>
        <p className="apoio">Uma conta para todas as ferramentas. Quem convida para a organização é a Absolute ZRO.</p>
        {erro && (
          <p className="erro" role="alert">
            {erro}
          </p>
        )}
        {configurado ? (
          <div className="acoes acoes--centro">
            <a className="glass-btn glass-btn--ink" href={ida()}>
              <ZroSimbolo size={18} /> Entrar
            </a>
            <a className="glass-btn" href={ida("criar")}>
              Criar conta
            </a>
          </div>
        ) : (
          <p className="sutil">O login com Absolute ZRO ainda não está configurado neste endereço.</p>
        )}
      </main>
      <footer className="abertura__rodape">
        <a href={HUB_URL}>
          <ZroSimbolo size={18} /> Absolute ZRO
        </a>
      </footer>
    </div>
  );
}

import type { Metadata } from "next";
import Link from "next/link";
import { AbasConta, IconeZ } from "@/components/conta/abas";
import { Cabecalho } from "@/components/conta/cabecalho";
import { MenuConta } from "@/components/conta/menu";
import { PainelZ } from "@/components/conta/painel-z";
import { BotaoZro } from "@/components/conta/zro";
import { buttonClasses } from "@/components/ui/button";
import { ehAdmin } from "@/lib/admin";
import { usuarioAtual } from "@/lib/auth/atual";
import { SemAcessoZro } from "../sem-acesso";

export const metadata: Metadata = { title: "Z" };

/**
 * A aba da Z, a IA da Absolute ZRO (pedido do titular, 27/10/2026: "uma aba só pra Z em todas as plataformas"). É a
 * primeira aba e a tela de entrada da área logada (lib/auth/volta.ts › destinoDeEntrada). A Z ocupa a tela; sem
 * login, o "Entrar" fica aqui mesmo, e sem o token da Z o painel mostra "Reconectar com Absolute ZRO".
 */
export default async function PaginaZ() {
  const atual = await usuarioAtual();
  if (atual && !atual.liberado) return <SemAcessoZro volta="/z" />;
  const admin = atual ? await ehAdmin(atual.usuario) : false;

  return (
    <div className="flex min-h-dvh flex-col pb-[env(safe-area-inset-bottom)]">
      <Cabecalho
        acao={
          atual ? (
            <MenuConta admin={admin} />
          ) : (
            <Link href="/entrar?volta=%2Fz" className={buttonClasses({ variant: "ghost", size: "sm" })}>
              Entrar
            </Link>
          )
        }
      />
      <AbasConta atual="z" />
      <main className="largura flex-1 pt-5 pb-8 sm:pt-8">
        <h1 className="sr-only">Z, a IA da Absolute ZRO</h1>
        {atual ? (
          <PainelZ nome={atual.usuario.nome.split(" ")[0]} volta="/z" />
        ) : (
          <section className="k-entra grid min-h-[60dvh] place-content-center justify-items-center gap-5 text-center">
            <span className="grid size-20 place-items-center rounded-full bg-surface-2 text-ink ring-1 ring-line">
              <IconeZ className="size-9" />
            </span>
            <p className="font-display text-[26px] leading-tight font-semibold tracking-[-0.02em] text-balance sm:text-[32px]">
              Entre para conversar com a Z.
            </p>
            <BotaoZro modo="entrar" volta="/z" variant="primary">
              Entrar com Absolute ZRO
            </BotaoZro>
          </section>
        )}
      </main>
    </div>
  );
}

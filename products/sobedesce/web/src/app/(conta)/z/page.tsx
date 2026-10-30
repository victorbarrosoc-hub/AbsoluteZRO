import type { Metadata } from "next";
import Link from "next/link";
import { IconeZ, VoltarConta } from "@/components/conta/abas";
import { Cabecalho } from "@/components/conta/cabecalho";
import { MenuConta } from "@/components/conta/menu";
import { PainelZ } from "@/components/conta/painel-z";
import { BotaoZro } from "@/components/conta/zro";
import { buttonClasses } from "@/components/ui/button";
import { ehAdmin } from "@/lib/admin";
import { usuarioAtual } from "@/lib/auth/atual";
import { SemAcessoZro } from "../sem-acesso";
import { SairDiscreto } from "../conta/sair";
import { LigarZro } from "@/components/conta/ligar-zro";
import { listarContas } from "@/lib/google/contas";
import { precisaLigarZro } from "@/lib/zro/ligar";

export const metadata: Metadata = { title: "Z" };

/**
 * A página da Z, a IA da Absolute ZRO. Desde 29/10/2026 (titular; Plano de Integração §7–8) ela não é aba nem a tela
 * de entrada: quem entra cai em /conta (lib/auth/volta.ts) e chega aqui pelo anel discreto do cabeçalho (LinkZ) ou por
 * link direto. A Z ocupa a tela; sem login, o "Entrar" fica aqui mesmo, e sem o token da Z o painel mostra
 * "Reconectar com Absolute ZRO".
 */
export default async function PaginaZ({ searchParams }: { searchParams: Promise<Record<string, string | string[] | undefined>> }) {
  const atual = await usuarioAtual();
  if (atual && !atual.liberado) return <SemAcessoZro volta="/z" />;
  // Conta antiga sem vínculo com a Absolute ZRO: a tela de ligar, uma vez (lib/zro/ligar.ts).
  if (atual && precisaLigarZro(atual)) {
    const [q, drives] = await Promise.all([searchParams, listarContas(atual.usuario.id)]);
    return <LigarZro volta="/z" erro={typeof q.erro === "string" ? q.erro : undefined} temDrive={drives.length > 0} sair={<SairDiscreto />} />;
  }
  const admin = atual ? await ehAdmin(atual.usuario) : false;

  return (
    <div className="flex min-h-dvh flex-col pb-[env(safe-area-inset-bottom)]">
      <Cabecalho
        acao={
          atual ? (
            <MenuConta admin={admin} naZ />
          ) : (
            <Link href="/entrar?volta=%2Fz" className={buttonClasses({ variant: "ghost", size: "sm" })}>
              Entrar
            </Link>
          )
        }
      />
      {atual ? <VoltarConta /> : null}
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

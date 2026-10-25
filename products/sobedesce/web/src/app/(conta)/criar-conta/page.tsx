import type { Metadata } from "next";
import { UserPlus } from "lucide-react";
import Link from "next/link";
import { redirect } from "next/navigation";
import { BotaoZro } from "@/components/conta/zro";
import { Moldura } from "@/components/conta/moldura";
import { buttonClasses } from "@/components/ui/button";
import { usuarioAtual } from "@/lib/auth/atual";
import { voltaSegura } from "@/lib/auth/volta";

export const metadata: Metadata = { title: "Criar conta" };

type Props = { searchParams: Promise<Record<string, string | string[] | undefined>> };

/** Conta nova só pela Absolute ZRO: o botão abre a tela de criar conta de lá (`modo=criar` → `prompt=create`). */
export default async function CriarConta({ searchParams }: Props) {
  const q = await searchParams;
  const volta = voltaSegura(q.volta);
  const atual = await usuarioAtual();
  if (atual?.via === "cookie") redirect(volta);
  const entrar = volta === "/conta" ? "/entrar" : `/entrar?volta=${encodeURIComponent(volta)}`;

  return (
    <Moldura
      estreita
      icone={<UserPlus />}
      titulo="Criar conta"
      subtitulo="A conta do SOBEDESCE é a sua conta Absolute ZRO."
      acao={
        <Link href={entrar} className={buttonClasses({ variant: "ghost", size: "sm" })}>
          Entrar
        </Link>
      }
    >
      <BotaoZro modo="criar" volta={volta} variant="primary" className="w-full">
        Criar com Absolute ZRO
      </BotaoZro>
      <p className="mt-3 text-center text-[13px] leading-relaxed text-pretty text-ink-3">Depois, conecte o Drive em Sua conta.</p>
      <p className="mt-12 text-center text-[15px] text-ink-2">
        Já tem conta?{" "}
        <Link href={entrar} className="toque font-medium text-ink underline-offset-4 hover:underline">
          Entrar
        </Link>
      </p>
    </Moldura>
  );
}

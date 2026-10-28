import type { Metadata } from "next";
import { LogIn } from "lucide-react";
import Link from "next/link";
import { redirect } from "next/navigation";
import { Aviso } from "@/components/conta/aviso";
import { BotaoZro } from "@/components/conta/zro";
import { mensagemDeErro } from "@/components/conta/mensagens";
import { Moldura } from "@/components/conta/moldura";
import { buttonClasses } from "@/components/ui/button";
import { usuarioAtual } from "@/lib/auth/atual";
import { destinoDeEntrada, voltaSegura } from "@/lib/auth/volta";
import { FormEntrar } from "./form";

export const metadata: Metadata = { title: "Entrar" };

type Props = { searchParams: Promise<Record<string, string | string[] | undefined>> };

export default async function Entrar({ searchParams }: Props) {
  const q = await searchParams;
  const volta = voltaSegura(q.volta);
  const atual = await usuarioAtual();
  if (atual?.via === "cookie") redirect(destinoDeEntrada(volta));

  const erro = typeof q.erro === "string" ? q.erro : undefined;
  const comVolta = (caminho: string) => (volta === "/conta" ? caminho : `${caminho}?volta=${encodeURIComponent(volta)}`);

  return (
    <Moldura
      estreita
      icone={<LogIn />}
      titulo="Entrar"
      subtitulo="Com a sua conta Absolute ZRO."
      acao={
        <Link href={comVolta("/criar-conta")} className={buttonClasses({ variant: "ghost", size: "sm" })}>
          Criar conta
        </Link>
      }
    >
      {mensagemDeErro(erro) ? (
        <Aviso tom={erro === "google_recusado" || erro === "zro_recusado" ? "info" : "erro"} className="mb-8">
          <p>{mensagemDeErro(erro)}</p>
          {erro === "zro_email_nao_verificado" ? (
            <p className="mt-3">
              <a href="https://absolutezro.com/boas-vindas" className="toque font-medium text-ink underline underline-offset-4">
                Reenviar o link na Absolute ZRO
              </a>
            </p>
          ) : null}
        </Aviso>
      ) : null}

      <BotaoZro modo="entrar" volta={volta} variant="primary" className="w-full">
        Entrar com Absolute ZRO
      </BotaoZro>
      <p className="mt-3 text-center text-[13px] leading-relaxed text-pretty text-ink-3">A sua conta da família Absolute ZRO.</p>

      {/* Contas antigas do SOBEDESCE (com senha própria) continuam entrando por aqui; conta nova é só Absolute ZRO. */}
      <details className="mt-10 group" open={erro === "senha" || erro === "credenciais"}>
        <summary className="toque cursor-pointer list-none text-center text-[13px] text-ink-3 hover:text-ink">
          Tenho conta antiga do SOBEDESCE
        </summary>
        <div className="mt-6">
          <FormEntrar volta={volta} />
        </div>
      </details>

      <p className="mt-12 text-center text-[15px] text-ink-2">
        Ainda não tem conta?{" "}
        <Link href={comVolta("/criar-conta")} className="toque font-medium text-ink underline-offset-4 hover:underline">
          Criar com Absolute ZRO
        </Link>
      </p>
    </Moldura>
  );
}

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
        </Aviso>
      ) : null}

      <BotaoZro modo="entrar" volta={volta} variant="primary" className="w-full">
        Entrar com Absolute ZRO
      </BotaoZro>
      <p className="mt-3 text-center text-[13px] leading-relaxed text-pretty text-ink-3">A sua conta da família Absolute ZRO.</p>

      <div className="my-8 flex items-center gap-4 text-[13px] text-ink-3" aria-hidden>
        <span className="h-px flex-1 bg-line" />
        ou com e-mail
        <span className="h-px flex-1 bg-line" />
      </div>

      <FormEntrar volta={volta} />

      <p className="mt-12 text-center text-[15px] text-ink-2">
        Ainda não tem conta?{" "}
        <Link href={comVolta("/criar-conta")} className="toque font-medium text-ink underline-offset-4 hover:underline">
          Criar com Absolute ZRO
        </Link>
      </p>
    </Moldura>
  );
}

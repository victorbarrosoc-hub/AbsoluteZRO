import { Aviso } from "@/components/conta/aviso";
import { LogoZro } from "@/components/conta/zro";
import { mensagemDeErro } from "@/components/conta/mensagens";
import { buttonClasses } from "@/components/ui/button";
import { BOTAO_LIGAR_ZRO, caminhoLigarZro, TITULO_LIGAR_ZRO } from "@/lib/zro/ligar";

/**
 * "Agora sua conta é Absolute ZRO" (lib/zro/ligar.ts): a tela inteira, uma vez, para a conta antiga sem vínculo. O
 * símbolo grande, o título, um botão (o vincular de sempre) e uma linha pequena. Sem ícone no botão: o símbolo já
 * está em cima. `sair`: o "Sair" discreto no canto (a pessoa não fica presa). `erro`: o ?erro= da volta.
 */
export function LigarZro({ volta, erro, temDrive, sair }: { volta: string; erro?: string; temDrive: boolean; sair?: React.ReactNode }) {
  const recado = mensagemDeErro(erro);
  return (
    <div className="relative flex min-h-dvh flex-col bg-bg px-5 pt-[env(safe-area-inset-top)] pb-[env(safe-area-inset-bottom)]" data-ligar-zro>
      {sair ? <div className="absolute top-[calc(env(safe-area-inset-top)+12px)] right-3 sm:top-5 sm:right-6">{sair}</div> : null}
      <main className="mx-auto grid w-full max-w-[440px] flex-1 content-center justify-items-center gap-0 py-16 text-center">
        <span className="k-entra grid size-[104px] place-items-center text-ink sm:size-[120px]" aria-hidden>
          <LogoZro className="size-full!" />
        </span>
        <h1
          className="k-entra mt-8 font-display text-[34px] leading-[1.08] font-semibold tracking-[-0.025em] text-balance text-ink sm:text-[44px]"
          style={{ "--i": 1 } as React.CSSProperties}
        >
          {TITULO_LIGAR_ZRO}
        </h1>
        {recado ? (
          <Aviso tom={erro === "zro_recusado" ? "info" : "erro"} className="k-entra mt-6 w-full text-left">
            <p>{recado}</p>
          </Aviso>
        ) : null}
        <div className="k-entra mt-10 grid w-full justify-items-center gap-4" style={{ "--i": 2 } as React.CSSProperties}>
          <a href={caminhoLigarZro(volta)} className={buttonClasses({ variant: "primary", size: "lg", className: "w-full sm:w-auto sm:min-w-[300px]" })}>
            {BOTAO_LIGAR_ZRO}
          </a>
          <p className="text-[13px] text-ink-3">{temDrive ? "Seu Google Drive continua conectado." : "Nada muda nos seus arquivos."}</p>
        </div>
      </main>
    </div>
  );
}

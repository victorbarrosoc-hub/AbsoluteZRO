import { BotaoGoogle } from "@/components/conta/google";
import { UsarOutraConta } from "@/components/conta/outra-conta";
import { BotaoZro } from "@/components/conta/zro";

/** Caminho do "Entrar com Absolute ZRO" pedindo a conta de novo (prompt=login), para o "Usar outra conta". */
export function caminhoEntrarOutraConta(volta: string): string {
  return `/api/zro/entrar?${new URLSearchParams({ modo: "entrar", volta, trocar: "1" })}`;
}

/**
 * As opções de /entrar (decisão do titular, 01/11/2026: os logins antigos saem da tela): "Entrar com Absolute ZRO" é a
 * única porta, com "Usar outra conta" discreto logo abaixo. As contas antigas do SOBEDESCE (Google de entrar e e-mail e
 * senha) não somem do servidor: quem tem uma conta de antes sem vínculo e entra pela Absolute ZRO com o mesmo e-mail
 * volta com `zro_email_em_uso`, e só então (`contaAntiga`) aparecem as portas antigas, para entrar uma vez e ligar a
 * Absolute ZRO (a tela "Agora sua conta é Absolute ZRO" faz o resto). Assim ninguém perde os dados dele.
 * `formulario`: o de e-mail e senha (componente de cliente; os testes passam outro). `abrirFormulario`: erro de senha.
 */
export function OpcoesEntrar({ volta, formulario, abrirFormulario, contaAntiga }: { volta: string; formulario: React.ReactNode; abrirFormulario?: boolean; contaAntiga?: boolean }) {
  return (
    <div className="grid" data-opcoes-entrar>
      <BotaoZro modo="entrar" volta={volta} variant="primary" className="w-full">
        Entrar com Absolute ZRO
      </BotaoZro>
      <UsarOutraConta href={caminhoEntrarOutraConta(volta)} className="mt-4 justify-self-center" />
      {contaAntiga ? <PortasAntigas volta={volta} formulario={formulario} abrirFormulario={abrirFormulario} /> : null}
    </div>
  );
}

/** A conta antiga do SOBEDESCE (Google de entrar ou senha própria), só para ligar à Absolute ZRO; não cria conta. */
function PortasAntigas({ volta, formulario, abrirFormulario }: { volta: string; formulario: React.ReactNode; abrirFormulario?: boolean }) {
  return (
    <>
      <p className="mt-10 flex items-center gap-3 text-[12px] text-ink-3">
        <span className="h-px flex-1 bg-line" aria-hidden />
        Conta antiga do SOBEDESCE
        <span className="h-px flex-1 bg-line" aria-hidden />
      </p>
      <BotaoGoogle modo="entrar" volta={volta} variant="secondary" className="mt-5 w-full">
        Entrar com Google
      </BotaoGoogle>
      <details className="group mt-3" open={abrirFormulario} data-entrada="senha">
        <summary className="toque flex h-12 cursor-pointer list-none items-center justify-center rounded-full text-[15px] text-ink-2 hover:text-ink [&::-webkit-details-marker]:hidden">
          Entrar com e-mail e senha
        </summary>
        <div className="mt-4">{formulario}</div>
      </details>
    </>
  );
}

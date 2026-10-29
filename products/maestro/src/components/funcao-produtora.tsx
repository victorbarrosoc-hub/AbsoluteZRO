"use client";
/**
 * Função na produtora (Ajustes › Pessoas): funcionário, editor, câmera… É só descrição, separada do papel de acesso
 * (que vem da Absolute ZRO). Texto livre com sugestões; só administração muda (a action e o banco conferem).
 */
import { useActionState } from "react";
import { useFormStatus } from "react-dom";
import { salvarFuncaoAcao } from "@/app/(app)/app/ajustes/pessoas/acoes";

function Salvar() {
  const { pending } = useFormStatus();
  return (
    <button type="submit" className="glass-btn glass-btn--sm" disabled={pending}>
      {pending ? "Salvando…" : "Salvar"}
    </button>
  );
}

export function FuncaoProdutora({ sub, nome, funcao, sugestoes }: { sub: string; nome: string; funcao: string | null; sugestoes: readonly string[] }) {
  const [estado, enviar] = useActionState(salvarFuncaoAcao, undefined);
  const lista = `funcoes-${sub}`;
  return (
    <form action={enviar} className="pessoa__funcao">
      <input type="hidden" name="sub" value={sub} />
      <input name="funcao" defaultValue={funcao ?? ""} maxLength={40} list={lista} placeholder="Ex.: Editor" aria-label={`Função de ${nome} na produtora`} />
      <datalist id={lista}>
        {sugestoes.map((s) => (
          <option key={s} value={s} />
        ))}
      </datalist>
      <Salvar />
      {estado?.mensagem ? (
        <small role="alert" className="pzro__erro">
          {estado.mensagem}
        </small>
      ) : estado?.aviso ? (
        <small role="status" className="pzro__ok">
          {estado.aviso}
        </small>
      ) : null}
    </form>
  );
}

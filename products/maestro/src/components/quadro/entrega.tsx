"use client";
/**
 * "Enviar a entrega" (titular, 04/11/2026): o arquivo final sobe para a pasta "Entrega" do card pelo próprio SOBEDESCE,
 * num quadro (`?no=maestro&modo=enviar&pasta=<id>`, contrato 2 em `src/lib/sobedesce/embutido.ts`). O arquivo vai
 * direto do aparelho para o Google; nada passa pelo Maestro. Cada arquivo terminado volta pelo recado `enviado`, com a
 * conferência do SOBEDESCE (MD5 do aparelho = MD5 do Drive é "Conferido"; sem MD5, "Sem conferência"; diferente, "Não
 * conferiu" e não vira versão). "Usar como versão" só preenche o campo da versão: quem adiciona é a pessoa.
 *
 * Só aparece quando o SOBEDESCE publicado diz que sabe (`useRecursoSobedesce("enviar")`); sem o `pronto` a tempo, o
 * aviso curto com o link, nunca um quadro quebrado.
 */
import { useEffect, useRef, useState } from "react";
import { enderecoParaEnviar, lerRecado, SOBEDESCE_APP, type ArquivoEnviado } from "@/lib/sobedesce/embutido";
import type { PastaDoCard } from "@/lib/quadro/pastas";
import { Folha, useFecharFolha } from "@/components/folha";
import { Icone } from "@/components/icones";
import { useTema } from "@/components/use-tema";
import "@/app/arquivos-sobedesce.css";

const FOLGA_DO_PRONTO = 4000;
const ESPERA_MAXIMA = 25_000;

const CONFERENCIA: Record<ArquivoEnviado["conferencia"], { rotulo: string; dica: string }> = {
  ok: { rotulo: "Conferido", dica: "O MD5 do arquivo bate com o do Drive." },
  sem: { rotulo: "Sem conferência", dica: "O tamanho confere; o MD5 não foi conferido." },
  diferente: { rotulo: "Não conferiu", dica: "O MD5 do Drive é diferente do arquivo. Envie de novo." },
};

export function FolhaEntrega(p: { pasta: PastaDoCard; aoFechar: () => void; aoUsar: (a: ArquivoEnviado) => void }) {
  return (
    <Folha rotulo="Enviar a entrega" aoFechar={p.aoFechar} className="en-folha">
      <Conteudo {...p} />
    </Folha>
  );
}

function Conteudo({ pasta, aoUsar }: { pasta: PastaDoCard; aoUsar: (a: ArquivoEnviado) => void }) {
  const fechar = useFecharFolha();
  const tema = useTema();
  const quadro = useRef<HTMLIFrameElement>(null);
  const [endereco, setEndereco] = useState<string | null>(null);
  const [fase, setFase] = useState<"abrindo" | "pronto" | "falhou">("abrindo");
  const [enviados, setEnviados] = useState<ArquivoEnviado[]>([]);
  // o endereço nasce uma vez, no tema da hora (trocar o tema não recarrega o envio)
  if (!endereco && tema) setEndereco(enderecoParaEnviar(tema, pasta));

  useEffect(() => {
    const aoReceber = (e: MessageEvent) => {
      const janela = quadro.current?.contentWindow;
      if (!janela || e.source !== janela) return;
      const r = lerRecado(e.origin, e.data);
      if (r?.tipo === "pronto") setFase((f) => (f === "falhou" ? f : "pronto"));
      else if (r?.tipo === "enviado" && r.arquivo.pasta === pasta.id)
        setEnviados((l) => (l.some((x) => x.id === r.arquivo.id) ? l : [r.arquivo, ...l].slice(0, 20)));
    };
    window.addEventListener("message", aoReceber);
    return () => window.removeEventListener("message", aoReceber);
  }, [pasta.id]);

  useEffect(() => {
    if (!endereco || fase !== "abrindo") return;
    const t = window.setTimeout(() => setFase((f) => (f === "abrindo" ? "falhou" : f)), ESPERA_MAXIMA);
    return () => clearTimeout(t);
  }, [endereco, fase]);

  return (
    <div className="en">
      <div className="pc-folha__topo">
        <div className="en__titulo">
          <h2>Enviar a entrega</h2>
          <a className="en__pasta" href={pasta.url} target="_blank" rel="noreferrer noopener" title="Abrir a pasta no Drive">
            <Icone nome="pasta" size={14} />
            {pasta.nome}
          </a>
        </div>
        <button type="button" className="q-icone-btn" onClick={fechar} aria-label="Fechar">
          <Icone nome="fechar" size={18} />
        </button>
      </div>

      {enviados.length ? (
        <ul className="en__lista" aria-label="Enviados">
          {enviados.map((a) => (
            <li key={a.id} data-conferencia={a.conferencia}>
              <Icone nome="filme" size={16} />
              <span className="en__nome">{a.nome}</span>
              <span className="en__selo" title={CONFERENCIA[a.conferencia].dica}>
                <i aria-hidden="true" />
                {CONFERENCIA[a.conferencia].rotulo}
              </span>
              {a.conferencia !== "diferente" ? (
                <button
                  type="button"
                  className="glass-btn glass-btn--sm glass-btn--ink"
                  onClick={() => {
                    aoUsar(a);
                    fechar();
                  }}
                >
                  Usar como versão
                </button>
              ) : null}
            </li>
          ))}
        </ul>
      ) : null}

      <div className="en__palco" data-fase={fase}>
        {endereco && fase !== "falhou" ? (
          <iframe
            ref={quadro}
            className="en__quadro"
            src={endereco}
            title="SOBEDESCE: enviar para a pasta de entrega"
            allow="clipboard-write"
            onLoad={() => window.setTimeout(() => setFase((f) => (f === "abrindo" ? "falhou" : f)), FOLGA_DO_PRONTO)}
          />
        ) : null}
        {fase === "abrindo" ? (
          <div className="sd-abrindo" aria-busy="true">
            <span className="sd-abrindo__ponto" aria-hidden="true" />
            <span className="sr-only">Abrindo o SOBEDESCE</span>
          </div>
        ) : null}
        {fase === "falhou" ? (
          <div className="sd-falhou" role="status">
            <Icone nome="arquivos" size={28} />
            <p>O SOBEDESCE não abriu aqui.</p>
            <a className="glass-btn glass-btn--ink" href={SOBEDESCE_APP} target="_blank" rel="noreferrer noopener">
              <Icone nome="externo" size={15} /> Abrir o SOBEDESCE
            </a>
          </div>
        ) : null}
      </div>
    </div>
  );
}

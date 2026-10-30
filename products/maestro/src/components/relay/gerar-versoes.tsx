"use client";
/**
 * A folha "Gerar versões com o Relay" (contrato "Maestro → Relay" em docs/integration-contracts/relay.md): escolha de
 * até 8 destinos (primeiro os de entrega ao cliente, o resto em "Mais"), a pasta (05 Entregas do projeto ou ao lado do
 * original), a prévia de cada arquivo (nome, codec e peso pelo `planejar` do Relay com os metadados do Drive) e o
 * botão "Gerar N versões". Sem o SOBEDESCE ou sem o Relay no plano, só o porquê e o link; nada é pedido.
 */
import { useEffect, useMemo, useState } from "react";
import { gerarVersoesAcao, prepararRelayAcao } from "@/app/(app)/app/aprovacoes/relay-acoes";
import type { Computador, Entregavel, Preparo } from "@/lib/relay/entregaveis";
import { alternar, MAX_PRESETS, origemDoDrive, presetsDaFolha, previa, type MetadadosDrive, type PresetMaestro } from "@/lib/relay/escolha";
import { contaQueVe } from "@/components/arquivos/drive-cliente";
import { Folha, useFecharFolha } from "@/components/folha";
import { Icone } from "@/components/icones";

type Origem = { nome: string; meta: MetadadosDrive; conta: string | null } | null;

/** Um preset na lista: marcar e desmarcar como um interruptor. */
function Opcao({ p, marcado, aoMudar }: { p: PresetMaestro; marcado: boolean; aoMudar: () => void }) {
  return (
    <li>
      <label className="rl-opcao" data-marcado={marcado || undefined} title={p.dica ?? p.resumo}>
        <input type="checkbox" checked={marcado} onChange={aoMudar} />
        <span className="rl-opcao__caixa" aria-hidden="true">
          {marcado ? <Icone nome="check" size={13} /> : null}
        </span>
        <span className="rl-opcao__nome">{p.nome}</span>
      </label>
    </li>
  );
}

function Corpo({ versaoId, aoPedir }: { versaoId: string; aoPedir: (lista: Entregavel[], c: Computador | null) => void }) {
  const fechar = useFecharFolha();
  const [prep, setPrep] = useState<Preparo | null>(null);
  const [falha, setFalha] = useState<string | null>(null);
  const [origem, setOrigem] = useState<Origem | undefined>(undefined);
  const [escolhidos, setEscolhidos] = useState<string[]>([]);
  const [cheio, setCheio] = useState(false);
  const [destino, setDestino] = useState<"entregas" | "original">("entregas");
  const [enviando, setEnviando] = useState(false);
  const [erro, setErro] = useState<string | null>(null);
  const { principais, mais } = useMemo(() => presetsDaFolha(), []);

  useEffect(() => {
    let vivo = true;
    prepararRelayAcao(versaoId).then(
      (r) => {
        if (!vivo) return;
        if (!r.ok) return setFalha(r.mensagem);
        setPrep(r);
        if (r.destino?.tipo === "original" || (!r.destino && r.avisoDestino)) setDestino("original");
        // os destinos que ainda não foram pedidos, para começar (os que já existem aparecem na lista da versão)
        const ja = new Set(r.entregaveis.filter((e) => e.status !== "cancelado" && e.status !== "erro").map((e) => e.preset));
        setEscolhidos(["youtube-1080", "reels", "whatsapp"].filter((id) => !ja.has(id)));
        if (!r.podeGerar) return;
        // os metadados do vídeo vêm do Drive direto no navegador (token curto da pessoa, como no player)
        contaQueVe(r.versao.driveId).then(
          (v) => vivo && setOrigem(v ? { nome: v.arquivo.name, meta: v.arquivo.videoMediaMetadata, conta: v.conta || null } : null),
          () => vivo && setOrigem(null),
        );
      },
      () => vivo && setFalha("Não deu para abrir agora. Tente de novo."),
    );
    return () => {
      vivo = false;
    };
  }, [versaoId]);

  const nomeOriginal = origem?.nome ?? prep?.versao.titulo ?? "video";
  const linhas = useMemo(() => previa(nomeOriginal, escolhidos, origemDoDrive(origem?.meta)), [nomeOriginal, escolhidos, origem]);
  const impossiveis = linhas.filter((l) => l.impossivel);

  const mudar = (id: string) => {
    const r = alternar(escolhidos, id);
    setEscolhidos(r.lista);
    setCheio(r.cheio);
  };

  if (falha)
    return (
      <div className="rl-folha__corpo">
        <p className="rl-erro" role="alert">
          {falha}
        </p>
      </div>
    );
  if (!prep)
    return (
      <div className="rl-folha__corpo" aria-busy="true">
        <p className="rl-apoio">Abrindo…</p>
      </div>
    );
  if (!prep.disponivel.ok) {
    const d = prep.disponivel;
    return (
      <div className="rl-folha__corpo rl-folha__sem">
        <h3>{d.titulo}</h3>
        <p className="rl-apoio">{d.mensagem}</p>
        <div className="rl-folha__acoes">
          <a className="glass-btn glass-btn--ink" href={d.link.href} target="_blank" rel="noreferrer noopener">
            {d.link.rotulo}
          </a>
          <button type="button" className="glass-btn" onClick={fechar}>
            Fechar
          </button>
        </div>
      </div>
    );
  }
  if (!prep.podeGerar)
    return (
      <div className="rl-folha__corpo rl-folha__sem">
        <p className="rl-apoio">Seu papel nesta organização só lê.</p>
      </div>
    );

  const d = prep.destino;
  const n = escolhidos.length;
  const pronto = n > 0 && !impossiveis.length && !enviando && origem !== undefined;

  return (
    <div className="rl-folha__corpo">
      <fieldset className="rl-grupo">
        <legend>
          Para onde vai <span className="rl-conta">{`${n} de ${MAX_PRESETS}`}</span>
        </legend>
        <ul className="rl-opcoes">
          {principais.map((p) => (
            <Opcao key={p.id} p={p} marcado={escolhidos.includes(p.id)} aoMudar={() => mudar(p.id)} />
          ))}
        </ul>
        <details className="rl-mais">
          <summary>Mais</summary>
          <ul className="rl-opcoes">
            {mais.map((p) => (
              <Opcao key={p.id} p={p} marcado={escolhidos.includes(p.id)} aoMudar={() => mudar(p.id)} />
            ))}
          </ul>
        </details>
        {cheio ? (
          <p className="rl-apoio" role="status">
            No máximo {MAX_PRESETS} de uma vez.
          </p>
        ) : null}
      </fieldset>

      <fieldset className="rl-grupo">
        <legend>Pasta</legend>
        <div className="q-segmentos rl-destino" role="radiogroup" aria-label="Pasta">
          {d && d.tipo !== "original" ? (
            <button type="button" role="radio" aria-checked={destino === "entregas"} onClick={() => setDestino("entregas")} title={d.caminho}>
              <Icone nome="pasta" size={14} /> {d.nome}
            </button>
          ) : null}
          <button type="button" role="radio" aria-checked={destino === "original"} onClick={() => setDestino("original")}>
            Ao lado do original
          </button>
        </div>
        {d?.tipo === "entregas" && !d.id && destino === "entregas" ? <p className="rl-apoio">Criamos {d.caminho}/05 Entregas no Drive.</p> : null}
        {prep.avisoDestino ? <p className="rl-apoio">{prep.avisoDestino}</p> : null}
      </fieldset>

      {linhas.length ? (
        <ul className="rl-previa" aria-label="Prévia">
          {linhas.map((l) => (
            <li key={l.preset} data-impossivel={l.impossivel ? true : undefined}>
              <span className="rl-previa__arquivo" title={l.arquivo}>
                <Icone nome="filme" size={14} /> {l.arquivo}
              </span>
              <span className="rl-previa__meta">
                {l.codec} · {l.peso}
              </span>
              {l.impossivel ? (
                <span className="rl-previa__aviso">{l.impossivel}</span>
              ) : l.avisos.length ? (
                <span className="rl-previa__aviso" title={l.avisos.join(" ")}>
                  {l.avisos[0]}
                </span>
              ) : null}
            </li>
          ))}
        </ul>
      ) : null}
      {origem === null ? <p className="rl-apoio">Sem os dados do vídeo no Drive: o peso aparece quando ficar pronto.</p> : null}

      {erro ? (
        <p className="rl-erro" role="alert">
          {erro}
        </p>
      ) : null}
      <div className="rl-folha__acoes">
        <button
          type="button"
          className="glass-btn glass-btn--ink"
          disabled={!pronto}
          onClick={async () => {
            setEnviando(true);
            setErro(null);
            const r = await gerarVersoesAcao({ versaoId, presets: escolhidos, destino, conta: origem?.conta ?? null }).catch(() => null);
            setEnviando(false);
            if (!r) return setErro("Não deu para pedir agora. Tente de novo.");
            if (!r.ok) return setErro(r.mensagem);
            aoPedir(r.entregaveis, r.computador);
            fechar();
          }}
        >
          {enviando ? "Pedindo…" : n === 1 ? "Gerar 1 versão" : `Gerar ${n} versões`}
        </button>
        <button type="button" className="glass-btn" onClick={fechar}>
          Cancelar
        </button>
      </div>
    </div>
  );
}

export function GerarVersoes({
  versaoId,
  titulo,
  aoFechar,
  aoPedir,
}: {
  versaoId: string;
  titulo: string;
  aoFechar: () => void;
  aoPedir: (lista: Entregavel[], c: Computador | null) => void;
}) {
  return (
    <Folha rotulo="Gerar versões" aoFechar={aoFechar} tamanho="acao" className="rl-folha">
      <header className="rl-folha__topo">
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img src="/brand/relay-icone.svg" alt="Relay" width={40} height={40} className="rl-folha__marca" />
        <div>
          <h2>Gerar versões</h2>
          <p className="rl-apoio" title={titulo}>
            {titulo} · com o Relay
          </p>
        </div>
      </header>
      <Corpo versaoId={versaoId} aoPedir={aoPedir} />
    </Folha>
  );
}

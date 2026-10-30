"use client";
/**
 * "•••" do roteiro: quem fala (elenco), formato e tempo (alvo e palavras por minuto), a ligação com projeto e card, o
 * estado (só administração e gestão) e a lixeira. Tudo grava pelo mesmo caminho do editor.
 */
import { useState } from "react";
import { apagarPessoa, lerTempo, mudarPessoa, novaPessoa } from "@/lib/criacao/roteiro/editar";
import { FORMATOS, LIMITES, NOME_PAPEL_PESSOA, PAPEIS_PESSOA, type PapelPessoa, type Roteiro } from "@/lib/criacao/roteiro/modelo";
import { ESTADOS_ROTEIRO, type EstadoRoteiro, NOME_ESTADO_ROTEIRO } from "@/lib/criacao/roteiro/nomes";
import { formatarTempo } from "@/lib/criacao/roteiro/tempo";
import { Folha } from "@/components/folha";
import { Icone } from "@/components/icones";
import type { OpcoesVinculo } from "./novo";

type Props = {
  roteiro: Roteiro;
  mudar: (fn: (r: Roteiro) => Roteiro) => void;
  editavel: boolean;
  podeEstado: boolean;
  estado: EstadoRoteiro;
  mudarEstado: (e: EstadoRoteiro) => Promise<string | null>;
  vinculo: { projetoId: string | null; cardId: string | null };
  ligar: (v: { projetoId: string | null; cardId: string | null }) => Promise<string | null>;
  opcoes: OpcoesVinculo;
  lixeira: () => Promise<string | null>;
  aoFechar: () => void;
};

function Alvo({ roteiro, mudar, editavel }: Pick<Props, "roteiro" | "mudar" | "editavel">) {
  const [min, setMin] = useState(roteiro.alvo ? formatarTempo(roteiro.alvo.min) : "");
  const [max, setMax] = useState(roteiro.alvo ? formatarTempo(roteiro.alvo.max) : "");
  const gravar = (a: string, b: string) => {
    const lo = lerTempo(a);
    const hi = lerTempo(b);
    mudar((r) => ({ ...r, alvo: lo || hi ? { min: Math.round(Math.min(lo ?? hi!, hi ?? lo!)), max: Math.round(Math.max(lo ?? hi!, hi ?? lo!)) } : null }));
  };
  return (
    <div className="cr-ajustes__alvo">
      <label className="q-campo">
        <span>Alvo de</span>
        <input
          value={min}
          placeholder="0:30"
          inputMode="numeric"
          readOnly={!editavel}
          onChange={(e) => setMin(e.target.value)}
          onBlur={() => gravar(min, max)}
        />
      </label>
      <label className="q-campo">
        <span>até</span>
        <input
          value={max}
          placeholder="1:00"
          inputMode="numeric"
          readOnly={!editavel}
          onChange={(e) => setMax(e.target.value)}
          onBlur={() => gravar(min, max)}
        />
      </label>
      <label className="q-campo">
        <span>Palavras por minuto</span>
        <input
          type="number"
          min={LIMITES.wpmMin}
          max={LIMITES.wpmMax}
          defaultValue={roteiro.wpm}
          readOnly={!editavel}
          onBlur={(e) => {
            const n = Math.round(Number(e.target.value));
            if (Number.isFinite(n) && n >= LIMITES.wpmMin && n <= LIMITES.wpmMax) mudar((r) => ({ ...r, wpm: n }));
          }}
        />
      </label>
    </div>
  );
}

export function FolhaAjustes(p: Props) {
  const [msg, setMsg] = useState<string | null>(null);
  const [certeza, setCerteza] = useState(false);
  const r = p.roteiro;
  const responder = async (x: Promise<string | null>) => setMsg(await x);
  return (
    <Folha rotulo="Ajustes do roteiro" aoFechar={p.aoFechar} className="cr-ajustes">
      <h2 className="cr-folha__titulo">Ajustes do roteiro</h2>

      <section className="cr-ajustes__secao" aria-label="Quem fala">
        <h3>Quem fala</h3>
        {r.pessoas.length ? (
          <ul className="cr-elenco">
            {r.pessoas.map((x) => (
              <li key={x.id}>
                <input
                  value={x.nome}
                  placeholder={x.dica ?? NOME_PAPEL_PESSOA[x.papel]}
                  aria-label="Nome"
                  maxLength={80}
                  readOnly={!p.editavel}
                  onChange={(e) => p.mudar((rr) => mudarPessoa(rr, x.id, { nome: e.target.value }))}
                />
                <select
                  className="cr-sel"
                  value={x.papel}
                  aria-label="Papel"
                  disabled={!p.editavel}
                  onChange={(e) => p.mudar((rr) => mudarPessoa(rr, x.id, { papel: e.target.value as PapelPessoa }))}
                >
                  {PAPEIS_PESSOA.map((k) => (
                    <option key={k} value={k}>
                      {NOME_PAPEL_PESSOA[k]}
                    </option>
                  ))}
                </select>
                {p.editavel ? (
                  <button
                    type="button"
                    className="cr-icone"
                    onClick={() => p.mudar((rr) => apagarPessoa(rr, x.id))}
                    aria-label={`Tirar ${x.nome || NOME_PAPEL_PESSOA[x.papel]}`}
                  >
                    <Icone nome="fechar" size={15} />
                  </button>
                ) : null}
              </li>
            ))}
          </ul>
        ) : (
          <p className="nada">Ninguém ainda. As falas sem pessoa saem como “Voz”.</p>
        )}
        {p.editavel ? (
          <button type="button" className="glass-btn glass-btn--sm" onClick={() => p.mudar((rr) => novaPessoa(rr, "", "locutor").roteiro)}>
            <Icone nome="mais" size={15} /> Pessoa
          </button>
        ) : null}
      </section>

      <section className="cr-ajustes__secao" aria-label="Formato e tempo">
        <h3>Formato e tempo</h3>
        <div className="q-segmentos" role="radiogroup" aria-label="Formato">
          {FORMATOS.map((f) => (
            <button
              key={f}
              type="button"
              role="radio"
              aria-checked={r.formato === f}
              disabled={!p.editavel}
              onClick={() => p.mudar((rr) => ({ ...rr, formato: f }))}
            >
              {f}
            </button>
          ))}
        </div>
        <Alvo roteiro={r} mudar={p.mudar} editavel={p.editavel} />
      </section>

      {p.editavel ? (
        <section className="cr-ajustes__secao" aria-label="Ligação">
          <h3>Ligado a</h3>
          <div className="cr-novo__selects">
            <label className="q-campo">
              <span>Projeto</span>
              <select value={p.vinculo.projetoId ?? ""} onChange={(e) => void responder(p.ligar({ ...p.vinculo, projetoId: e.target.value || null }))}>
                <option value="">Nenhum</option>
                {p.opcoes.projetos.map((x) => (
                  <option key={x.id} value={x.id}>
                    {x.codigo} · {x.titulo}
                  </option>
                ))}
              </select>
            </label>
            <label className="q-campo">
              <span>Card</span>
              <select value={p.vinculo.cardId ?? ""} onChange={(e) => void responder(p.ligar({ ...p.vinculo, cardId: e.target.value || null }))}>
                <option value="">Nenhum</option>
                {p.opcoes.cards.map((x) => (
                  <option key={x.id} value={x.id}>
                    {x.tema}
                  </option>
                ))}
              </select>
            </label>
          </div>
        </section>
      ) : null}

      {p.podeEstado ? (
        <section className="cr-ajustes__secao" aria-label="Estado">
          <h3>Estado</h3>
          <div className="q-segmentos cr-estados" role="radiogroup" aria-label="Estado do roteiro">
            {ESTADOS_ROTEIRO.map((e) => (
              <button key={e} type="button" role="radio" aria-checked={p.estado === e} onClick={() => void responder(p.mudarEstado(e))}>
                {NOME_ESTADO_ROTEIRO[e]}
              </button>
            ))}
          </div>
        </section>
      ) : null}

      {msg ? (
        <p className="form__erro" role="alert">
          {msg}
        </p>
      ) : null}

      {p.editavel ? (
        <div className="cr-ajustes__pe">
          {certeza ? (
            <span className="remover__certeza">
              <span>Mandar para a lixeira?</span>
              <button type="button" className="q-perigo" onClick={() => void responder(p.lixeira())}>
                Sim
              </button>
              <button type="button" className="q-limpar" onClick={() => setCerteza(false)}>
                Não
              </button>
            </span>
          ) : (
            <button type="button" className="q-limpar" onClick={() => setCerteza(true)}>
              <Icone nome="lixo" size={15} /> Lixeira
            </button>
          )}
        </div>
      ) : null}
    </Folha>
  );
}

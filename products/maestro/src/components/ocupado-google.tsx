"use client";
/**
 * "Ocupado no Google" ao marcar uma diária (ADR 0026 do HUB): os blocos ocupados da agenda Google da pessoa, pela
 * Absolute ZRO (`/api/agenda/google/ocupado`). Com `de`/`ate` fixos (ficha do evento) ou seguindo os campos `data` e
 * `dataFim` do formulário da página (novo evento). Só leitura; nada do Google fica no Maestro.
 */
import { useEffect, useState } from "react";
import { Icone } from "./icones";
import "@/app/agenda-google.css";

type Ocupado = { inicio: string; fim: string };
type Estado = "ok" | "sem_conexao" | "app_desligado" | "reconectar_zro" | "erro";
type Resposta = { estado: Estado; ocupado: Ocupado[]; conectar: string };

const DATA = /^\d{4}-\d{2}-\d{2}$/;
const FUSO = "America/Sao_Paulo";
const hora = new Intl.DateTimeFormat("pt-BR", { timeZone: FUSO, hour: "2-digit", minute: "2-digit" });
const dia = new Intl.DateTimeFormat("pt-BR", { timeZone: FUSO, weekday: "short", day: "2-digit", month: "2-digit" });
const diaIso = new Intl.DateTimeFormat("en-CA", { timeZone: FUSO, year: "numeric", month: "2-digit", day: "2-digit" });

/** Um bloco por dia, em Brasília: "09:00–11:00" ou "Dia todo". */
export function blocosPorDia(ocupado: Ocupado[]): { dia: string; rotulo: string; blocos: string[] }[] {
  const porDia = new Map<string, { rotulo: string; blocos: string[] }>();
  for (const o of ocupado) {
    const ini = new Date(o.inicio);
    const fim = new Date(o.fim);
    let t = ini.getTime();
    while (t < fim.getTime()) {
      const d = diaIso.format(t);
      const proxDia = Date.parse(`${d}T00:00:00-03:00`) + 86_400_000;
      const ate = Math.min(fim.getTime(), proxDia);
      const inteiro = hora.format(t) === "00:00" && ate === proxDia;
      const linha = porDia.get(d) ?? { rotulo: dia.format(t).replace(".", ""), blocos: [] };
      linha.blocos.push(inteiro ? "Dia todo" : `${hora.format(t)}–${ate === proxDia ? "24:00" : hora.format(ate)}`);
      porDia.set(d, linha);
      t = ate;
    }
  }
  return [...porDia.entries()].sort(([a], [b]) => (a < b ? -1 : 1)).map(([d, v]) => ({ dia: d, ...v }));
}

function datasDoFormulario(): { de: string; ate: string } | null {
  const de = (document.querySelector('form input[name="data"]') as HTMLInputElement | null)?.value ?? "";
  const fim = (document.querySelector('form input[name="dataFim"]') as HTMLInputElement | null)?.value ?? "";
  if (!DATA.test(de)) return null;
  return { de, ate: DATA.test(fim) && fim >= de ? fim : de };
}

export function OcupadoNoGoogle({ de, ate, volta }: { de?: string; ate?: string; volta: string }) {
  const [datas, setDatas] = useState<{ de: string; ate: string } | null>(de ? { de, ate: ate ?? de } : null);
  const [resposta, setResposta] = useState<{ chave: string; r: Resposta } | null>(null);

  useEffect(() => {
    if (de) return;
    const ler = () => setDatas(datasDoFormulario());
    ler();
    document.addEventListener("change", ler);
    return () => document.removeEventListener("change", ler);
  }, [de]);

  const chave = datas ? `${datas.de}_${datas.ate}` : null;
  useEffect(() => {
    if (!chave) return;
    const [d, a] = chave.split("_");
    const c = new AbortController();
    fetch(`/api/agenda/google/ocupado?${new URLSearchParams({ de: d!, ate: a! })}`, { signal: c.signal, cache: "no-store" })
      .then((x) => (x.ok ? (x.json() as Promise<Resposta>) : ({ estado: "erro", ocupado: [], conectar: "" } as Resposta)))
      .then((r) => setResposta({ chave, r }))
      .catch((e: unknown) => {
        if ((e as Error)?.name !== "AbortError") setResposta({ chave, r: { estado: "erro", ocupado: [], conectar: "" } });
      });
    return () => c.abort();
  }, [chave]);

  // Enquanto a resposta não é das datas atuais, "lendo".
  const r: Resposta | "carregando" | null = !chave ? null : resposta?.chave === chave ? resposta.r : "carregando";
  if (!datas || !r) return null;
  return (
    <section
      className="ocupado-google"
      aria-label="Ocupado no Google"
      aria-busy={r === "carregando"}
      data-estado={r === "carregando" ? "carregando" : r.estado}
    >
      <header className="ocupado-google__cab">
        <Icone nome="agenda" size={16} />
        <strong>Ocupado no Google</strong>
      </header>
      {r === "carregando" ? (
        <p className="sutil">Lendo sua agenda…</p>
      ) : r.estado === "ok" ? (
        r.ocupado.length ? (
          <ul className="ocupado-google__dias">
            {blocosPorDia(r.ocupado).map((d) => (
              <li key={d.dia}>
                <span className="ocupado-google__dia">{d.rotulo}</span>
                <span className="ocupado-google__blocos">
                  {d.blocos.map((b, i) => (
                    <span key={i} className="ocupado-google__bloco">
                      {b}
                    </span>
                  ))}
                </span>
              </li>
            ))}
          </ul>
        ) : (
          <p className="sutil">Livre no Google.</p>
        )
      ) : r.estado === "reconectar_zro" ? (
        <p className="sutil">
          Entre de novo para ver o Google. <a href={`/api/zro/entrar?volta=${encodeURIComponent(volta)}`}>Entrar</a>
        </p>
      ) : r.estado === "sem_conexao" || r.estado === "app_desligado" ? (
        <p className="sutil">
          {r.estado === "sem_conexao" ? "Conecte o Google Agenda na sua conta." : "O Maestro está desligado nas Conexões."}{" "}
          <a href={r.conectar} target="_blank" rel="noopener noreferrer">
            Abrir Conexões <Icone nome="externo" size={12} />
          </a>
        </p>
      ) : (
        <p className="sutil">Não deu para ler o Google agora.</p>
      )}
    </section>
  );
}

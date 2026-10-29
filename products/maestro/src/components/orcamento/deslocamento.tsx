"use client";
/**
 * Calculadora de deslocamento (porte de travel-item.tsx do ZRO): saída (a cidade base da organização), chegada, km,
 * ida e volta, viagens, veículo, combustível (gasolina, etanol ou diesel S10), consumo, preço do litro e pedágio. Vira
 * a linha "Deslocamento".
 *
 * - Lugares e km (titular, 29/10/2026: "reconhecer e medir sozinho"): o texto digitado vira lugar sozinho (cidade com o
 *   mesmo nome, ao sair do campo ou quando só uma cidade casa), a dica diz o que foi entendido ("São Paulo/SP") e a
 *   rota de carro (OSRM) preenche "Km de uma ida". Km digitado vale e fica com a volta "Usar o da rota". Serviço fora
 *   do ar: a dica diz e o campo segue aberto. Nada inventado.
 * - Preço do litro: o preço médio da semana na ANP na cidade de saída (é lá que se abastece), senão no lugar da
 *   produtora; município, senão estado, senão Brasil, com a fonte e a semana embaixo. Mudou o preço à mão, vale o
 *   digitado para aquele combustível neste orçamento (lembrado no aparelho). Sem semana guardada, o campo fica vazio,
 *   diz por quê e pergunta de novo uma vez (a coleta de reserva pode estar a caminho).
 * - Veículo: tipos comuns de carro de produção (`VEICULOS_PADRAO`, consumo por combustível) e os do inventário; o
 *   consumo continua digitável. Orçamento salvo não muda: a linha grava o preço e o consumo usados.
 */
import { useEffect, useRef, useState } from "react";
import Link from "next/link";
import { buscarLugaresAcao, medirRotaAcao, precoCombustivelAcao } from "@/app/(app)/app/orcamentos/acoes";
import { brl, centavosParaCampo, lerNumero, lerReais, numeroBr } from "@/lib/dinheiro";
import {
  calcularDeslocamento,
  chaveDoMunicipio,
  COMBUSTIVEIS,
  ehCombustivel,
  lerTextoDeLugar,
  linhaDeDeslocamento,
  melhorLugar,
  nomeDoLugar,
  rotuloDoPreco,
  tempoDeCarro,
  type Combustivel,
  type Lugar,
  type PrecoCombustivel,
} from "@/lib/orcamento/deslocamento";
import { aplicarVeiculo, combustiveisDo, consumoDo, VEICULOS_PADRAO, veiculoPadrao } from "@/lib/orcamento/veiculos";
import { Icone } from "../icones";

const KML = "maestro:deslocamento:km-l";
const VEICULO = "maestro:deslocamento:veiculo";
const ULTIMO_COMBUSTIVEL = "maestro:deslocamento:combustivel";
/** O que vale só para este orçamento: o combustível escolhido e os preços digitados. */
const DO_ORCAMENTO = (id: string) => `maestro:deslocamento:orcamento:${id}`;
/** Sem semana guardada: perguntar de novo depois deste tempo (a coleta de reserva leva uns segundos). */
const DE_NOVO_MS = 25_000;

type Lembrado = { combustivel?: Combustivel; litro?: Partial<Record<Combustivel, string>> };
type RespostaPreco = { preco: PrecoCombustivel | null; semLugar: boolean; coletando: boolean; vez: number };
type Medida = { chave: string; km: number; minutos: number } | { chave: string; erro: string };

function ler<T>(chave: string, padrao: T): T {
  try {
    const v = localStorage.getItem(chave);
    return v == null ? padrao : (JSON.parse(v) as T);
  } catch {
    return padrao;
  }
}
function gravar(chave: string, valor: unknown) {
  try {
    localStorage.setItem(chave, JSON.stringify(valor));
  } catch {
    // aparelho sem armazenamento: segue sem lembrar
  }
}

/** Número para o campo, sem separador de milhar (o campo lê "2923,1", não "2.923,1"). */
const campo = (n: number) => n.toLocaleString("pt-BR", { maximumFractionDigits: 1, useGrouping: false });

/** Onde procurar o preço: a saída entendida, senão o texto da saída; sem nada, o servidor usa a produtora. */
function lugarDoPreco(de: Lugar | null, texto: string): { cidade: string | null; uf: string | null } | null {
  if (de) return de.cidade || de.uf ? { cidade: de.cidade ?? null, uf: de.uf ?? null } : null;
  const t = texto.trim();
  return t ? { cidade: t, uf: null } : null;
}

export type LinhaDeslocamento = ReturnType<typeof linhaDeDeslocamento>;

export function Deslocamento({
  orcamentoId,
  base,
  baseTexto,
  veiculos,
  servicos,
  aoAdicionar,
  aoFechar,
}: {
  orcamentoId: string;
  base: Lugar | null;
  /** A cidade da produtora sem coordenadas: entra como texto e é procurada ao abrir. */
  baseTexto?: string | null;
  veiculos: { id: string; nome: string; kmL: number }[];
  servicos: boolean;
  aoAdicionar: (l: LinhaDeslocamento) => void;
  aoFechar: () => void;
}) {
  const [de, setDe] = useState<Lugar | null>(base);
  const [para, setPara] = useState<Lugar | null>(null);
  const [deTexto, setDeTexto] = useState(base?.rotulo ?? baseTexto ?? "");
  const [paraTexto, setParaTexto] = useState("");
  const [idaEVolta, setIdaEVolta] = useState(true);
  const [viagens, setViagens] = useState("1");
  // Km: o da rota enquanto ninguém digita; digitou, vale o digitado (com a volta para o da rota).
  const [kmDigitado, setKmDigitado] = useState<string | null>(null);
  const [medida, setMedida] = useState<Medida | null>(null);
  const [lembrado, setLembrado] = useState<Lembrado>(() => ler<Lembrado>(DO_ORCAMENTO(orcamentoId), {}));
  const [combustivel, setCombustivel] = useState<Combustivel>(() => {
    const c = lembrado.combustivel ?? ler<string>(ULTIMO_COMBUSTIVEL, "gasolina");
    return ehCombustivel(c) ? c : "gasolina";
  });
  // Veículo: o lembrado no aparelho (tipo de partida ou do inventário), senão o primeiro do inventário, senão nenhum
  // (consumo de partida do combustível). Enquanto ninguém mexe, trocar o combustível troca o de partida.
  const [veiculo, setVeiculo] = useState<string | null>(() => {
    const v = ler<string | null>(VEICULO, null);
    if (v?.startsWith("p:") && veiculoPadrao(v.slice(2)) && consumoDo(veiculoPadrao(v.slice(2))!, combustivel) != null) return v;
    if (v?.startsWith("i:") && veiculos.some((x) => x.id === v.slice(2))) return v;
    return null;
  });
  const [kmlTocado, setKmlTocado] = useState(() => veiculo != null || ler<string | null>(KML, null) != null || veiculos.length > 0);
  const [kml, setKml] = useState(() => {
    const p = veiculo?.startsWith("p:") ? veiculoPadrao(veiculo.slice(2)) : null;
    if (p) return campo(consumoDo(p, combustivel)!);
    const i = veiculo?.startsWith("i:") ? veiculos.find((x) => x.id === veiculo.slice(2)) : null;
    if (i) return campo(i.kmL);
    const salvo = ler<string | null>(KML, null);
    if (salvo) return salvo;
    return veiculos[0] ? campo(veiculos[0].kmL) : String(COMBUSTIVEIS[combustivel].kmL);
  });
  const [precos, setPrecos] = useState<Record<string, RespostaPreco>>({});
  const [pedagio, setPedagio] = useState("");
  const [erro, setErro] = useState<string | null>(null);
  const dialogo = useRef<HTMLDialogElement>(null);

  useEffect(() => {
    dialogo.current?.showModal();
  }, []);

  /* ── rota: uma medida por par de lugares; a que chegou atrasada não vale ── */
  const chaveRota = servicos && de && para ? `${de.lat},${de.lon};${para.lat},${para.lon}` : null;
  useEffect(() => {
    if (!chaveRota || !de || !para) return;
    let vivo = true;
    medirRotaAcao({ lat: de.lat, lon: de.lon }, { lat: para.lat, lon: para.lon })
      .catch(() => null)
      .then((r) => {
        if (!vivo) return;
        setMedida(
          r?.ok
            ? { chave: chaveRota, km: r.km, minutos: r.minutos }
            : { chave: chaveRota, erro: r && !r.ok ? r.erro : "A rota não respondeu agora. Digite os km." },
        );
      });
    return () => {
      vivo = false;
    };
  }, [chaveRota, de, para]);
  const medidaAgora = medida && medida.chave === chaveRota ? medida : null;
  const rota = medidaAgora && "km" in medidaAgora ? medidaAgora : null;
  const erroRota = medidaAgora && "erro" in medidaAgora ? medidaAgora.erro : null;
  const medindo = chaveRota != null && !medidaAgora;
  const km = kmDigitado ?? (rota ? campo(rota.km) : "");
  const kmDaRota = rota && kmDigitado != null && lerNumero(kmDigitado) !== rota.km ? rota : null;

  /* ── preço da semana na ANP: um pedido por combustível e lugar de saída (o texto espera a pessoa parar) ── */
  const lugarAgora = lugarDoPreco(de, deTexto);
  const [lugarPreco, setLugarPreco] = useState(lugarAgora);
  const lugarAgoraChave = JSON.stringify(lugarAgora);
  useEffect(() => {
    const t = setTimeout(() => setLugarPreco(JSON.parse(lugarAgoraChave)), 500);
    return () => clearTimeout(t);
  }, [lugarAgoraChave]);
  const chavePreco = `${combustivel}|${lugarPreco ? `${chaveDoMunicipio(lugarPreco.cidade ?? "")}/${lugarPreco.uf ?? ""}` : ""}`;
  const resposta = precos[chavePreco];
  const vez = resposta?.vez ?? 0;
  const deNovo = resposta?.coletando && vez < 2;
  useEffect(() => {
    if (resposta && !deNovo) return;
    let vivo = true;
    const pedir = () =>
      precoCombustivelAcao(combustivel, lugarPreco)
        .then((r) => vivo && setPrecos((p) => ({ ...p, [chavePreco]: { ...r, vez: vez + 1 } })))
        .catch(() => vivo && setPrecos((p) => ({ ...p, [chavePreco]: { preco: null, semLugar: false, coletando: false, vez: vez + 1 } })));
    const t = resposta ? setTimeout(pedir, DE_NOVO_MS) : (void pedir(), null);
    return () => {
      vivo = false;
      if (t) clearTimeout(t);
    };
    // `lugarPreco` e `combustivel` já estão em `chavePreco`.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [chavePreco, resposta, deNovo, vez]);
  const buscando = !resposta;
  const preco = resposta?.preco ?? null;
  const semLugar = resposta?.semLugar ?? false;

  const digitado = lembrado.litro?.[combustivel];
  const litro = digitado ?? (preco ? centavosParaCampo(preco.litroCents) : "");
  const manual = digitado != null && (!preco || lerReais(digitado) !== preco.litroCents);

  function lembrar(novo: Lembrado) {
    setLembrado(novo);
    gravar(DO_ORCAMENTO(orcamentoId), novo);
  }
  function mudarCombustivel(c: Combustivel, lembrete: Lembrado = lembrado) {
    setCombustivel(c);
    gravar(ULTIMO_COMBUSTIVEL, c);
    lembrar({ ...lembrete, combustivel: c });
  }
  function escolherCombustivel(c: Combustivel) {
    mudarCombustivel(c);
    const p = veiculo?.startsWith("p:") ? veiculoPadrao(veiculo.slice(2)) : null;
    if (p) {
      const consumo = consumoDo(p, c);
      if (consumo != null) setKml(campo(consumo));
      else setVeiculo(null);
    } else if (!kmlTocado) setKml(String(COMBUSTIVEIS[c].kmL));
  }
  function escolherPadrao(id: string) {
    const p = veiculoPadrao(id);
    if (!p) return;
    const r = aplicarVeiculo(p, combustivel);
    if (r.combustivel !== combustivel) mudarCombustivel(r.combustivel);
    setVeiculo(`p:${id}`);
    setKml(campo(r.kmL));
    setKmlTocado(true);
  }
  function escolherDoInventario(v: { id: string; kmL: number }) {
    setVeiculo(`i:${v.id}`);
    setKml(campo(v.kmL));
    setKmlTocado(true);
  }
  function digitarLitro(v: string) {
    lembrar({ ...lembrado, litro: { ...lembrado.litro, [combustivel]: v } });
  }
  function usarAnp() {
    const litros = { ...lembrado.litro };
    delete litros[combustivel];
    lembrar({ ...lembrado, litro: litros });
  }
  function mudarKml(v: string) {
    setKml(v);
    setKmlTocado(true);
    setVeiculo(null);
  }

  const entrada = {
    kmIda: lerNumero(km) ?? 0,
    idaEVolta,
    viagens: Number(viagens) || 1,
    kmPorLitro: lerNumero(kml) ?? 0,
    litroCents: lerReais(litro) ?? 0,
    pedagioCents: lerReais(pedagio) ?? 0,
    combustivel,
  };
  const d = calcularDeslocamento(entrada);
  const porKmCents = entrada.kmPorLitro > 0 && entrada.litroCents > 0 ? entrada.litroCents / entrada.kmPorLitro : 0;

  function adicionar(e: React.FormEvent) {
    e.preventDefault();
    if (!(entrada.kmIda > 0)) return setErro("Diga os km de uma ida.");
    if (!(entrada.kmPorLitro > 0)) return setErro("Quantos km o carro faz com 1 litro?");
    if (!(entrada.litroCents > 0)) return setErro("Coloque o preço do litro.");
    if (kmlTocado) gravar(KML, kml);
    gravar(VEICULO, veiculo);
    const nome = (l: Lugar | null, t: string) => (l ? l.rotulo : lerTextoDeLugar(t).nome || null);
    aoAdicionar(linhaDeDeslocamento(entrada, nome(de, deTexto), nome(para, paraTexto)));
  }

  return (
    <dialog ref={dialogo} className="dialogo" onClose={aoFechar} aria-labelledby="desl-titulo">
      <form className="dialogo__corpo" onSubmit={adicionar} noValidate>
        <header className="dialogo__topo">
          <h2 id="desl-titulo">
            <Icone nome="carro" size={20} /> Deslocamento
          </h2>
          <button type="button" className="q-icone-btn" onClick={() => dialogo.current?.close()} aria-label="Fechar">
            <Icone nome="fechar" size={18} />
          </button>
        </header>

        <div className="form__grade">
          <CampoLugar
            rotulo="Saída"
            valor={de}
            texto={deTexto}
            setTexto={setDeTexto}
            aoEscolher={setDe}
            servicos={servicos}
            procurarAoAbrir={!base && !!baseTexto}
          />
          <CampoLugar rotulo="Chegada" valor={para} texto={paraTexto} setTexto={setParaTexto} aoEscolher={setPara} servicos={servicos} focar />
          <div className="form__campo">
            <label htmlFor="desl-km">Km de uma ida</label>
            <input
              id="desl-km"
              className="num"
              inputMode="decimal"
              value={km}
              onChange={(e) => setKmDigitado(e.target.value)}
              placeholder="0"
              aria-describedby="desl-km-dica"
            />
            <span
              id="desl-km-dica"
              className={erroRota && kmDigitado == null ? "form__erro" : "form__dica"}
              data-km={kmDaRota ? "digitado" : rota ? "rota" : "livre"}
            >
              {kmDaRota ? (
                <>
                  Km digitado.{" "}
                  <button type="button" className="q-limpar desl-fonte__voltar" onClick={() => setKmDigitado(null)}>
                    Usar o da rota ({numeroBr(kmDaRota.km, 1)} km)
                  </button>
                </>
              ) : medindo ? (
                "Medindo a rota…"
              ) : rota ? (
                `Pela estrada · ${tempoDeCarro(rota.minutos)}`
              ) : erroRota ? (
                erroRota
              ) : servicos ? (
                "Medimos pela estrada; dá para mudar."
              ) : (
                "Digite os km do trajeto."
              )}
            </span>
          </div>
          <div className="form__campo">
            <label>Trajeto</label>
            <div className="q-segmentos" role="radiogroup" aria-label="Trajeto">
              <button type="button" role="radio" aria-checked={!idaEVolta} onClick={() => setIdaEVolta(false)}>
                Só ida
              </button>
              <button type="button" role="radio" aria-checked={idaEVolta} onClick={() => setIdaEVolta(true)}>
                Ida e volta
              </button>
            </div>
          </div>
          <div className="form__campo">
            <label htmlFor="desl-viagens">Viagens</label>
            <input
              id="desl-viagens"
              className="num"
              inputMode="numeric"
              value={viagens}
              onChange={(e) => setViagens(e.target.value.replace(/\D/g, "").slice(0, 3))}
            />
            <span className="form__dica">3 diárias indo e voltando = 3</span>
          </div>
          <div className="form__campo form__campo--largo">
            <label id="desl-veiculo">Veículo</label>
            <div className="chips desl-veiculos" role="group" aria-labelledby="desl-veiculo">
              {veiculos.map((v) => (
                <button
                  key={`i:${v.id}`}
                  type="button"
                  className="chip"
                  data-origem="inventario"
                  aria-pressed={veiculo === `i:${v.id}`}
                  onClick={() => escolherDoInventario(v)}
                  title="Do inventário"
                >
                  {v.nome} · {numeroBr(v.kmL, 1)}
                </button>
              ))}
              {VEICULOS_PADRAO.map((p) => {
                const consumo = consumoDo(p, combustivel) ?? consumoDo(p, combustiveisDo(p)[0])!;
                const porCombustivel = combustiveisDo(p)
                  .map((c) => `${numeroBr(p.kmL[c]!, 1)} km/L no ${COMBUSTIVEIS[c].texto}`)
                  .join(", ");
                return (
                  <button
                    key={p.id}
                    type="button"
                    className="chip"
                    aria-pressed={veiculo === `p:${p.id}`}
                    onClick={() => escolherPadrao(p.id)}
                    title={`${p.exemplos} · ${porCombustivel}`}
                  >
                    {p.nome} · {numeroBr(consumo, 1)}
                  </button>
                );
              })}
            </div>
          </div>
          <div className="form__campo">
            <label>Combustível</label>
            <div className="q-segmentos" role="radiogroup" aria-label="Combustível">
              {(Object.keys(COMBUSTIVEIS) as Combustivel[]).map((c) => (
                <button key={c} type="button" role="radio" aria-checked={combustivel === c} onClick={() => escolherCombustivel(c)}>
                  {COMBUSTIVEIS[c].nome}
                </button>
              ))}
            </div>
          </div>
          <div className="form__campo">
            <label htmlFor="desl-kml">Consumo (km/L)</label>
            <input id="desl-kml" className="num" inputMode="decimal" value={kml} onChange={(e) => mudarKml(e.target.value)} />
            <span className="form__dica">
              {veiculo ? "Média de estrada; troque pelo do seu." : kmlTocado ? "Do seu carro." : "Média de um carro; troque pelo do seu."}
            </span>
          </div>
          <div className="form__campo">
            <label htmlFor="desl-litro">Preço do litro</label>
            <input
              id="desl-litro"
              className="num"
              inputMode="decimal"
              value={litro}
              onChange={(e) => digitarLitro(e.target.value)}
              placeholder="0,00"
              aria-describedby="desl-litro-fonte"
            />
            <span id="desl-litro-fonte" className="form__dica desl-fonte" data-fonte={manual ? "manual" : preco ? "anp" : "nenhuma"}>
              {buscando && !digitado ? (
                "Buscando o preço da semana…"
              ) : manual ? (
                <>
                  Preço digitado.{" "}
                  {preco ? (
                    <button type="button" className="q-limpar desl-fonte__voltar" onClick={usarAnp}>
                      Usar o da ANP ({brl(preco.litroCents)})
                    </button>
                  ) : null}
                </>
              ) : preco ? (
                <>
                  {rotuloDoPreco(preco)}
                  {semLugar ? (
                    <>
                      {" · "}
                      <Link href="/app/ajustes/empresa">Diga a cidade da produtora</Link>
                    </>
                  ) : null}
                </>
              ) : deNovo ? (
                "Buscando o preço da semana na ANP…"
              ) : (
                "Sem preço da ANP guardado agora. Digite o preço do posto."
              )}
            </span>
          </div>
          <div className="form__campo">
            <label htmlFor="desl-pedagio">Pedágio por viagem</label>
            <input id="desl-pedagio" className="num" inputMode="decimal" value={pedagio} onChange={(e) => setPedagio(e.target.value)} placeholder="0,00" />
          </div>
        </div>

        <dl className="resumo-desl">
          <div>
            <dt>Rodagem</dt>
            <dd>{d.kmTotal > 0 ? `${numeroBr(d.kmTotal, 0)} km` : "—"}</dd>
          </div>
          <div>
            <dt>{COMBUSTIVEIS[combustivel].nome}</dt>
            <dd>{d.litros > 0 ? `${numeroBr(d.litros, 1)} L` : "—"}</dd>
          </div>
          <div>
            <dt>Por km</dt>
            <dd>{porKmCents > 0 ? brl(Math.round(porKmCents)) : "—"}</dd>
          </div>
          <div>
            <dt>Custo</dt>
            <dd>
              <strong>{d.custoCents > 0 ? brl(d.custoCents) : "—"}</strong>
            </dd>
          </div>
        </dl>
        {erro ? (
          <p className="erro" role="alert">
            {erro}
          </p>
        ) : null}
        <div className="acoes">
          <button type="submit" className="glass-btn glass-btn--ink" disabled={!(d.custoCents > 0)}>
            <Icone nome="mais" size={18} /> Adicionar ao orçamento
          </button>
        </div>
      </form>
    </dialog>
  );
}

/**
 * Cidade ou endereço. Com os serviços abertos: sugestões enquanto digita; quando só uma cidade tem o nome digitado,
 * ou ao sair do campo (e no Enter), o melhor lugar é escolhido sozinho e a dica diz o que foi entendido. Sem os
 * serviços, texto livre.
 */
function CampoLugar({
  rotulo,
  valor,
  texto,
  setTexto,
  aoEscolher,
  servicos,
  focar,
  procurarAoAbrir,
}: {
  rotulo: string;
  valor: Lugar | null;
  texto: string;
  setTexto: (t: string) => void;
  aoEscolher: (l: Lugar | null) => void;
  servicos: boolean;
  focar?: boolean;
  procurarAoAbrir?: boolean;
}) {
  const [lugares, setLugares] = useState<Lugar[]>([]);
  const [aviso, setAviso] = useState<string | null>(null);
  const [procurando, setProcurando] = useState(false);
  const relogio = useRef<ReturnType<typeof setTimeout> | null>(null);
  const ultima = useRef(0);
  const escolhendo = useRef(false);
  const valorRef = useRef(valor);
  useEffect(() => {
    valorRef.current = valor;
  }, [valor]);
  const id = `desl-${chaveDoMunicipio(rotulo).toLowerCase()}`;

  function escolher(l: Lugar) {
    aoEscolher(l);
    setLugares([]);
    setAviso(null);
    setProcurando(false);
  }

  /** Procura e escolhe o melhor lugar para o texto (ao sair do campo, no Enter e ao abrir com a cidade da produtora). */
  async function resolver(t: string) {
    if (!servicos || valorRef.current || t.trim().length < 2) return;
    if (relogio.current) clearTimeout(relogio.current);
    const n = ++ultima.current;
    setProcurando(true);
    const r = await buscarLugaresAcao(t).catch(() => null);
    if (n !== ultima.current) return;
    setProcurando(false);
    if (!r?.ok) return setAviso(r && !r.ok ? r.erro : "A busca não respondeu agora. Digite os km.");
    const l = melhorLugar(r.lugares, t);
    if (l) escolher(l);
    else setAviso("Não achei esse lugar. Digite os km.");
  }

  useEffect(() => {
    if (!procurarAoAbrir) return;
    const t = setTimeout(() => void resolver(texto), 0);
    return () => clearTimeout(t);
    // Só ao abrir: a cidade da produtora sem coordenadas.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  function digitar(t: string) {
    setTexto(t);
    aoEscolher(null);
    setAviso(null);
    if (!servicos) return;
    if (relogio.current) clearTimeout(relogio.current);
    const n = ++ultima.current;
    setProcurando(false);
    if (t.trim().length < 2) return setLugares([]);
    relogio.current = setTimeout(async () => {
      const r = await buscarLugaresAcao(t).catch(() => null);
      if (n !== ultima.current) return;
      if (r?.ok) {
        // Uma cidade só com este nome (e a UF, se veio): já é ela.
        const { nome, uf } = lerTextoDeLugar(t);
        const mesmas = r.lugares.filter((l) => l.tipo === "cidade" && chaveDoMunicipio(l.rotulo) === chaveDoMunicipio(nome) && (!uf || l.uf === uf));
        if (mesmas.length === 1) return escolher(mesmas[0]);
        setLugares(r.lugares);
        if (!r.lugares.length) setAviso("Nada encontrado. Tente o nome da cidade.");
      } else setAviso(r && !r.ok ? r.erro : "A busca não respondeu agora. Digite os km.");
    }, 350);
  }

  return (
    <div className="form__campo lugar">
      <label htmlFor={id}>{rotulo}</label>
      <input
        id={id}
        value={texto}
        onChange={(e) => digitar(e.target.value)}
        onBlur={(e) => {
          const t = e.currentTarget.value;
          // Quem tocou numa sugestão escolhe por ela; o resto procura o melhor lugar sozinho.
          setTimeout(() => {
            if (escolhendo.current) return void (escolhendo.current = false);
            void resolver(t);
          }, 120);
        }}
        onKeyDown={(e) => {
          if (e.key !== "Enter") return;
          e.preventDefault();
          if (lugares.length && !valor) escolher(melhorLugar(lugares, texto) ?? lugares[0]);
          else void resolver(texto);
        }}
        autoFocus={focar}
        autoComplete="off"
        placeholder="Cidade ou endereço"
        aria-describedby={`${id}-dica`}
      />
      <span id={`${id}-dica`} className="form__dica lugar__dica" aria-live="polite">
        {valor ? (
          <>
            <Icone nome="check" size={13} /> {nomeDoLugar(valor)}
          </>
        ) : procurando ? (
          "Procurando…"
        ) : (
          aviso
        )}
      </span>
      {lugares.length && !valor ? (
        <ul className="lugar__lista" role="listbox" aria-label={`Sugestões de ${rotulo.toLowerCase()}`}>
          {lugares.map((l) => (
            <li key={`${l.lat},${l.lon},${l.tipo}`}>
              <button
                type="button"
                onPointerDown={() => (escolhendo.current = true)}
                onClick={() => {
                  setTexto(l.rotulo);
                  escolher(l);
                }}
              >
                <strong>{l.rotulo}</strong>
                <span>{l.detalhe}</span>
              </button>
            </li>
          ))}
        </ul>
      ) : null}
    </div>
  );
}

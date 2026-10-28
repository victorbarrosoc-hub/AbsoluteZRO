"use client";
/**
 * Calculadora de deslocamento (porte de travel-item.tsx do ZRO): saída (a cidade base da organização), chegada, km,
 * ida e volta, viagens, consumo (do veículo do inventário ou digitado; lembrado no aparelho), preço do litro (ANP da
 * UF da organização quando os serviços abertos estão ligados; senão digitado) e pedágio. Vira a linha "Deslocamento".
 * Sem os serviços abertos, tudo é digitado: a saída manual existe sempre.
 */
import { useEffect, useRef, useState, useTransition } from "react";
import { buscarLugaresAcao, medirRotaAcao, precoGasolinaAcao } from "@/app/(app)/app/orcamentos/acoes";
import { brl, centavosParaCampo, dataCurta, lerNumero, lerReais, numeroBr } from "@/lib/dinheiro";
import { calcularDeslocamento, linhaDeDeslocamento, type Lugar, type PrecoCombustivel } from "@/lib/orcamento/deslocamento";
import { Icone } from "../icones";

const KML = "maestro:deslocamento:km-l";

export type LinhaDeslocamento = ReturnType<typeof linhaDeDeslocamento>;

export function Deslocamento({
  base,
  veiculos,
  servicos,
  aoAdicionar,
  aoFechar,
}: {
  base: Lugar | null;
  veiculos: { id: string; nome: string; kmL: number }[];
  servicos: boolean;
  aoAdicionar: (l: LinhaDeslocamento) => void;
  aoFechar: () => void;
}) {
  const [de, setDe] = useState<Lugar | null>(base);
  const [para, setPara] = useState<Lugar | null>(null);
  const [deTexto, setDeTexto] = useState(base?.rotulo ?? "");
  const [paraTexto, setParaTexto] = useState("");
  const [idaEVolta, setIdaEVolta] = useState(true);
  const [viagens, setViagens] = useState("1");
  const [km, setKm] = useState("");
  const [minutos, setMinutos] = useState<number | null>(null);
  const [erroRota, setErroRota] = useState<string | null>(null);
  const [medindo, medir] = useTransition();
  const [kml, setKml] = useState(() => {
    try {
      return localStorage.getItem(KML) ?? (veiculos[0] ? String(veiculos[0].kmL).replace(".", ",") : "10");
    } catch {
      return "10";
    }
  });
  const [anp, setAnp] = useState<PrecoCombustivel | null>(null);
  const [buscandoAnp, setBuscandoAnp] = useState(servicos);
  const [litro, setLitro] = useState("");
  const [pedagio, setPedagio] = useState("");
  const [erro, setErro] = useState<string | null>(null);
  const dialogo = useRef<HTMLDialogElement>(null);

  useEffect(() => {
    dialogo.current?.showModal();
  }, []);

  useEffect(() => {
    if (!servicos) return;
    let vivo = true;
    precoGasolinaAcao()
      .then((p) => {
        if (!vivo) return;
        setAnp(p);
        if (p) setLitro((v) => v || centavosParaCampo(p.litroCents));
      })
      .catch(() => {})
      .finally(() => vivo && setBuscandoAnp(false));
    return () => {
      vivo = false;
    };
  }, [servicos]);

  useEffect(() => {
    if (!servicos || !de || !para) return;
    medir(async () => {
      setErroRota(null);
      const r = await medirRotaAcao({ lat: de.lat, lon: de.lon }, { lat: para.lat, lon: para.lon }).catch(() => null);
      if (r?.ok) {
        setKm(numeroBr(r.km, 1));
        setMinutos(r.minutos);
      } else {
        setMinutos(null);
        setErroRota(r && !r.ok ? r.erro : "O cálculo da rota não respondeu. Digite os km.");
      }
    });
  }, [servicos, de, para]);

  const entrada = {
    kmIda: lerNumero(km) ?? 0,
    idaEVolta,
    viagens: Number(viagens) || 1,
    kmPorLitro: lerNumero(kml) ?? 0,
    litroCents: lerReais(litro) ?? 0,
    pedagioCents: lerReais(pedagio) ?? 0,
  };
  const d = calcularDeslocamento(entrada);

  function adicionar(e: React.FormEvent) {
    e.preventDefault();
    if (!(entrada.kmIda > 0)) return setErro("Diga os km de uma ida.");
    if (!(entrada.kmPorLitro > 0)) return setErro("Quantos km o carro faz com 1 litro?");
    if (!(entrada.litroCents > 0)) return setErro("Coloque o preço do litro.");
    try {
      localStorage.setItem(KML, kml);
    } catch {
      // aparelho sem armazenamento: segue sem lembrar
    }
    aoAdicionar(linhaDeDeslocamento(entrada, de?.rotulo ?? (deTexto.trim() || null), para?.rotulo ?? (paraTexto.trim() || null)));
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
          <CampoLugar rotulo="Saída" valor={de} texto={deTexto} setTexto={setDeTexto} aoEscolher={setDe} servicos={servicos} />
          <CampoLugar rotulo="Chegada" valor={para} texto={paraTexto} setTexto={setParaTexto} aoEscolher={setPara} servicos={servicos} focar />
          <div className="form__campo">
            <label htmlFor="desl-km">Km de uma ida</label>
            <input id="desl-km" className="num" inputMode="decimal" value={km} onChange={(e) => (setKm(e.target.value), setMinutos(null))} placeholder="0" />
            <span className={erroRota ? "form__erro" : "form__dica"}>
              {medindo
                ? "Calculando a rota…"
                : erroRota
                  ? erroRota
                  : minutos
                    ? `≈ ${minutos >= 60 ? `${Math.floor(minutos / 60)}h${String(minutos % 60).padStart(2, "0")}` : `${minutos} min`} de carro`
                    : servicos
                      ? "Sai da rota; dá para mudar."
                      : "Digite os km do trajeto."}
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
          <div className="form__campo">
            <label htmlFor="desl-kml">Consumo (km/L)</label>
            <input id="desl-kml" className="num" inputMode="decimal" value={kml} onChange={(e) => setKml(e.target.value)} />
            {veiculos.length ? (
              <span className="chips">
                {veiculos.map((v) => (
                  <button key={v.id} type="button" className="chip" onClick={() => setKml(String(v.kmL).replace(".", ","))}>
                    {v.nome} · {numeroBr(v.kmL, 1)}
                  </button>
                ))}
              </span>
            ) : (
              <span className="form__dica">Cadastre veículos no inventário para escolher aqui.</span>
            )}
          </div>
          <div className="form__campo">
            <label htmlFor="desl-litro">Gasolina (litro)</label>
            <input id="desl-litro" className="num" inputMode="decimal" value={litro} onChange={(e) => setLitro(e.target.value)} placeholder="0,00" />
            <span className="form__dica">
              {buscandoAnp
                ? "Buscando o preço da semana na ANP…"
                : anp
                  ? `ANP, ${anp.base === "capital" ? anp.onde : `média de ${anp.onde}`}, ${dataCurta(anp.inicio)} a ${dataCurta(anp.fim)}. Dá para mudar.`
                  : "Digite o preço do posto."}
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
            <dt>Gasolina</dt>
            <dd>{d.litros > 0 ? `${numeroBr(d.litros, 1)} L` : "—"}</dd>
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

/** Cidade ou endereço: com os serviços abertos, sugestões enquanto digita; sem eles, texto livre. */
function CampoLugar({
  rotulo,
  valor,
  texto,
  setTexto,
  aoEscolher,
  servicos,
  focar,
}: {
  rotulo: string;
  valor: Lugar | null;
  texto: string;
  setTexto: (t: string) => void;
  aoEscolher: (l: Lugar | null) => void;
  servicos: boolean;
  focar?: boolean;
}) {
  const [lugares, setLugares] = useState<Lugar[]>([]);
  const [aviso, setAviso] = useState<string | null>(null);
  const relogio = useRef<ReturnType<typeof setTimeout> | null>(null);
  const ultima = useRef(0);
  const id = `desl-${rotulo.toLowerCase()}`;

  function digitar(t: string) {
    setTexto(t);
    aoEscolher(null);
    setAviso(null);
    if (!servicos) return;
    if (relogio.current) clearTimeout(relogio.current);
    const n = ++ultima.current;
    if (t.trim().length < 2) return setLugares([]);
    relogio.current = setTimeout(async () => {
      const r = await buscarLugaresAcao(t).catch(() => null);
      if (n !== ultima.current) return;
      if (r?.ok) {
        setLugares(r.lugares);
        if (!r.lugares.length) setAviso("Nada encontrado. Tente o nome da cidade.");
      } else setAviso(r && !r.ok ? r.erro : "A busca não respondeu agora.");
    }, 350);
  }

  return (
    <div className="form__campo lugar">
      <label htmlFor={id}>{rotulo}</label>
      <input id={id} value={texto} onChange={(e) => digitar(e.target.value)} autoFocus={focar} autoComplete="off" placeholder="Cidade ou endereço" />
      {valor ? (
        <span className="form__dica">
          <Icone nome="check" size={13} /> {valor.detalhe || valor.rotulo}
        </span>
      ) : aviso ? (
        <span className="form__dica">{aviso}</span>
      ) : null}
      {lugares.length && !valor ? (
        <ul className="lugar__lista" role="listbox" aria-label={`Sugestões de ${rotulo.toLowerCase()}`}>
          {lugares.map((l) => (
            <li key={`${l.lat},${l.lon}`}>
              <button
                type="button"
                onClick={() => {
                  aoEscolher(l);
                  setTexto(l.rotulo);
                  setLugares([]);
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

// O painel de ajustes: grupos na ordem de uso (Luz, Cor, Presença, Curva, Misturador, Tonalização, Detalhe, Efeitos,
// Geometria; Calibração e Tela recolhidos em "Avançado"). Cada controle é o da casca (duplo clique zera, setas, número
// que se digita); grupo mexido mostra um ponto e ganha o "zerar"; o grupo abre com mola (Web Animations, nada com
// "reduzir movimento"). Tudo que muda vai para o palco na hora; o que entra no desfazer é o `final`.

import { cx, html, reduzirMovimento, useLayoutEffect, useRef } from '../../preact.js'
import { Chave, Segmentado } from '../../componentes/base.js'
import { CONTROLES, FAIXAS, comValor, normalizar, valor } from '../../../src/motor/ajustes.js'
import { margens } from '../../../src/motor/tela.js'
import { Ajuste } from './controle.js'
import { Curva } from './curva.js'
import { Icone } from './icones.js'
import { PROPORCOES, controlesDoGrupo, grupoMexido, posicaoDaTemperatura, temperaturaDaPosicao, POSICOES_DA_TEMPERATURA } from './logica.js'
import { Rodas } from './rodas.js'

const MOLA = 'cubic-bezier(0.32, 0.72, 0, 1)'
const CORES_DAS_FAIXAS = { vermelho: 0, laranja: 30, amarelo: 55, verde: 120, ciano: 185, azul: 225, roxo: 270, magenta: 315 }
const NOMES_DAS_FAIXAS = {
  vermelho: 'Vermelho',
  laranja: 'Laranja',
  amarelo: 'Amarelo',
  verde: 'Verde',
  ciano: 'Ciano',
  azul: 'Azul',
  roxo: 'Roxo',
  magenta: 'Magenta',
}

/** Um controle da lista única, pelo caminho. */
function Ctl({ caminho, a, mudar, desligado, dica, classe }) {
  const c = CONTROLES[caminho]
  return html`<${Ajuste}
    caminho=${caminho}
    rotulo=${c.rotulo}
    valor=${valor(a, caminho)}
    min=${c.min}
    max=${c.max}
    passo=${c.passo}
    neutro=${c.neutro}
    unidade=${c.unidade}
    desligado=${desligado}
    dica=${dica}
    classe=${classe}
    aoMudar=${(v, o) => mudar(comValor(a, caminho, v), { ...o, rotulo: c.rotulo })}
  />`
}

/** Um grupo do painel: cabeça (nome, ponto de mexido, zerar) e o corpo que abre com mola. */
function Grupo({ id, rotulo, aberto, aoAlternar, mexido, aoZerar, children, extra }) {
  const corpo = useRef(null)
  const antes = useRef(aberto)
  useLayoutEffect(() => {
    const el = corpo.current
    const abriu = aberto && !antes.current
    antes.current = aberto
    if (!abriu || !el?.animate || reduzirMovimento()) return
    const h = el.scrollHeight
    el.animate(
      [
        { height: '0px', opacity: 0, transform: 'translateY(-6px)' },
        { height: `${h}px`, opacity: 1, transform: 'none' },
      ],
      { duration: 420, easing: MOLA },
    )
  }, [aberto])
  return html`<section class=${cx('rv-grupo', aberto && 'rv-grupo--aberto')} data-grupo=${id}>
    <div class="rv-grupo-cabeca">
      <button type="button" class="rv-grupo-botao" aria-expanded=${aberto ? 'true' : 'false'} aria-controls=${`grupo-${id}`} onClick=${aoAlternar}>
        <span class="rv-grupo-nome">${rotulo}</span>
        ${mexido ? html`<span class="rv-grupo-ponto" title="Mexido" aria-label="mexido"></span>` : null}
        <svg class="rv-grupo-seta" viewBox="0 0 24 24" aria-hidden="true"><path d="m6 9.5 6 6 6-6" /></svg>
      </button>
      ${extra}
      ${
        mexido && aoZerar
          ? html`<button
              type="button"
              class="liso rv-grupo-zerar"
              aria-label=${`Zerar ${rotulo}`}
              data-dica="Zerar"
              data-dica-lado="esquerda"
              onClick=${aoZerar}
            >
              <${Icone} nome="zerar" />
            </button>`
          : null
      }
    </div>
    ${aberto ? html`<div class="rv-grupo-corpo" id=${`grupo-${id}`} ref=${corpo}>${children}</div>` : null}
  </section>`
}

/** Os controles de um grupo, na ordem da lista única. */
function Lista({ grupo, a, mudar }) {
  return html`<div class="rv-controles">
    ${controlesDoGrupo(grupo).map((c) => html`<${Ctl} key=${c.caminho} caminho=${c.caminho} a=${a} mudar=${mudar} />`)}
  </div>`
}

function Luz({ a, mudar }) {
  return html`<div class="rv-controles">
    ${controlesDoGrupo('luz').map((c) => html`<${Ctl} key=${c.caminho} caminho=${c.caminho} a=${a} mudar=${mudar} />`)}
  </div>`
}

function Cor({ a, mudar, gota, aoGota, aoModoBranco }) {
  const modo = a.branco.modo
  const t = CONTROLES['branco.temperatura']
  const tn = CONTROLES['branco.tinta']
  const manual = (mud, o, rotulo) => {
    const b = normalizar(a)
    b.branco = { ...b.branco, ...mud, modo: 'manual' }
    mudar(b, { ...o, rotulo })
  }
  const doArquivo = modo === 'original'
  return html`<div class="rv-controles">
    <div class="linha-branco">
      <${Segmentado}
        rotulo="Branco"
        valor=${modo}
        aoMudar=${aoModoBranco}
        opcoes=${[
          { valor: 'original', rotulo: 'Original', dica: 'O branco gravado no arquivo' },
          { valor: 'auto', rotulo: 'Auto', dica: 'Medido nos tons neutros da foto' },
          { valor: 'manual', rotulo: 'Manual' },
        ]}
      />
      <button
        type="button"
        class="liso toque"
        aria-pressed=${gota ? 'true' : 'false'}
        aria-label="Conta-gotas: tocar num ponto que deveria ser cinza"
        data-dica="Conta-gotas"
        data-tecla="W"
        data-dica-lado="esquerda"
        data-gota
        onClick=${aoGota}
      >
        <${Icone} nome="gota" />
      </button>
    </div>
    <${Ajuste}
      caminho="branco.temperatura"
      rotulo=${t.rotulo}
      classe="controle--temperatura"
      valor=${posicaoDaTemperatura(a.branco.temperatura)}
      min=${0}
      max=${POSICOES_DA_TEMPERATURA}
      passo=${1}
      neutro=${posicaoDaTemperatura(t.neutro)}
      desligado=${doArquivo}
      dica=${doArquivo ? 'Escolha Manual ou Auto para mexer' : undefined}
      formato=${(p) => (doArquivo ? 'do arquivo' : `${temperaturaDaPosicao(p).toLocaleString('pt-BR')} K`)}
      deTexto=${(txt) => {
        const k = Number(String(txt).replace(/\D/g, ''))
        return k ? posicaoDaTemperatura(Math.max(t.min, Math.min(t.max, k))) : null
      }}
      aoMudar=${(p, o) => manual({ temperatura: temperaturaDaPosicao(p) }, o, t.rotulo)}
    />
    <${Ajuste}
      caminho="branco.tinta"
      rotulo=${tn.rotulo}
      classe="controle--tinta"
      valor=${a.branco.tinta}
      min=${tn.min}
      max=${tn.max}
      passo=${tn.passo}
      neutro=${tn.neutro}
      desligado=${doArquivo}
      formato=${doArquivo ? () => 'do arquivo' : undefined}
      aoMudar=${(v, o) => manual({ tinta: v }, o, tn.rotulo)}
    />
    <${Ctl} caminho="cor.vibracao" a=${a} mudar=${mudar} />
    <${Ctl} caminho="cor.saturacao" a=${a} mudar=${mudar} />
  </div>`
}

function Misturador({ a, mudar, aba, aoAba }) {
  const pb = a.pb.ativo
  const qual = pb ? 'pb' : aba
  const lista = pb ? a.pb.mistura : a.misturador[aba]
  const gravar = (i, v, o) => {
    const b = normalizar(a)
    if (pb) b.pb.mistura[i] = v
    else b.misturador[aba][i] = v
    mudar(b, { ...o, rotulo: pb ? 'Mistura do P&B' : `Misturador · ${NOMES_DAS_FAIXAS[FAIXAS[i]].toLowerCase()}` })
  }
  return html`<div class="rv-controles">
    <${Chave}
      rotulo="Preto e branco"
      ligada=${pb}
      aoMudar=${(v) => {
        const b = normalizar(a)
        b.pb.ativo = v
        mudar(b, { final: true, rotulo: v ? 'Preto e branco' : 'Cor' })
      }}
    />
    ${
      pb
        ? null
        : html`<${Segmentado}
            rotulo="O que o misturador muda"
            valor=${aba}
            aoMudar=${aoAba}
            opcoes=${[
              { valor: 'matiz', rotulo: 'Matiz' },
              { valor: 'saturacao', rotulo: 'Saturação' },
              { valor: 'luz', rotulo: 'Luz' },
            ]}
          />`
    }
    ${FAIXAS.map(
      (f, i) => html`<div class="rv-faixa" key=${`${qual}-${f}`} style=${`--matiz:${CORES_DAS_FAIXAS[f]}`}>
        <span class="rv-faixa-ponto" aria-hidden="true"></span>
        <${Ajuste}
          caminho=${`${pb ? 'pb.mistura' : `misturador.${aba}`}.${i}`}
          rotulo=${NOMES_DAS_FAIXAS[f]}
          valor=${lista[i]}
          min=${-100}
          max=${100}
          aoMudar=${(v, o) => gravar(i, v, o)}
        />
      </div>`,
    )}
  </div>`
}

function Detalhe({ a, mudar }) {
  const ruido = a.detalhe.ruidoLuz > 0 || a.detalhe.ruidoCor > 0
  return html`<div class="rv-controles">
    ${['detalhe.nitidez', 'detalhe.raio', 'detalhe.detalhe', 'detalhe.mascara'].map(
      (c) => html`<${Ctl} key=${c} caminho=${c} a=${a} mudar=${mudar} dica=${c === 'detalhe.nitidez' ? 'Veja em 100% (Z)' : undefined} />`,
    )}
    <div class="rv-separa"></div>
    ${['detalhe.ruidoLuz', 'detalhe.ruidoCor'].map((c) => html`<${Ctl} key=${c} caminho=${c} a=${a} mudar=${mudar} />`)}
    <p class="rv-nota" data-ruido=${ruido ? '' : undefined}>A redução de ruído aparece na exportação.</p>
  </div>`
}

function Geometria({ a, mudar, corte, aoCorte, proporcao, aoProporcao, regua, aoRegua }) {
  const g = a.geometria
  const mudarG = (mud, rotulo) => {
    const b = normalizar(a)
    b.geometria = { ...b.geometria, ...mud }
    mudar(b, { final: true, rotulo })
  }
  return html`<div class="rv-controles">
    <div class="linha-botoes">
      <button
        type="button"
        class="vidro vidro--pequeno"
        aria-pressed=${corte ? 'true' : 'false'}
        data-corte
        onClick=${aoCorte}
        data-dica="Cortar"
        data-tecla="R"
      >
        <${Icone} nome="cortar" />${corte ? 'Pronto' : 'Cortar'}
      </button>
      <button
        type="button"
        class="vidro vidro--pequeno vidro--icone"
        aria-pressed=${regua ? 'true' : 'false'}
        aria-label="Régua: trace uma linha que deveria ser reta"
        data-dica="Régua"
        data-regua
        onClick=${aoRegua}
      >
        <${Icone} nome="regua" />
      </button>
      <button
        type="button"
        class="vidro vidro--pequeno vidro--icone"
        aria-label="Girar 90° para a esquerda"
        data-dica="Girar"
        data-girar
        onClick=${() => mudarG({ giro: (g.giro + 270) % 360, corte: null }, 'Girar')}
      >
        <${Icone} nome="girar" />
      </button>
      <button
        type="button"
        class="vidro vidro--pequeno vidro--icone"
        aria-label="Espelhar na horizontal"
        aria-pressed=${g.espelhoH ? 'true' : 'false'}
        data-dica="Espelhar"
        onClick=${() => mudarG({ espelhoH: !g.espelhoH }, 'Espelhar')}
      >
        <${Icone} nome="espelhar" />
      </button>
      <button
        type="button"
        class="vidro vidro--pequeno vidro--icone"
        aria-label="Espelhar na vertical"
        aria-pressed=${g.espelhoV ? 'true' : 'false'}
        data-dica="Virar"
        onClick=${() => mudarG({ espelhoV: !g.espelhoV }, 'Virar')}
      >
        <${Icone} nome="virar" />
      </button>
    </div>
    ${
      corte
        ? html`<${Segmentado} rotulo="Proporção do corte" valor=${proporcao} aoMudar=${aoProporcao} opcoes=${PROPORCOES} classe="proporcoes" />`
        : null
    }
    <${Ctl} caminho="geometria.angulo" a=${a} mudar=${mudar} />
  </div>`
}

function Tela({ a, mudar, latitude }) {
  const base = latitude ? { latitude, origem: 'raw' } : { origem: 'imagem' }
  const m = margens(a, base)
  const margem = (lado, rotulo) => {
    const chave = lado === 'altas' ? 'margemAltas' : 'margemSombras'
    const manual = typeof a.tela[chave] === 'number'
    const gravar = (v, o) => {
      const b = normalizar(a)
      b.tela[chave] = v
      mudar(b, { ...o, rotulo })
    }
    return html`<div class="margem-manual" data-margem=${lado}>
      <div class="linha-rotulo">
        <span>${rotulo}</span>
        <${Segmentado}
          rotulo=${rotulo}
          valor=${manual ? 'manual' : 'auto'}
          aoMudar=${(v) => gravar(v === 'auto' ? 'auto' : Math.round(m[lado] * 10) / 10, { final: true })}
          opcoes=${[
            { valor: 'auto', rotulo: 'Do arquivo' },
            { valor: 'manual', rotulo: 'Manual' },
          ]}
        />
      </div>
      ${
        manual
          ? html`<${Ajuste}
              caminho=${`tela.${chave}`}
              rotulo="Margem"
              valor=${a.tela[chave]}
              min=${0.5}
              max=${16}
              passo=${0.1}
              neutro=${Math.round(m[lado] * 10) / 10}
              unidade="EV"
              aoMudar=${gravar}
            />`
          : null
      }
    </div>`
  }
  return html`<div class="rv-controles">
    <${Ctl} caminho="tela.contraste" a=${a} mudar=${mudar} />
    <${Ctl} caminho="tela.preservarMatiz" a=${a} mudar=${mudar} />
    ${margem('altas', 'Margem das altas')} ${margem('sombras', 'Margem das sombras')}
  </div>`
}

/**
 * `a`: os ajustes de agora; `mudar(ajustes, { final, rotulo })`. `abertos`: Set dos grupos abertos; `aoAbrir(id)`.
 * `ferramentas`: { gota, aoGota, aoModoBranco, corte, aoCorte, proporcao, aoProporcao, regua, aoRegua, latitude }.
 */
export function Grupos({ a, mudar, abertos, aoAbrir, aoZerar, ferramentas, aba, aoAba }) {
  const f = ferramentas
  const g = (id, rotulo, corpo, { zerar = true } = {}) => html`<${Grupo}
    key=${id}
    id=${id}
    rotulo=${rotulo}
    aberto=${abertos.has(id)}
    aoAlternar=${() => aoAbrir(id)}
    mexido=${grupoMexido(a, id)}
    aoZerar=${zerar ? () => aoZerar(id) : null}
  >${abertos.has(id) ? corpo() : null}<//>`
  const avancado = abertos.has('avancado')
  return html`<div class="rv-grupos">
    ${g('luz', 'Luz', () => html`<${Luz} a=${a} mudar=${mudar} />`)}
    ${g('cor', 'Cor', () => html`<${Cor} a=${a} mudar=${mudar} gota=${f.gota} aoGota=${f.aoGota} aoModoBranco=${f.aoModoBranco} />`)}
    ${g(
      'presenca',
      'Presença',
      () => html`<${Lista} grupo="presenca" a=${a} mudar=${mudar} />`,
    )}
    ${g('curva', 'Curva', () => html`<${Curva} ajustes=${a} aoMudar=${mudar} />`)}
    ${g('misturador', 'Misturador', () => html`<${Misturador} a=${a} mudar=${mudar} aba=${aba} aoAba=${aoAba} />`)}
    ${g('tonalizacao', 'Tonalização', () => html`<${Rodas} ajustes=${a} aoMudar=${mudar} />`)}
    ${g('detalhe', 'Detalhe', () => html`<${Detalhe} a=${a} mudar=${mudar} />`)}
    ${g(
      'efeitos',
      'Efeitos',
      () => html`<${Lista} grupo="efeitos" a=${a} mudar=${mudar} />`,
    )}
    ${g(
      'geometria',
      'Geometria',
      () =>
        html`<${Geometria}
          a=${a}
          mudar=${mudar}
          corte=${f.corte}
          aoCorte=${f.aoCorte}
          proporcao=${f.proporcao}
          aoProporcao=${f.aoProporcao}
          regua=${f.regua}
          aoRegua=${f.aoRegua}
        />`,
    )}
    <section class=${cx('avancado', avancado && 'avancado--aberto')} data-grupo="avancado">
      <button type="button" class="avancado-botao" aria-expanded=${avancado ? 'true' : 'false'} onClick=${() => aoAbrir('avancado')}>
        Avançado
        ${grupoMexido(a, 'calibracao') || grupoMexido(a, 'tela') ? html`<span class="rv-grupo-ponto" aria-label="mexido"></span>` : null}
        <svg class="rv-grupo-seta" viewBox="0 0 24 24" aria-hidden="true"><path d="m6 9.5 6 6 6-6" /></svg>
      </button>
      ${
        avancado
          ? html`${g(
              'calibracao',
              'Calibração',
              () =>
                html`<div class="rv-controles">
                  ${controlesDoGrupo('calibracao').map((c) => html`<${Ctl} key=${c.caminho} caminho=${c.caminho} a=${a} mudar=${mudar} />`)}
                </div>`,
            )}
            ${g('tela', 'Tela', () => html`<${Tela} a=${a} mudar=${mudar} latitude=${f.latitude} />`)}`
          : null
      }
    </section>
  </div>`
}

export { Ctl }

// As três folhas da Decupar: os ajustes da análise, a confirmação de "aceitar sugestões" e "gravar estrelas".
// Uma ideia por folha, um botão principal.

import { html, useEffect, useState } from '../../preact.js'
import { Icone } from '../../icones.js'
import { Chave, Numero, Segmentado } from '../../componentes/base.js'
import { Folha } from '../../componentes/folha.js'
import { avisar } from '../../componentes/aviso.js'
import { CAMADAS, ENSAIOS, ESTADO_DA_CAMADA, RIGORES } from '../../../src/decupagem/textos.js'
import { baixar, gravarNaPasta, pastaDoTrabalho, planoDeGravar, zipDosXmp } from './gravar.js'

const milhar = (n) => Number(n || 0).toLocaleString('pt-BR')

/** Os ajustes: tipo de ensaio, rigor, o que a análise olha, começar sozinha e o aprendizado. */
export function FolhaDeAjustes({ aberta, aoFechar, est, esteira }) {
  const camada = (k) => {
    const situacao = est.analise.camadas?.[k]
    const pedida = est.camadas.includes(k)
    const texto = !pedida ? ESTADO_DA_CAMADA.desligada : situacao && situacao !== 'desligada' ? ESTADO_DA_CAMADA[situacao] : 'Na próxima análise'
    return html`<div class="ajuste-camada" data-situacao=${pedida ? situacao : 'desligada'}>
      <${Chave}
        rotulo=${CAMADAS[k]}
        ligada=${pedida}
        aoMudar=${(sim) => esteira.definirCamadas(sim ? [...est.camadas, k] : est.camadas.filter((x) => x !== k))}
      />
      <small title=${est.analise.motivos?.[k] ?? ''}>${texto}</small>
    </div>`
  }
  return html`<${Folha} aberta=${aberta} aoFechar=${aoFechar} titulo=${['Como', 'decupar.']} largura=${560} classe="folha-ajustes">
    <section class="ajuste">
      <h3 class="sobretitulo">Tipo de ensaio</h3>
      <${Segmentado}
        rotulo="Tipo de ensaio"
        valor=${est.ensaio}
        aoMudar=${(v) => esteira.definirEnsaio(v)}
        opcoes=${Object.entries(ENSAIOS).map(([id, e]) => ({ valor: id, rotulo: e.nome, dica: e.dica }))}
      />
      <p class="apoio">${ENSAIOS[est.ensaio].dica}${est.ensaio === 'geral' ? '. Vale para evento, casamento e retrato.' : '.'}</p>
    </section>
    <section class="ajuste">
      <h3 class="sobretitulo">Rigor</h3>
      <${Segmentado}
        rotulo="Rigor"
        valor=${est.rigor}
        aoMudar=${(v) => esteira.definirRigor(v)}
        opcoes=${Object.entries(RIGORES).map(([id, r]) => ({ valor: id, rotulo: r.nome, dica: r.dica }))}
      />
      <p class="apoio">${RIGORES[est.rigor].dica}.</p>
    </section>
    <section class="ajuste">
      <h3 class="sobretitulo">O que a análise olha</h3>
      <div class="ajuste-camada" data-situacao="pronta">
        <span class="ajuste-sempre"><${Icone} nome="ok" />Nitidez, tremido e exposição</span>
        <small>Sempre</small>
      </div>
      ${camada('rostos')} ${camada('objetos')} ${camada('rotulos')}
      <div class="ajuste-camada">
        <${Chave} rotulo="Começar sozinha ao abrir" ligada=${est.sozinha} aoMudar=${(v) => esteira.definirSozinha(v)} />
      </div>
    </section>
    ${
      est.mexido
        ? html`<section class="ajuste">
            <h3 class="sobretitulo">O que aprendi com você</h3>
            ${est.aprendizado.map((frase) => html`<p class="ajuste-frase">${frase}</p>`)}
            <button type="button" class="vidro vidro--pequeno" onClick=${() => esteira.zerarAprendizado()}>Zerar</button>
          </section>`
        : null
    }
  <//>`
}

/** "Aceitar sugestões": quanto muda, em forma de número; um passo só no desfazer. */
export function FolhaDeAceitar({ aberta, aoFechar, esteira, aoAceitou }) {
  const [plano, definirPlano] = useState(null)
  useEffect(() => {
    if (aberta) definirPlano(esteira.planoDeAceitar())
  }, [aberta])
  const p = plano ?? { itens: [], escolhidas: 0, rejeitadas: 0, estrelas: 0 }
  const aceitar = () => {
    const ids = esteira.aceitar(p)
    aoFechar()
    aoAceitou?.(ids)
  }
  return html`<${Folha} aberta=${aberta} aoFechar=${aoFechar} titulo=${['Aceitar', 'as sugestões?']} largura=${480} classe="folha-aceitar">
    <div class="numeros">
      <div>
        <span class="marca" data-marca="escolhida"><${Icone} nome="ok" /></span><b><${Numero} valor=${p.escolhidas} /></b><span>escolhidas</span>
      </div>
      <div>
        <span class="marca" data-marca="rejeitada"><${Icone} nome="x" /></span><b><${Numero} valor=${p.rejeitadas} /></b><span>rejeitadas</span>
      </div>
      <div>
        <span class="numeros-estrela"><${Icone} nome="estrela" cheio /></span><b><${Numero} valor=${p.estrelas} /></b><span>com estrelas</span>
      </div>
    </div>
    <p class="apoio">O que você já marcou fica como está.</p>
    <div class="folha-pe">
      <button type="button" class="vidro" onClick=${aoFechar}>Cancelar</button>
      <button type="button" class="vidro vidro--tinta" data-acao="confirmar-aceitar" disabled=${!p.itens.length} onClick=${aceitar}>Aceitar</button>
    </div>
  <//>`
}

const nomeDeArquivo = (nome) =>
  String(nome || 'fotos')
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .replace(/[^\w-]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .toLowerCase()
    .slice(0, 60) || 'fotos'

/** "Gravar estrelas no Lightroom": na pasta (com permissão de escrita) ou num .zip. */
export function FolhaDeGravar({ aberta, aoFechar, loja }) {
  const [plano, definirPlano] = useState(null)
  const [pasta, definirPasta] = useState(undefined)
  const [idioma, definirIdioma] = useState('pt')
  const [gravando, definirGravando] = useState(null)
  useEffect(() => {
    if (!aberta) return
    definirPlano(planoDeGravar(loja.catalogo))
    definirGravando(null)
    pastaDoTrabalho(loja).then(definirPasta, () => definirPasta(null))
  }, [aberta])
  const p = plano ?? { fotos: [], fora: 0, semDecisao: 0 }
  const comCor = p.fotos.some((f) => f.cor)
  const gravar = async () => {
    if (pasta) {
      definirGravando({ feitas: 0, total: p.fotos.length })
      const r = await gravarNaPasta(pasta, p.fotos, { idioma, aoProgredir: (feitas, total) => definirGravando({ feitas, total }) })
      definirGravando(null)
      if (r) {
        aoFechar()
        const feitos = r.novos + r.atualizados
        avisar(
          r.falhas.length
            ? `${milhar(feitos)} .xmp gravados; ${milhar(r.falhas.length)} não deu (o arquivo antigo ficou como estava)`
            : `${milhar(feitos)} .xmp ao lado dos RAW${r.atualizados ? `, ${milhar(r.atualizados)} atualizados` : ''}`,
        )
        return
      }
      // sem a permissão de escrita: vai o .zip
    }
    const { blob, quantos } = zipDosXmp(p.fotos, { idioma })
    baixar(blob, `${nomeDeArquivo(loja.trabalho()?.nome)}-xmp.zip`)
    aoFechar()
    avisar(`${milhar(quantos)} .xmp num .zip: solte ao lado dos RAW`)
  }
  const destino = pasta ? `Na pasta ${pasta.name}, ao lado de cada RAW` : 'Num .zip, para soltar ao lado dos RAW'
  return html`<${Folha} aberta=${aberta} aoFechar=${aoFechar} titulo=${['Gravar', 'as estrelas.']} largura=${500} classe="folha-gravar">
    ${
      p.fotos.length
        ? html`<div class="gravar-numero">
              <b><${Numero} valor=${p.fotos.length} /></b><span>.xmp</span>
            </div>
            <p class="apoio">${destino}. As fotos não mudam.</p>`
        : html`<p class="apoio">${p.semDecisao ? 'Marque ou aceite as sugestões primeiro.' : 'Nenhum RAW por aqui.'}</p>`
    }
    ${p.fora ? html`<p class="apoio gravar-fora">${milhar(p.fora)} JPEG ou DNG ficam de fora: guardam a nota dentro do arquivo, que a gente não muda.</p>` : null}
    ${
      comCor
        ? html`<div class="gravar-idioma">
            <span class="apoio">Cores no Lightroom em</span>
            <${Segmentado}
              rotulo="Idioma das cores"
              valor=${idioma}
              aoMudar=${definirIdioma}
              opcoes=${[
                { valor: 'pt', rotulo: 'Português' },
                { valor: 'en', rotulo: 'English' },
              ]}
            />
          </div>`
        : null
    }
    <div class="folha-pe">
      <button type="button" class="vidro" onClick=${aoFechar}>Cancelar</button>
      <button type="button" class="vidro vidro--tinta" data-acao="confirmar-gravar" disabled=${!p.fotos.length || !!gravando} onClick=${gravar}>
        ${gravando ? `${milhar(gravando.feitas)} de ${milhar(gravando.total)}` : pasta ? 'Gravar' : 'Baixar o .zip'}
      </button>
    </div>
  <//>`
}

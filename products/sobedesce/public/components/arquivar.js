// Arquivar (Cartões, 09/11/2026): uma pasta do projeto vira "<pasta> · arquivo", menor. RAW → DNG (Adobe DNG
// Converter, quando instalado) e vídeo compactado (ffmpeg, com LUT opcional), com "Testar 8 s" antes para ver quanto
// fica. O original nunca é tocado. Motor em src/arquivar/servico.js, rotas /api/arquivar.
import { html, useEffect, useState } from '/vendor/preact-htm.js'
import { api } from '../lib/api.js'
import { bytes, count, plural, tildify } from '../lib/format.js'
import { openModal, registerModal } from '../lib/modals.js'
import { pickFolderPath, revealLabel, revealPath } from '../lib/desktop.js'
import { Icon } from './icons.js'
import { Button, Select, Spinner } from './common.js'
import { Barra } from './kit.js'
import { Modal } from './modal.js'

const NIVEIS = [
  { value: 'manter', label: 'Manter como está' },
  { value: 'maxima', label: 'Máxima' },
  { value: 'alta', label: 'Alta' },
  { value: 'equilibrado', label: 'Equilibrado' },
  { value: 'economico', label: 'Econômico' },
]
const DICA_FOTO = {
  manter: 'Copia o RAW igual.',
  maxima: 'DNG sem perda.',
  alta: 'DNG com perda leve, tamanho cheio.',
  equilibrado: 'DNG com perda, lado maior 4096 px.',
  economico: 'DNG com perda, lado maior 2560 px.',
}
const DICA_VIDEO = {
  manter: 'Copia o vídeo igual.',
  maxima: 'Quase igual ao original.',
  alta: 'Para guardar e reeditar.',
  equilibrado: 'Bom para consulta.',
  economico: 'Leve, até 1080p.',
}

function Arquivar({ origem: inicial, sugestao, onClose }) {
  const [origem, setOrigem] = useState(inicial || '')
  const [plano, setPlano] = useState(null)
  const [erro, setErro] = useState(null)
  const [lendo, setLendo] = useState(false)
  const [nivelFoto, setNivelFoto] = useState('manter')
  const [nivelVideo, setNivelVideo] = useState('alta')
  const [perfil, setPerfil] = useState('rec709')
  const [perfis, setPerfis] = useState([])
  const [teste, setTeste] = useState(null)
  const [testando, setTestando] = useState(false)
  const [st, setSt] = useState(null)

  // andamento: enquanto houver trabalho, pergunta a cada segundo
  useEffect(() => {
    let vivo = true
    let t
    const ler = () =>
      api
        .get('/api/arquivar')
        .then((r) => {
          if (!vivo) return
          setSt(r)
          if (r.perfis) setPerfis(r.perfis)
          t = setTimeout(ler, r.job ? 1000 : 4000)
        })
        .catch(() => vivo && (t = setTimeout(ler, 4000)))
    ler()
    return () => {
      vivo = false
      clearTimeout(t)
    }
  }, [])

  useEffect(() => {
    if (!origem) return
    let vivo = true
    setLendo(true)
    setErro(null)
    setPlano(null)
    setTeste(null)
    api
      .post('/api/arquivar/planejar', { origem })
      .then((r) => {
        if (!vivo) return
        setPlano(r.plano)
        if (!r.plano.dng) setNivelFoto('manter')
        if (!r.plano.video) setNivelVideo('manter')
      })
      .catch((err) => vivo && setErro(err?.message || 'Não consegui ler a pasta.'))
      .finally(() => vivo && setLendo(false))
    return () => (vivo = false)
  }, [origem])

  const escolher = async () => {
    const p = await pickFolderPath({
      title: 'Qual pasta arquivar?',
      subtitle: 'O original fica como está. O arquivo vai para uma pasta ao lado.',
      defaultPath: origem || sugestao || undefined,
    })
    if (p) setOrigem(p)
  }
  const testar = async () => {
    setTestando(true)
    setErro(null)
    try {
      setTeste((await api.post('/api/arquivar/testar', { origem: plano.origem, nivel: nivelVideo, perfil })).teste)
    } catch (err) {
      setErro(err?.message || 'O teste não deu certo.')
    } finally {
      setTestando(false)
    }
  }
  const iniciar = async () => {
    setErro(null)
    try {
      setSt(await api.post('/api/arquivar/iniciar', { origem: plano.origem, nivelFoto, nivelVideo, perfil }))
    } catch (err) {
      setErro(err?.message || 'Não deu para começar.')
    }
  }

  const job = st?.job
  const ultimo = st?.ultimo
  const nada = plano && nivelFoto === 'manter' && nivelVideo === 'manter'
  const sub = job ? 'Arquivando…' : plano ? tildify(plano.origem) : 'O original fica como está'

  const corpo = job
    ? html`<div class="arq-andamento">
        <${Barra} p=${job.total ? job.feitos / job.total : null} vivo=${true} />
        <p><b>${count(job.feitos)} de ${count(job.total)}</b> · ${bytes(job.bytesAntes)} viraram ${bytes(job.bytesDepois)}</p>
        ${job.atual ? html`<p class="sub mono-path" title=${job.atual}>${job.atual}</p>` : null}
        ${job.erros.length ? html`<p class="lk-erro"><${Icon} name="warning" size=${14} />${plural(job.erros.length, 'arquivo não deu', 'arquivos não deram')}: fica o original</p>` : null}
      </div>`
    : html`
        ${ultimo && ultimo.origem === plano?.origem ? html`<${Resultado} u=${ultimo} />` : null}
        ${
          !origem
            ? html`<div class="arq-vazio">
                <${Icon} name="archive" size=${28} />
                <p>Escolha a pasta do projeto ou da diária. RAW pode virar DNG e o vídeo fica mais leve. O original não muda.</p>
              </div>`
            : lendo
              ? html`<p class="sub"><${Spinner} size=${14} /> Lendo a pasta…</p>`
              : plano
                ? html`<div class="arq-plano">
                    <div class="arq-conta">
                      <span><b>${count(plano.raw)}</b> RAW · ${bytes(plano.bytes.raw)}</span>
                      <span><b>${count(plano.videos)}</b> vídeos · ${bytes(plano.bytes.videos)}</span>
                      <span><b>${count(plano.outros)}</b> outros · ${bytes(plano.bytes.outros)}</span>
                    </div>
                    <div class="arq-linha">
                      <span class="arq-rot"><${Icon} name="photo" size=${15} />Fotos RAW</span>
                      ${
                        plano.dng
                          ? html`<${Select} label="Fotos RAW" value=${nivelFoto} options=${NIVEIS} onChange=${setNivelFoto} />`
                          : html`<span class="sub" title="O Adobe DNG Converter é gratuito. Instale e abra esta tela de novo."
                              >Instale o Adobe DNG Converter para virar DNG</span
                            >`
                      }
                      <span class="sub">${plano.dng ? DICA_FOTO[nivelFoto] : 'Por enquanto, o RAW é copiado igual.'}</span>
                    </div>
                    <div class="arq-linha">
                      <span class="arq-rot"><${Icon} name="film" size=${15} />Vídeos</span>
                      ${
                        plano.video
                          ? html`<${Select} label="Vídeos" value=${nivelVideo} options=${NIVEIS} onChange=${(v) => (setNivelVideo(v), setTeste(null))} />`
                          : html`<span class="sub">Sem o ffmpeg, o vídeo é copiado igual</span>`
                      }
                      <span class="sub">${plano.video ? DICA_VIDEO[nivelVideo] : ''}</span>
                    </div>
                    ${
                      plano.video && nivelVideo !== 'manter'
                        ? html`<div class="arq-linha">
                            <span class="arq-rot"><${Icon} name="sparkle" size=${15} />Cor</span>
                            <${Select}
                              label="Cor"
                              value=${perfil}
                              options=${[{ value: 'rec709', label: 'Como foi gravado' }, ...perfis.filter((x) => x.id !== 'rec709').map((x) => ({ value: x.id, label: x.nome }))]}
                              onChange=${(v) => (setPerfil(v), setTeste(null))}
                            />
                            <span class="sub">${perfil === 'rec709' ? 'Sem LUT.' : 'LUT para Rec.709: assiste sem tratar.'}</span>
                          </div>`
                        : null
                    }
                    ${
                      plano.video && nivelVideo !== 'manter' && plano.videos
                        ? html`<div class="arq-teste">
                          <${Button} size="sm" icon="play" onClick=${testar} loading=${testando} disabled=${testando}>Testar 8 s</${Button}>
                          ${
                            teste
                              ? html`<span
                                  >Os vídeos ficariam com <b>~${bytes(teste.estimativaVideos)}</b> (${Math.round(Math.min(1, teste.razao) * 100)}% do
                                  original)</span
                                >`
                              : html`<span class="sub">Converte 8 s do maior vídeo para ver o tamanho e a qualidade.</span>`
                          }
                          ${teste ? html`<${Button} size="sm" icon="eye" onClick=${() => revealPath(teste.arquivo)}>Ver o teste</${Button}>` : null}
                        </div>`
                        : null
                    }
                    <p class="sub arq-destino" title=${tildify(plano.destino)}>
                      <${Icon} name="folder" size=${13} /><span>Vai para a pasta ao lado: <b>${plano.destino.split(/[\\/]/).pop()}</b></span>
                    </p>
                  </div>`
                : null
        }
      `

  const footer = html`
    ${
      job
        ? html`<${Button} icon="x" onClick=${() => api.post('/api/arquivar/cancelar').then(setSt)}>Parar</${Button}>`
        : html`<${Button} icon="folder" onClick=${escolher}>${origem ? 'Outra pasta…' : 'Escolher a pasta…'}</${Button}>
          <${Button} variant="primary" icon="archive" onClick=${iniciar} disabled=${!plano || nada || lendo} title=${nada ? 'Escolha um nível para fotos ou vídeos' : undefined}>Arquivar</${Button}>`
    }
  `

  return html`<${Modal} size="md" class="arq-modal" title="Arquivar" subtitle=${sub} onClose=${onClose} footer=${footer}>
    ${erro ? html`<p class="lk-erro" role="alert"><${Icon} name="warning" size=${15} />${erro}</p>` : null}
    ${corpo}
  </${Modal}>`
}

function Resultado({ u }) {
  const economia = u.bytesAntes > 0 ? Math.max(0, 1 - u.bytesDepois / u.bytesAntes) : 0
  return html`<div class=${u.erros?.length || u.cancelado ? 'arq-resultado is-warn' : 'arq-resultado'}>
    <${Icon} name=${u.cancelado ? 'x' : u.erros?.length ? 'warning' : 'circle-check'} size=${18} />
    <div>
      <b>${u.cancelado ? 'Parado' : 'Arquivado'}: ${bytes(u.bytesAntes)} → ${bytes(u.bytesDepois)}${economia > 0.01 ? ` (−${Math.round(economia * 100)}%)` : ''}</b>
      <span class="sub">${count(u.feitos)} de ${count(u.total)}${u.ja ? ` · ${count(u.ja)} já estavam lá` : ''}${u.erros?.length ? ` · ${plural(u.erros.length, 'não deu', 'não deram')}` : ''}</span>
    </div>
    <${Button} size="sm" icon="folder" onClick=${() => revealPath(u.destino)}>${revealLabel()}</${Button}>
  </div>`
}

registerModal('arquivar', Arquivar)

export const abrirArquivar = ({ origem, sugestao } = {}) => openModal('arquivar', { origem, sugestao })

'use client'
/**
 * O campo de conversa do laboratório: texto, ditado (o microfone escreve no campo para editar antes de enviar) e anexos
 * (imagem, PDF, Word, Excel, PowerPoint, texto, CSV, áudio e vídeo). Áudio e vídeo viram texto aqui mesmo: o navegador
 * tira o som e manda para a transcrição em pedaços; do vídeo também saem quatro quadros-chave.
 */
import { useEffect, useRef, useState, type FormEvent, type KeyboardEvent } from 'react'
import type { ZLabAnexo } from '@zro/core'
import { audioDoArquivo, Gravador, pedacosDoPcm, quadrosDoVideo } from '@/lib/ia/lab/audio'
import { api, ErroDoLab, transcrever } from '@/lib/ia/lab/cliente'
import { Icon } from '../../icons'

export type AnexoPronto = { nome: string; tipo: 'imagem' | 'pdf' | 'texto' | 'audio' | 'video'; anexos: ZLabAnexo[]; arquivos: string[] }
type Anexo = AnexoPronto & { id: string; estado: 'lendo' | 'pronto' | 'erro'; erro?: string }

/** Limites do lado do navegador (o servidor confere de novo o que chega lá). */
export const LIMITES = { documentoBytes: 4 * 1024 * 1024, midiaBytes: 300 * 1024 * 1024, midiaSegundos: 30 * 60, ditadoSegundos: 5 * 60, anexos: 8 }
const MIDIA = /\.(mp3|wav|m4a|aac|ogg|oga|opus|flac|mp4|m4v|mov|webm|mkv)$/i
const VIDEO = /\.(mp4|m4v|mov|webm|mkv)$/i

type Lido =
  | { tipo: 'imagem'; nome: string; arquivo: string }
  | { tipo: 'pdf'; nome: string; arquivo: string }
  | { tipo: 'texto'; nome: string; texto: string; origem: 'docx' | 'xlsx' | 'pptx' | 'texto'; cortado: boolean }

async function enviarArquivo(arquivo: Blob, nome: string): Promise<Lido> {
  const form = new FormData()
  form.set('arquivo', arquivo, nome)
  return api<Lido>('/anexos', { method: 'POST', body: form })
}

export function Compositor({
  desligado,
  ocupado,
  vozLigada,
  nomeChaveVoz,
  onEnviar,
  onParar,
  onVoz,
  onAviso,
  onArquivo,
}: {
  desligado: boolean
  ocupado: boolean
  vozLigada: boolean
  nomeChaveVoz: string
  onEnviar: (texto: string, anexos: AnexoPronto[]) => void
  onParar: () => void
  onVoz: () => void
  onAviso: (m: string | null) => void
  onArquivo: (id: string) => void
}) {
  const [texto, setTexto] = useState('')
  const [anexos, setAnexos] = useState<Anexo[]>([])
  const [ditado, setDitado] = useState<'parado' | 'ouvindo' | 'escrevendo'>('parado')
  const [nivel, setNivel] = useState(0)
  const [segundos, setSegundos] = useState(0)
  const campo = useRef<HTMLTextAreaElement>(null)
  const escolher = useRef<HTMLInputElement>(null)
  const gravador = useRef<Gravador | null>(null)

  // Tempo do ditado e o limite (para sozinho em 5 min).
  useEffect(() => {
    if (ditado !== 'ouvindo') return
    const t = setInterval(() => {
      const s = (performance.now() - (gravador.current?.inicio ?? performance.now())) / 1000
      setSegundos(s)
      if (s >= LIMITES.ditadoSegundos) void pararDitado()
    }, 250)
    return () => clearInterval(t)
  }, [ditado])

  useEffect(() => () => gravador.current?.cancelar(), [])

  const atualizar = (id: string, p: Partial<Anexo>) => setAnexos((as) => as.map((a) => (a.id === id ? { ...a, ...p } : a)))

  async function lerAnexo(f: File) {
    const id = crypto.randomUUID()
    const midia = f.type.startsWith('audio/') || f.type.startsWith('video/') || MIDIA.test(f.name)
    const video = f.type.startsWith('video/') || VIDEO.test(f.name)
    const base: Anexo = { id, nome: f.name, tipo: midia ? (video ? 'video' : 'audio') : 'texto', anexos: [], arquivos: [], estado: 'lendo' }
    setAnexos((as) => [...as, base])
    try {
      if (midia) {
        if (!vozLigada) throw new Error(`Áudio e vídeo precisam da chave da ElevenLabs (${nomeChaveVoz}).`)
        if (f.size > LIMITES.midiaBytes) throw new Error('Arquivo grande demais (até 300 MB).')
        let fala = ''
        try {
          const { pcm } = await audioDoArquivo(f, LIMITES.midiaSegundos)
          if (pcm.length >= 3200) fala = (await transcrever(pedacosDoPcm(pcm))).texto
        } catch (err) {
          // Vídeo sem som ainda vale pelos quadros; teto, chave e limite sobem sempre.
          if (!video || err instanceof ErroDoLab || /longo demais/.test((err as Error).message)) throw err
        }
        const lista: ZLabAnexo[] = []
        const ids: string[] = []
        if (fala) lista.push({ tipo: 'texto', nome: f.name, texto: fala.slice(0, 150_000), origem: video ? 'video' : 'audio', cortado: fala.length > 150_000 })
        if (video) {
          const quadros = await quadrosDoVideo(f, 4)
          for (const [i, q] of quadros.entries()) {
            const l = await enviarArquivo(q, `${f.name} · quadro ${i + 1}.jpg`)
            if (l.tipo === 'imagem') {
              lista.push({ tipo: 'imagem', arquivo: l.arquivo, nome: l.nome })
              ids.push(l.arquivo)
              onArquivo(l.arquivo)
            }
          }
        }
        if (!lista.length) throw new Error('Não ouvi fala neste arquivo.')
        atualizar(id, { estado: 'pronto', anexos: lista, arquivos: ids })
        return
      }
      if (f.size > LIMITES.documentoBytes) throw new Error('Arquivo grande demais (até 4 MB).')
      const l = await enviarArquivo(f, f.name)
      if (l.tipo === 'texto')
        atualizar(id, { estado: 'pronto', tipo: 'texto', anexos: [{ tipo: 'texto', nome: l.nome, texto: l.texto, origem: l.origem, cortado: l.cortado }] })
      else {
        onArquivo(l.arquivo)
        atualizar(id, { estado: 'pronto', tipo: l.tipo, anexos: [{ tipo: l.tipo, arquivo: l.arquivo, nome: l.nome }], arquivos: [l.arquivo] })
      }
    } catch (err) {
      atualizar(id, { estado: 'erro', erro: (err as Error).message })
    }
  }

  function escolhidos(lista: FileList | null) {
    if (!lista?.length) return
    const espaco = LIMITES.anexos - anexos.length
    if (lista.length > espaco) onAviso(`Até ${LIMITES.anexos} anexos por mensagem.`)
    for (const f of [...lista].slice(0, Math.max(0, espaco))) void lerAnexo(f)
  }

  function tirar(a: Anexo) {
    setAnexos((as) => as.filter((x) => x.id !== a.id))
    for (const f of a.arquivos) void api(`/anexos/${f}`, { method: 'DELETE' }).catch(() => undefined)
  }

  async function comecarDitado() {
    onAviso(null)
    const g = new Gravador((n) => setNivel(n))
    try {
      await g.abrir()
    } catch {
      onAviso('O microfone não abriu. Confira a permissão do navegador.')
      return
    }
    gravador.current = g
    setSegundos(0)
    setDitado('ouvindo')
  }

  async function pararDitado() {
    const g = gravador.current
    if (!g) return
    gravador.current = null
    const pcm = g.fechar()
    setNivel(0)
    if (pcm.length < 3200) return setDitado('parado')
    setDitado('escrevendo')
    try {
      const r = await transcrever(pedacosDoPcm(pcm), { idioma: 'pt' })
      if (r.texto) {
        const el = campo.current
        setTexto((t) => {
          const i = el?.selectionStart ?? t.length
          const antes = t.slice(0, i)
          const junta = antes && !/\s$/.test(antes) ? ' ' : ''
          return antes + junta + r.texto + t.slice(i)
        })
        requestAnimationFrame(() => campo.current?.focus())
      }
    } catch (err) {
      onAviso(err instanceof ErroDoLab ? err.message : 'O ditado não funcionou agora.')
    } finally {
      setDitado('parado')
    }
  }

  const lendo = anexos.some((a) => a.estado === 'lendo')
  const prontos = anexos.filter((a) => a.estado === 'pronto')
  const podeEnviar = !desligado && !ocupado && !lendo && ditado === 'parado' && (texto.trim().length > 0 || prontos.length > 0)

  function enviar(e?: FormEvent) {
    e?.preventDefault()
    if (!podeEnviar) return
    onEnviar(texto.trim(), prontos)
    setTexto('')
    setAnexos([])
  }

  const tecla = (e: KeyboardEvent<HTMLTextAreaElement>) => {
    if (e.key === 'Enter' && !e.shiftKey && !e.nativeEvent.isComposing) {
      e.preventDefault()
      enviar()
    }
  }

  return (
    <form
      className="zl-compositor"
      onSubmit={enviar}
      onDragOver={(e) => e.preventDefault()}
      onDrop={(e) => {
        e.preventDefault()
        escolhidos(e.dataTransfer.files)
      }}
      aria-label="Conversar com a Z"
    >
      {anexos.length > 0 && (
        <ul className="zl-compositor__anexos" aria-label="Anexos">
          {anexos.map((a) => (
            <li key={a.id} className="zl-anexo" data-estado={a.estado} data-tipo={a.tipo} title={a.erro ?? a.nome}>
              {a.estado === 'lendo' ? (
                <span className="zl-anexo__girando" aria-hidden="true" />
              ) : (
                <Icon name={a.estado === 'erro' ? 'plus' : 'check'} size={14} />
              )}
              <span className="zl-anexo__nome">{a.nome}</span>
              {a.estado === 'lendo' && <span className="zro-sr-only">lendo</span>}
              {a.erro && <span className="zl-anexo__erro">{a.erro}</span>}
              <button type="button" className="zl-anexo__tirar" aria-label={`Tirar ${a.nome}`} onClick={() => tirar(a)}>
                <Icon name="plus" size={12} />
              </button>
            </li>
          ))}
        </ul>
      )}
      <div className="zl-compositor__linha">
        <button
          type="button"
          className="zl-botao"
          aria-label="Anexar arquivo"
          title="Imagem, PDF, Word, Excel, PowerPoint, texto, áudio ou vídeo"
          disabled={desligado}
          onClick={() => escolher.current?.click()}
        >
          <Icon name="clip" />
        </button>
        <input
          ref={escolher}
          type="file"
          multiple
          hidden
          accept="image/*,application/pdf,.docx,.xlsx,.pptx,.txt,.md,.csv,.json,audio/*,video/*"
          onChange={(e) => {
            escolhidos(e.target.files)
            e.target.value = ''
          }}
        />
        <label className="zro-sr-only" htmlFor="zl-campo">
          Mensagem para a Z
        </label>
        <textarea
          id="zl-campo"
          ref={campo}
          className="zl-compositor__campo"
          rows={1}
          placeholder={ditado === 'ouvindo' ? 'Ouvindo…' : ditado === 'escrevendo' ? 'Escrevendo o que você falou…' : 'Fale com a Z'}
          value={texto}
          disabled={desligado}
          onChange={(e) => setTexto(e.target.value)}
          onKeyDown={tecla}
          maxLength={40_000}
        />
        <button
          type="button"
          className="zl-botao zl-botao--mic"
          data-ouvindo={ditado === 'ouvindo' ? '' : undefined}
          style={{ ['--nivel' as string]: String(nivel) }}
          aria-pressed={ditado === 'ouvindo'}
          aria-label={ditado === 'ouvindo' ? 'Parar o ditado' : 'Ditar'}
          title={!vozLigada ? `Conecte a chave da ElevenLabs (${nomeChaveVoz})` : ditado === 'ouvindo' ? 'Parar e escrever' : 'Ditar no campo'}
          disabled={desligado || !vozLigada || ditado === 'escrevendo'}
          onClick={() => (ditado === 'ouvindo' ? void pararDitado() : void comecarDitado())}
        >
          {ditado === 'escrevendo' ? <span className="zl-anexo__girando" aria-hidden="true" /> : <Icon name={ditado === 'ouvindo' ? 'stop' : 'mic'} />}
        </button>
        {ditado === 'ouvindo' && <span className="zl-compositor__tempo">{formatarTempo(segundos)}</span>}
        {ocupado ? (
          <button type="button" className="zl-botao zl-botao--enviar" aria-label="Parar a resposta" onClick={onParar}>
            <Icon name="stop" />
          </button>
        ) : texto.trim() || prontos.length || !vozLigada ? (
          <button type="submit" className="zl-botao zl-botao--enviar" aria-label="Enviar" disabled={!podeEnviar}>
            <Icon name="send" />
          </button>
        ) : (
          <button
            type="button"
            className="zl-botao zl-botao--enviar"
            aria-label="Conversar por voz"
            title="Conversar por voz"
            disabled={desligado}
            onClick={onVoz}
          >
            <Icon name="wave" />
          </button>
        )}
      </div>
    </form>
  )
}

const formatarTempo = (s: number) => `${Math.floor(s / 60)}:${String(Math.floor(s % 60)).padStart(2, '0')}`

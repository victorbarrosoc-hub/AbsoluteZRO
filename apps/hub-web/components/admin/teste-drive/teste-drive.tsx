'use client'
import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { checarEscolhidos, checarPasta, limpar, type Criados } from '@/lib/teste-drive/drive'
import {
  DRIVE_FILE,
  lerEscopos,
  ORDEM,
  PASTA_MIME,
  rotulo,
  rotuloFluxo,
  textoDoResultado,
  TITULOS,
  veredito,
  type Checagem,
  type Veredito,
} from '@/lib/teste-drive/veredito'
import { Icon } from '../../icons'

// Tipos mínimos do que usamos do Google Identity Services e do Picker (os scripts vêm do Google, só nesta tela).
type TokenResposta = { access_token?: string; expires_in?: number; scope?: string; error?: string; error_description?: string }
type TokenClient = { requestAccessToken: (o?: { prompt?: string }) => void }
type PickerDoc = { id: string; name?: string; mimeType?: string }
type PickerDados = { action: string; docs?: PickerDoc[] }
interface DocsView {
  setIncludeFolders(b: boolean): DocsView
  setSelectFolderEnabled(b: boolean): DocsView
  setMimeTypes(m: string): DocsView
}
interface PickerBuilder {
  addView(v: DocsView): PickerBuilder
  enableFeature(f: string): PickerBuilder
  setOAuthToken(t: string): PickerBuilder
  setDeveloperKey(k: string): PickerBuilder
  setAppId(a: string): PickerBuilder
  setLocale(l: string): PickerBuilder
  setTitle(t: string): PickerBuilder
  setCallback(cb: (d: PickerDados) => void): PickerBuilder
  build(): { setVisible(v: boolean): void }
}
type GoogleApis = {
  accounts: {
    oauth2: {
      initTokenClient(c: {
        client_id: string
        scope: string
        include_granted_scopes: boolean
        prompt: string
        callback: (r: TokenResposta) => void
        error_callback: (e: { type?: string; message?: string }) => void
      }): TokenClient
      revoke(token: string, cb?: () => void): void
    }
  }
  picker: {
    DocsView: new (viewId?: string) => DocsView
    PickerBuilder: new () => PickerBuilder
    ViewId: { DOCS: string }
    Feature: { MULTISELECT_ENABLED: string }
    Action: { PICKED: string }
  }
}
type Gapi = { load(lib: string, o: { callback: () => void; onerror: () => void }): void }
declare global {
  interface Window {
    google?: GoogleApis
    gapi?: Gapi
  }
}

const GSI = 'https://accounts.google.com/gsi/client'
const GAPI = 'https://apis.google.com/js/api.js'

function carregar(src: string): Promise<void> {
  return new Promise((resolve, reject) => {
    const ja = document.querySelector<HTMLScriptElement>(`script[src="${src}"]`)
    if (ja?.dataset.pronto) return resolve()
    const s = ja ?? document.createElement('script')
    s.addEventListener('load', () => ((s.dataset.pronto = '1'), resolve()), { once: true })
    s.addEventListener('error', () => reject(new Error(src)), { once: true })
    if (!ja) {
      s.src = src
      s.async = true
      document.head.appendChild(s)
    }
  })
}

async function copiar(texto: string): Promise<boolean> {
  try {
    await navigator.clipboard.writeText(texto)
    return true
  } catch {
    // Safari antigo, sem permissão ou fora de HTTPS: o caminho de sempre.
    const t = document.createElement('textarea')
    t.value = texto
    t.setAttribute('readonly', '')
    t.style.position = 'fixed'
    t.style.opacity = '0'
    document.body.appendChild(t)
    t.select()
    const ok = document.execCommand('copy')
    t.remove()
    return ok
  }
}

export type ConfigCliente = { clientId: string; apiKey: string; appId: string }

/**
 * A tela do teste: pede só drive.file, abre o Picker (pasta ou vários arquivos), roda as checagens na API do Drive e
 * aplica a tabela de decisão. Com `exemplo`, mostra um resultado fictício e não carrega nada do Google.
 */
export function TesteDrive({ config, exemplo }: { config?: ConfigCliente; exemplo?: { checagens: Checagem[]; escopos: string } }) {
  const [pronto, setPronto] = useState<'carregando' | 'ok' | 'erro'>(exemplo ? 'ok' : 'carregando')
  const [checagens, setChecagens] = useState<Checagem[]>(exemplo?.checagens ?? [])
  const [escopos, setEscopos] = useState(exemplo?.escopos ?? '')
  const [esperados, setEsperados] = useState('')
  const [rodando, setRodando] = useState(false)
  const [criados, setCriados] = useState<Criados>({})
  const [aviso, setAviso] = useState('')
  const [copiado, setCopiado] = useState<'' | 'ok' | 'manual'>('')
  const [encerrado, setEncerrado] = useState(false)
  const token = useRef<{ valor: string; ate: number } | null>(null)
  const cliente = useRef<TokenClient | null>(null)
  const espera = useRef<{ ok: (t: string) => void; erro: (m: string) => void } | null>(null)

  useEffect(() => {
    if (exemplo || !config) return
    let vivo = true
    Promise.all([carregar(GSI), carregar(GAPI)])
      .then(
        () =>
          new Promise<void>((resolve, reject) => {
            window.gapi!.load('picker', { callback: resolve, onerror: () => reject(new Error('picker')) })
          }),
      )
      .then(() => {
        if (!vivo) return
        cliente.current = window.google!.accounts.oauth2.initTokenClient({
          client_id: config.clientId,
          scope: DRIVE_FILE,
          // Nada de somar escopos que este cliente já tenha recebido antes: o teste mede só o drive.file.
          include_granted_scopes: false,
          prompt: '',
          callback: (r) => {
            if (r.error || !r.access_token) return espera.current?.erro(r.error_description || r.error || 'sem token')
            token.current = { valor: r.access_token, ate: Date.now() + (r.expires_in ?? 3000) * 1000 - 60_000 }
            setEscopos(r.scope ?? '')
            setEncerrado(false)
            espera.current?.ok(r.access_token)
          },
          error_callback: (e) => espera.current?.erro(e.type === 'popup_closed' ? 'Janela do Google fechada.' : e.message || 'O Google não respondeu.'),
        })
        setPronto('ok')
      })
      .catch(() => vivo && setPronto('erro'))
    return () => {
      vivo = false
    }
  }, [config, exemplo])

  // Saiu da tela com o acesso aberto: revoga (melhor esforço).
  useEffect(() => {
    const sair = () => {
      if (token.current) window.google?.accounts.oauth2.revoke(token.current.valor)
    }
    window.addEventListener('pagehide', sair)
    return () => window.removeEventListener('pagehide', sair)
  }, [])

  /** Precisa ser chamada direto no clique: a janela do Google só abre num gesto da pessoa. */
  const garantirToken = useCallback((): Promise<string> => {
    if (token.current && token.current.ate > Date.now()) return Promise.resolve(token.current.valor)
    return new Promise((ok, erro) => {
      espera.current = { ok, erro: (m) => erro(new Error(m)) }
      cliente.current?.requestAccessToken({ prompt: '' })
    })
  }, [])

  const abrirPicker = useCallback(
    (modo: 'pasta' | 'arquivos', tk: string, aoEscolher: (docs: PickerDoc[]) => void) => {
      const p = window.google!.picker
      const view =
        modo === 'pasta'
          ? new p.DocsView(p.ViewId.DOCS).setIncludeFolders(true).setSelectFolderEnabled(true).setMimeTypes(PASTA_MIME)
          : new p.DocsView(p.ViewId.DOCS).setIncludeFolders(true).setSelectFolderEnabled(false)
      let b = new p.PickerBuilder()
        .addView(view)
        .setOAuthToken(tk)
        .setDeveloperKey(config!.apiKey)
        .setAppId(config!.appId)
        .setLocale('pt-BR')
        .setTitle(modo === 'pasta' ? 'Escolha a pasta de teste' : 'Escolha alguns arquivos')
        .setCallback((d) => {
          if (d.action === p.Action.PICKED && d.docs?.length) aoEscolher(d.docs)
        })
      if (modo === 'arquivos') b = b.enableFeature(p.Feature.MULTISELECT_ENABLED)
      b.build().setVisible(true)
    },
    [config],
  )

  const escolherPasta = () => {
    setAviso('')
    garantirToken()
      .then((tk) =>
        abrirPicker('pasta', tk, async (docs) => {
          const pasta = docs[0]
          if (!pasta) return
          setRodando(true)
          setCriados({})
          setChecagens((atual) => atual.filter((c) => c.id === 'ler_escolhidos'))
          const n = Number.parseInt(esperados, 10)
          const { criados: novos } = await checarPasta((u, i) => fetch(u, i), tk, pasta.id, {
            esperados: Number.isFinite(n) ? n : undefined,
            aoAvancar: (c) => setChecagens((atual) => [...atual.filter((x) => x.id !== c.id), c]),
          })
          setCriados(novos)
          setRodando(false)
        }),
      )
      .catch((e: Error) => setAviso(e.message))
  }

  const escolherArquivos = () => {
    setAviso('')
    garantirToken()
      .then((tk) =>
        abrirPicker('arquivos', tk, async (docs) => {
          setRodando(true)
          const c = await checarEscolhidos(
            (u, i) => fetch(u, i),
            tk,
            docs.map((d) => d.id),
          )
          setChecagens((atual) => [...atual.filter((x) => x.id !== c.id), c])
          setRodando(false)
        }),
      )
      .catch((e: Error) => setAviso(e.message))
  }

  const limparCriados = async () => {
    if (!token.current) return
    const r = await limpar((u, i) => fetch(u, i), token.current.valor, criados)
    setCriados({})
    setAviso(r.falhas ? `Apagou ${r.apagados}; ${r.falhas} não saíram. Apague teste-absolutezro à mão.` : 'O que o teste criou foi apagado.')
  }

  const encerrar = () => {
    const t = token.current
    token.current = null
    setEncerrado(true)
    if (t) window.google?.accounts.oauth2.revoke(t.valor, () => setAviso('Acesso revogado.'))
  }

  const amplo = lerEscopos(escopos).amplos.length > 0
  const v = useMemo(() => veredito(checagens, { escopoAmplo: amplo }), [checagens, amplo])
  const texto = useMemo(() => textoDoResultado(checagens, v, new Date(), { escopos }), [checagens, v, escopos])
  const temCriados = Boolean(criados.arquivo || criados.pasta)
  const desligado = exemplo !== undefined || pronto !== 'ok' || rodando

  return (
    <>
      {exemplo && (
        <p className="td-exemplo" role="note">
          <Icon name="flask" size={16} /> Exemplo com dados fictícios. Nada foi medido.
        </p>
      )}

      <section className="td-card td-inicio" aria-labelledby="td-passo">
        <h2 id="td-passo">Escolha a pasta de teste</h2>
        <p>Use uma pasta de teste com subpastas e arquivos que você criou antes, fora deste app.</p>
        <label className="td-campo">
          <span>Itens no primeiro nível</span>
          <input
            inputMode="numeric"
            pattern="[0-9]*"
            placeholder="opcional"
            value={esperados}
            onChange={(e) => setEsperados(e.target.value.replace(/\D/g, '').slice(0, 4))}
            disabled={desligado}
          />
        </label>
        <div className="td-acoes">
          <button type="button" className="glass-btn glass-btn--ink td-btn" onClick={escolherPasta} disabled={desligado}>
            <Icon name="files" size={18} />
            {rodando ? 'Testando…' : 'Escolher a pasta'}
          </button>
          <button
            type="button"
            className="glass-btn td-btn"
            onClick={escolherArquivos}
            disabled={desligado}
            title="Escolha vários arquivos de uma vez: o teste lê cada um."
          >
            <Icon name="check" size={18} />
            Escolher arquivos
          </button>
        </div>
        {pronto === 'carregando' && !exemplo && <p className="td-faint">Carregando o Google…</p>}
        {pronto === 'erro' && <p className="td-erro">Os scripts do Google não carregaram. Confira a rede e recarregue.</p>}
        {escopos && (
          <p className="td-faint" title={escopos}>
            Escopo do token: {lerEscopos(escopos).temDriveFile && !amplo ? 'só drive.file' : escopos.replaceAll('https://www.googleapis.com/auth/', '')}
          </p>
        )}
        {aviso && (
          <p className="td-faint" role="status">
            {aviso}
          </p>
        )}
      </section>

      {checagens.length > 0 && <Resultado checagens={checagens} v={v} rodando={rodando} />}

      {checagens.length > 0 && (
        <div className="td-acoes td-acoes--fim">
          <button
            type="button"
            className="glass-btn td-btn"
            onClick={async () => {
              const ok = await copiar(texto)
              setCopiado(ok ? 'ok' : 'manual')
              if (ok) window.setTimeout(() => setCopiado(''), 1800)
            }}
          >
            <Icon name={copiado === 'ok' ? 'check' : 'copy'} size={18} />
            <span aria-live="polite">{copiado === 'ok' ? 'Copiado' : 'Copiar resultado'}</span>
          </button>
          {temCriados && (
            <button type="button" className="glass-btn td-btn" onClick={limparCriados} disabled={rodando || !token.current}>
              Limpar o que o teste criou
            </button>
          )}
          {!exemplo && (
            <button type="button" className="glass-btn td-btn" onClick={encerrar} disabled={rodando || encerrado}>
              <Icon name="lock" size={18} />
              {encerrado ? 'Acesso revogado' : 'Terminar e revogar'}
            </button>
          )}
        </div>
      )}
      {copiado === 'manual' && (
        <textarea className="td-copia" readOnly value={texto} rows={12} aria-label="Resultado para copiar" onFocus={(e) => e.currentTarget.select()} />
      )}
    </>
  )
}

const ICONE = { passou: 'check', falhou: 'stop', nao_testado: 'more' } as const

function Resultado({ checagens, v, rodando }: { checagens: Checagem[]; v: Veredito; rodando: boolean }) {
  const porId = new Map(checagens.map((c) => [c.id, c]))
  return (
    <>
      <section className="td-card td-veredito" data-tipo={v.tipo} aria-live="polite" aria-labelledby="td-veredito">
        <h2 id="td-veredito">{rodando ? 'Testando…' : v.titulo}</h2>
        {!rodando && <p>{v.texto}</p>}
        {!rodando && (
          <ul className="td-fluxos" aria-label="Fluxos do SOBEDESCE">
            {v.fluxos.map((f) => (
              <li key={f.id} data-estado={f.estado}>
                <span>{f.nome}</span>
                <b>{rotuloFluxo(f.estado)}</b>
              </li>
            ))}
          </ul>
        )}
      </section>

      <ol className="td-card td-checks" aria-label="Checagens">
        {ORDEM.map((id, i) => {
          const c = porId.get(id)
          const estado = c?.estado
          return (
            <li key={id} data-estado={estado ?? 'pendente'}>
              <span className="td-checks__n" aria-hidden="true">
                {estado ? <Icon name={ICONE[estado]} size={16} /> : i + 1}
              </span>
              <div>
                <strong>{TITULOS[id]}</strong>
                <span className="td-checks__det">{c ? c.detalhe : id === 'ler_escolhidos' ? 'Use "Escolher arquivos".' : rodando ? 'Na fila…' : '—'}</span>
              </div>
              <span className="td-checks__estado">
                {estado ? rotulo(estado) : ''}
                {c?.status !== undefined && <small>HTTP {c.status}</small>}
              </span>
            </li>
          )
        })}
      </ol>
    </>
  )
}

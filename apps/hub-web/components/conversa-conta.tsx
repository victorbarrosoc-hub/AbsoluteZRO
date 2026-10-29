'use client'
/**
 * Entrar e criar conta como uma conversa: uma pergunta por vez, com o símbolo da marca (o orbe) ouvindo,
 * conferindo e com um ✓ em traço fino no fim. A conversa só avança no cliente; quem valida é a Server Action no último passo
 * (nada de consultar antes se um e-mail tem conta). Sem JavaScript, todos os campos aparecem e o form posta direto.
 * Animação em CSS (globals.css, "Conversa de conta") e o Z (components/ia/simbolo-z.tsx); "reduzir movimento" deixa tudo parado.
 */
import { startTransition, useActionState, useEffect, useRef, useState, useSyncExternalStore, type FormEvent, type ReactNode } from 'react'
import { normalizarArroba, sugerirArroba, validarArroba } from '@zro/auth/arroba'
import { CampoSenha } from '@zro/ui/senha'
import type { FormState } from './action-form'
import { PalcoZ, Z, type CenaZ, type MovimentoZ } from './ia/simbolo-z'
import './pessoas/pessoas.css'

type Passo = 'email' | 'nome' | 'arroba' | 'senha'
type Estado = 'absolute-zro' | 'ouvindo' | 'conferindo' | 'pronto'

const ROTULO: Record<Estado, string> = { 'absolute-zro': 'Z', ouvindo: 'ouvindo', conferindo: 'conferindo', pronto: 'pronto' }
const MOVIMENTO: Record<Estado, MovimentoZ> = { 'absolute-zro': 'parada', ouvindo: 'parada', conferindo: 'pensando', pronto: 'pronta' }
const CENA: Record<Estado, CenaZ> = { 'absolute-zro': 'calma', ouvindo: 'ouvindo', conferindo: 'pensando', pronto: 'pronta' }
const semAssinatura = () => () => {}

export function ConversaConta({
  modo,
  action,
  next,
  senhaMin = 8,
  aviso,
  erroInicial,
  google,
  rodape,
  autoFocus = false,
  destinoNome = 'seu HUB',
}: {
  modo: 'entrar' | 'criar'
  action: (prev: FormState, data: FormData) => Promise<FormState>
  next: string | null
  senhaMin?: number
  /** Linha de apoio no primeiro passo (ex.: "Senha criada. Entre com ela."). */
  aviso?: string
  /** Erro vindo da URL (?erro= do Google). */
  erroInicial?: string
  google?: ReactNode
  rodape?: ReactNode
  autoFocus?: boolean
  destinoNome?: string
}) {
  // Criar conta também escolhe o @ do perfil profissional (0029): a sugestão vem do nome e a pessoa troca se quiser.
  const passos: Passo[] = modo === 'criar' ? ['email', 'nome', 'arroba', 'senha'] : ['email', 'senha']
  const [state, formAction, pending] = useActionState(action, null)
  const js = useSyncExternalStore(
    semAssinatura,
    () => true,
    () => false,
  )
  const [passo, setPasso] = useState<Passo>('email')
  const [valores, setValores] = useState({ email: '', nome: '', arroba: '', senha: '' })
  const [arrobaMexida, setArrobaMexida] = useState(false)
  const [erro, setErro] = useState<string | null>(erroInicial ?? null)
  const [foco, setFoco] = useState(false)
  const [focoPedido, setFocoPedido] = useState(0)
  const refs = {
    email: useRef<HTMLInputElement>(null),
    nome: useRef<HTMLInputElement>(null),
    arroba: useRef<HTMLInputElement>(null),
    senha: useRef<HTMLInputElement>(null),
  }

  // Resposta da Server Action: erro volta ao passo certo (e o orbe a "ouvir"); sucesso vira "pronto".
  const [visto, setVisto] = useState<FormState>(state)
  if (state !== visto) {
    setVisto(state)
    if (state?.error) {
      setPasso(passoDoErro(modo, state.error))
      setErro(state.error)
      setFocoPedido((n) => n + 1)
    }
  }
  const destino = state?.ok && isDestino(state.data) ? state.data.to : null

  useEffect(() => {
    // refs são estáveis: o foco só muda quando o passo ou o pedido mudam
    if (focoPedido) refs[passo].current?.focus()
  }, [passo, focoPedido])

  useEffect(() => {
    if (!destino) return
    const reduz = window.matchMedia('(prefers-reduced-motion: reduce)').matches
    const t = setTimeout(() => window.location.assign(destino), reduz ? 250 : 1300)
    return () => clearTimeout(t)
  }, [destino])

  const estado: Estado = destino ? 'pronto' : pending ? 'conferindo' : foco ? 'ouvindo' : 'absolute-zro'

  function irPara(p: Passo, mensagem: string | null = null) {
    if (p === 'arroba' && !arrobaMexida) setValores((v) => ({ ...v, arroba: sugerirArroba(v.nome, v.email) }))
    setPasso(p)
    setErro(mensagem)
    setFocoPedido((n) => n + 1)
  }

  function invalido(p: Passo): string | null {
    const c = refs[p].current
    if (p === 'arroba' && c) return c.value.trim() ? validarArroba(normalizarArroba(c.value)) : 'Escolha seu @.'
    if (!c || c.checkValidity()) return null
    if (p === 'email') return c.value ? 'Confira o e-mail.' : 'Digite seu e-mail.'
    if (p === 'nome') return 'Diga como podemos te chamar.'
    return modo === 'criar' ? `Use pelo menos ${senhaMin} caracteres.` : 'Digite sua senha.'
  }

  function enviar(e: FormEvent<HTMLFormElement>) {
    e.preventDefault()
    if (pending || destino) return
    const agora = invalido(passo)
    if (agora) return irPara(passo, agora)
    const i = passos.indexOf(passo)
    if (i < passos.length - 1) return irPara(passos[i + 1]!)
    for (const p of passos) {
      const m = invalido(p)
      if (m) return irPara(p, m)
    }
    setErro(null)
    const fd = new FormData(e.currentTarget)
    startTransition(() => formAction(fd))
  }

  const mudar = (k: keyof typeof valores) => (ev: { target: { value: string } }) => {
    if (k === 'arroba') setArrobaMexida(true)
    setValores((v) => ({ ...v, [k]: k === 'arroba' ? ev.target.value.replace(/^@+/, '').toLowerCase() : ev.target.value }))
    if (erro) setErro(null)
  }

  if (destino)
    return (
      <div className="conversa" data-estado="pronto">
        <Orbe estado="pronto" />
        <div className="conversa__fim" role="status">
          <h1 className="conversa__titulo">{modo === 'criar' ? 'Conta criada.' : 'Conectado.'}</h1>
          <p className="conversa__apoio">Abrindo {destinoNome}…</p>
          <span className="conversa__barra" aria-hidden="true" />
        </div>
      </div>
    )

  const primeiroNome = valores.nome.trim().split(/\s+/)[0]
  const emailPilula = (
    <button type="button" className="conversa__quem" onClick={() => irPara('email')} aria-label={`${valores.email}. Trocar e-mail`}>
      {valores.email}
      <svg width="12" height="12" viewBox="0 0 24 24" aria-hidden="true">
        <path d="M4 20h4L19 9l-4-4L4 16v4Z" fill="none" stroke="currentColor" strokeWidth="2" strokeLinejoin="round" />
      </svg>
    </button>
  )

  const arrobaPilula = valores.arroba ? (
    <button type="button" className="conversa__quem" onClick={() => irPara('arroba')} aria-label={`@${valores.arroba}. Trocar o @`}>
      @{valores.arroba}
      <svg width="12" height="12" viewBox="0 0 24 24" aria-hidden="true">
        <path d="M4 20h4L19 9l-4-4L4 16v4Z" fill="none" stroke="currentColor" strokeWidth="2" strokeLinejoin="round" />
      </svg>
    </button>
  ) : null

  const campo = (p: Passo) => {
    const ativo = passo === p
    const ultimo = p === passos[passos.length - 1]
    const Titulo = ativo ? 'h1' : 'h2'
    const id = p === 'senha' ? 'password' : p === 'nome' ? 'name' : p === 'arroba' ? 'arroba' : 'email'
    let apoio: ReactNode = null
    if (p === 'email') apoio = aviso ?? (modo === 'criar' ? 'Oi! Vamos criar sua conta.' : 'Oi! Que bom te ver.')
    else if (js && p === 'nome') apoio = emailPilula
    else if (js && p === 'arroba') apoio = primeiroNome ? `Prazer, ${primeiroNome}.` : null
    else if (js && p === 'senha') apoio = modo === 'entrar' ? emailPilula : arrobaPilula
    const titulo =
      p === 'email'
        ? 'Qual é o seu e-mail?'
        : p === 'nome'
          ? 'Como podemos te chamar?'
          : p === 'arroba'
            ? 'Escolha seu @'
            : modo === 'criar'
              ? 'Crie uma senha'
              : 'Sua senha'
    const rotuloBotao = ultimo ? (modo === 'criar' ? 'Criar conta' : 'Entrar') : 'Continuar'
    const mostraErro = ativo && erro
    const atributos = {
      ref: refs[p],
      id,
      name: p === 'senha' ? 'password' : p === 'nome' ? 'name' : p === 'arroba' ? 'arroba' : 'email',
      autoComplete: p === 'senha' ? (modo === 'criar' ? 'new-password' : 'current-password') : p === 'nome' ? 'name' : p === 'arroba' ? 'username' : 'email',
      inputMode: p === 'email' ? ('email' as const) : undefined,
      autoCapitalize: p === 'nome' ? 'words' : 'none',
      spellCheck: false,
      // Sem JavaScript o @ é opcional: a conta nasce com a sugestão e a pessoa troca no Perfil.
      required: p !== 'arroba' || js,
      maxLength: p === 'nome' ? 120 : p === 'arroba' ? 31 : undefined,
      minLength: p === 'senha' && modo === 'criar' ? senhaMin : undefined,
      placeholder:
        p === 'email' ? 'voce@exemplo.com' : p === 'nome' ? 'Seu nome' : p === 'arroba' ? 'seu.nome' : modo === 'criar' ? `${senhaMin}+ caracteres` : '',
      autoFocus: autoFocus && p === 'email' && !erroInicial,
      value: valores[p],
      onChange: mudar(p),
      'aria-invalid': mostraErro ? true : undefined,
      'aria-describedby': mostraErro ? `${id}-erro` : undefined,
    }
    return (
      <div key={p} className="conversa__passo" data-ativo={ativo} inert={js && !ativo ? true : undefined}>
        {apoio && <p className="conversa__apoio">{apoio}</p>}
        <Titulo className="conversa__titulo">
          <label htmlFor={id}>{titulo}</label>
        </Titulo>
        <div className="conversa__campo" data-arroba={p === 'arroba' ? '' : undefined}>
          {p === 'senha' ? <CampoSenha {...atributos} /> : <input {...atributos} type={p === 'email' ? 'email' : 'text'} />}
          {(!js || ativo) && (
            <button type="submit" className="conversa__enviar" aria-label={rotuloBotao} title={rotuloBotao} disabled={pending}>
              <svg width="18" height="18" viewBox="0 0 24 24" aria-hidden="true">
                <path d="M5 12h13M13 6l6 6-6 6" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round" />
              </svg>
            </button>
          )}
        </div>
        {mostraErro ? (
          <p className="conversa__erro" id={`${id}-erro`} role="alert">
            {erro}
          </p>
        ) : null}
        {p === 'senha' && modo === 'entrar' && (
          <a className="conversa__link" href="/esqueci-a-senha">
            Esqueci a senha
          </a>
        )}
      </div>
    )
  }

  return (
    <form
      action={formAction}
      onSubmit={js ? enviar : undefined}
      noValidate={js}
      className="conversa"
      data-estado={estado}
      data-js={js ? '' : undefined}
      onFocus={(e) => setFoco(e.target instanceof HTMLInputElement)}
      onBlur={() => setFoco(false)}
    >
      <Orbe estado={estado} />
      <input type="hidden" name="next" value={next ?? ''} />
      {js && <input type="hidden" name="conversa" value="1" />}
      {js && modo === 'criar' && !arrobaMexida && <input type="hidden" name="arroba_sugerida" value="1" />}
      <div className="conversa__passos">{passos.map(campo)}</div>
      {(google || rodape) && (
        <div className="conversa__fora">
          {google}
          {rodape && <p className="conversa__rodape">{rodape}</p>}
        </div>
      )}
    </form>
  )
}

/**
 * O orbe é o Z (anel e estrela, com o rastro e as correntes em volta), com o estado em `data-estado`: parado na pose
 * da logo, pensando enquanto confere, uma volta e assenta no fim, quando um ✓ em traço fino se desenha abaixo dele.
 * O rótulo em pílula é a voz do orbe (aria-live).
 */
function Orbe({ estado }: { estado: Estado }) {
  return (
    <div className="orbe-wrap">
      <div className="conversa-orbe" data-estado={estado} aria-hidden="true">
        <PalcoZ cena={CENA[estado]} className="conversa-orbe__palco">
          <Z movimento={MOVIMENTO[estado]} tamanho={104} vento />
        </PalcoZ>
        <svg className="conversa-orbe__check" width="26" height="26" viewBox="0 0 24 24">
          <path d="M5 12.5l4.5 4.5L19 7.5" pathLength={1} fill="none" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round" strokeLinejoin="round" />
        </svg>
      </div>
      <p className="orbe__rotulo" aria-live="polite">
        <span className="orbe__luz" aria-hidden="true" />
        {ROTULO[estado]}
      </p>
    </div>
  )
}

function passoDoErro(modo: 'entrar' | 'criar', msg: string): Passo {
  if (modo === 'entrar') return 'senha'
  if (msg.includes('@')) return 'arroba'
  if (/e-mail/i.test(msg)) return 'email'
  if (/nome/i.test(msg)) return 'nome'
  return 'senha'
}

function isDestino(d: unknown): d is { to: string } {
  return !!d && typeof d === 'object' && typeof (d as { to?: unknown }).to === 'string'
}

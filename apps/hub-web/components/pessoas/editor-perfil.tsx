'use client'
/**
 * Editor do perfil profissional (ADR 0029): o @, "Aparecer na busca", funções, cidade, portfólio, bio e os selos dos
 * apps que a pessoa usa. Uma prévia mostra o que os outros veem. Sem JavaScript, cada formulário posta normalmente.
 */
import { useActionState, useState } from 'react'
import { useFormStatus } from 'react-dom'
import { ARROBA_MAX, BIO_MAX, CIDADE_MAX, FUNCAO_OUTRA_MAX, FUNCOES_PERFIL, PORTFOLIO_MAX } from '@zro/auth/arroba'
import type { MeuPerfil } from '@zro/core'
import type { FormState } from '../action-form'
import { FichaPessoa } from './ficha'

function Salvar({ rotulo, variante = 'primary' }: { rotulo: string; variante?: 'primary' | 'ghost' }) {
  const { pending } = useFormStatus()
  return (
    <button type="submit" className={`zro-btn zro-btn--${variante}`} disabled={pending} aria-busy={pending}>
      {pending ? 'Salvando…' : rotulo}
    </button>
  )
}

function Retorno({ s }: { s: FormState }) {
  if (s?.error)
    return (
      <p className="zro-field__error" role="alert">
        {s.error}
      </p>
    )
  if (s?.ok)
    return (
      <p className="zro-mute" role="status">
        {s.ok}
      </p>
    )
  return null
}

export function EditorPerfil({
  perfil,
  salvar,
  trocarArroba,
  visibilidade,
}: {
  perfil: MeuPerfil
  salvar: (prev: FormState, fd: FormData) => Promise<FormState>
  trocarArroba: (prev: FormState, fd: FormData) => Promise<FormState>
  visibilidade: (fd: FormData) => Promise<void>
}) {
  const [estadoPerfil, acaoPerfil] = useActionState(salvar, null)
  const [estadoArroba, acaoArroba] = useActionState(trocarArroba, null)
  const [bio, setBio] = useState(perfil.bio ?? '')
  const [outra, setOutra] = useState(perfil.funcaoOutra ?? '')
  return (
    <div className="pperfil">
      <section className="pperfil__vitrine" aria-labelledby="pp-vitrine">
        <p id="pp-vitrine" className="pperfil__rotulo">
          Como os outros te veem
        </p>
        <FichaPessoa p={perfil} titulo="h2" link={false} />
        <form action={visibilidade} className="pchave">
          <input type="hidden" name="visivel" value={perfil.visivel ? '0' : '1'} />
          <span>
            <strong id="pp-busca">Aparecer na busca</strong>
            <span>{perfil.visivel ? 'Quem usa a Absolute ZRO te acha pelo @ ou pelo nome.' : 'Só quem tem seu e-mail exato te convida.'}</span>
          </span>
          <button type="submit" role="switch" aria-checked={perfil.visivel} aria-labelledby="pp-busca" className="pinterruptor" />
        </form>
      </section>

      <form action={acaoArroba} className="zro-form account-card" aria-labelledby="pp-arroba-rot">
        <div className="account-name">
          <label id="pp-arroba-rot" className="zro-field__label" htmlFor="pp-arroba">
            Seu @
          </label>
          <div className="row">
            <span className="parroba">
              <input
                className="zro-input"
                id="pp-arroba"
                name="arroba"
                defaultValue={perfil.arroba}
                autoComplete="username"
                autoCapitalize="none"
                spellCheck={false}
                maxLength={ARROBA_MAX + 1}
                required
                aria-describedby="pp-arroba-dica"
              />
            </span>
            <Salvar rotulo="Salvar @" variante="ghost" />
          </div>
          <p id="pp-arroba-dica" className="zro-field__hint">
            {perfil.arrobaSugerida ? 'Sugerido pelo seu nome. Troque se quiser.' : 'Até 2 trocas por mês. O antigo ainda leva a você por 90 dias.'}
          </p>
          <Retorno s={estadoArroba} />
        </div>
      </form>

      <form action={acaoPerfil} className="zro-form account-card pperfil__form">
        <div className="stack" style={{ width: '100%' }}>
          <fieldset className="pfuncoes">
            <legend>Funções</legend>
            {FUNCOES_PERFIL.filter((f) => f.chave !== 'outra').map((f) => (
              <label key={f.chave} className="pchip">
                <input type="checkbox" name="funcao" value={f.chave} defaultChecked={perfil.funcoesMarcadas.includes(f.chave)} />
                <span>{f.nome}</span>
              </label>
            ))}
          </fieldset>
          <label className="zro-field" htmlFor="pp-outra">
            <span className="zro-field__label">Outra função</span>
            <input
              className="zro-input"
              id="pp-outra"
              name="funcao_outra"
              value={outra}
              onChange={(e) => setOutra(e.target.value)}
              maxLength={FUNCAO_OUTRA_MAX}
              placeholder="Ex.: Steadicam"
            />
          </label>
          <div className="grid grid--2">
            <label className="zro-field" htmlFor="pp-cidade">
              <span className="zro-field__label">Cidade</span>
              <input
                className="zro-input"
                id="pp-cidade"
                name="cidade"
                defaultValue={perfil.cidade ?? ''}
                maxLength={CIDADE_MAX}
                autoComplete="address-level2"
              />
            </label>
            <label className="zro-field" htmlFor="pp-portfolio">
              <span className="zro-field__label">Portfólio</span>
              <input
                className="zro-input"
                id="pp-portfolio"
                name="portfolio"
                type="url"
                inputMode="url"
                defaultValue={perfil.portfolio ?? ''}
                maxLength={PORTFOLIO_MAX}
                placeholder="https://"
              />
            </label>
          </div>
          <label className="zro-field" htmlFor="pp-bio">
            <span className="zro-field__label">Bio</span>
            <textarea className="zro-input" id="pp-bio" name="bio" value={bio} onChange={(e) => setBio(e.target.value)} maxLength={BIO_MAX} rows={3} />
            <span className="pcontador" aria-live="polite">
              {bio.length}/{BIO_MAX}
            </span>
          </label>
          {perfil.apps.length ? (
            <fieldset className="pfuncoes">
              <legend>Selos no perfil</legend>
              {perfil.apps.map((a) => (
                <label key={a.produto} className="pchip">
                  <input type="checkbox" name="selo" value={a.produto} defaultChecked={perfil.selosLigados.includes(a.produto)} />
                  <span>{a.texto}</span>
                </label>
              ))}
            </fieldset>
          ) : null}
          <details className="pdetalhe">
            <summary>O que aparece para os outros</summary>
            <ul>
              <li>Nome, foto, @, funções, cidade, portfólio, bio e os selos que você ligar.</li>
              <li>E-mail e telefone nunca aparecem. Para falar com você, a pessoa te convida pela Absolute ZRO.</li>
              <li>Você sempre aceita antes de entrar numa equipe.</li>
            </ul>
          </details>
          <div className="row">
            <Salvar rotulo="Salvar perfil" />
          </div>
          <Retorno s={estadoPerfil} />
        </div>
      </form>
    </div>
  )
}

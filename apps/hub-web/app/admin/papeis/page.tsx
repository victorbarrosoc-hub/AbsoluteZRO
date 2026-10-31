import type { Metadata } from 'next'
import { notFound } from 'next/navigation'
import { listarPapeisDoConsole, NOME_DO_PAPEL, PAPEIS_CONSOLE, papelNoConsole, podeVer, requireConsole, type PapelConsole } from '@zro/core'
import { Field } from '@zro/ui'
import { ActionForm } from '@/components/action-form'
import { Face, Fold } from '@/components/admin/parts'
import { definirPapelAction } from '@/lib/actions/papeis'
import { db, getAuth } from '@/lib/session'
import './papeis.css'

export const metadata: Metadata = { title: 'Papéis · Console', robots: { index: false, follow: false } }
export const dynamic = 'force-dynamic'

/** O que cada papel vê (curto; o detalhe fica no title). */
const VE: Record<PapelConsole, { curto: string; dica: string }> = {
  admin: { curto: 'Tudo', dica: 'Todo o console, as três caixas do Correio e esta tela.' },
  financeiro: { curto: 'Custos, Planos e financeiro@', dica: 'Só a parte financeira. O resto do console não aparece.' },
  support: { curto: 'Leitura', dica: 'Vê pessoas, planos e apps. Não muda nada, sem Custos nem Correio.' },
}

function SeletorDePapel({ id, atual, rotulo }: { id: string; atual?: PapelConsole; rotulo?: string }) {
  return (
    <select className="zro-select" id={id} name="papel" defaultValue={atual ?? 'financeiro'} aria-label={rotulo} required>
      {PAPEIS_CONSOLE.map((p) => (
        <option key={p} value={p}>
          {NOME_DO_PAPEL[p]}
        </option>
      ))}
      {atual && <option value="nenhum">Sem papel</option>}
    </select>
  )
}

/** Papéis do console (ADR 0034): quem entra e o que vê. Só admin; ninguém muda o próprio papel. */
export default async function Papeis() {
  const auth = await getAuth()
  // Layout e página renderizam em paralelo no Next: a página confere por conta própria.
  if (!auth || !podeVer(papelNoConsole(auth), 'papeis')) notFound()
  const eu = requireConsole(auth, 'papeis')
  const pessoas = await db().asSystem('admin: papéis do console', (tx) => listarPapeisDoConsole(tx))

  return (
    <div className="page adm-page">
      <header className="adm-head">
        <h1>Papéis</h1>
        <p>Quem entra no console e o que vê.</p>
      </header>

      <ul className="pap-legenda" aria-label="O que cada papel vê">
        {(['admin', 'financeiro', 'support'] as const).map((p) => (
          <li key={p} title={VE[p].dica}>
            <strong>{NOME_DO_PAPEL[p]}</strong>
            <span>{VE[p].curto}</span>
          </li>
        ))}
      </ul>

      <ul className="pap-lista">
        {pessoas.map((p) => {
          const self = p.userId === eu.userId
          return (
            <li key={p.userId} className="pap-pessoa">
              <Face name={p.nome} avatarId={null} size={40} />
              <span className="pap-pessoa__nome">
                <strong>{p.nome}</strong>
                <span className="zro-faint">{p.email}</span>
              </span>
              {self ? (
                <span className="adm-chip" title="O próprio papel só outro admin muda.">
                  {NOME_DO_PAPEL[p.papel]} · você
                </span>
              ) : (
                <ActionForm action={definirPapelAction} submit="Salvar" className="pap-form" variant="ghost" inlineSubmit>
                  <input type="hidden" name="userId" value={p.userId} />
                  <SeletorDePapel id={`papel-${p.userId}`} atual={p.papel} rotulo={`Papel de ${p.nome}`} />
                </ActionForm>
              )}
            </li>
          )
        })}
      </ul>

      <Fold title="Adicionar pessoa" meta="Conta com e-mail confirmado" open={pessoas.length <= 1}>
        <ActionForm action={definirPapelAction} submit="Dar papel" className="zro-form">
          <div className="zro-form-row">
            <Field label="E-mail da conta" htmlFor="papel-email">
              <input className="zro-input" id="papel-email" name="email" type="email" autoComplete="off" required />
            </Field>
            <Field label="Papel" htmlFor="papel-novo">
              <SeletorDePapel id="papel-novo" />
            </Field>
          </div>
        </ActionForm>
      </Fold>
    </div>
  )
}

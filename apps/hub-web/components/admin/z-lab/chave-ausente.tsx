import Link from 'next/link'
import type { LabEstado } from '@/lib/ia/lab/estado'
import { Icon } from '../../icons'

/**
 * Sem a chave do Claude, o laboratório não conversa. Estado calmo: diz qual variável falta e onde ela entra. Nunca
 * mostra campo de chave nem valor.
 */
export function ChaveAusente({ estado }: { estado: Pick<LabEstado, 'chaves' | 'nomesDasChaves'> }) {
  const itens = [
    { ok: estado.chaves.claude, nome: estado.nomesDasChaves.claude, para: 'Conversa' },
    { ok: estado.chaves.voz, nome: estado.nomesDasChaves.voz, para: 'Voz, ditado e transcrição' },
  ]
  return (
    <section className="zl-chave" aria-labelledby="zl-chave-titulo">
      <span className="zl-chave__icone" aria-hidden="true">
        <Icon name="key" size={28} />
      </span>
      <h2 id="zl-chave-titulo">Conecte a chave</h2>
      <p>Ela fica só no servidor, nas variáveis do projeto na Vercel.</p>
      <ul className="zl-chave__lista">
        {itens.map((i) => (
          <li key={i.nome} data-ok={i.ok ? '' : undefined}>
            <code>{i.nome}</code>
            <span>{i.para}</span>
            <span className="zl-chave__estado">{i.ok ? 'Conectada' : 'Falta'}</span>
          </li>
        ))}
      </ul>
      <Link className="glass-btn cst-btn" href="/admin/laboratorio/configurar">
        Abrir o Configurar
      </Link>
    </section>
  )
}

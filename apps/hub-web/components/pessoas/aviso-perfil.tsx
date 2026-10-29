/**
 * O aviso único do perfil profissional (ADR 0029): aparece uma vez no topo da central para quem já tinha conta (e para
 * quem acabou de criar), diz que o perfil aparece na busca e oferece esconder. Qualquer resposta some com ele.
 */
import Link from 'next/link'
import { avisoPerfilAction } from '@/lib/actions/perfil'
import { Icon } from '../icons'
import './pessoas.css'

export function AvisoPerfil({ arroba }: { arroba: string }) {
  return (
    <section className="paviso" aria-labelledby="paviso-titulo">
      <span className="paviso__icone" aria-hidden="true">
        <Icon name="at" size={22} />
      </span>
      <div>
        <h2 id="paviso-titulo">Você agora é @{arroba}</h2>
        <p>Quem trabalha com audiovisual te acha pelo @ ou pelo nome e te convida. E-mail e telefone nunca aparecem.</p>
        <div className="paviso__acoes">
          <form action={avisoPerfilAction}>
            <button type="submit" className="zro-btn zro-btn--primary zro-btn--small">
              Entendi
            </button>
          </form>
          <form action={avisoPerfilAction}>
            <input type="hidden" name="esconder" value="1" />
            <button type="submit" className="zro-btn zro-btn--small">
              Esconder meu perfil
            </button>
          </form>
          <Link href="/perfil/profissional" className="zro-btn zro-btn--ghost zro-btn--small">
            Editar perfil
          </Link>
        </div>
      </div>
    </section>
  )
}

import type { Metadata } from 'next'
import { Legal, LegalSecao } from '@/components/legal'

export const metadata: Metadata = { title: 'Privacidade', description: 'Que dados a Absolute ZRO usa, por quê e como você controla.' }

export default function Privacidade() {
  return (
    <Legal id="privacidade-title" titulo="Privacidade">
      <LegalSecao titulo="Quem somos">
        <p>
          A Absolute ZRO é a conta única e o HUB das ferramentas da família (Maestro, SOBEDESCE, Relay e outras). Dúvidas ou pedidos sobre seus dados:{' '}
          <a href="mailto:contato@absolutezro.com">contato@absolutezro.com</a>.
        </p>
      </LegalSecao>
      <LegalSecao titulo="O que guardamos">
        <ul>
          <li>Conta: nome, e-mail e foto de perfil (quando você entra com Google), plano e organização.</li>
          <li>Uso do produto: preferências, registros de acesso e de segurança, e o que você cria nas ferramentas.</li>
          <li>Pagamento: feito por um processador externo. Não guardamos o número do seu cartão.</li>
        </ul>
        <p>Não vendemos dados e não os usamos para publicidade.</p>
      </LegalSecao>
      <LegalSecao titulo="Entrar com Google">
        <p>
          Pedimos só <code>openid</code>, <code>email</code> e <code>profile</code>: para identificar você, mostrar seu nome e foto, e evitar contas duplicadas.
        </p>
      </LegalSecao>
      <LegalSecao titulo="Google Agenda (opcional)">
        <p>Só se você ligar a Agenda em Conexões. Pedimos dois acessos:</p>
        <ul>
          <li>
            <code>calendar.events</code>: ler os horários ocupados e criar, mudar ou apagar os eventos que você pede para o Maestro marcar.
          </li>
          <li>
            <code>calendar.calendarlist.readonly</code>: listar suas agendas para você escolher quais contam como ocupadas.
          </li>
        </ul>
        <p>
          Os tokens ficam cifrados. Você desliga a Agenda em Conexões quando quiser, e o acesso também se revoga em{' '}
          <a href="https://myaccount.google.com/permissions" rel="noreferrer noopener" target="_blank">
            myaccount.google.com/permissions
          </a>
          .
        </p>
      </LegalSecao>
      <LegalSecao titulo="Google Drive">
        <p>
          Nas ferramentas que abrem arquivos do seu Drive, você concede o acesso direto ao Google, e os arquivos vão do Google para o seu aparelho. O HUB não
          guarda o conteúdo dos seus arquivos. Cada ferramenta descreve o acesso que pede na própria política.
        </p>
      </LegalSecao>
      <LegalSecao titulo="Uso de dados do Google (Limited Use)">
        <p lang="en">
          Absolute ZRO&apos;s use and transfer to any other app of information received from Google APIs will adhere to the{' '}
          <a href="https://developers.google.com/terms/api-services-user-data-policy" rel="noreferrer noopener" target="_blank">
            Google API Services User Data Policy
          </a>
          , including the Limited Use requirements.
        </p>
        <p lang="en">
          We use Google user data only to provide and improve the user-facing features you request. We do not transfer it to others except as needed to provide
          those features, to comply with law, or as part of a merger or sale with notice to you. We do not use it for advertising, and we do not sell it. Humans
          do not read it unless you ask for support, it is needed for security or legal reasons, or it is aggregated and anonymized.
        </p>
        <p>
          Em português: usamos dados do Google só para entregar o que você pediu. Não vendemos, não usamos para anúncios e ninguém lê seu conteúdo sem sua
          autorização.
        </p>
      </LegalSecao>
      <LegalSecao titulo="Seus direitos (LGPD)">
        <p>
          Você pode pedir acesso, correção, exportação e exclusão dos seus dados, e apagar a conta. Escreva para{' '}
          <a href="mailto:contato@absolutezro.com">contato@absolutezro.com</a>.
        </p>
      </LegalSecao>
      <LegalSecao titulo="Mudanças">
        <p>Se esta página mudar, a data no alto muda junto, e avisamos por e-mail quando for relevante.</p>
      </LegalSecao>
    </Legal>
  )
}

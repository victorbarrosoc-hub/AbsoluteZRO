import type { Metadata } from 'next'
import Link from 'next/link'
import { Legal, LegalSecao } from '@/components/legal'

export const metadata: Metadata = { title: 'Termos de uso', description: 'As regras simples para usar a conta e as ferramentas da Absolute ZRO.' }

export default function Termos() {
  return (
    <Legal id="termos-title" titulo="Termos de uso">
      <LegalSecao titulo="Sua conta">
        <p>
          Uma conta abre o HUB e as ferramentas do seu plano. Mantenha seus dados verdadeiros e a senha protegida; você responde pelo que acontece na conta.
        </p>
      </LegalSecao>
      <LegalSecao titulo="Uso aceitável">
        <ul>
          <li>Use só com conteúdo que é seu ou que você tem direito de usar.</li>
          <li>Nada de abuso, fraude, tentativa de burlar limites ou de acessar dados de outras pessoas.</li>
          <li>Os arquivos continuam sendo seus. A Absolute ZRO não move, renomeia nem apaga seus arquivos sem uma confirmação sua.</li>
        </ul>
      </LegalSecao>
      <LegalSecao titulo="Planos e pagamento">
        <p>O que cada plano inclui está em Planos. Você pode cancelar quando quiser; o acesso segue até o fim do período já pago.</p>
      </LegalSecao>
      <LegalSecao titulo="Serviços do Google">
        <p>
          Se você conecta uma conta Google, vale também a <Link href="/privacidade">Privacidade</Link> desta página. Você pode desconectar quando quiser em
          Conexões ou em{' '}
          <a href="https://myaccount.google.com/permissions" rel="noreferrer noopener" target="_blank">
            myaccount.google.com/permissions
          </a>
          .
        </p>
      </LegalSecao>
      <LegalSecao titulo="Disponibilidade e responsabilidade">
        <p>
          Trabalhamos para manter tudo no ar, mas não garantimos funcionamento sem interrupção. Mantenha cópias do que é importante. Nossa responsabilidade
          segue a lei brasileira.
        </p>
      </LegalSecao>
      <LegalSecao titulo="Encerramento">
        <p>Você pode apagar a conta a qualquer momento. Podemos suspender contas que violem estes termos.</p>
      </LegalSecao>
      <LegalSecao titulo="Contato">
        <p>
          <a href="mailto:contato@absolutezro.com">contato@absolutezro.com</a>.
        </p>
      </LegalSecao>
    </Legal>
  )
}

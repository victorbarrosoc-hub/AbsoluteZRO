import Link from 'next/link';
import { Brand } from '@/components/brand';
export default function Privacy() {
  return (
    <main className="privacy-page container">
      <Link href="/" aria-label="Página inicial">
        <Brand />
      </Link>
      <span className="eyebrow">SEU SOM FICA COM VOCÊ</span>
      <h1>
        Privacidade,
        <br />
        com clareza.
      </h1>
      <p>
        A NOSSOM exige uma conta Supabase para entrar no estúdio. Contas e cotas ficam na nuvem;
        seus projetos e originais ficam neste dispositivo. A restauração avançada com IA envia uma
        cópia temporária do arquivo para processamento na nuvem.
      </p>
      <h2>Arquivos e projetos</h2>
      <p>
        Os arquivos importados, originais, versões e nomes de projetos ficam no armazenamento
        IndexedDB deste navegador. Não há sincronização entre dispositivos ou cópia de segurança na
        nuvem. Exclua um projeto na tela “Meus projetos” para remover seus dados locais. Limpar os
        dados do site no navegador também apaga os projetos. Exporte seus arquivos antes de fazer
        isso.
      </p>
      <p>
        Os presets pessoais ficam no armazenamento local deste navegador. Eles guardam ajustes e
        nomes, sem cópias do áudio. Limpar os dados do site também remove esses presets.
      </p>
      <h2>Processamento local</h2>
      <p>
        O motor FFmpeg e os modelos DeepFilterNet3/RNNoise são baixados do próprio site e executam
        no seu dispositivo. A primeira utilização exige o download desse motor. A decodificação e os
        tratamentos usam memória e processamento locais. Esta versão aceita arquivos mono ou
        estéreo, de até 100 MB e 10 minutos.
      </p>
      <h2>Restauração com IA na nuvem</h2>
      <p>
        Ao escolher Restaurar com IA, uma cópia do arquivo é enviada a um bucket privado do Supabase
        e processada por uma GPU da RunPod com Resemble Enhance, no preset D escolhido para a
        plataforma. Os links são temporários e restritos aos objetos desse trabalho. Não enviamos
        sua chave de conta ou a chave administrativa ao worker. A voz restaurada é mono, em WAV
        float32 a 44,1 kHz. Revise a fala e a pronúncia antes de publicar.
      </p>
      <p>
        Depois de baixar e salvar a versão local, solicitamos a remoção dos objetos temporários. Um
        processo diário, quando configurado na hospedagem, remove objetos abandonados com mais de 24
        horas. Falhas de conexão ou configuração podem atrasar essa remoção. Registramos o
        identificador do trabalho, conta, horários, duração, tamanho, estado e parâmetros técnicos
        para acompanhar o processamento. Os provedores podem manter logs técnicos segundo suas
        próprias políticas. Não usamos seus áudios para treinar um modelo.
      </p>
      <h2>Microfone e assistente</h2>
      <p>
        A gravação só acessa o microfone após sua permissão e salva o resultado localmente. A IA da
        plataforma usa a chave e o agente do administrador, no servidor, sem pedir configuração
        individual. Ao enviar um pedido, texto e medições de loudness, pico, duração e canais vão à
        Anthropic; o arquivo de áudio não vai ao Claude. Cada conversa recebe uma sessão própria,
        separada das outras contas. Ao fechar o painel, solicitamos a exclusão da sessão remota;
        falhas de conexão podem impedir a limpeza. A retenção do provedor continua aplicável.
      </p>
      <p>
        Voz ao vivo, quando habilitada pela plataforma, é opcional e usa ElevenLabs após sua ação e
        permissão de microfone. Nessa conversa, o áudio do microfone vai ao ElevenLabs conforme as
        políticas do provedor. Sem voz habilitada, o assistente funciona por texto.
      </p>
      <h2>Conta, planos e franquia mensal</h2>
      <p>
        Supabase Auth guarda seu e-mail, nome de exibição e os dados de autenticação. A aplicação
        não salva sua senha no navegador. Tokens de acesso e renovação ficam criptografados em
        cookie HttpOnly, com SameSite e Secure em produção. O cookie dura até sete dias e pode ser
        renovado durante o uso. Sair da conta apaga o cookie e solicita a revogação da sessão de
        renovação no Supabase. A hospedagem e o provedor podem manter registros técnicos de
        autenticação.
      </p>
      <p>
        Registramos no banco seu ID de usuário, operação, identificador e horário de cada
        autorização de restauração para aplicar a franquia mensal do plano. O Grátis inclui 5
        minutos; Essencial, 2 horas; Studio, 6 horas. O administrador pode atribuir planos, validade
        e limites personalizados. A franquia renova no dia 1 à 0h de Brasília, sem acumular saldo;
        cada pedido usa no mínimo 1 minuto. A conta ADM confirmada é ilimitada. Tempo é reservado
        antes do despacho; falhas e cancelamentos confirmados devolvem essa reserva. EQ, efeitos,
        masterização local, reprodução e downloads não gastam minutos. Um despacho com resultado de
        rede incerto não é repetido automaticamente. Planos pagos são assinados com cartão pela
        Stripe, na página de pagamento dela: a NOSSOM não recebe nem guarda dados do cartão, só os
        identificadores de cliente e assinatura, plano, situação do pagamento e data de renovação.
        Cancelamento, troca de cartão e faturas ficam na página da Stripe; o plano vale até o fim do
        período pago. Enquanto a assinatura não estiver disponível, o administrador ativa planos
        pagos manualmente. Alterações de plano são registradas para auditoria; o painel do
        administrador mostra conta, plano, uso, volumes enviados e estados dos trabalhos, sem expor
        os arquivos locais dos usuários.
      </p>
      <p>
        Projetos e presets são separados por conta no navegador. A primeira conta que entrar mantém
        o workspace local anterior. Isso não criptografa os áudios contra acesso físico ou às
        ferramentas de desenvolvimento no mesmo perfil de navegador. Entrar em outro aparelho
        recupera a conta e o saldo, mas não os arquivos. Limpar os dados locais apaga os projetos e
        presets, sem apagar sua conta Supabase ou reiniciar o contador. Para exclusão da conta e
        registros associados, solicite ao administrador da plataforma; apagar o usuário Supabase
        elimina os registros de uso vinculados.
      </p>
      <h2>Dados de acesso</h2>
      <p>
        A hospedagem pode registrar dados técnicos de acesso, como endereço IP, horário e erros,
        conforme suas configurações e políticas. Não instalamos ferramentas de publicidade,
        rastreamento comportamental ou analytics nesta versão.
      </p>
      <h2>Limites e direitos</h2>
      <p>
        Use arquivos que você tenha direito de processar. Preserve o consentimento e a privacidade
        das pessoas gravadas. As medições de áudio são ferramentas de apoio; os perfis de entrega
        não constituem certificação técnica.
      </p>
      <Link className="button primary" href="/studio">
        Voltar ao estúdio ↗
      </Link>
    </main>
  );
}

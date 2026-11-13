// Rosto em evento · os textos de consentimento e de aviso (docs/estudo/rosto-em-evento.md, B.4). Moram aqui, num lugar
// só: a página do visitante e o painel do fotógrafo mostram estes, e o servidor grava a versão e o sha256 do texto que
// a pessoa viu (foto.evento_consentimentos), nunca o que ela é. Mudou um texto, mude a versão (o registro antigo
// continua provando o que foi aceito antes). Todos pedem revisão jurídica antes de lançar.
//
// `{prazo}` é trocado pela data na tela; o sha256 é do texto com o marcador (a versão do modelo).

export const TEXTOS = Object.freeze({
  busca: {
    versao: 'busca-2026-11-13',
    titulo: 'Achar suas fotos pelo rosto?',
    corpo:
      'Vamos comparar seu rosto com as fotos deste evento. A selfie fica no seu celular. Só uma assinatura do rosto, ' +
      'uma sequência de números, vai para a comparação, e é apagada em seguida.',
    caixa: 'Tenho 18 anos ou mais, ou sou responsável por quem aparece na selfie.',
  },
  cadastro: {
    versao: 'cadastro-2026-11-13',
    titulo: 'Achar suas fotos pelo rosto?',
    corpo:
      'A selfie fica no seu celular. Só uma assinatura do rosto, uma sequência de números, fica guardada até {prazo} ' +
      'para o fotógrafo achar você nas fotos deste evento. Quem não pede não é procurado. Você pode desistir quando ' +
      'quiser.',
    caixa: 'Tenho 18 anos ou mais, ou sou responsável por quem aparece na selfie.',
  },
  remocao: {
    versao: 'remocao-2026-11-13',
    titulo: 'Não quer aparecer na busca?',
    corpo:
      'Vamos comparar seu rosto com as fotos deste evento e mostrar as parecidas. Você confere e elas saem da busca. ' +
      'A selfie fica no seu celular. A assinatura de quem pediu fica guardada até {prazo}, só para barrar fotos ' +
      'novas.',
    caixa: 'Tenho 18 anos ou mais, ou sou responsável por quem aparece na selfie.',
  },
  desistencia: {
    versao: 'desistencia-2026-11-13',
    titulo: 'Desistir da busca?',
    corpo: 'Apagamos sua assinatura e as fotos ligadas a você neste evento.',
    caixa: '',
  },
  ativacaoAberta: {
    versao: 'ativacao-aberta-2026-11-13',
    titulo: 'Busca aberta',
    corpo:
      'Achar minhas fotos cria uma assinatura do rosto de cada pessoa nas fotos deste evento. Avise quem participa ' +
      '(cartaz e inscrição). As assinaturas somem em {prazo} ou quando você encerrar o evento.',
    caixa: 'Vou avisar quem participa antes de abrir a busca.',
  },
  ativacaoConsentimento: {
    versao: 'ativacao-consentimento-2026-11-13',
    titulo: 'Com consentimento',
    corpo:
      'Só quem pedir para ser achado entra na busca. Seu computador compara as fotos com a assinatura de quem pediu e ' +
      'envia só a ligação entre a foto e a pessoa. As assinaturas somem em {prazo} ou quando você encerrar o evento.',
    caixa: '',
  },
  cartazAberta: {
    versao: 'cartaz-aberta-2026-11-13',
    titulo: 'Ache suas fotos pelo rosto',
    corpo: 'Neste evento você pode achar suas fotos pelo rosto. A selfie não sai do seu celular. Não quer aparecer na busca? Aponte aqui.',
    caixa: '',
  },
  cartazConsentimento: {
    versao: 'cartaz-consentimento-2026-11-13',
    titulo: 'Ache suas fotos pelo rosto',
    corpo: 'Neste evento você pode achar suas fotos pelo rosto. A selfie não sai do seu celular. Só é procurado quem pedir. Aponte aqui.',
    caixa: '',
  },
  regulamento: {
    versao: 'regulamento-2026-11-13',
    titulo: 'Para o regulamento ou a inscrição',
    corpo:
      'Neste evento haverá fotos. Quem quiser pode achar as próprias fotos pelo rosto, num link do fotógrafo. A ' +
      'selfie não sai do celular de quem busca; uma assinatura do rosto, uma sequência de números, é usada só neste ' +
      'evento e apagada até {prazo}. Quem não quiser aparecer na busca pode pedir pelo mesmo link.',
    caixa: '',
  },
})

/** O texto que entra no sha256 (título, corpo e caixa, como a pessoa viu, com o marcador {prazo}). */
export const textoDoRegistro = (chave) => {
  const t = TEXTOS[chave]
  return t ? [t.titulo, t.corpo, t.caixa].join('\n') : null
}

/** O texto com o prazo trocado pela data (ex.: '26 de novembro'). */
export const comPrazo = (texto, prazo) =>
  texto.replace('{prazo}', prazo ? new Intl.DateTimeFormat('pt-BR', { day: 'numeric', month: 'long' }).format(new Date(prazo)) : 'o fim do evento')

/** As chaves de texto por versão (o servidor confere a versão que a página mandou). */
export const PELA_VERSAO = Object.freeze(Object.fromEntries(Object.entries(TEXTOS).map(([k, t]) => [t.versao, k])))

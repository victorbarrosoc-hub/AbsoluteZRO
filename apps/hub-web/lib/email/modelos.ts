/**
 * Os e-mails da Absolute ZRO. Primeiro desenho (28/10/2026): cartão com marca em imagem e faixa do ecossistema; o
 * Gmail mandava tudo para Promoções. Desde 29/10/2026 (pedido do titular): com cara de e-mail de conta, como os da
 * Apple e do Google: fundo branco, símbolo e logo pequenos no topo (PNG servido pelo site, em cinza, que funciona no
 * claro e no escuro; nunca anexado), título curto, uma linha de apoio, um botão simples e o endereço por extenso.
 * Nada de imagem anexada, texto escondido de prévia com preenchimento ou bloco de produtos.
 * HTML em tabelas e estilo inline (Gmail, Outlook e Mail do iPhone) e sempre uma versão em texto.
 */
import type { OutgoingEmail } from '@zro/auth'

const ORIGEM = 'https://absolutezro.com'
const FONTE = "-apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Helvetica, Arial, sans-serif"
const GRAFITE = '#1d1d1f'
const APOIO = '#424245'
const SUTIL = '#6e6e73'

const esc = (s: string) => s.replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]!)

type Corpo = {
  /** Frase que aparece ao lado do assunto na caixa de entrada. */
  previa: string
  /** Título em duas partes (ex.: "Boas-vindas," + "Victor."). */
  fino: string
  forte: string
  apoio: string
  botao: { texto: string; link: string }
  /** Linha pequena abaixo do botão (validade, segurança). */
  nota?: string
}

function html(c: Corpo): string {
  return `<!doctype html>
<html lang="pt-BR"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">
<meta name="color-scheme" content="light dark"><meta name="supported-color-schemes" content="light dark">
<style>@media (prefers-color-scheme: dark){.z-fundo{background:#1c1c1e!important}.z-titulo,.z-forte{color:#f5f5f7!important}.z-apoio{color:#d1d1d6!important}.z-sutil,.z-sutil a{color:#a1a1a6!important}.z-botao{background:#f5f5f7!important}.z-botao a{color:#1d1d1f!important}.z-linha{border-top-color:#38383a!important}}</style>
<title>${esc(c.fino)} ${esc(c.forte)}</title></head>
<body class="z-fundo" style="margin:0;padding:0;background:#ffffff;">
<div style="display:none;max-height:0;overflow:hidden;">${esc(c.previa)}</div>
<table class="z-fundo" role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background:#ffffff;">
  <tr><td style="padding:32px 24px;">
    <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="max-width:520px;">
      <tr><td style="padding:0 0 28px 0;">
        <a href="${ORIGEM}" style="text-decoration:none;"><table role="presentation" cellpadding="0" cellspacing="0"><tr>
          <td style="padding:0 10px 0 0;vertical-align:middle;"><img src="${ORIGEM}/brand/email/absolute-zro-simbolo-cinza.png" width="28" height="28" alt="" style="display:block;border:0;width:28px;height:28px;"></td>
          <td style="vertical-align:middle;"><img src="${ORIGEM}/brand/email/absolute-zro-cinza.png" width="151" height="14" alt="Absolute ZRO" style="display:block;border:0;width:151px;height:auto;"></td>
        </tr></table></a>
      </td></tr>
      <tr><td style="font-family:${FONTE};">
        <h1 class="z-titulo" style="margin:0;font-size:24px;line-height:1.25;color:${GRAFITE};font-weight:600;">${esc(c.fino)} ${esc(c.forte)}</h1>
        <p class="z-apoio" style="margin:12px 0 0 0;font-size:16px;line-height:1.5;color:${APOIO};">${esc(c.apoio)}</p>
      </td></tr>
      <tr><td style="padding:24px 0 0 0;">
        <table role="presentation" cellpadding="0" cellspacing="0"><tr>
          <td class="z-botao" style="border-radius:8px;background:${GRAFITE};">
            <a href="${esc(c.botao.link)}" style="display:inline-block;padding:11px 20px;font-family:${FONTE};font-size:15px;font-weight:600;color:#ffffff;text-decoration:none;border-radius:8px;">${esc(c.botao.texto)}</a>
          </td>
        </tr></table>
      </td></tr>
      ${c.nota ? `<tr><td class="z-sutil" style="padding:16px 0 0 0;font-family:${FONTE};font-size:14px;line-height:1.5;color:${SUTIL};">${esc(c.nota)}</td></tr>` : ''}
      <tr><td class="z-sutil" style="padding:24px 0 0 0;font-family:${FONTE};font-size:13px;line-height:1.5;color:${SUTIL};">
        Se o botão não abrir, copie este endereço no navegador:<br>
        <a href="${esc(c.botao.link)}" style="color:${SUTIL};word-break:break-all;">${esc(c.botao.link)}</a>
      </td></tr>
      <tr><td style="padding:32px 0 0 0;">
        <table role="presentation" width="100%" cellpadding="0" cellspacing="0"><tr>
          <td class="z-sutil z-linha" style="padding:16px 0 0 0;border-top:1px solid #e8e8ed;font-family:${FONTE};font-size:12px;line-height:1.6;color:${SUTIL};">
            Absolute ZRO · <a href="mailto:contato@absolutezro.com" style="color:${SUTIL};">contato@absolutezro.com</a>
          </td>
        </tr></table>
      </td></tr>
    </table>
  </td></tr>
</table>
</body></html>`
}

function texto(c: Corpo): string {
  return [
    `${c.fino} ${c.forte}`,
    '',
    c.apoio,
    '',
    `${c.botao.texto}: ${c.botao.link}`,
    ...(c.nota ? ['', c.nota] : []),
    '',
    '—',
    'Absolute ZRO · contato@absolutezro.com',
  ].join('\n')
}

const primeiroNome = (nome?: string | null) => nome?.trim().split(/\s+/)[0] || ''

function montar(to: string, subject: string, c: Corpo): OutgoingEmail {
  return { to, subject, text: texto(c), html: html(c) }
}

/** Conta nova: boas-vindas + confirmar e-mail. No reenvio, só a confirmação. */
export function emailConfirmacao(to: string, link: string, opts: { nome?: string | null; boasVindas: boolean }): OutgoingEmail {
  const nome = primeiroNome(opts.nome)
  if (opts.boasVindas)
    return montar(to, 'Boas-vindas à Absolute ZRO', {
      previa: 'Confirme seu e-mail e abra todas as ferramentas com uma conta só.',
      fino: 'Boas-vindas,',
      forte: `${nome || 'que bom te ver'}.`,
      apoio: 'Sua conta Absolute ZRO está pronta. Confirme o e-mail para entrar em todas as ferramentas com ela.',
      botao: { texto: 'Confirmar e-mail', link },
      nota: 'Não foi você que criou a conta? É só ignorar este e-mail.',
    })
  return montar(to, 'Confirme seu e-mail na Absolute ZRO', {
    previa: 'Um toque e sua conta fica confirmada.',
    fino: 'Confirme seu',
    forte: 'e-mail.',
    apoio: 'Um toque e sua conta Absolute ZRO fica confirmada em todas as ferramentas.',
    botao: { texto: 'Confirmar e-mail', link },
    nota: 'Não pediu este link? É só ignorar.',
  })
}

export function emailNovaSenha(to: string, link: string): OutgoingEmail {
  return montar(to, 'Crie uma nova senha', {
    previa: 'O link vale por 1 hora.',
    fino: 'Uma nova',
    forte: 'senha.',
    apoio: 'Toque no botão para criar a nova senha da sua conta Absolute ZRO.',
    botao: { texto: 'Criar nova senha', link },
    nota: 'O link vale por 1 hora. Não pediu? Ignore este e-mail: sua senha continua a mesma.',
  })
}

export function emailNovoEmail(to: string, link: string): OutgoingEmail {
  return montar(to, 'Confirme seu novo e-mail', {
    previa: 'Confirme para a sua conta passar a usar este endereço.',
    fino: 'Confirme o',
    forte: 'novo e-mail.',
    apoio: 'Depois de confirmar, sua conta Absolute ZRO passa a entrar com este endereço.',
    botao: { texto: 'Confirmar novo e-mail', link },
    nota: 'O link vale por 48 horas. Até lá, o e-mail atual continua valendo.',
  })
}

export function emailEmailMudou(to: string, novo: string): OutgoingEmail {
  return montar(to, 'O e-mail da sua conta mudou', {
    previa: `Sua conta agora entra com ${novo}.`,
    fino: 'Seu e-mail',
    forte: 'mudou.',
    apoio: `Sua conta Absolute ZRO agora entra com ${novo}. Se não foi você, fale com a gente agora.`,
    botao: { texto: 'Falar com a Absolute ZRO', link: 'mailto:contato@absolutezro.com' },
  })
}

/** Confirmação da exclusão da conta. Nada a clicar além do contato: a conta já não existe. */
export function emailContaExcluida(to: string, nome?: string | null): OutgoingEmail {
  const n = primeiroNome(nome)
  return montar(to, 'Sua conta foi excluída', {
    previa: 'Sua conta Absolute ZRO e o acesso a todas as ferramentas foram encerrados.',
    fino: n ? `${n}, sua conta foi` : 'Sua conta foi',
    forte: 'excluída.',
    apoio: 'A conta Absolute ZRO deste e-mail foi excluída, e com ela o acesso a todas as ferramentas. Se não foi você, fale com a gente.',
    botao: { texto: 'Falar com a Absolute ZRO', link: 'mailto:contato@absolutezro.com' },
    nota: 'Se quiser voltar um dia, é só criar uma conta nova com este e-mail.',
  })
}

export function emailConvite(to: string, link: string): OutgoingEmail {
  return montar(to, 'Você foi convidado para uma equipe', {
    previa: 'Aceite o convite para entrar na equipe na Absolute ZRO.',
    fino: 'Um convite',
    forte: 'para você.',
    apoio: 'Você foi convidado para uma equipe na Absolute ZRO. Uma conta só abre todas as ferramentas da equipe.',
    botao: { texto: 'Aceitar convite', link },
    nota: 'O convite vale por 7 dias.',
  })
}

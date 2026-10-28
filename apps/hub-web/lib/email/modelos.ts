/**
 * Os e-mails da Absolute ZRO (pedido do titular, 28/10/2026: experiência premium, identidade do ecossistema).
 * Padrão Apple em e-mail: fundo cinza-claro, um cartão branco, a marca pequena no topo, título Light × ExtraBold,
 * uma linha de apoio, um botão em pílula grafite e um rodapé discreto. HTML em tabelas e estilo inline (Gmail,
 * Outlook e Mail do iPhone), imagens em PNG servidas pelo próprio site e sempre uma versão em texto.
 */
import type { OutgoingEmail } from '@zro/auth'

const ORIGEM = 'https://absolutezro.com'
const FONTE = "-apple-system, BlinkMacSystemFont, 'SF Pro Display', 'Figtree', 'Segoe UI', Roboto, Helvetica, Arial, sans-serif"
const GRAFITE = '#1d1d1f'
const APOIO = '#6e6e73'
const SUTIL = '#86868b'

const esc = (s: string) => s.replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]!)

type Corpo = {
  /** Texto escondido que aparece ao lado do assunto na caixa de entrada. */
  previa: string
  /** Título em duas partes: a primeira fina, a segunda forte (ex.: "Boas-vindas," + "Victor."). */
  fino: string
  forte: string
  apoio: string
  botao: { texto: string; link: string }
  /** Linha pequena abaixo do botão (validade, segurança). */
  nota?: string
  /** Faixa do ecossistema (só no e-mail de boas-vindas). */
  ecossistema?: boolean
}

function html(c: Corpo): string {
  const faixa = c.ecossistema
    ? `<tr><td style="padding:40px 48px 0 48px;">
        <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="border-top:1px solid #e8e8ed;">
          <tr><td style="padding-top:32px;font-family:${FONTE};">
            <p style="margin:0 0 6px 0;font-size:13px;letter-spacing:.02em;color:${SUTIL};">Uma conta. Todas as ferramentas.</p>
            <p style="margin:0 0 20px 0;font-size:20px;line-height:1.35;color:${GRAFITE};font-weight:300;">Do roteiro à entrega, <strong style="font-weight:800;">tudo conversa.</strong></p>
            ${[
              ['TPeasy', 'Roteiro e apoio na hora de gravar.'],
              ['SOBEDESCE', 'Cópia e backup do cartão à nuvem, tudo conferido.'],
              ['Synquei', 'Organiza, alinha e sincroniza o material.'],
              ['Z', 'A IA do ecossistema, que conversa com tudo isso.'],
            ]
              .map(
                ([nome, frase]) =>
                  `<p style="margin:0 0 10px 0;font-size:15px;line-height:1.45;color:${APOIO};"><strong style="color:${GRAFITE};font-weight:600;">${nome}</strong> &nbsp;${frase}</p>`,
              )
              .join('')}
          </td></tr>
        </table>
      </td></tr>`
    : ''
  return `<!doctype html>
<html lang="pt-BR"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">
<meta name="color-scheme" content="light"><meta name="supported-color-schemes" content="light">
<title>${esc(c.fino)} ${esc(c.forte)}</title></head>
<body style="margin:0;padding:0;background:#f5f5f7;-webkit-font-smoothing:antialiased;">
<div style="display:none;max-height:0;overflow:hidden;opacity:0;color:transparent;">${esc(c.previa)}&#8199;&#65279;&#847;&#8199;&#65279;&#847;</div>
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background:#f5f5f7;">
  <tr><td align="center" style="padding:48px 16px;">
    <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="max-width:560px;">
      <tr><td style="padding:0 8px 28px 8px;">
        <a href="${ORIGEM}" style="text-decoration:none;"><img src="${ORIGEM}/brand/email/absolute-zro-grafite.png" width="151" height="14" alt="Absolute ZRO" style="display:block;border:0;width:151px;height:auto;"></a>
      </td></tr>
      <tr><td style="background:#ffffff;border-radius:28px;">
        <table role="presentation" width="100%" cellpadding="0" cellspacing="0">
          <tr><td style="padding:48px 48px 0 48px;">
            <img src="${ORIGEM}/brand/email/absolute-zro-simbolo-grafite.png" width="40" height="40" alt="" style="display:block;border:0;width:40px;height:40px;">
          </td></tr>
          <tr><td style="padding:28px 48px 0 48px;font-family:${FONTE};">
            <h1 style="margin:0;font-size:36px;line-height:1.12;letter-spacing:-.02em;color:${GRAFITE};font-weight:300;">${esc(c.fino)} <strong style="font-weight:800;">${esc(c.forte)}</strong></h1>
            <p style="margin:16px 0 0 0;font-size:17px;line-height:1.5;color:${APOIO};">${esc(c.apoio)}</p>
          </td></tr>
          <tr><td style="padding:32px 48px 0 48px;">
            <table role="presentation" cellpadding="0" cellspacing="0"><tr>
              <td style="border-radius:999px;background:${GRAFITE};">
                <a href="${esc(c.botao.link)}" style="display:inline-block;padding:15px 30px;font-family:${FONTE};font-size:16px;font-weight:600;color:#ffffff;text-decoration:none;border-radius:999px;">${esc(c.botao.texto)}</a>
              </td>
            </tr></table>
          </td></tr>
          ${c.nota ? `<tr><td style="padding:20px 48px 0 48px;font-family:${FONTE};font-size:13px;line-height:1.5;color:${SUTIL};">${esc(c.nota)}</td></tr>` : ''}
          ${faixa}
          <tr><td style="padding:40px 48px 44px 48px;font-family:${FONTE};font-size:12px;line-height:1.55;color:${SUTIL};">
            O botão não abre? Copie este endereço no navegador:<br>
            <a href="${esc(c.botao.link)}" style="color:${APOIO};word-break:break-all;">${esc(c.botao.link)}</a>
          </td></tr>
        </table>
      </td></tr>
      <tr><td align="center" style="padding:28px 8px 0 8px;font-family:${FONTE};font-size:12px;line-height:1.6;color:${SUTIL};">
        O futuro começa do zero.<br>
        Absolute ZRO · <a href="mailto:contato@absolutezro.com" style="color:${SUTIL};">contato@absolutezro.com</a>
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
      ecossistema: true,
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

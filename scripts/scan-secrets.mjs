#!/usr/bin/env node
// Varredura de segredos nos arquivos versionados (o repositório é público). Falha o CI se achar algo.
// Placeholders conhecidos das cópias (testes do SOBEDESCE e NOSSOM) ficam na lista de permitidos.
import { execFileSync } from 'node:child_process'
import fs from 'node:fs'

const PATTERNS = [
  ['chave Stripe', /\b[sr]k_live_[0-9a-zA-Z]{10,}/],
  ['segredo de webhook Stripe', /\bwhsec_[0-9a-zA-Z]{20,}/],
  ['AWS', /\bAKIA[0-9A-Z]{16}\b/],
  ['chave privada', /-----BEGIN [A-Z ]*PRIVATE KEY-----/],
  ['JWT (ex.: chave Supabase)', /\beyJhbGciOi[A-Za-z0-9_-]{20,}\.[A-Za-z0-9_-]{20,}\.[A-Za-z0-9_-]{10,}/],
  ['token GitHub', /\bgh[pousr]_[0-9A-Za-z]{30,}/],
  ['token Slack', /\bxox[abprs]-[0-9A-Za-z-]{10,}/],
  ['chave Google', /\bAIza[0-9A-Za-z_-]{35}\b/],
  ['chave Anthropic', /\bsk-ant-[0-9A-Za-z_-]{20,}/],
  ['chave Resend', /\bre_[0-9A-Za-z]{24,}\b/],
  ['segredo OAuth Google real', /\bGOCSPX-[0-9A-Za-z_-]{28}\b/],
  ['URL de banco com senha', /postgres(?:ql)?:\/\/[^:\s/]+:(?!postgres@|zro@)[^@\s]{6,}@(?!localhost)/],
]
const ALLOW = [/sk_test_placeholder/, /GOCSPX-sobedesce-teste/, /GOCSPX-\$\{/, /GOCSPX-(errado|segredo-errado|outro|…)/]

const files = execFileSync('git', ['ls-files', '-z'], { encoding: 'utf8' }).split('\0').filter(Boolean)
let found = 0
for (const f of files) {
  if (/\.(png|jpe?g|webp|gif|mp4|mp3|wav|woff2?|ico|icns|zip|pdf)$/i.test(f)) continue
  let text
  try {
    text = fs.readFileSync(f, 'utf8')
  } catch {
    continue
  }
  text.split('\n').forEach((line, i) => {
    for (const [name, re] of PATTERNS) {
      if (re.test(line) && !ALLOW.some((a) => a.test(line))) {
        found++
        console.error(`${f}:${i + 1}: possível ${name}`)
      }
    }
  })
}
if (found) {
  console.error(`${found} possível(is) segredo(s). Remova antes de commitar.`)
  process.exit(1)
}
console.log(`Nenhum segredo encontrado em ${files.length} arquivos.`)

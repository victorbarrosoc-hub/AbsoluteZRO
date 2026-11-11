package com.absolutezro.radion

import java.net.URI
import java.net.URLDecoder
import java.net.URLEncoder
import java.security.MessageDigest
import java.security.SecureRandom
import java.util.Base64

/**
 * Entrar com o Google pelo navegador do celular (ADR 0041), igual ao app de computador
 * (products/radio/desktop/desktop/login-externo.cjs). O Google recusa login dentro de WebView, então o app:
 *   1. guarda um pedido (state + verifier, só na memória) e abre `<HUB>/entrar/app?app=radion&state=…&challenge=…`
 *      no navegador;
 *   2. a pessoa entra lá e toca em "Voltar para o app";
 *   3. o HUB abre `radion://entrar-app?code=…&state=…` (código de uso único, 60 s);
 *   4. o app confere o state, troca código + verifier por uma sessão do HUB (POST <HUB>/entrar/app/trocar; o cookie
 *      vai para a WebView) e volta para onde estava. O esquema `radion` já está liberado no HUB (migração 0063).
 * Esta classe é pura (sem Android): a troca em si é uma função passada de fora.
 */
class LoginExterno(private val agora: () -> Long = System::currentTimeMillis, private val aleatorio: (Int) -> ByteArray = ::bytes) {

    data class Pedido(val state: String, val verifier: String, val challenge: String, val next: String?, val criadoEm: Long)
    data class Retorno(val code: String, val state: String)

    enum class Resultado { IGNORADO, INVALIDO, ENTROU, FALHOU }

    var pedido: Pedido? = null
        private set

    /** A WebView tentou abrir o Google: devolve o endereço para abrir no navegador. */
    fun iniciar(urlInterceptada: String?, ultimaUrl: String?): String {
        val state = b64(aleatorio(24))
        val verifier = b64(aleatorio(32))
        val p = Pedido(state, verifier, sha256url(verifier), destinoDepoisDeEntrar(urlInterceptada, ultimaUrl), agora())
        pedido = p
        return urlDeInicio(p)
    }

    /** Chegou um link: troca (com `trocar(corpoJson) → caminho ou null`) se for o retorno certo. */
    fun tratar(url: String?, trocar: (String) -> String?, carregar: (String) -> Unit): Resultado {
        if (!ehRetorno(url)) return Resultado.IGNORADO
        val r = lerRetorno(url) ?: return Resultado.INVALIDO
        val p = pedido ?: return Resultado.INVALIDO
        if (agora() - p.criadoEm > VALIDADE_MS) {
            pedido = null
            return Resultado.INVALIDO
        }
        // state errado: pode ser um link de fora se passando pelo retorno; o pedido de verdade continua valendo
        if (!MessageDigest.isEqual(r.state.toByteArray(), p.state.toByteArray())) return Resultado.INVALIDO
        pedido = null
        val corpo = """{"app":"${Regras.ESQUEMA}","code":"${r.code}","state":"${r.state}","verifier":"${p.verifier}"}"""
        val caminho = try {
            trocar(corpo)
        } catch (_: Exception) {
            null
        } ?: return Resultado.FALHOU
        val seguro = caminhoSeguro(caminho) ?: p.next
        carregar(if (seguro != null) Regras.HUB + seguro else Regras.INICIO)
        return Resultado.ENTROU
    }

    companion object {
        const val ROTA = "entrar-app"
        const val VALIDADE_MS = 10 * 60_000L
        private val STATE = Regex("^[A-Za-z0-9_-]{16,128}$")
        private val CODIGO = Regex("^zd_[A-Za-z0-9_-]{43}$")
        private val CONTROLE = Regex("[\\u0000-\\u001f\\u007f]")

        private fun bytes(n: Int) = ByteArray(n).also { SecureRandom().nextBytes(it) }
        private fun b64(b: ByteArray) = Base64.getUrlEncoder().withoutPadding().encodeToString(b)
        fun sha256url(s: String): String = b64(MessageDigest.getInstance("SHA-256").digest(s.toByteArray(Charsets.UTF_8)))

        /** Caminho do próprio HUB: começa com uma barra, nunca //host, /\host nem caractere de controle. */
        fun caminhoSeguro(n: String?): String? {
            if (n.isNullOrEmpty() || n.length > 2000 || !n.startsWith("/") || n.startsWith("//") || n.contains('\\')) return null
            return if (CONTROLE.containsMatchIn(n)) null else n
        }

        fun ehGoogle(url: String?): Boolean {
            val u = Regras.uri(url) ?: return false
            return u.scheme == "https" && u.host == "accounts.google.com" && u.port == -1 && u.rawUserInfo == null
        }

        /** accounts.google.com, ou a rota do HUB que leva a ele (/entrar/google). */
        fun ehEntradaGoogle(url: String?): Boolean {
            if (ehGoogle(url)) return true
            val u = Regras.uri(url) ?: return false
            return Regras.origem(u) == Regras.HUB && Regex("^/entrar/google/?$").matches(u.rawPath ?: "")
        }

        fun query(u: URI): Map<String, String> = (u.rawQuery ?: "").split('&').filter { it.isNotEmpty() }.associate {
            val k = it.substringBefore('=')
            val v = it.substringAfter('=', "")
            URLDecoder.decode(k, "UTF-8") to URLDecoder.decode(v, "UTF-8")
        }

        /** Para onde voltar depois de entrar: o `next` do Google ou da tela de entrar, ou a última página do HUB. */
        fun destinoDepoisDeEntrar(urlInterceptada: String?, ultimaUrl: String?): String? {
            for (url in listOf(urlInterceptada, ultimaUrl)) {
                val u = Regras.uri(url) ?: continue
                if (Regras.origem(u) != Regras.HUB) continue
                val caminho = u.rawPath ?: ""
                val next = caminhoSeguro(query(u)["next"])
                if (Regex("^/(entrar|criar-conta)(/|$)").containsMatchIn(caminho)) {
                    if (next != null) return next
                    continue
                }
                return caminhoSeguro(caminho + (u.rawQuery?.let { "?$it" } ?: ""))
            }
            return null
        }

        fun urlDeInicio(p: Pedido): String {
            fun e(s: String) = URLEncoder.encode(s, "UTF-8")
            val next = p.next?.let { "&next=${e(it)}" } ?: ""
            return "${Regras.HUB}/entrar/app?app=${Regras.ESQUEMA}&state=${e(p.state)}&challenge=${e(p.challenge)}$next"
        }

        fun ehRetorno(url: String?): Boolean {
            val u = Regras.uri(url) ?: return false
            return u.scheme == Regras.ESQUEMA && u.host == ROTA
        }

        fun lerRetorno(url: String?): Retorno? {
            if (url == null || url.length > 512 || !ehRetorno(url)) return null
            val u = Regras.uri(url) ?: return null
            if (u.rawUserInfo != null || !(u.rawPath.isNullOrEmpty() || u.rawPath == "/")) return null
            val q = query(u)
            val code = q["code"] ?: return null
            val state = q["state"] ?: return null
            if (!CODIGO.matches(code) || !STATE.matches(state)) return null
            return Retorno(code, state)
        }
    }
}

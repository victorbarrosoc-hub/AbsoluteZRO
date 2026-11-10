package com.absolutezro.radion

import java.net.URI

/**
 * Regras de confiança do RADION no Android, as mesmas do app de computador (products/radio/desktop/desktop/regras.cjs):
 * a WebView mostra o RADION e, para o login único, só as telas de entrar da Absolute ZRO; o Google vai para o navegador
 * do celular (LoginExterno); o resto abre fora, e só se for https (ou mailto:). radion://d/ABC234 abre a diária.
 */
object Regras {
    const val RADION = "https://radion.absolutezro.com"
    const val HUB = "https://absolutezro.com"
    const val ESQUEMA = "radion"
    const val INICIO = "$RADION/"

    private val LOGIN_DO_HUB = listOf(
        Regex("^/oauth/authorize/?$"),
        Regex("^/entrar(/|$)"),
        Regex("^/criar-conta/?$"),
        Regex("^/esqueci-a-senha/?$"),
        Regex("^/redefinir-senha/?$"),
        Regex("^/confirmar-email/?$"),
        Regex("^/boas-vindas/?$"),
        Regex("^/em-desenvolvimento/?$"),
    )
    private val FORA_DO_DEEP_LINK = listOf(Regex("^/api(/|$)", RegexOption.IGNORE_CASE), Regex("^/\\.well-known(/|$)", RegexOption.IGNORE_CASE), Regex("^/entrar-app(/|$)", RegexOption.IGNORE_CASE))

    enum class Destino { APP, FORA, NADA }

    fun uri(s: String?): URI? = try {
        if (s == null || s.length > 4096) null else URI(s.trim())
    } catch (_: Exception) {
        null
    }

    /** https://host[:porta] sem usuário/senha embutidos, ou null. */
    fun origem(u: URI?): String? {
        if (u == null || u.scheme == null || u.host == null || u.rawUserInfo != null) return null
        val esquema = u.scheme.lowercase()
        val porta = if (u.port == -1 || (esquema == "https" && u.port == 443) || (esquema == "http" && u.port == 80)) "" else ":${u.port}"
        return "$esquema://${u.host.lowercase()}$porta"
    }

    fun ehDoApp(url: String?): Boolean = origem(uri(url)) == RADION

    fun ehLoginDoHub(url: String?): Boolean {
        val u = uri(url) ?: return false
        return origem(u) == HUB && LOGIN_DO_HUB.any { it.containsMatchIn(u.rawPath ?: "") }
    }

    fun linkExterno(url: String?): String? {
        val u = uri(url) ?: return null
        if (u.rawUserInfo != null) return null
        return when (u.scheme?.lowercase()) {
            "https" -> if (u.host.isNullOrEmpty()) null else u.toString()
            "mailto" -> if (Regex("^[^\\s<>\"]{3,320}$").matches(u.schemeSpecificPart.substringBefore('?'))) u.toString() else null
            else -> null
        }
    }

    fun destino(url: String?): Destino = when {
        ehDoApp(url) || ehLoginDoHub(url) -> Destino.APP
        linkExterno(url) != null -> Destino.FORA
        else -> Destino.NADA
    }

    /** radion://d/ABC234 → a diária pelo código; radion://sobre → /sobre. null para a API, o retorno do login e o resto. */
    fun deepLink(url: String?): String? {
        val bruto = (url ?: "").trim()
        if (!bruto.lowercase().startsWith("$ESQUEMA:") || bruto.length > 2048) return null
        var resto = bruto.substring(ESQUEMA.length + 1).replace('\\', '/')
        resto = "/" + resto.trimStart('/')
        Regex("^/d/([A-Za-z0-9]{6})/?$").find(resto)?.let { return "$RADION/?d=${it.groupValues[1].uppercase()}" }
        if (Regex("^/[^/?#]*@").containsMatchIn(resto)) return null
        val alvo = uri(RADION + resto) ?: return null
        if (origem(alvo) != RADION) return null
        val caminho = alvo.rawPath ?: "/"
        if (FORA_DO_DEEP_LINK.any { it.containsMatchIn(caminho) }) return null
        return alvo.toString()
    }
}

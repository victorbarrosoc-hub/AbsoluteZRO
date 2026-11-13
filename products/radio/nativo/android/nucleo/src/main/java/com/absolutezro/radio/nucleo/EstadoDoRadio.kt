package com.absolutezro.radio.nucleo

/**
 * O que o app conta ao núcleo sobre o rádio, já conferido (vem de uma página: nada passa sem formato). Mesmo contrato
 * do RADION para computador (products/radio/desktop/desktop/radio.cjs): diária, canal, modo, silenciado, mãos, ligado.
 */
data class EstadoDoRadio(
    val diaria: String? = null,
    val canal: String? = null,
    val modo: Modo = Modo.MUDO,
    val calado: Boolean = false,
    val maos: Int = 0,
    val ligado: Boolean = false,
) {
    enum class Modo { MUDO, ABERTO, PTT }

    /** Falando agora (microfone aberto, travado ou segurando). */
    val falando: Boolean get() = ligado && !calado && modo != Modo.MUDO

    companion object {
        private val CONTROLE = Regex("[\\u0000-\\u001f\\u007f\\u200e\\u200f\\u202a-\\u202e\\u2066-\\u2069]")

        /** Texto curto e limpo (sem controle nem bidi), ou null. */
        fun texto(v: Any?, max: Int): String? {
            if (v !is String) return null
            val s = v.replace(CONTROLE, "").trim().take(max)
            return s.ifEmpty { null }
        }

        /** O estado que a página manda (já em mapa), conferido campo a campo; o que não for do formato vira o padrão. */
        fun de(m: Map<String, Any?>): EstadoDoRadio {
            val maos = (m["maos"] as? Number)?.toDouble()
            return EstadoDoRadio(
                diaria = texto(m["diaria"], 60),
                canal = texto(m["canal"], 40),
                modo = when (m["modo"]) {
                    "aberto" -> Modo.ABERTO
                    "ptt" -> Modo.PTT
                    else -> Modo.MUDO
                },
                calado = m["calado"] == true,
                maos = if (maos != null && maos > 0 && maos == Math.floor(maos)) minOf(maos.toInt(), 99) else 0,
                ligado = m["ligado"] == true,
            )
        }
    }
}

/** O que a notificação mostra: título, linha de baixo e o rótulo do botão. Puro, para testar sem Android. */
object TextoDaNotificacao {
    fun titulo(e: EstadoDoRadio, app: String): String = e.diaria ?: app

    fun linha(e: EstadoDoRadio): String {
        val partes = mutableListOf<String>()
        val canal = e.canal ?: "Geral"
        partes += when {
            e.calado -> "Silenciado"
            e.falando -> "Falando para $canal"
            else -> "No ar · $canal"
        }
        if (e.maos == 1) partes += "1 pediu a palavra"
        if (e.maos > 1) partes += "${e.maos} pediram a palavra"
        return partes.joinToString(" · ")
    }

    fun botao(e: EstadoDoRadio): String = if (e.falando) "Parar" else "Falar"
}

package com.absolutezro.radion

import com.absolutezro.radion.LoginExterno.Resultado
import org.junit.Assert.assertEquals
import org.junit.Assert.assertFalse
import org.junit.Assert.assertNull
import org.junit.Assert.assertTrue
import org.junit.Test

class LoginExternoTest {
    private val codigo = "zd_" + "a".repeat(43)

    @Test fun `o Google e a rota que leva a ele vão para o navegador`() {
        assertTrue(LoginExterno.ehEntradaGoogle("https://accounts.google.com/o/oauth2/v2/auth?x=1"))
        assertTrue(LoginExterno.ehEntradaGoogle("https://absolutezro.com/entrar/google?next=/oauth/authorize"))
        assertFalse(LoginExterno.ehEntradaGoogle("https://absolutezro.com/entrar/google/retorno"))
        assertFalse(LoginExterno.ehEntradaGoogle("https://accounts.google.com.evil.com/"))
    }

    @Test fun `o pedido abre o HUB com app, state, desafio e para onde voltar`() {
        var t = 1_000L
        val l = LoginExterno(agora = { t }, aleatorio = { n -> ByteArray(n) { 7 } })
        val url = l.iniciar("https://absolutezro.com/entrar/google?next=%2Foauth%2Fauthorize%3Fclient_id%3Dradio-web", null)
        val p = l.pedido!!
        assertEquals("/oauth/authorize?client_id=radio-web", p.next)
        assertEquals(LoginExterno.sha256url(p.verifier), p.challenge)
        assertTrue(url.startsWith("https://absolutezro.com/entrar/app?app=radion&state=${p.state}&challenge="))
        assertTrue(url.endsWith("&next=%2Foauth%2Fauthorize%3Fclient_id%3Dradio-web"))
    }

    @Test fun `retorno certo troca o código e volta para o caminho do HUB`() {
        val l = LoginExterno(aleatorio = { n -> ByteArray(n) { 1 } })
        l.iniciar("https://absolutezro.com/entrar/google?next=/oauth/authorize", null)
        val state = l.pedido!!.state
        var corpo = ""
        var carregou = ""
        val r = l.tratar("radion://entrar-app?code=$codigo&state=$state", { c -> corpo = c; "/oauth/authorize?x=1" }) { carregou = it }
        assertEquals(Resultado.ENTROU, r)
        assertTrue(corpo.contains("\"app\":\"radion\"") && corpo.contains("\"code\":\"$codigo\"") && corpo.contains("\"verifier\":"))
        assertEquals("https://absolutezro.com/oauth/authorize?x=1", carregou)
        assertNull(l.pedido)
    }

    @Test fun `state errado, código fora do formato, pedido velho ou troca recusada não entram`() {
        var t = 0L
        val l = LoginExterno(agora = { t })
        l.iniciar(null, null)
        val certo = l.pedido!!.state
        assertEquals(Resultado.INVALIDO, l.tratar("radion://entrar-app?code=$codigo&state=${"x".repeat(32)}", { "/" }) {})
        assertEquals(Resultado.INVALIDO, l.tratar("radion://entrar-app?code=zd_curto&state=$certo", { "/" }) {})
        assertEquals(Resultado.IGNORADO, l.tratar("radion://d/ABC234", { "/" }) {})
        assertEquals(Resultado.FALHOU, l.tratar("radion://entrar-app?code=$codigo&state=$certo", { null }) {})
        l.iniciar(null, null)
        val s2 = l.pedido!!.state
        t += LoginExterno.VALIDADE_MS + 1
        assertEquals(Resultado.INVALIDO, l.tratar("radion://entrar-app?code=$codigo&state=$s2", { "/" }) {})
    }

    @Test fun `caminho seguro só do próprio HUB`() {
        assertEquals("/x?y=1", LoginExterno.caminhoSeguro("/x?y=1"))
        assertNull(LoginExterno.caminhoSeguro("//evil.com"))
        assertNull(LoginExterno.caminhoSeguro("https://evil.com"))
        assertNull(LoginExterno.caminhoSeguro("/a\\b"))
        assertNull(LoginExterno.caminhoSeguro("/a\u0000"))
    }
}

package com.absolutezro.radion

import com.absolutezro.radion.Regras.Destino
import org.junit.Assert.assertEquals
import org.junit.Assert.assertNull
import org.junit.Test

class RegrasTest {
    @Test fun `o RADION e só as telas de entrar do HUB ficam no app`() {
        assertEquals(Destino.APP, Regras.destino("https://radion.absolutezro.com/"))
        assertEquals(Destino.APP, Regras.destino("https://radion.absolutezro.com/?d=ABC234#noar"))
        assertEquals(Destino.APP, Regras.destino("https://absolutezro.com/oauth/authorize?client_id=radio-web"))
        assertEquals(Destino.APP, Regras.destino("https://absolutezro.com/entrar?next=/x"))
        assertEquals(Destino.APP, Regras.destino("https://absolutezro.com/criar-conta"))
        assertEquals(Destino.FORA, Regras.destino("https://absolutezro.com/perfil"))
        assertEquals(Destino.FORA, Regras.destino("https://example.com/"))
        assertEquals(Destino.FORA, Regras.destino("mailto:ajuda@absolutezro.com"))
    }

    @Test fun `nada de origem falsa, http, arquivo ou javascript`() {
        assertEquals(Destino.NADA, Regras.destino("http://radion.absolutezro.com/"))
        assertEquals(Destino.FORA, Regras.destino("https://radion.absolutezro.com.evil.com/"))
        assertEquals(Destino.NADA, Regras.destino("https://user:pw@radion.absolutezro.com/"))
        assertEquals(Destino.NADA, Regras.destino("javascript:alert(1)"))
        assertEquals(Destino.NADA, Regras.destino("file:///sdcard/x"))
        assertEquals(Destino.NADA, Regras.destino("intent://x#Intent;end"))
        assertEquals(Destino.APP, Regras.destino("https://RADION.absolutezro.com:443/"))
    }

    @Test fun `radion pelo link abre a diária ou uma rota, nunca a API nem o retorno do login`() {
        assertEquals("https://radion.absolutezro.com/?d=ABC234", Regras.deepLink("radion://d/abc234"))
        assertEquals("https://radion.absolutezro.com/sobre", Regras.deepLink("radion://sobre"))
        assertEquals("https://radion.absolutezro.com/sobre", Regras.deepLink("radion:///sobre"))
        assertNull(Regras.deepLink("radion://api/radio/diarias"))
        assertNull(Regras.deepLink("radion://entrar-app?code=x"))
        assertNull(Regras.deepLink("radion://evil@example.com/"))
        assertNull(Regras.deepLink("https://radion.absolutezro.com/"))
    }
}

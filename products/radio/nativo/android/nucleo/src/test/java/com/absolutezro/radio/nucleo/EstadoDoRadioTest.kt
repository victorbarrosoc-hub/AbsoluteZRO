package com.absolutezro.radio.nucleo

import android.media.AudioDeviceInfo
import org.junit.Assert.assertEquals
import org.junit.Assert.assertFalse
import org.junit.Assert.assertNull
import org.junit.Assert.assertTrue
import org.junit.Test

class EstadoDoRadioTest {
    @Test fun `estado vazio ou estranho vira o padrão (rádio desligado)`() {
        assertEquals(EstadoDoRadio(), EstadoDoRadio.de(emptyMap()))
        val e = EstadoDoRadio.de(mapOf("modo" to "gritar", "ligado" to "sim", "calado" to 1, "maos" to -3, "diaria" to 42))
        assertEquals(EstadoDoRadio(), e)
    }

    @Test fun `texto sem controle nem bidi, cortado`() {
        val e = EstadoDoRadio.de(mapOf("diaria" to "  Comercial‮\u0007 Verão  ", "canal" to "x".repeat(80), "ligado" to true))
        assertEquals("Comercial Verão", e.diaria)
        assertEquals(40, e.canal!!.length)
        assertNull(EstadoDoRadio.texto("   ", 10))
    }

    @Test fun `mãos inteiras de 1 a 99`() {
        assertEquals(3, EstadoDoRadio.de(mapOf("maos" to 3)).maos)
        assertEquals(99, EstadoDoRadio.de(mapOf("maos" to 500)).maos)
        assertEquals(0, EstadoDoRadio.de(mapOf("maos" to 2.5)).maos)
    }

    @Test fun `falando só ligado, sem silêncio e com o microfone aberto`() {
        assertTrue(EstadoDoRadio(modo = EstadoDoRadio.Modo.PTT, ligado = true).falando)
        assertTrue(EstadoDoRadio(modo = EstadoDoRadio.Modo.ABERTO, ligado = true).falando)
        assertFalse(EstadoDoRadio(modo = EstadoDoRadio.Modo.ABERTO, ligado = true, calado = true).falando)
        assertFalse(EstadoDoRadio(modo = EstadoDoRadio.Modo.ABERTO, ligado = false).falando)
    }

    @Test fun `a notificação diz a diária, o canal e as mãos`() {
        val e = EstadoDoRadio(diaria = "Comercial", canal = "Câmera", ligado = true, maos = 2)
        assertEquals("Comercial", TextoDaNotificacao.titulo(e, "RADION"))
        assertEquals("No ar · Câmera · 2 pediram a palavra", TextoDaNotificacao.linha(e))
        assertEquals("Falar", TextoDaNotificacao.botao(e))
        val falando = e.copy(modo = EstadoDoRadio.Modo.ABERTO, maos = 1)
        assertEquals("Falando para Câmera · 1 pediu a palavra", TextoDaNotificacao.linha(falando))
        assertEquals("Parar", TextoDaNotificacao.botao(falando))
        assertEquals("Silenciado", TextoDaNotificacao.linha(e.copy(calado = true, maos = 0)))
        assertEquals("RADION", TextoDaNotificacao.titulo(EstadoDoRadio(), "RADION"))
    }

    @Test fun `saída vai para o Bluetooth com microfone, depois fone com fio, depois viva-voz`() {
        val viva = AudioDeviceInfo.TYPE_BUILTIN_SPEAKER
        val ouvido = AudioDeviceInfo.TYPE_BUILTIN_EARPIECE
        assertEquals(viva, PreferenciaDeSaida.escolher(listOf(ouvido, viva)))
        assertEquals(AudioDeviceInfo.TYPE_WIRED_HEADSET, PreferenciaDeSaida.escolher(listOf(ouvido, viva, AudioDeviceInfo.TYPE_WIRED_HEADSET)))
        assertEquals(AudioDeviceInfo.TYPE_BLUETOOTH_SCO, PreferenciaDeSaida.escolher(listOf(viva, AudioDeviceInfo.TYPE_WIRED_HEADSET, AudioDeviceInfo.TYPE_BLUETOOTH_SCO)))
        assertNull(PreferenciaDeSaida.escolher(listOf(ouvido)))
    }
}

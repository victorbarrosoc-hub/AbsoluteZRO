package com.absolutezro.radio.nucleo

import android.content.Context
import android.media.AudioDeviceCallback
import android.media.AudioDeviceInfo
import android.media.AudioManager
import android.os.Build
import android.os.Handler
import android.os.Looper

/**
 * Para onde o som do rádio vai. Com o microfone aberto, o Android trata a voz como ligação e a manda para o alto-falante
 * de encostar no ouvido (titular, 07/11/2026). Aqui o núcleo escolhe: fone Bluetooth com microfone, depois fone com fio
 * ou USB, e sem fone, o viva-voz. Refaz a escolha quando um fone entra ou sai.
 */
class SaidaDeSom(context: Context) {
    private val am = context.getSystemService(Context.AUDIO_SERVICE) as AudioManager
    private val principal = Handler(Looper.getMainLooper())
    private val mudou = object : AudioDeviceCallback() {
        override fun onAudioDevicesAdded(added: Array<out AudioDeviceInfo>?) = aplicar()
        override fun onAudioDevicesRemoved(removed: Array<out AudioDeviceInfo>?) = aplicar()
    }
    private var ouvindo = false

    fun ligar() {
        if (!ouvindo) {
            am.registerAudioDeviceCallback(mudou, principal)
            ouvindo = true
        }
        aplicar()
    }

    fun desligar() {
        if (ouvindo) {
            am.unregisterAudioDeviceCallback(mudou)
            ouvindo = false
        }
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.S) am.clearCommunicationDevice()
        else @Suppress("DEPRECATION") run { am.isSpeakerphoneOn = false }
    }

    fun aplicar() {
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.S) {
            val aparelhos = am.availableCommunicationDevices
            val tipo = PreferenciaDeSaida.escolher(aparelhos.map { it.type })
            val alvo = aparelhos.firstOrNull { it.type == tipo }
            if (alvo != null) am.setCommunicationDevice(alvo)
        } else {
            val saidas = am.getDevices(AudioManager.GET_DEVICES_OUTPUTS).map { it.type }
            val tipo = PreferenciaDeSaida.escolher(saidas)
            @Suppress("DEPRECATION")
            am.isSpeakerphoneOn = tipo == AudioDeviceInfo.TYPE_BUILTIN_SPEAKER
        }
    }
}

/** A ordem de preferência (pura, testável): Bluetooth com microfone, fone com fio ou USB, viva-voz. */
object PreferenciaDeSaida {
    private val ORDEM = listOf(
        26, // AudioDeviceInfo.TYPE_BLE_HEADSET (Android 12)
        AudioDeviceInfo.TYPE_BLUETOOTH_SCO,
        AudioDeviceInfo.TYPE_WIRED_HEADSET,
        22, // AudioDeviceInfo.TYPE_USB_HEADSET
        AudioDeviceInfo.TYPE_WIRED_HEADPHONES,
        AudioDeviceInfo.TYPE_BUILTIN_SPEAKER,
    )

    fun escolher(disponiveis: List<Int>): Int? = ORDEM.firstOrNull { it in disponiveis }
}

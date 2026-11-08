package com.absolutezro.radio.nucleo

import android.app.Notification
import android.app.NotificationChannel
import android.app.NotificationManager
import android.app.PendingIntent
import android.app.Service
import android.content.Context
import android.content.Intent
import android.content.pm.ServiceInfo
import android.os.Build
import android.os.IBinder
import android.os.PowerManager
import android.support.v4.media.session.MediaSessionCompat
import android.support.v4.media.session.PlaybackStateCompat
import android.view.KeyEvent
import androidx.core.app.NotificationCompat
import androidx.core.app.ServiceCompat
import androidx.core.content.ContextCompat
import androidx.media.app.NotificationCompat.MediaStyle

/** O que o rádio pede ao app (vindo da notificação, da tela bloqueada ou do botão do fone). */
enum class Comando { ALTERNAR_FALA, DESLIGAR }

/**
 * O rádio no ar com a tela travada: serviço em primeiro plano (microfone e som), com a notificação fixa que mostra a
 * diária e o canal e tem Falar/Parar e Desligar, também na tela bloqueada. O botão do fone (play/pause ou o de atender)
 * fala e para. Enquanto está no ar, o celular não dorme (wake lock parcial) e o som sai no fone ou no viva-voz
 * (SaidaDeSom). Sem login nem banco: o app conta o estado (EstadoDoRadio) e recebe os comandos (aoComando).
 *
 * Android 14: o serviço de microfone só pode começar com o app na frente; o app liga quando a pessoa toca em Ligar.
 */
class RadioNoAr : Service() {

    /** O app diz o nome, o ícone da notificação (branco, transparente) e qual tela abrir ao tocar nela. */
    data class Config(val nome: String, val icone: Int, val abrir: Class<*>)

    companion object {
        private const val CANAL = "radio_no_ar"
        private const val ID = 7301
        private const val ACAO_LIGAR = "com.absolutezro.radio.nucleo.LIGAR"
        private const val ACAO_FALAR = "com.absolutezro.radio.nucleo.FALAR"
        private const val ACAO_DESLIGAR = "com.absolutezro.radio.nucleo.DESLIGAR"
        private const val WAKE_MAX_MS = 14L * 60 * 60 * 1000 // um dia de set, no máximo

        @Volatile var config: Config? = null

        /** Quem recebe os comandos (o app). Chamado na thread principal. */
        @Volatile var aoComando: ((Comando) -> Unit)? = null

        @Volatile var estado: EstadoDoRadio = EstadoDoRadio()
            private set

        @Volatile var noAr: Boolean = false
            private set

        /** Liga ou atualiza o rádio no ar. Com `ligado` falso, desliga. */
        fun contar(ctx: Context, novo: EstadoDoRadio) {
            estado = novo
            if (!novo.ligado) {
                if (noAr) ctx.stopService(Intent(ctx, RadioNoAr::class.java))
                return
            }
            val i = Intent(ctx, RadioNoAr::class.java).setAction(ACAO_LIGAR)
            if (noAr) ctx.startService(i) else ContextCompat.startForegroundService(ctx, i)
        }

        fun desligar(ctx: Context) = contar(ctx, estado.copy(ligado = false))
    }

    private lateinit var sessao: MediaSessionCompat
    private lateinit var saida: SaidaDeSom
    private var trava: PowerManager.WakeLock? = null

    override fun onBind(intent: Intent?): IBinder? = null

    override fun onCreate() {
        super.onCreate()
        saida = SaidaDeSom(this)
        sessao = MediaSessionCompat(this, "radio").apply {
            setCallback(object : MediaSessionCompat.Callback() {
                override fun onMediaButtonEvent(intent: Intent): Boolean {
                    @Suppress("DEPRECATION")
                    val k = intent.getParcelableExtra<KeyEvent>(Intent.EXTRA_KEY_EVENT) ?: return false
                    if (k.action != KeyEvent.ACTION_DOWN || k.repeatCount > 0) return true
                    return when (k.keyCode) {
                        KeyEvent.KEYCODE_HEADSETHOOK, KeyEvent.KEYCODE_MEDIA_PLAY_PAUSE,
                        KeyEvent.KEYCODE_MEDIA_PLAY, KeyEvent.KEYCODE_MEDIA_PAUSE -> {
                            aoComando?.invoke(Comando.ALTERNAR_FALA)
                            true
                        }
                        else -> false
                    }
                }
                override fun onPlay() { aoComando?.invoke(Comando.ALTERNAR_FALA) }
                override fun onPause() { aoComando?.invoke(Comando.ALTERNAR_FALA) }
            })
            setPlaybackState(
                PlaybackStateCompat.Builder()
                    .setActions(PlaybackStateCompat.ACTION_PLAY_PAUSE or PlaybackStateCompat.ACTION_PLAY or PlaybackStateCompat.ACTION_PAUSE)
                    .setState(PlaybackStateCompat.STATE_PLAYING, 0, 1f)
                    .build(),
            )
            isActive = true
        }
        criarCanal()
    }

    override fun onStartCommand(intent: Intent?, flags: Int, startId: Int): Int {
        when (intent?.action) {
            ACAO_FALAR -> aoComando?.invoke(Comando.ALTERNAR_FALA)
            ACAO_DESLIGAR -> {
                aoComando?.invoke(Comando.DESLIGAR)
                pararTudo()
                return START_NOT_STICKY
            }
        }
        // sem a permissão do microfone (só ouve), o serviço fica só de som: o Android 14 recusa o de microfone sem ela
        val comMic = ContextCompat.checkSelfPermission(this, android.Manifest.permission.RECORD_AUDIO) == android.content.pm.PackageManager.PERMISSION_GRANTED
        val tipo = if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.R)
            ServiceInfo.FOREGROUND_SERVICE_TYPE_MEDIA_PLAYBACK or (if (comMic) ServiceInfo.FOREGROUND_SERVICE_TYPE_MICROPHONE else 0)
        else 0
        ServiceCompat.startForeground(this, ID, notificacao(), tipo)
        if (!noAr) {
            noAr = true
            saida.ligar()
            trava = (getSystemService(Context.POWER_SERVICE) as PowerManager)
                .newWakeLock(PowerManager.PARTIAL_WAKE_LOCK, "radio:no-ar")
                .apply { setReferenceCounted(false); acquire(WAKE_MAX_MS) }
        } else {
            // a página pode ter aberto o microfone agora (o Android muda o modo de áudio): refaz a saída
            saida.aplicar()
        }
        return START_NOT_STICKY
    }

    override fun onDestroy() {
        pararTudo()
        sessao.release()
        super.onDestroy()
    }

    private fun pararTudo() {
        if (noAr) saida.desligar()
        noAr = false
        trava?.let { if (it.isHeld) it.release() }
        trava = null
        ServiceCompat.stopForeground(this, ServiceCompat.STOP_FOREGROUND_REMOVE)
        stopSelf()
    }

    private fun criarCanal() {
        val nm = getSystemService(NotificationManager::class.java)
        if (nm.getNotificationChannel(CANAL) != null) return
        nm.createNotificationChannel(
            NotificationChannel(CANAL, "Rádio no ar", NotificationManager.IMPORTANCE_LOW).apply {
                description = "Mantém o rádio ligado com a tela travada e mostra Falar e Parar."
                setShowBadge(false)
                lockscreenVisibility = Notification.VISIBILITY_PUBLIC
            },
        )
    }

    private fun acao(acao: String, codigo: Int): PendingIntent =
        PendingIntent.getService(
            this, codigo, Intent(this, RadioNoAr::class.java).setAction(acao),
            PendingIntent.FLAG_UPDATE_CURRENT or PendingIntent.FLAG_IMMUTABLE,
        )

    private fun notificacao(): Notification {
        val c = config
        val nome = c?.nome ?: "Rádio"
        val e = estado
        val b = NotificationCompat.Builder(this, CANAL)
            .setSmallIcon(c?.icone ?: android.R.drawable.ic_btn_speak_now)
            .setContentTitle(TextoDaNotificacao.titulo(e, nome))
            .setContentText(TextoDaNotificacao.linha(e))
            .setOngoing(true)
            .setOnlyAlertOnce(true)
            .setSilent(true)
            .setShowWhen(false)
            .setCategory(NotificationCompat.CATEGORY_SERVICE)
            .setVisibility(NotificationCompat.VISIBILITY_PUBLIC)
            .setForegroundServiceBehavior(NotificationCompat.FOREGROUND_SERVICE_IMMEDIATE)
        if (c != null) {
            val abrir = Intent(this, c.abrir).addFlags(Intent.FLAG_ACTIVITY_SINGLE_TOP or Intent.FLAG_ACTIVITY_CLEAR_TOP)
            b.setContentIntent(PendingIntent.getActivity(this, 1, abrir, PendingIntent.FLAG_UPDATE_CURRENT or PendingIntent.FLAG_IMMUTABLE))
        }
        if (!e.calado) {
            val falar = if (e.falando) android.R.drawable.ic_media_pause else android.R.drawable.ic_btn_speak_now
            b.addAction(falar, TextoDaNotificacao.botao(e), acao(ACAO_FALAR, 2))
        }
        b.addAction(android.R.drawable.ic_menu_close_clear_cancel, "Desligar", acao(ACAO_DESLIGAR, 3))
        // estilo de mídia: os botões aparecem inteiros na tela bloqueada e o fone fala com esta sessão
        b.setStyle(MediaStyle().setMediaSession(sessao.sessionToken).setShowActionsInCompactView(*(if (e.calado) intArrayOf(0) else intArrayOf(0, 1))))
        return b.build()
    }
}

package com.absolutezro.radion

import android.Manifest
import android.annotation.SuppressLint
import android.app.Activity
import android.app.NotificationChannel
import android.app.NotificationManager
import android.app.PendingIntent
import android.content.ActivityNotFoundException
import android.content.Intent
import android.content.pm.PackageManager
import android.graphics.Color
import android.net.Uri
import android.os.Build
import android.os.Bundle
import android.webkit.CookieManager
import android.webkit.PermissionRequest
import android.webkit.WebChromeClient
import android.webkit.WebResourceError
import android.webkit.WebResourceRequest
import android.webkit.WebView
import android.webkit.WebViewClient
import android.widget.Toast
import androidx.core.app.NotificationCompat
import androidx.core.content.ContextCompat
import androidx.webkit.WebViewCompat
import androidx.webkit.WebViewFeature
import com.absolutezro.radio.nucleo.Comando
import com.absolutezro.radio.nucleo.EstadoDoRadio
import com.absolutezro.radio.nucleo.RadioNoAr
import org.json.JSONObject
import java.net.HttpURLConnection
import java.net.URL
import java.util.concurrent.Executors

/**
 * O RADION no Android (marco 1, titular, 08/11/2026): a página de verdade (radion.absolutezro.com) numa WebView, com o
 * que só o app faz: o rádio segue no ar com a tela travada (RadioNoAr, do núcleo), Falar/Parar na tela bloqueada e no
 * botão do fone, o som no fone ou no viva-voz. O login do Google vai pelo navegador e volta por radion://entrar-app.
 * Nada muda no servidor: a página já fala com o app pelo contrato do RADION para computador (assets/ponte.js).
 */
class MainActivity : Activity() {
    private lateinit var web: WebView
    private val login = LoginExterno()
    private val fundo = Executors.newSingleThreadExecutor()
    private var ultimaUrl: String? = null
    private var naFrente = false
    private var pedidoDeMicrofone: PermissionRequest? = null

    companion object {
        private const val PEDIDO_MIC = 11
        private const val PEDIDO_AVISOS = 12
        private const val CANAL_AVISOS = "avisos_do_set"
    }

    @SuppressLint("SetJavaScriptEnabled")
    override fun onCreate(estadoSalvo: Bundle?) {
        super.onCreate(estadoSalvo)
        window.statusBarColor = Color.parseColor("#F5F5F7")
        RadioNoAr.config = RadioNoAr.Config("RADION", R.drawable.ic_no_ar, MainActivity::class.java)
        RadioNoAr.aoComando = { c ->
            runOnUiThread {
                when (c) {
                    Comando.ALTERNAR_FALA -> web.evaluateJavascript("window.__radionComando && window.__radionComando('alternar-fala')", null)
                    // Desligar na notificação: a página recarrega (fecha o microfone e as conexões) e o rádio sai do ar
                    Comando.DESLIGAR -> web.reload()
                }
            }
        }
        criarCanalDeAvisos()

        web = WebView(this)
        setContentView(web)
        web.setBackgroundColor(Color.parseColor("#F5F5F7"))
        with(web.settings) {
            javaScriptEnabled = true
            domStorageEnabled = true
            mediaPlaybackRequiresUserGesture = false
            setSupportMultipleWindows(false)
            allowFileAccess = false
            allowContentAccess = false
            userAgentString = "$userAgentString RADION-Android/${BuildConfig.VERSION_NAME}"
        }
        CookieManager.getInstance().setAcceptCookie(true)
        // com a tela travada o processo da página não pode perder a prioridade (o rádio segue no ar)
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.O) web.setRendererPriorityPolicy(WebView.RENDERER_PRIORITY_IMPORTANT, false)

        val origens = setOf(Regras.RADION)
        if (WebViewFeature.isFeatureSupported(WebViewFeature.WEB_MESSAGE_LISTENER)) {
            WebViewCompat.addWebMessageListener(web, "RadionAndroid", origens) { _, msg, origem, eFramePrincipal, _ ->
                if (eFramePrincipal && origem.toString().trimEnd('/') == Regras.RADION) receber(msg.data)
            }
        }
        if (WebViewFeature.isFeatureSupported(WebViewFeature.DOCUMENT_START_SCRIPT)) {
            WebViewCompat.addDocumentStartJavaScript(web, assets.open("ponte.js").bufferedReader().use { it.readText() }, origens)
        }

        web.webViewClient = object : WebViewClient() {
            override fun shouldOverrideUrlLoading(view: WebView, req: WebResourceRequest): Boolean {
                val url = req.url.toString()
                if (LoginExterno.ehEntradaGoogle(url)) {
                    abrirFora(login.iniciar(url, ultimaUrl))
                    return true
                }
                if (url.startsWith("${Regras.ESQUEMA}:")) {
                    tratarLink(url)
                    return true
                }
                return when (Regras.destino(url)) {
                    Regras.Destino.APP -> false
                    Regras.Destino.FORA -> {
                        Regras.linkExterno(url)?.let { abrirFora(it) }
                        true
                    }
                    Regras.Destino.NADA -> true
                }
            }

            override fun onPageFinished(view: WebView, url: String?) {
                if (url != null && Regras.destino(url) == Regras.Destino.APP) ultimaUrl = url
            }

            override fun onReceivedError(view: WebView, req: WebResourceRequest, erro: WebResourceError) {
                if (!req.isForMainFrame) return
                val html = assets.open("offline.html").bufferedReader().use { it.readText() }
                view.loadDataWithBaseURL(null, html, "text/html", "utf-8", null)
            }
        }

        web.webChromeClient = object : WebChromeClient() {
            // o microfone só para o RADION, e só áudio (nada de câmera)
            override fun onPermissionRequest(pedido: PermissionRequest) {
                runOnUiThread {
                    val doRadion = pedido.origin.toString().trimEnd('/') == Regras.RADION
                    if (!doRadion || !pedido.resources.contains(PermissionRequest.RESOURCE_AUDIO_CAPTURE)) {
                        pedido.deny()
                        return@runOnUiThread
                    }
                    if (temPermissao(Manifest.permission.RECORD_AUDIO)) {
                        pedido.grant(arrayOf(PermissionRequest.RESOURCE_AUDIO_CAPTURE))
                    } else {
                        pedidoDeMicrofone = pedido
                        requestPermissions(arrayOf(Manifest.permission.RECORD_AUDIO), PEDIDO_MIC)
                    }
                }
            }
        }

        if (Build.VERSION.SDK_INT >= 33 && !temPermissao(Manifest.permission.POST_NOTIFICATIONS)) {
            requestPermissions(arrayOf(Manifest.permission.POST_NOTIFICATIONS), PEDIDO_AVISOS)
        }

        val link = intent?.data?.toString()
        if (estadoSalvo != null) web.restoreState(estadoSalvo)
        else if (link != null && link.startsWith("${Regras.ESQUEMA}:")) {
            web.loadUrl(Regras.INICIO)
            tratarLink(link)
        } else web.loadUrl(Regras.INICIO)
    }

    override fun onNewIntent(intent: Intent) {
        super.onNewIntent(intent)
        intent.data?.toString()?.let { tratarLink(it) }
    }

    override fun onSaveInstanceState(saida: Bundle) {
        super.onSaveInstanceState(saida)
        web.saveState(saida)
    }

    // a WebView não é pausada ao sair da frente: com o rádio no ar, a página segue rodando (o serviço segura o processo)
    override fun onResume() {
        super.onResume()
        naFrente = true
    }

    override fun onPause() {
        naFrente = false
        super.onPause()
    }

    @Deprecated("O voltar navega na página; na primeira tela, o app vai para trás sem fechar (o rádio segue no ar).")
    override fun onBackPressed() {
        if (web.canGoBack()) web.goBack() else moveTaskToBack(true)
    }

    override fun onDestroy() {
        // sem a página o rádio não funciona: a notificação sai junto
        RadioNoAr.desligar(this)
        RadioNoAr.aoComando = null
        web.destroy()
        fundo.shutdown()
        super.onDestroy()
    }

    override fun onRequestPermissionsResult(codigo: Int, permissoes: Array<out String>, resultados: IntArray) {
        super.onRequestPermissionsResult(codigo, permissoes, resultados)
        if (codigo != PEDIDO_MIC) return
        val p = pedidoDeMicrofone ?: return
        pedidoDeMicrofone = null
        if (resultados.firstOrNull() == PackageManager.PERMISSION_GRANTED) p.grant(arrayOf(PermissionRequest.RESOURCE_AUDIO_CAPTURE))
        else p.deny()
    }

    private fun temPermissao(p: String) = ContextCompat.checkSelfPermission(this, p) == PackageManager.PERMISSION_GRANTED

    /** Mensagens da página (só do RADION, só do frame principal): estado do rádio, avisos e links para fora. */
    private fun receber(dados: String?) {
        val m = try {
            JSONObject(dados ?: return)
        } catch (_: Exception) {
            return
        }
        when (m.optString("t")) {
            "estado" -> {
                val e = m.optJSONObject("e") ?: return
                val mapa = e.keys().asSequence().associateWith { k -> e.opt(k).takeUnless { it == JSONObject.NULL } }
                RadioNoAr.contar(this, EstadoDoRadio.de(mapa))
            }
            "notificar" -> if (!naFrente) avisar(EstadoDoRadio.texto(m.optString("titulo"), 80) ?: return, EstadoDoRadio.texto(m.optString("corpo"), 200) ?: "")
            "fora" -> Regras.linkExterno(m.optString("url"))?.let { abrirFora(it) }
        }
    }

    private fun tratarLink(url: String) {
        if (LoginExterno.ehRetorno(url)) {
            fundo.execute {
                val r = login.tratar(url, ::trocarCodigo) { alvo -> runOnUiThread { web.loadUrl(alvo) } }
                if (r == LoginExterno.Resultado.FALHOU) runOnUiThread {
                    Toast.makeText(this, "Não deu para entrar com o Google. Tente de novo.", Toast.LENGTH_LONG).show()
                }
            }
            return
        }
        Regras.deepLink(url)?.let { web.loadUrl(it) }
    }

    /** POST <HUB>/entrar/app/trocar: o cookie de sessão do HUB vai para a WebView. Devolve o caminho de volta. */
    private fun trocarCodigo(corpo: String): String? {
        val c = URL("${Regras.HUB}/entrar/app/trocar").openConnection() as HttpURLConnection
        try {
            c.requestMethod = "POST"
            c.connectTimeout = 15_000
            c.readTimeout = 15_000
            c.instanceFollowRedirects = false
            c.doOutput = true
            c.setRequestProperty("content-type", "application/json")
            c.outputStream.use { it.write(corpo.toByteArray(Charsets.UTF_8)) }
            if (c.responseCode != 200) return null
            val cm = CookieManager.getInstance()
            c.headerFields.entries.filter { it.key.equals("set-cookie", ignoreCase = true) }.flatMap { it.value }.forEach { cm.setCookie(Regras.HUB, it) }
            cm.flush()
            val j = JSONObject(c.inputStream.bufferedReader().use { it.readText() })
            if (!j.optBoolean("ok")) return null
            return j.optString("next", "/").ifEmpty { "/" }
        } finally {
            c.disconnect()
        }
    }

    private fun abrirFora(url: String) {
        try {
            startActivity(Intent(Intent.ACTION_VIEW, Uri.parse(url)).addCategory(Intent.CATEGORY_BROWSABLE))
        } catch (_: ActivityNotFoundException) {
            Toast.makeText(this, "Nenhum navegador para abrir o link.", Toast.LENGTH_SHORT).show()
        }
    }

    private fun criarCanalDeAvisos() {
        val nm = getSystemService(NotificationManager::class.java)
        if (nm.getNotificationChannel(CANAL_AVISOS) != null) return
        nm.createNotificationChannel(NotificationChannel(CANAL_AVISOS, "Avisos do set", NotificationManager.IMPORTANCE_HIGH).apply {
            description = "Ação, Corta, Silêncio e quem pede a palavra, com o app atrás."
        })
    }

    private fun avisar(titulo: String, corpo: String) {
        if (Build.VERSION.SDK_INT >= 33 && !temPermissao(Manifest.permission.POST_NOTIFICATIONS)) return
        val abrir = PendingIntent.getActivity(this, 4, Intent(this, MainActivity::class.java).addFlags(Intent.FLAG_ACTIVITY_SINGLE_TOP), PendingIntent.FLAG_IMMUTABLE)
        val n = NotificationCompat.Builder(this, CANAL_AVISOS)
            .setSmallIcon(R.drawable.ic_no_ar)
            .setContentTitle(titulo)
            .setContentText(corpo)
            .setAutoCancel(true)
            .setContentIntent(abrir)
            .setPriority(NotificationCompat.PRIORITY_HIGH)
            .setCategory(NotificationCompat.CATEGORY_MESSAGE)
            .build()
        getSystemService(NotificationManager::class.java).notify((System.currentTimeMillis() % 100000).toInt() + 100, n)
    }
}

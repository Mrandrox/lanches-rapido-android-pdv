package com.lanchesrapido.cliente.state

import android.content.Context
import android.content.SharedPreferences
import com.lanchesrapido.cliente.model.Bootstrap
import com.lanchesrapido.cliente.net.Api

object AppData {
    const val PREFS = "lanches_app"

    fun prefs(context: Context): SharedPreferences =
        context.getSharedPreferences(PREFS, Context.MODE_PRIVATE)

    fun loadBaseUrl(context: Context): String {
        return prefs(context).getString("baseUrl", "") ?: ""
    }

    fun saveBaseUrl(context: Context, url: String) {
        val v = url.trim().trimEnd('/')
        Api.baseUrl = v
        prefs(context).edit().putString("baseUrl", v).apply()
    }

    fun loadLastOrder(context: Context): String {
        return prefs(context).getString("lastOrder", "") ?: ""
    }

    fun saveLastOrder(context: Context, id: String) {
        prefs(context).edit().putString("lastOrder", id).apply()
    }

    @Volatile
    var bootstrap: Bootstrap? = null

    suspend fun ensure(): Bootstrap {
        bootstrap?.let { return it }
        val data = Api.bootstrap()
        bootstrap = data
        return data
    }

    fun invalidate() {
        bootstrap = null
    }

    fun serverName(): String = bootstrap?.store?.name ?: "Lanches Rápido"

    suspend fun testConnection(): String {
        val h = Api.health()
        return h.optString("name", "Servidor conectado")
    }
}
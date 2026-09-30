package com.lanchesrapido.cliente.net

import com.lanchesrapido.cliente.model.AiItem
import com.lanchesrapido.cliente.model.Bootstrap
import com.lanchesrapido.cliente.model.TrackLine
import com.lanchesrapido.cliente.model.TrackOrder
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.withContext
import org.json.JSONObject
import java.io.BufferedInputStream
import java.io.BufferedOutputStream
import java.net.HttpURLConnection
import java.net.URL

class ApiException(message: String) : Exception(message)

object Api {
    @Volatile
    var baseUrl: String = ""

    private fun url(path: String) = baseUrl.trimEnd('/') + "/" + path.trimStart('/')

    private fun String.toJson(): JSONObject = JSONObject(this)

    private suspend fun request(path: String, method: String, body: JSONObject?): JSONObject =
        withContext(Dispatchers.IO) {
            if (baseUrl.isBlank()) throw ApiException("Configure o endereço do servidor da loja em Servidor.")
            val conn = URL(url(path)).openConnection() as HttpURLConnection
            try {
                conn.connectTimeout = 5000
                conn.readTimeout = 7000
                conn.requestMethod = method
                conn.setRequestProperty("Accept", "application/json")
                if (body != null) {
                    conn.doOutput = true
                    conn.setRequestProperty("Content-Type", "application/json; charset=utf-8")
                    BufferedOutputStream(conn.outputStream).use {
                        it.write(body.toString().toByteArray(Charsets.UTF_8))
                    }
                }
                val code = conn.responseCode
                val raw = if (code in 200..299) {
                    BufferedInputStream(conn.inputStream).bufferedReader(Charsets.UTF_8).use { it.readText() }
                } else {
                    BufferedInputStream(conn.errorStream ?: conn.inputStream).bufferedReader(Charsets.UTF_8).use { it.readText() }
                }
                val json = runCatching { raw.toJson() }.getOrNull()
                val message = json?.optString("error", "")?.takeIf { it.isNotEmpty() }
                    ?: if (code in 200..299) null else "Erro do servidor ($code)."
                if (message != null) throw ApiException(message)
                json ?: throw ApiException("Resposta vazia do servidor.")
            } finally {
                conn.disconnect()
            }
        }

    suspend fun getJson(path: String) = request(path, "GET", null)

    suspend fun postJson(path: String, body: JSONObject) = request(path, "POST", body)

    suspend fun health(): JSONObject = getJson("api/health")

    suspend fun bootstrap(): Bootstrap {
        val j = getJson("api/public/bootstrap")
        val p = j.getJSONArray("products")
        val c = j.getJSONArray("categories")
        return Bootstrap(
            store = com.lanchesrapido.cliente.model.Store.fromJson(j.getJSONObject("store")),
            categories = List(c.length()) { i -> com.lanchesrapido.cliente.model.Category.fromJson(c.getJSONObject(i)) },
            products = List(p.length()) { i -> com.lanchesrapido.cliente.model.Product.fromJson(p.getJSONObject(i)) },
        )
    }

    suspend fun aiParse(text: String): Pair<Boolean, List<AiItem>> {
        val j = postJson("api/public/ai-parse", JSONObject().put("text", text))
        val arr = j.optJSONArray("items") ?: org.json.JSONArray()
        val items = List(arr.length()) { i ->
            val it = arr.getJSONObject(i)
            AiItem(
                id = it.getString("id"),
                name = it.getString("name"),
                price = it.optDouble("price", 0.0),
                qty = it.optInt("qty", 1),
                total = it.optDouble("total", 0.0),
            )
        }
        return j.optBoolean("ok", false) to items
    }

    suspend fun createOrder(
        type: String,
        items: List<Pair<String, Int>>,
        customerName: String,
        phone: String,
        address: String,
        payment: String,
        note: String,
    ): TrackOrder {
        val body = JSONObject()
        body.put("type", type)
        val arr = org.json.JSONArray()
        items.forEach { (id, qty) -> arr.put(JSONObject().put("id", id).put("qty", qty)) }
        body.put("items", arr)
        if (customerName.isNotBlank()) body.put("customerName", customerName)
        if (phone.isNotBlank()) {
            body.put("customer", phone)
            body.put("phone", phone)
        }
        if (address.isNotBlank()) body.put("address", address)
        body.put("payment", payment)
        if (note.isNotBlank()) body.put("note", note)
        return trackFromJson(postJson("api/public/orders", body))
    }

    suspend fun track(orderId: String): TrackOrder =
        trackFromJson(getJson("api/orders/$orderId"))

    private fun trackFromJson(j: JSONObject): TrackOrder {
        val itemsArr = j.optJSONArray("items") ?: org.json.JSONArray()
        val items = List(itemsArr.length()) { i ->
            val it = itemsArr.getJSONObject(i)
            TrackLine(it.getString("name"), it.optDouble("price", 0.0), it.optInt("qty", 1))
        }
        val store = j.optJSONObject("store")
        return TrackOrder(
            id = j.getString("id"),
            number = j.optInt("number", 0),
            status = j.optString("status", "open"),
            type = j.optString("type", "counter"),
            customer = j.optString("customer", ""),
            phone = j.optString("phone", ""),
            address = j.optString("address", ""),
            subtotal = j.optDouble("subtotal", 0.0),
            deliveryFee = j.optDouble("deliveryFee", 0.0),
            total = j.optDouble("total", 0.0),
            payment = j.optString("payment", ""),
            note = j.optString("note", ""),
            courierName = j.optString("courierName", ""),
            storeName = store?.optString("name", "") ?: "",
            items = items,
        )
    }
}
package com.lanchesrapido.bloco.net

import android.content.Context
import com.lanchesrapido.bloco.data.BlocoStore
import com.lanchesrapido.bloco.data.NoteRecord
import com.lanchesrapido.bloco.data.OrderRecord
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.withContext
import org.json.JSONArray
import org.json.JSONObject
import java.io.BufferedInputStream
import java.io.BufferedOutputStream
import java.net.HttpURLConnection
import java.net.URL
import java.text.Normalizer
import java.text.NumberFormat
import java.text.SimpleDateFormat
import java.util.Base64
import java.util.Date
import java.util.Locale

data class ServerConnection(val baseUrl: String, val pin: String)
data class ServerInfo(val storeName: String, val printer: JSONObject)
data class TransferResult(val orders: Int, val notes: Int)

class BlocoApiException(message: String) : Exception(message)

object BlocoApi {
    private const val CONNECTION_PREFS = "bloco_connection"
    private const val DEFAULT_PORT = 4191
    @Volatile private var cachedUrl = ""
    @Volatile private var cachedToken = ""

    fun loadConnection(context: Context): ServerConnection {
        val prefs = context.getSharedPreferences(CONNECTION_PREFS, Context.MODE_PRIVATE)
        return ServerConnection(
            prefs.getString("baseUrl", "") ?: "",
            prefs.getString("pin", "") ?: "",
        )
    }

    fun saveConnection(context: Context, baseUrl: String, pin: String) {
        val normalized = normalizeUrl(baseUrl)
        require(normalized.isNotBlank()) { "Informe o endereço do computador." }
        require(pin.isNotBlank()) { "Informe o PIN configurado no servidor." }
        context.getSharedPreferences(CONNECTION_PREFS, Context.MODE_PRIVATE)
            .edit()
            .putString("baseUrl", normalized)
            .putString("pin", pin.trim())
            .apply()
        clearToken()
    }

    suspend fun testConnection(context: Context): ServerInfo {
        val connection = requireConnection(context)
        val state = request(connection, "GET", "api/state")
        return ServerInfo(
            state.optJSONObject("store")?.optString("name", "Bloco de Pedidos") ?: "Bloco de Pedidos",
            state.optJSONObject("settings")?.optJSONObject("printer") ?: JSONObject(),
        )
    }

    suspend fun importFromServer(context: Context, store: BlocoStore): TransferResult {
        val connection = requireConnection(context)
        val state = request(connection, "GET", "api/state")
        val remoteOrders = state.optJSONArray("orders") ?: JSONArray()
        val remoteNotes = state.optJSONArray("notes") ?: JSONArray()
        var ordersImported = 0
        var notesImported = 0
        for (index in 0 until remoteOrders.length()) {
            val order = remoteOrders.optJSONObject(index) ?: continue
            val serverId = order.optString("id")
            if (serverId.isBlank()) continue
            withContext(Dispatchers.IO) { store.upsertImportedOrder(serverId, order) }
            ordersImported++
        }
        for (index in 0 until remoteNotes.length()) {
            val note = remoteNotes.optJSONObject(index) ?: continue
            val serverId = note.optString("id")
            if (serverId.isBlank()) continue
            withContext(Dispatchers.IO) { store.upsertImportedNote(serverId, note) }
            notesImported++
        }
        val storeName = state.optJSONObject("store")?.optString("name").orEmpty()
        val limit = state.optJSONObject("settings")?.optInt("defaultLimit", 20)?.coerceIn(1, 1440) ?: 20
        if (storeName.isNotBlank()) {
            withContext(Dispatchers.IO) { store.saveSettings(storeName, limit) }
        }
        return TransferResult(ordersImported, notesImported)
    }

    suspend fun exportToServer(context: Context, store: BlocoStore): TransferResult {
        val connection = requireConnection(context)
        var ordersSent = 0
        var notesSent = 0
        var beforeOrderId: Long? = null
        while (true) {
            val page = withContext(Dispatchers.IO) { store.syncOrders(beforeOrderId) }
            if (page.items.isNotEmpty()) {
                val entries = JSONArray()
                page.items.forEach { entries.put(orderEnvelope(it)) }
                val response = request(connection, "POST", "api/mobile/sync", JSONObject().put("orders", entries))
                val mappings = readMappings(response.optJSONArray("orders"))
                withContext(Dispatchers.IO) { store.recordServerIds(mappings, "orders") }
                ordersSent += page.items.size
            }
            if (!page.hasMore) break
            beforeOrderId = page.items.last().id
        }

        var beforeNoteId: Long? = null
        while (true) {
            val page = withContext(Dispatchers.IO) { store.syncNotes(beforeNoteId) }
            if (page.items.isNotEmpty()) {
                val entries = JSONArray()
                page.items.forEach { entries.put(noteEnvelope(it)) }
                val response = request(connection, "POST", "api/mobile/sync", JSONObject().put("notes", entries))
                val mappings = readMappings(response.optJSONArray("notes"))
                withContext(Dispatchers.IO) { store.recordServerIds(mappings, "notes") }
                notesSent += page.items.size
            }
            if (!page.hasMore) break
            beforeNoteId = page.items.minOf { it.id }
        }
        return TransferResult(ordersSent, notesSent)
    }

    suspend fun printOrder(context: Context, order: OrderRecord) {
        val connection = requireConnection(context)
        val state = request(connection, "GET", "api/state")
        val info = state.optJSONObject("store") ?: JSONObject()
        val printer = state.optJSONObject("settings")?.optJSONObject("printer") ?: JSONObject()
        sendPrint(connection, buildReceipt(order, info.optString("name"), info.optString("phone"), info.optString("address"), printer))
    }

    suspend fun printTest(context: Context) {
        val connection = requireConnection(context)
        val state = request(connection, "GET", "api/state")
        val info = state.optJSONObject("store") ?: JSONObject()
        val printer = state.optJSONObject("settings")?.optJSONObject("printer") ?: JSONObject()
        val sample = OrderRecord(
            id = 0,
            number = 0,
            customer = "Teste de impressão",
            phone = "",
            type = "retirada",
            address = "",
            note = "",
            payment = "",
            limitMinutes = 20,
            elapsedMillis = 0,
            startedAtMillis = null,
            status = "done",
            createdAtMillis = System.currentTimeMillis(),
            syncId = "",
            serverId = null,
            items = listOf(com.lanchesrapido.bloco.data.OrderItem("Impressora conectada ao projeto", 1, 0.0)),
        )
        sendPrint(connection, buildReceipt(sample, info.optString("name"), info.optString("phone"), info.optString("address"), printer))
    }

    suspend fun printNotes(context: Context, notes: List<NoteRecord>) {
        if (notes.isEmpty()) throw BlocoApiException("Não há lembretes para imprimir.")
        val connection = requireConnection(context)
        val state = request(connection, "GET", "api/state")
        val info = state.optJSONObject("store") ?: JSONObject()
        val printer = state.optJSONObject("settings")?.optJSONObject("printer") ?: JSONObject()
        sendPrint(connection, buildNotesReceipt(
            notes,
            info.optString("name"),
            info.optString("phone"),
            info.optString("address"),
            printer,
        ))
    }

    private suspend fun sendPrint(connection: ServerConnection, receipt: ByteArray) {
        request(
            connection,
            "POST",
            "api/mobile/print",
            JSONObject()
                .put("data", Base64.getEncoder().encodeToString(receipt))
                .put("copies", 1),
        )
    }

    private fun orderEnvelope(order: OrderRecord): JSONObject {
        val items = JSONArray()
        order.items.forEach { items.put(JSONObject().put("name", it.name).put("qty", it.quantity).put("price", it.price)) }
        val status = when (order.status) {
            "preparing" -> "preparing"
            "paused" -> "paused"
            "done" -> "done"
            "canceled" -> "canceled"
            else -> "open"
        }
        val record = JSONObject()
            .put("mobileStatus", status)
            .put("items", items)
            .put("note", order.note)
            .put("payment", order.payment)
            .put("limitMin", order.limitMinutes)
            .put("accumMs", order.elapsedMillis)
            .put("startedAt", if (status == "preparing" && order.startedAtMillis != null) isoDate(order.startedAtMillis) else JSONObject.NULL)
            .put("doneAt", if (status == "done" || status == "canceled") isoDate(order.createdAtMillis) else JSONObject.NULL)
            .put("canceledAt", if (status == "canceled") isoDate(order.createdAtMillis) else JSONObject.NULL)
            .put("createdAt", isoDate(order.createdAtMillis))
            .put(
                "customer",
                JSONObject()
                    .put("name", order.customer)
                    .put("phone", order.phone)
                    .put("type", order.type)
                    .put("address", order.address),
            )
        return JSONObject()
            .put("syncId", order.syncId)
            .put("serverId", order.serverId ?: JSONObject.NULL)
            .put("record", record)
    }

    private fun noteEnvelope(note: NoteRecord): JSONObject =
        JSONObject()
            .put("syncId", note.syncId)
            .put("serverId", note.serverId ?: JSONObject.NULL)
            .put(
                "record",
                JSONObject()
                    .put("text", note.text)
                    .put("color", note.color)
                    .put("done", note.done)
                    .put("createdAt", isoDate(note.createdAtMillis)),
            )

    private fun readMappings(array: JSONArray?): List<Pair<String, String>> {
        if (array == null) throw BlocoApiException("O servidor não devolveu os identificadores sincronizados.")
        return (0 until array.length()).map { index ->
            val item = array.optJSONObject(index) ?: throw BlocoApiException("Resposta de sincronização inválida.")
            val syncId = item.optString("syncId")
            val serverId = item.optString("serverId")
            if (syncId.isBlank() || serverId.isBlank()) {
                throw BlocoApiException("O servidor devolveu um identificador vazio.")
            }
            syncId to serverId
        }
    }

    private fun buildReceipt(
        order: OrderRecord,
        storeName: String,
        storePhone: String,
        storeAddress: String,
        printer: JSONObject,
    ): ByteArray {
        val width = printer.optInt("width", 32).coerceIn(24, 48)
        val out = java.io.ByteArrayOutputStream()
        fun raw(vararg bytes: Int) { out.write(bytes.map { it.toByte() }.toByteArray()) }
        fun text(value: String) { out.write(ascii(value).toByteArray(Charsets.US_ASCII)) }
        fun line(value: String) { text(value); text("\n") }
        raw(0x1b, 0x40)
        raw(0x1b, 0x61, 0x01)
        raw(0x1d, 0x21, 0x11)
        line(storeName.ifBlank { "BLOCO DE PEDIDOS" })
        raw(0x1d, 0x21, 0x00)
        if (storePhone.isNotBlank()) line(storePhone)
        if (storeAddress.isNotBlank()) line(storeAddress)
        raw(0x1b, 0x61, 0x00, 0x1b, 0x64, 0x02, 0x1b, 0x45, 0x01, 0x1d, 0x21, 0x11)
        line("PEDIDO #${order.number.toString().padStart(3, '0')}")
        raw(0x1d, 0x21, 0x00, 0x1b, 0x45, 0x00)
        val date = SimpleDateFormat("dd/MM HH:mm", Locale("pt", "BR")).format(Date(order.createdAtMillis))
        line("$date  ${if (order.type == "entrega") "ENTREGA" else "RETIRADA"}")
        line("-".repeat(width))
        order.items.forEach { item ->
            fold("${item.quantity}x ${item.name}", width).forEach(::line)
            if (item.price > 0.0) line(" ${money(item.quantity * item.price)}")
        }
        line("-".repeat(width))
        val total = order.items.sumOf { it.quantity * it.price }
        if (total > 0) line(align("TOTAL", money(total), width))
        if (order.payment.isNotBlank()) line(order.payment)
        line("-".repeat(width))
        raw(0x1b, 0x45, 0x01)
        fold("Cliente: ${order.customer}", width).forEach(::line)
        if (order.phone.isNotBlank()) fold("Tel: ${order.phone}", width).forEach(::line)
        if (order.type == "entrega" && order.address.isNotBlank()) fold("End: ${order.address}", width).forEach(::line)
        raw(0x1b, 0x45, 0x00)
        if (order.note.isNotBlank()) {
            raw(0x1b, 0x45, 0x01)
            fold("OBS: ${order.note}", width).forEach(::line)
            raw(0x1b, 0x45, 0x00)
        }
        line("")
        line("")
        line("")
        if (printer.optBoolean("drawer")) raw(0x1b, 0x70, 0x00, 0x19, 0xfa)
        if (printer.optBoolean("cut", true)) raw(0x1d, 0x56, 0x42, 0x00)
        return out.toByteArray()
    }

    private fun buildNotesReceipt(
        notes: List<NoteRecord>,
        storeName: String,
        storePhone: String,
        storeAddress: String,
        printer: JSONObject,
    ): ByteArray {
        val width = printer.optInt("width", 32).coerceIn(24, 48)
        val out = java.io.ByteArrayOutputStream()
        fun raw(vararg bytes: Int) { out.write(bytes.map { it.toByte() }.toByteArray()) }
        fun text(value: String) { out.write(ascii(value).toByteArray(Charsets.US_ASCII)) }
        fun line(value: String) { text(value); text("\n") }
        raw(0x1b, 0x40, 0x1b, 0x61, 0x01, 0x1d, 0x21, 0x11)
        line(storeName.ifBlank { "BLOCO DE PEDIDOS" })
        raw(0x1d, 0x21, 0x00)
        if (storePhone.isNotBlank()) line(storePhone)
        if (storeAddress.isNotBlank()) line(storeAddress)
        raw(0x1b, 0x61, 0x01, 0x1b, 0x45, 0x01)
        line("BLOCO DE NOTAS")
        raw(0x1b, 0x45, 0x00, 0x1b, 0x61, 0x00)
        line("-".repeat(width))
        notes.forEach { note ->
            fold("${if (note.done) "[x]" else "[ ]"} ${note.text}", width).forEach(::line)
            line("")
        }
        line("-".repeat(width))
        line("Impresso ${SimpleDateFormat("dd/MM/yyyy HH:mm", Locale("pt", "BR")).format(Date())}")
        line("")
        line("")
        line("")
        if (printer.optBoolean("cut", true)) raw(0x1d, 0x56, 0x42, 0x00)
        return out.toByteArray()
    }

    private fun fold(value: String, width: Int): List<String> {
        val output = mutableListOf<String>()
        var line = ""
        for (word in ascii(value).split(Regex("\\s+")).filter { it.isNotEmpty() }) {
            if (line.isEmpty()) line = word
            else if (line.length + 1 + word.length <= width) line += " $word"
            else {
                output += line
                line = word
            }
            while (line.length > width) {
                output += line.take(width)
                line = line.drop(width)
            }
        }
        if (line.isNotEmpty()) output += line
        return output
    }

    private fun align(left: String, right: String, width: Int): String =
        left + " ".repeat((width - left.length - right.length).coerceAtLeast(1)) + right

    private fun ascii(value: String): String =
        Normalizer.normalize(value, Normalizer.Form.NFD)
            .replace(Regex("\\p{M}+"), "")
            .replace('ç', 'c')
            .replace('Ç', 'C')
            .replace(Regex("[^\\x20-\\x7e\\n]"), "")

    private fun money(value: Double): String =
        NumberFormat.getCurrencyInstance(Locale("pt", "BR")).format(value)

    private fun isoDate(millis: Long): String = java.time.Instant.ofEpochMilli(millis).toString()

    private fun requireConnection(context: Context): ServerConnection {
        val connection = loadConnection(context)
        if (connection.baseUrl.isBlank()) throw BlocoApiException("Configure o endereço do computador em Ajustes.")
        if (connection.pin.isBlank()) throw BlocoApiException("Configure o PIN do servidor em Ajustes.")
        return connection
    }

    private suspend fun request(
        connection: ServerConnection,
        method: String,
        path: String,
        body: JSONObject? = null,
    ): JSONObject = withContext(Dispatchers.IO) {
        val baseUrl = normalizeUrl(connection.baseUrl).trimEnd('/')
        if (baseUrl.isBlank()) throw BlocoApiException("Informe o endereço do servidor.")
        var token = getToken(connection, baseUrl)
        var response = requestOnce(baseUrl, path, method, body, token)
        if (response.first == HttpURLConnection.HTTP_UNAUTHORIZED) {
            clearToken()
            token = login(baseUrl, connection.pin)
            response = requestOnce(baseUrl, path, method, body, token)
        }
        val (status, json) = response
        if (status !in 200..299) {
            val serverMessage = json?.optString("error")?.takeIf { it.isNotBlank() }
            throw BlocoApiException(serverMessage ?: "O servidor respondeu com erro ($status).")
        }
        json ?: throw BlocoApiException("O servidor enviou uma resposta vazia.")
    }

    private suspend fun getToken(connection: ServerConnection, baseUrl: String): String {
        if (cachedUrl == baseUrl && cachedToken.isNotBlank()) return cachedToken
        return login(baseUrl, connection.pin)
    }

    private suspend fun login(baseUrl: String, pin: String): String = withContext(Dispatchers.IO) {
        val (status, response) = requestOnce(
            baseUrl,
            "api/login",
            "POST",
            JSONObject().put("pin", pin),
            token = null,
        )
        if (status !in 200..299) {
            val message = response?.optString("error")?.takeIf { it.isNotBlank() }
                ?: if (status == HttpURLConnection.HTTP_UNAUTHORIZED) "PIN incorreto. Confira o PIN do servidor." else "Não foi possível entrar no servidor ($status)."
            throw BlocoApiException(message)
        }
        val token = response?.optString("token").orEmpty()
        if (token.isBlank()) throw BlocoApiException("O servidor não devolveu um token de acesso.")
        cachedUrl = baseUrl
        cachedToken = token
        token
    }

    private fun requestOnce(
        baseUrl: String,
        path: String,
        method: String,
        body: JSONObject?,
        token: String?,
    ): Pair<Int, JSONObject?> {
        val connection = try {
            URL("$baseUrl/${path.trimStart('/')}").openConnection() as HttpURLConnection
        } catch (e: Exception) {
            throw BlocoApiException("Endereço inválido: $baseUrl")
        }
        try {
            connection.connectTimeout = 8_000
            connection.readTimeout = 20_000
            connection.requestMethod = method
            connection.setRequestProperty("Accept", "application/json")
            if (token != null) connection.setRequestProperty("X-Token", token)
            if (body != null) {
                connection.doOutput = true
                connection.setRequestProperty("Content-Type", "application/json; charset=utf-8")
                BufferedOutputStream(connection.outputStream).use {
                    it.write(body.toString().toByteArray(Charsets.UTF_8))
                }
            }
            val status = connection.responseCode
            val stream = if (status in 200..299) connection.inputStream else connection.errorStream
            val text = stream?.let { BufferedInputStream(it).bufferedReader(Charsets.UTF_8).use { reader -> reader.readText() } }.orEmpty()
            return status to if (text.isBlank()) null else runCatching { JSONObject(text) }.getOrNull()
        } catch (e: BlocoApiException) {
            throw e
        } catch (e: Exception) {
            throw BlocoApiException("Não foi possível falar com o servidor. Confira o Wi-Fi, o endereço e se o Bloco de Pedidos está aberto no computador.")
        } finally {
            connection.disconnect()
        }
    }

    private fun normalizeUrl(input: String): String {
        var value = input.trim().trimEnd('/')
        if (value.isEmpty()) return ""
        if (!value.startsWith("http://", true) && !value.startsWith("https://", true)) value = "http://$value"
        val schemeEnd = value.indexOf("://") + 3
        val authorityEnd = value.indexOf('/', schemeEnd).let { if (it < 0) value.length else it }
        val authority = value.substring(schemeEnd, authorityEnd)
        val localHost = authority.startsWith("localhost", true) ||
            authority.startsWith("192.168.") ||
            authority.startsWith("10.") ||
            Regex("""172\.(1[6-9]|2\d|3[01])\.""").containsMatchIn(authority)
        val hasPort = Regex(""":\d+$""").containsMatchIn(authority)
        val port = if (localHost && !hasPort) ":$DEFAULT_PORT" else ""
        return value.substring(0, authorityEnd) + port + value.substring(authorityEnd)
    }

    private fun clearToken() {
        cachedUrl = ""
        cachedToken = ""
    }
}

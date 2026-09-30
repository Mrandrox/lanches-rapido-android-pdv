package com.lanchesrapido.bloco.data

import android.content.ContentValues
import android.content.Context
import android.database.sqlite.SQLiteDatabase
import android.database.sqlite.SQLiteOpenHelper
import org.json.JSONObject
import java.util.UUID

data class OrderItem(val name: String, val quantity: Int, val price: Double)

data class OrderRecord(
    val id: Long,
    val number: Int,
    val customer: String,
    val phone: String,
    val type: String,
    val address: String,
    val note: String,
    val payment: String,
    val limitMinutes: Int,
    val elapsedMillis: Long,
    val startedAtMillis: Long?,
    val status: String,
    val createdAtMillis: Long,
    val syncId: String,
    val serverId: String?,
    val items: List<OrderItem>,
)

data class OrderPage(val items: List<OrderRecord>, val hasMore: Boolean)

data class NoteRecord(
    val id: Long,
    val text: String,
    val color: String,
    val done: Boolean,
    val createdAtMillis: Long,
    val syncId: String,
    val serverId: String?,
)

data class NotePage(val items: List<NoteRecord>, val hasMore: Boolean)

data class BlocoSettings(val storeName: String, val defaultLimitMinutes: Int)

class BlocoStore(context: Context) : SQLiteOpenHelper(context, "bloco-pedidos.db", null, 2) {
    init {
        setWriteAheadLoggingEnabled(true)
    }

    override fun onConfigure(db: SQLiteDatabase) {
        super.onConfigure(db)
        db.setForeignKeyConstraintsEnabled(true)
    }

    override fun onCreate(db: SQLiteDatabase) {
        db.execSQL(
            """CREATE TABLE orders (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                customer TEXT NOT NULL,
                phone TEXT NOT NULL DEFAULT '',
                type TEXT NOT NULL CHECK(type IN ('retirada', 'entrega')),
                address TEXT NOT NULL DEFAULT '',
                note TEXT NOT NULL DEFAULT '',
                payment TEXT NOT NULL,
                limit_minutes INTEGER NOT NULL CHECK(limit_minutes > 0),
                elapsed_ms INTEGER NOT NULL DEFAULT 0 CHECK(elapsed_ms >= 0),
                started_at_ms INTEGER,
                status TEXT NOT NULL CHECK(status IN ('open', 'preparing', 'paused', 'done', 'canceled')),
                created_at_ms INTEGER NOT NULL,
                deleted_at_ms INTEGER,
                sync_id TEXT NOT NULL UNIQUE,
                server_id TEXT UNIQUE
            )""",
        )
        db.execSQL(
            """CREATE TABLE order_items (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                order_id INTEGER NOT NULL REFERENCES orders(id) ON DELETE CASCADE,
                name TEXT NOT NULL,
                quantity INTEGER NOT NULL CHECK(quantity > 0),
                price REAL NOT NULL CHECK(price >= 0)
            )""",
        )
        db.execSQL(
            """CREATE TABLE notes (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                text TEXT NOT NULL,
                color TEXT NOT NULL DEFAULT 'amarelo',
                done INTEGER NOT NULL DEFAULT 0 CHECK(done IN (0, 1)),
                created_at_ms INTEGER NOT NULL,
                sync_id TEXT NOT NULL UNIQUE,
                server_id TEXT UNIQUE
            )""",
        )
        db.execSQL(
            """CREATE TABLE settings (
                id INTEGER PRIMARY KEY CHECK(id = 1),
                store_name TEXT NOT NULL,
                default_limit_minutes INTEGER NOT NULL CHECK(default_limit_minutes BETWEEN 1 AND 1440)
            )""",
        )
        db.execSQL("CREATE INDEX orders_active_idx ON orders(deleted_at_ms, id DESC)")
        db.execSQL("CREATE INDEX order_items_order_idx ON order_items(order_id)")
        db.execSQL("CREATE INDEX notes_created_idx ON notes(id DESC)")
        db.insertOrThrow(
            "settings",
            null,
            ContentValues().apply {
                put("id", 1)
                put("store_name", "Minha Lanchonete")
                put("default_limit_minutes", 20)
            },
        )
    }

    override fun onUpgrade(db: SQLiteDatabase, oldVersion: Int, newVersion: Int) {
        if (oldVersion < 2) {
            db.execSQL("ALTER TABLE orders ADD COLUMN sync_id TEXT")
            db.execSQL("ALTER TABLE orders ADD COLUMN server_id TEXT")
            db.execSQL("ALTER TABLE notes ADD COLUMN sync_id TEXT")
            db.execSQL("ALTER TABLE notes ADD COLUMN server_id TEXT")
            backfillSyncIds(db, "orders", "order")
            backfillSyncIds(db, "notes", "note")
            db.execSQL("CREATE UNIQUE INDEX orders_sync_id_idx ON orders(sync_id)")
            db.execSQL("CREATE UNIQUE INDEX orders_server_id_idx ON orders(server_id)")
            db.execSQL("CREATE UNIQUE INDEX notes_sync_id_idx ON notes(sync_id)")
            db.execSQL("CREATE UNIQUE INDEX notes_server_id_idx ON notes(server_id)")
        }
    }

    private fun backfillSyncIds(db: SQLiteDatabase, table: String, kind: String) {
        db.rawQuery("SELECT id FROM $table WHERE sync_id IS NULL", null).use { cursor ->
            while (cursor.moveToNext()) {
                val id = cursor.getLong(0)
                db.execSQL(
                    "UPDATE $table SET sync_id = ? WHERE id = ?",
                    arrayOf("$kind-${UUID.randomUUID()}", id),
                )
            }
        }
    }

    fun settings(): BlocoSettings =
        readableDatabase.rawQuery(
            "SELECT store_name, default_limit_minutes FROM settings WHERE id = 1",
            null,
        ).use { cursor ->
            check(cursor.moveToFirst()) { "As configurações locais não foram inicializadas." }
            BlocoSettings(cursor.getString(0), cursor.getInt(1))
        }

    fun saveSettings(storeName: String, limitMinutes: Int) {
        require(storeName.isNotBlank()) { "Informe o nome da loja." }
        require(limitMinutes in 1..1440) { "O prazo padrão deve ficar entre 1 e 1440 minutos." }
        val changed = writableDatabase.update(
            "settings",
            ContentValues().apply {
                put("store_name", storeName.trim().take(80))
                put("default_limit_minutes", limitMinutes)
            },
            "id = 1",
            null,
        )
        check(changed == 1) { "Não foi possível salvar as configurações." }
    }

    fun createOrder(
        customer: String,
        phone: String,
        type: String,
        address: String,
        note: String,
        payment: String,
        limitMinutes: Int,
        items: List<OrderItem>,
    ): Long {
        require(type == "retirada" || type == "entrega") { "Tipo de pedido inválido." }
        require(customer.isNotBlank()) { "Informe o nome do cliente." }
        require(type != "entrega" || address.isNotBlank()) { "Informe o endereço de entrega." }
        require(items.isNotEmpty()) { "Adicione pelo menos um item ao pedido." }
        require(limitMinutes in 1..1440) { "O prazo deve ficar entre 1 e 1440 minutos." }
        items.forEach {
            require(it.name.isNotBlank()) { "Informe o nome de todos os itens." }
            require(it.quantity > 0) { "A quantidade dos itens deve ser maior que zero." }
            require(it.price >= 0.0 && it.price.isFinite()) { "Informe preços válidos." }
        }

        val db = writableDatabase
        db.beginTransaction()
        try {
            val id = db.insertOrThrow(
                "orders",
                null,
                ContentValues().apply {
                    put("customer", customer.trim().take(80))
                    put("phone", phone.trim().take(30))
                    put("type", type)
                    put("address", if (type == "entrega") address.trim().take(240) else "")
                    put("note", note.trim().take(500))
                    put("payment", payment.trim().ifBlank { "A combinar" }.take(40))
                    put("limit_minutes", limitMinutes)
                    put("status", "open")
                    put("created_at_ms", System.currentTimeMillis())
                    put("sync_id", UUID.randomUUID().toString())
                },
            )
            items.forEach { item ->
                db.insertOrThrow(
                    "order_items",
                    null,
                    ContentValues().apply {
                        put("order_id", id)
                        put("name", item.name.trim().take(100))
                        put("quantity", item.quantity)
                        put("price", item.price)
                    },
                )
            }
            db.setTransactionSuccessful()
            return id
        } finally {
            db.endTransaction()
        }
    }

    fun orders(inTrash: Boolean, beforeId: Long? = null): OrderPage {
        val db = readableDatabase
        val records = mutableListOf<OrderRecord>()
        val selection = buildString {
            append(if (inTrash) "deleted_at_ms IS NOT NULL" else "deleted_at_ms IS NULL")
            if (beforeId != null) append(" AND id < ?")
        }
        db.query(
            "orders",
            arrayOf(
                "id", "customer", "phone", "type", "address", "note", "payment",
                "limit_minutes", "elapsed_ms", "started_at_ms", "status", "created_at_ms",
                "sync_id", "server_id",
            ),
            selection,
            beforeId?.let { arrayOf(it.toString()) },
            null,
            null,
            "id DESC",
            (PAGE_SIZE + 1).toString(),
        ).use { cursor ->
            while (cursor.moveToNext()) {
                records += OrderRecord(
                    id = cursor.getLong(0),
                    number = cursor.getLong(0).toInt(),
                    customer = cursor.getString(1),
                    phone = cursor.getString(2),
                    type = cursor.getString(3),
                    address = cursor.getString(4),
                    note = cursor.getString(5),
                    payment = cursor.getString(6),
                    limitMinutes = cursor.getInt(7),
                    elapsedMillis = cursor.getLong(8),
                    startedAtMillis = if (cursor.isNull(9)) null else cursor.getLong(9),
                    status = cursor.getString(10),
                    createdAtMillis = cursor.getLong(11),
                    syncId = cursor.getString(12),
                    serverId = if (cursor.isNull(13)) null else cursor.getString(13),
                    items = emptyList(),
                )
            }
        }
        val hasMore = records.size > PAGE_SIZE
        val orders = records.take(PAGE_SIZE)
        if (orders.isEmpty()) return OrderPage(emptyList(), false)

        val ids = orders.joinToString(",") { it.id.toString() }
        val itemsByOrder = mutableMapOf<Long, MutableList<OrderItem>>()
        db.rawQuery(
            "SELECT order_id, name, quantity, price FROM order_items WHERE order_id IN ($ids) ORDER BY id",
            null,
        ).use { cursor ->
            while (cursor.moveToNext()) {
                itemsByOrder.getOrPut(cursor.getLong(0)) { mutableListOf() } += OrderItem(
                    cursor.getString(1),
                    cursor.getInt(2),
                    cursor.getDouble(3),
                )
            }
        }
        return OrderPage(orders.map { it.copy(items = itemsByOrder[it.id].orEmpty()) }, hasMore)
    }

    fun syncOrders(beforeId: Long? = null): OrderPage = orders(inTrash = false, beforeId = beforeId)

    fun syncNotes(beforeId: Long? = null): NotePage = notes(beforeId)

    fun upsertImportedOrder(serverId: String, source: JSONObject) {
        require(serverId.isNotBlank()) { "Pedido recebido sem identificador do servidor." }
        val customerObject = source.optJSONObject("customer") ?: JSONObject()
        val type = if (customerObject.optString("type") == "entrega") "entrega" else "retirada"
        val customer = customerObject.optString("name", "Balcão").trim().ifBlank { "Balcão" }.take(80)
        val address = customerObject.optString("address").trim().take(240)
        require(type != "entrega" || address.isNotBlank()) { "Pedido de entrega recebido sem endereço." }
        val sourceItems = source.optJSONArray("items") ?: error("Pedido recebido sem itens.")
        val items = (0 until sourceItems.length()).map { index ->
            val item = sourceItems.optJSONObject(index) ?: error("Item inválido no pedido recebido.")
            OrderItem(
                item.optString("name").trim().take(100),
                item.optInt("qty", 1),
                item.optDouble("price", 0.0),
            ).also {
                require(it.name.isNotBlank() && it.quantity > 0 && it.price >= 0.0 && it.price.isFinite()) {
                    "O pedido recebido contém itens inválidos."
                }
            }
        }
        require(items.isNotEmpty()) { "Pedido recebido sem itens." }
        val serverSyncId = source.optString("androidSyncId").takeIf { it.isNotBlank() }
            ?: "server-$serverId"
        val receivedStatus = source.optString("mobileStatus")
        val status = when {
            receivedStatus in setOf("open", "preparing", "paused", "done", "canceled") -> receivedStatus
            source.optString("canceledAt").isNotBlank() -> "canceled"
            source.optString("doneAt").isNotBlank() -> "done"
            source.optString("startedAt").isNotBlank() -> "preparing"
            else -> "open"
        }
        val startedAt = source.optString("startedAt").takeIf { it.isNotBlank() }?.let(::parseTime)
        val db = writableDatabase
        db.beginTransaction()
        try {
            val byServerId = findId(db, "orders", "server_id", serverId)
            val bySyncId = findId(db, "orders", "sync_id", serverSyncId)
            check(byServerId == null || bySyncId == null || byServerId == bySyncId) {
                "O pedido do servidor conflita com outro pedido local. Nenhum dado foi alterado."
            }
            val localId = byServerId ?: bySyncId
            val values = ContentValues().apply {
                put("customer", customer)
                put("phone", customerObject.optString("phone").take(30))
                put("type", type)
                put("address", address)
                put("note", source.optString("note").trim().take(500))
                put("payment", source.optString("payment", "A combinar").ifBlank { "A combinar" }.take(40))
                put("limit_minutes", source.optInt("limitMin", settings().defaultLimitMinutes).coerceIn(1, 1440))
                put("elapsed_ms", source.optLong("accumMs").coerceAtLeast(0L))
                if (startedAt == null) putNull("started_at_ms") else put("started_at_ms", startedAt)
                put("status", status)
                put("created_at_ms", parseTime(source.optString("createdAt")))
                put("sync_id", serverSyncId)
                put("server_id", serverId)
            }
            val localOrderId = if (localId == null) {
                db.insertOrThrow("orders", null, values)
            } else {
                check(db.update("orders", values, "id = ?", arrayOf(localId.toString())) == 1) {
                    "Não foi possível atualizar o pedido recebido."
                }
                localId
            }
            db.delete("order_items", "order_id = ?", arrayOf(localOrderId.toString()))
            items.forEach { item ->
                db.insertOrThrow(
                    "order_items",
                    null,
                    ContentValues().apply {
                        put("order_id", localOrderId)
                        put("name", item.name)
                        put("quantity", item.quantity)
                        put("price", item.price)
                    },
                )
            }
            db.setTransactionSuccessful()
        } finally {
            db.endTransaction()
        }
    }

    fun upsertImportedNote(serverId: String, source: JSONObject) {
        require(serverId.isNotBlank()) { "Lembrete recebido sem identificador do servidor." }
        val text = source.optString("text").trim().take(500)
        require(text.isNotBlank()) { "Lembrete recebido sem texto." }
        val color = source.optString("color", "amarelo").takeIf { it in NOTE_COLORS } ?: "amarelo"
        val sourceSyncId = source.optString("androidSyncId").takeIf { it.isNotBlank() }
            ?: "server-$serverId"
        val db = writableDatabase
        db.beginTransaction()
        try {
            val byServerId = findId(db, "notes", "server_id", serverId)
            val bySyncId = findId(db, "notes", "sync_id", sourceSyncId)
            check(byServerId == null || bySyncId == null || byServerId == bySyncId) {
                "O lembrete do servidor conflita com outro lembrete local. Nenhum dado foi alterado."
            }
            val values = ContentValues().apply {
                put("text", text)
                put("color", color)
                put("done", if (source.optBoolean("done")) 1 else 0)
                put("created_at_ms", parseTime(source.optString("createdAt")))
                put("sync_id", sourceSyncId)
                put("server_id", serverId)
            }
            val localId = byServerId ?: bySyncId
            if (localId == null) {
                db.insertOrThrow("notes", null, values)
            } else {
                check(db.update("notes", values, "id = ?", arrayOf(localId.toString())) == 1) {
                    "Não foi possível atualizar o lembrete recebido."
                }
            }
            db.setTransactionSuccessful()
        } finally {
            db.endTransaction()
        }
    }

    fun recordServerIds(records: List<Pair<String, String>>, table: String) {
        require(table == "orders" || table == "notes") { "Tipo de registro inválido." }
        val db = writableDatabase
        db.beginTransaction()
        try {
            records.forEach { (syncId, serverId) ->
                check(db.update(
                    table,
                    ContentValues().apply { put("server_id", serverId) },
                    "sync_id = ?",
                    arrayOf(syncId),
                ) == 1) { "Não foi possível registrar a confirmação do servidor." }
            }
            db.setTransactionSuccessful()
        } finally {
            db.endTransaction()
        }
    }

    private fun findId(db: SQLiteDatabase, table: String, column: String, value: String): Long? {
        require(table == "orders" || table == "notes")
        require(column == "server_id" || column == "sync_id")
        return db.rawQuery(
            "SELECT id FROM $table WHERE $column = ?",
            arrayOf(value),
        ).use { cursor -> if (cursor.moveToFirst()) cursor.getLong(0) else null }
    }

    private fun parseTime(value: String): Long =
        runCatching { java.time.Instant.parse(value).toEpochMilli() }.getOrDefault(System.currentTimeMillis())

    fun updateOrderStatus(id: Long, status: String) {
        require(status in setOf("open", "preparing", "paused", "done", "canceled")) {
            "Estado do pedido inválido."
        }
        val db = writableDatabase
        db.beginTransaction()
        try {
            val order = readTimerState(db, id)
            check(order.deletedAt == null) { "Restaure o pedido antes de alterá-lo." }
            val allowedTransitions = when (order.status) {
                "open" -> setOf("preparing", "canceled")
                "preparing" -> setOf("paused", "done", "canceled")
                "paused" -> setOf("preparing", "done", "canceled")
                else -> emptySet()
            }
            check(status in allowedTransitions) { "Essa mudança de estado não é permitida." }
            val now = System.currentTimeMillis()
            val elapsed = if (order.status == "preparing" && status != "preparing") {
                order.elapsedMillis + (now - (order.startedAtMillis ?: now)).coerceAtLeast(0L)
            } else {
                order.elapsedMillis
            }
            val startedAt = if (status == "preparing") {
                if (order.status == "preparing") order.startedAtMillis else now
            } else {
                null
            }
            check(
                db.update(
                    "orders",
                    ContentValues().apply {
                        put("status", status)
                        put("elapsed_ms", elapsed)
                        if (startedAt == null) putNull("started_at_ms") else put("started_at_ms", startedAt)
                    },
                    "id = ? AND deleted_at_ms IS NULL",
                    arrayOf(id.toString()),
                ) == 1,
            ) { "Não foi possível atualizar o pedido." }
            db.setTransactionSuccessful()
        } finally {
            db.endTransaction()
        }
    }

    private data class TimerState(
        val status: String,
        val elapsedMillis: Long,
        val startedAtMillis: Long?,
        val deletedAt: Long?,
    )

    private fun readTimerState(db: SQLiteDatabase, id: Long): TimerState =
        db.rawQuery(
            "SELECT status, elapsed_ms, started_at_ms, deleted_at_ms FROM orders WHERE id = ?",
            arrayOf(id.toString()),
        ).use { cursor ->
            check(cursor.moveToFirst()) { "Pedido não encontrado." }
            TimerState(
                cursor.getString(0),
                cursor.getLong(1),
                if (cursor.isNull(2)) null else cursor.getLong(2),
                if (cursor.isNull(3)) null else cursor.getLong(3),
            )
        }

    fun moveOrderToTrash(id: Long) {
        val changed = writableDatabase.update(
            "orders",
            ContentValues().apply { put("deleted_at_ms", System.currentTimeMillis()) },
            "id = ? AND deleted_at_ms IS NULL AND status IN ('done', 'canceled')",
            arrayOf(id.toString()),
        )
        check(changed == 1) { "Conclua ou cancele o pedido antes de arquivá-lo." }
    }

    fun restoreOrder(id: Long) {
        val changed = writableDatabase.update(
            "orders",
            ContentValues().apply { putNull("deleted_at_ms") },
            "id = ? AND deleted_at_ms IS NOT NULL",
            arrayOf(id.toString()),
        )
        check(changed == 1) { "O pedido não está na lixeira." }
    }

    fun deleteOrderPermanently(id: Long) {
        val db = writableDatabase
        db.beginTransaction()
        try {
            check(
                db.delete("orders", "id = ? AND deleted_at_ms IS NOT NULL", arrayOf(id.toString())) == 1,
            ) { "O pedido não está na lixeira." }
            db.setTransactionSuccessful()
        } finally {
            db.endTransaction()
        }
    }

    fun emptyTrash(): Int {
        val db = writableDatabase
        db.beginTransaction()
        try {
            val count = db.delete("orders", "deleted_at_ms IS NOT NULL", null)
            db.setTransactionSuccessful()
            return count
        } finally {
            db.endTransaction()
        }
    }

    fun notes(beforeId: Long? = null): NotePage {
        val records = mutableListOf<NoteRecord>()
        val selection = if (beforeId == null) null else "id < ?"
        readableDatabase.query(
            "notes",
            arrayOf("id", "text", "color", "done", "created_at_ms", "sync_id", "server_id"),
            selection,
            beforeId?.let { arrayOf(it.toString()) },
            null,
            null,
            "id DESC",
            (PAGE_SIZE + 1).toString(),
        ).use { cursor ->
            while (cursor.moveToNext()) {
                records += NoteRecord(
                    cursor.getLong(0),
                    cursor.getString(1),
                    cursor.getString(2),
                    cursor.getInt(3) == 1,
                    cursor.getLong(4),
                    cursor.getString(5),
                    if (cursor.isNull(6)) null else cursor.getString(6),
                )
            }
        }
        val hasMore = records.size > PAGE_SIZE
        return NotePage(records.take(PAGE_SIZE).sortedWith(compareBy<NoteRecord> { it.done }.thenByDescending { it.id }), hasMore)
    }

    fun notesForPrint(): List<NoteRecord> {
        val records = mutableListOf<NoteRecord>()
        readableDatabase.query(
            "notes",
            arrayOf("id", "text", "color", "done", "created_at_ms", "sync_id", "server_id"),
            null,
            null,
            null,
            null,
            "done ASC, id DESC",
            (MAX_PRINT_NOTES + 1).toString(),
        ).use { cursor ->
            while (cursor.moveToNext()) {
                records += NoteRecord(
                    cursor.getLong(0),
                    cursor.getString(1),
                    cursor.getString(2),
                    cursor.getInt(3) == 1,
                    cursor.getLong(4),
                    cursor.getString(5),
                    if (cursor.isNull(6)) null else cursor.getString(6),
                )
            }
        }
        check(records.size <= MAX_PRINT_NOTES) {
            "Há mais de $MAX_PRINT_NOTES lembretes. Conclua ou limpe alguns antes de imprimir o bloco."
        }
        return records
    }

    fun addNote(text: String, color: String) {
        require(text.isNotBlank()) { "Escreva um lembrete antes de salvar." }
        require(color in NOTE_COLORS) { "Cor do lembrete inválida." }
        writableDatabase.insertOrThrow(
            "notes",
            null,
            ContentValues().apply {
                put("text", text.trim().take(500))
                put("color", color)
                put("created_at_ms", System.currentTimeMillis())
                put("sync_id", UUID.randomUUID().toString())
            },
        )
    }

    fun toggleNote(id: Long) {
        val db = writableDatabase
        db.beginTransaction()
        try {
            val done = db.rawQuery("SELECT done FROM notes WHERE id = ?", arrayOf(id.toString())).use { cursor ->
                check(cursor.moveToFirst()) { "Lembrete não encontrado." }
                cursor.getInt(0) == 1
            }
            check(db.update("notes", ContentValues().apply { put("done", if (done) 0 else 1) }, "id = ?", arrayOf(id.toString())) == 1) {
                "Não foi possível atualizar o lembrete."
            }
            db.setTransactionSuccessful()
        } finally {
            db.endTransaction()
        }
    }

    fun deleteNote(id: Long) {
        check(writableDatabase.delete("notes", "id = ?", arrayOf(id.toString())) == 1) {
            "Lembrete não encontrado."
        }
    }

    fun clearCompletedNotes(): Int {
        val db = writableDatabase
        db.beginTransaction()
        try {
            val count = db.delete("notes", "done = 1", null)
            db.setTransactionSuccessful()
            return count
        } finally {
            db.endTransaction()
        }
    }

    companion object {
        private const val PAGE_SIZE = 200
        private const val MAX_PRINT_NOTES = 1000
        val NOTE_COLORS = setOf("amarelo", "verde", "azul", "rosa", "cinza")
    }
}

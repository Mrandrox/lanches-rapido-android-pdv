package com.lanchesrapido.cliente.state

import android.content.ContentValues
import android.content.Context
import android.database.sqlite.SQLiteDatabase
import android.database.sqlite.SQLiteOpenHelper
import com.lanchesrapido.cliente.model.Product
import java.time.Instant

data class LocalOrderLine(val name: String, val price: Double, val quantity: Int)

data class LocalOrder(
    val id: Long,
    val number: Int,
    val customer: String,
    val phone: String,
    val type: String,
    val status: String,
    val payment: String,
    val address: String,
    val note: String,
    val deliveryFee: Double,
    val total: Double,
    val createdAt: String,
    val lines: List<LocalOrderLine>,
)

data class CashSnapshot(
    val isOpen: Boolean,
    val sessionId: Long?,
    val opening: Double,
    val sales: Double,
    val deposits: Double,
    val withdrawals: Double,
    val balance: Double,
    val openedAt: String?,
)

data class CashHistory(
    val openedAt: String,
    val closedAt: String,
    val opening: Double,
    val closing: Double,
    val sales: Double,
    val deposits: Double,
    val withdrawals: Double,
    val expected: Double,
)

class LocalStore(context: Context) : SQLiteOpenHelper(context, "lanches-pdv.db", null, 1) {
    init {
        setWriteAheadLoggingEnabled(true)
    }

    override fun onCreate(db: SQLiteDatabase) {
        db.execSQL(
            """CREATE TABLE products (
                id TEXT PRIMARY KEY, name TEXT NOT NULL, description TEXT NOT NULL DEFAULT '',
                price REAL NOT NULL CHECK(price >= 0), active INTEGER NOT NULL DEFAULT 1
            )""",
        )
        db.execSQL(
            """CREATE TABLE cash_sessions (
                id INTEGER PRIMARY KEY AUTOINCREMENT, opened_at TEXT NOT NULL, closed_at TEXT,
                opening REAL NOT NULL, closing REAL
            )""",
        )
        db.execSQL(
            """CREATE TABLE orders (
                id INTEGER PRIMARY KEY AUTOINCREMENT, number INTEGER NOT NULL, customer TEXT NOT NULL,
                phone TEXT NOT NULL DEFAULT '', type TEXT NOT NULL, status TEXT NOT NULL, payment TEXT NOT NULL,
                address TEXT NOT NULL DEFAULT '', note TEXT NOT NULL, delivery_fee REAL NOT NULL DEFAULT 0,
                total REAL NOT NULL, created_at TEXT NOT NULL, deleted_at TEXT,
                cash_session_id INTEGER NOT NULL REFERENCES cash_sessions(id)
            )""",
        )
        db.execSQL(
            """CREATE TABLE order_items (
                id INTEGER PRIMARY KEY AUTOINCREMENT, order_id INTEGER NOT NULL REFERENCES orders(id) ON DELETE CASCADE,
                name TEXT NOT NULL, price REAL NOT NULL, quantity INTEGER NOT NULL
            )""",
        )
        db.execSQL(
            """CREATE TABLE cash_entries (
                id INTEGER PRIMARY KEY AUTOINCREMENT, session_id INTEGER NOT NULL REFERENCES cash_sessions(id),
                kind TEXT NOT NULL CHECK(kind IN ('deposit', 'withdraw')), value REAL NOT NULL CHECK(value > 0),
                description TEXT NOT NULL, created_at TEXT NOT NULL
            )""",
        )
        db.execSQL("CREATE INDEX orders_session_idx ON orders(cash_session_id, status)")
        db.execSQL("CREATE INDEX orders_trash_idx ON orders(deleted_at)")
        seedProducts(db)
    }

    override fun onUpgrade(db: SQLiteDatabase, oldVersion: Int, newVersion: Int) = Unit

    override fun onConfigure(db: SQLiteDatabase) {
        super.onConfigure(db)
        db.setForeignKeyConstraintsEnabled(true)
    }

    private fun seedProducts(db: SQLiteDatabase) {
        val products = listOf(
            Triple("X-Burger", "Pão, hambúrguer, queijo e maionese", 15.0),
            Triple("X-Salada", "Com alface e tomate", 16.0),
            Triple("X-Bacon", "Com bacon crocante e cheddar", 18.0),
            Triple("X-Tudo", "Tudo que tem direito", 22.0),
            Triple("Batata Frita", "Porção 300g", 10.0),
            Triple("Nuggets", "Porção 8 unidades", 12.0),
            Triple("Refrigerante Lata", "Coca-Cola, Guaraná ou Fanta", 6.0),
            Triple("Refrigerante 600ml", "Coca-Cola, Guaraná ou Fanta", 8.0),
            Triple("Suco Natural", "Laranja ou limão", 8.0),
            Triple("Água Mineral", "Garrafa 500ml", 4.0),
            Triple("Água com Gás", "Garrafa 500ml", 4.5),
            Triple("Milk Shake", "Chocolate, morango ou baunilha", 12.0),
        )
        products.forEachIndexed { index, (name, description, price) ->
            val values = ContentValues().apply {
                put("id", "local-${index + 1}")
                put("name", name)
                put("description", description)
                put("price", price)
            }
            db.insertOrThrow("products", null, values)
        }
    }

    fun products(): List<Product> {
        val result = mutableListOf<Product>()
        readableDatabase.query("products", null, "active = 1", null, null, null, "name COLLATE NOCASE").use { cursor ->
            while (cursor.moveToNext()) {
                result += Product(
                    id = cursor.getString(cursor.getColumnIndexOrThrow("id")),
                    categoryId = "",
                    name = cursor.getString(cursor.getColumnIndexOrThrow("name")),
                    description = cursor.getString(cursor.getColumnIndexOrThrow("description")),
                    price = cursor.getDouble(cursor.getColumnIndexOrThrow("price")),
                )
            }
        }
        return result
    }

    fun addProduct(name: String, price: Double) {
        require(name.isNotBlank()) { "Informe o nome do produto." }
        require(price >= 0.0 && price.isFinite()) { "Informe um preço válido." }
        val values = ContentValues().apply {
            put("id", "custom-${java.util.UUID.randomUUID()}")
            put("name", name.trim().take(60))
            put("price", price)
            put("description", "")
        }
        writableDatabase.insertOrThrow("products", null, values)
    }

    fun currentCash(): CashSnapshot {
        val db = readableDatabase
        val session = db.rawQuery(
            "SELECT id, opened_at, opening FROM cash_sessions WHERE closed_at IS NULL ORDER BY id DESC LIMIT 1",
            null,
        ).use { cursor ->
            if (cursor.moveToFirst()) Triple(
                cursor.getLong(0),
                cursor.getString(1),
                cursor.getDouble(2),
            ) else null
        } ?: return CashSnapshot(false, null, 0.0, 0.0, 0.0, 0.0, 0.0, null)
        val sales = sumForSession(db, session.first, "SELECT COALESCE(SUM(total), 0) FROM orders WHERE cash_session_id = ? AND status IN ('finished', 'delivered')")
        val deposits = sumForSession(db, session.first, "SELECT COALESCE(SUM(value), 0) FROM cash_entries WHERE session_id = ? AND kind = 'deposit'")
        val withdrawals = sumForSession(db, session.first, "SELECT COALESCE(SUM(value), 0) FROM cash_entries WHERE session_id = ? AND kind = 'withdraw'")
        val balance = session.third + sales + deposits - withdrawals
        return CashSnapshot(true, session.first, session.third, sales, deposits, withdrawals, balance, session.second)
    }

    private fun sumForSession(db: SQLiteDatabase, id: Long, sql: String): Double =
        db.rawQuery(sql, arrayOf(id.toString())).use { cursor ->
            if (cursor.moveToFirst()) cursor.getDouble(0) else 0.0
        }

    fun openCash(opening: Double) {
        require(opening >= 0.0 && opening.isFinite()) { "Informe um saldo inicial válido." }
        val db = writableDatabase
        db.beginTransaction()
        try {
            val alreadyOpen = db.rawQuery("SELECT 1 FROM cash_sessions WHERE closed_at IS NULL LIMIT 1", null).use { it.moveToFirst() }
            check(!alreadyOpen) { "O caixa já está aberto." }
            db.insertOrThrow(
                "cash_sessions",
                null,
                ContentValues().apply {
                    put("opened_at", Instant.now().toString())
                    put("opening", opening)
                },
            )
            db.setTransactionSuccessful()
        } finally {
            db.endTransaction()
        }
    }

    fun closeCash(counted: Double) {
        require(counted >= 0.0 && counted.isFinite()) { "Informe um valor contado válido." }
        val db = writableDatabase
        db.beginTransaction()
        try {
            val sessionId = db.rawQuery(
                "SELECT id FROM cash_sessions WHERE closed_at IS NULL ORDER BY id DESC LIMIT 1",
                null,
            ).use { cursor -> if (cursor.moveToFirst()) cursor.getLong(0) else null }
                ?: error("O caixa não está aberto.")
            val openOrders = db.rawQuery(
                "SELECT COUNT(*) FROM orders WHERE cash_session_id = ? AND status IN ('open', 'preparing')",
                arrayOf(sessionId.toString()),
            ).use { cursor -> cursor.moveToFirst(); cursor.getInt(0) }
            check(openOrders == 0) { "Conclua ou cancele as comandas abertas antes de fechar o caixa." }
            val values = ContentValues().apply {
                put("closed_at", Instant.now().toString())
                put("closing", counted)
            }
            check(db.update("cash_sessions", values, "id = ? AND closed_at IS NULL", arrayOf(sessionId.toString())) == 1) {
                "Não foi possível fechar o caixa."
            }
            db.setTransactionSuccessful()
        } finally {
            db.endTransaction()
        }
    }

    fun addCashEntry(kind: String, value: Double, description: String) {
        require(kind == "deposit" || kind == "withdraw") { "Tipo de lançamento inválido." }
        require(value > 0.0 && value.isFinite()) { "Informe um valor maior que zero." }
        val sessionId = currentCash().sessionId ?: error("Abra o caixa primeiro.")
        writableDatabase.insertOrThrow(
            "cash_entries",
            null,
            ContentValues().apply {
                put("session_id", sessionId)
                put("kind", kind)
                put("value", value)
                put("description", description.trim().take(120))
                put("created_at", Instant.now().toString())
            },
        )
    }

    fun cashHistory(): List<CashHistory> {
        val result = mutableListOf<CashHistory>()
        readableDatabase.query(
            "cash_sessions s",
            arrayOf(
                "s.opened_at",
                "s.closed_at",
                "s.opening",
                "s.closing",
                "COALESCE((SELECT SUM(total) FROM orders WHERE cash_session_id = s.id AND status IN ('finished', 'delivered')), 0)",
                "COALESCE((SELECT SUM(value) FROM cash_entries WHERE session_id = s.id AND kind = 'deposit'), 0)",
                "COALESCE((SELECT SUM(value) FROM cash_entries WHERE session_id = s.id AND kind = 'withdraw'), 0)",
            ),
            "s.closed_at IS NOT NULL",
            null,
            null,
            null,
            "s.id DESC",
            "10",
        ).use { cursor ->
            while (cursor.moveToNext()) {
                val opening = cursor.getDouble(2)
                val sales = cursor.getDouble(4)
                val deposits = cursor.getDouble(5)
                val withdrawals = cursor.getDouble(6)
                result += CashHistory(
                    openedAt = cursor.getString(0),
                    closedAt = cursor.getString(1),
                    opening = opening,
                    closing = cursor.getDouble(3),
                    sales = sales,
                    deposits = deposits,
                    withdrawals = withdrawals,
                    expected = opening + sales + deposits - withdrawals,
                )
            }
        }
        return result
    }

    fun createOrder(
        items: List<Pair<Product, Int>>,
        customer: String,
        phone: String,
        type: String,
        payment: String,
        address: String,
        deliveryFee: Double,
        note: String,
    ): Long {
        require(items.isNotEmpty()) { "Adicione pelo menos um produto." }
        require(type == "counter" || type == "delivery") { "Tipo de pedido inválido." }
        require(deliveryFee >= 0.0 && deliveryFee.isFinite()) { "Informe uma taxa de entrega válida." }
        require(type != "delivery" || address.isNotBlank()) { "Informe o endereço de entrega." }
        val db = writableDatabase
        db.beginTransaction()
        try {
            val cash = db.rawQuery(
                "SELECT id FROM cash_sessions WHERE closed_at IS NULL ORDER BY id DESC LIMIT 1",
                null,
            ).use { cursor -> if (cursor.moveToFirst()) cursor.getLong(0) else null }
                ?: error("Abra o caixa antes de registrar uma comanda.")
            val fee = if (type == "delivery") deliveryFee else 0.0
            val total = items.sumOf { (product, quantity) -> product.price * quantity } + fee
            val orderId = db.insertOrThrow(
                "orders",
                null,
                ContentValues().apply {
                    put("number", 0)
                    put("customer", customer.trim().ifBlank { "Consumidor" }.take(60))
                    put("phone", phone.trim().take(30))
                    put("type", type)
                    put("status", "open")
                    put("payment", payment.take(30))
                    put("address", if (type == "delivery") address.trim().take(200) else "")
                    put("note", note.trim().take(300))
                    put("delivery_fee", fee)
                    put("total", total)
                    put("created_at", Instant.now().toString())
                    put("cash_session_id", cash)
                },
            )
            check(db.update("orders", ContentValues().apply { put("number", orderId) }, "id = ?", arrayOf(orderId.toString())) == 1) {
                "Não foi possível numerar a comanda."
            }
            items.forEach { (product, quantity) ->
                require(quantity > 0) { "Quantidade inválida." }
                db.insertOrThrow(
                    "order_items",
                    null,
                    ContentValues().apply {
                        put("order_id", orderId)
                        put("name", product.name)
                        put("price", product.price)
                        put("quantity", quantity)
                    },
                )
            }
            db.setTransactionSuccessful()
            return orderId
        } finally {
            db.endTransaction()
        }
    }

    fun orders(inTrash: Boolean): List<LocalOrder> {
        val db = readableDatabase
        val result = mutableListOf<LocalOrder>()
        val selection = if (inTrash) "deleted_at IS NOT NULL" else "deleted_at IS NULL"
        db.query("orders", null, selection, null, null, null, "id DESC").use { cursor ->
            while (cursor.moveToNext()) {
                val id = cursor.getLong(cursor.getColumnIndexOrThrow("id"))
                result += LocalOrder(
                    id = id,
                    number = cursor.getInt(cursor.getColumnIndexOrThrow("number")),
                    customer = cursor.getString(cursor.getColumnIndexOrThrow("customer")),
                    phone = cursor.getString(cursor.getColumnIndexOrThrow("phone")),
                    type = cursor.getString(cursor.getColumnIndexOrThrow("type")),
                    status = cursor.getString(cursor.getColumnIndexOrThrow("status")),
                    payment = cursor.getString(cursor.getColumnIndexOrThrow("payment")),
                    address = cursor.getString(cursor.getColumnIndexOrThrow("address")),
                    note = cursor.getString(cursor.getColumnIndexOrThrow("note")),
                    deliveryFee = cursor.getDouble(cursor.getColumnIndexOrThrow("delivery_fee")),
                    total = cursor.getDouble(cursor.getColumnIndexOrThrow("total")),
                    createdAt = cursor.getString(cursor.getColumnIndexOrThrow("created_at")),
                    lines = orderLines(db, id),
                )
            }
        }
        return result
    }

    private fun orderLines(db: SQLiteDatabase, orderId: Long): List<LocalOrderLine> {
        val result = mutableListOf<LocalOrderLine>()
        db.query("order_items", null, "order_id = ?", arrayOf(orderId.toString()), null, null, "id").use { cursor ->
            while (cursor.moveToNext()) {
                result += LocalOrderLine(
                    cursor.getString(cursor.getColumnIndexOrThrow("name")),
                    cursor.getDouble(cursor.getColumnIndexOrThrow("price")),
                    cursor.getInt(cursor.getColumnIndexOrThrow("quantity")),
                )
            }
        }
        return result
    }

    fun updateOrderStatus(id: Long, status: String) {
        require(status in setOf("preparing", "finished", "canceled")) { "Status inválido." }
        check(writableDatabase.update(
            "orders",
            ContentValues().apply { put("status", status) },
            "id = ? AND deleted_at IS NULL",
            arrayOf(id.toString()),
        ) == 1) { "Comanda não encontrada." }
    }

    fun moveOrderToTrash(id: Long) {
        check(writableDatabase.update(
            "orders",
            ContentValues().apply { put("deleted_at", Instant.now().toString()) },
            "id = ? AND deleted_at IS NULL",
            arrayOf(id.toString()),
        ) == 1) { "Comanda não encontrada." }
    }

    fun restoreOrder(id: Long) {
        check(writableDatabase.update(
            "orders",
            ContentValues().apply { putNull("deleted_at") },
            "id = ? AND deleted_at IS NOT NULL",
            arrayOf(id.toString()),
        ) == 1) { "Comanda não encontrada na lixeira." }
    }

    fun deleteOrderPermanently(id: Long) {
        val db = writableDatabase
        db.beginTransaction()
        try {
            val status = db.rawQuery("SELECT status FROM orders WHERE id = ? AND deleted_at IS NOT NULL", arrayOf(id.toString())).use { cursor ->
                if (cursor.moveToFirst()) cursor.getString(0) else null
            }
            check(status != null) { "A comanda não está na lixeira." }
            check(status == "open" || status == "canceled") {
                "Comandas concluídas fazem parte do fechamento e não podem ser apagadas definitivamente."
            }
            db.delete("order_items", "order_id = ?", arrayOf(id.toString()))
            check(db.delete("orders", "id = ? AND deleted_at IS NOT NULL", arrayOf(id.toString())) == 1) {
                "A comanda não está na lixeira."
            }
            db.setTransactionSuccessful()
        } finally {
            db.endTransaction()
        }
    }
}

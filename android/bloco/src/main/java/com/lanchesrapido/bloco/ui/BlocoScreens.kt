package com.lanchesrapido.bloco.ui

import android.content.Intent
import androidx.compose.foundation.background
import androidx.compose.foundation.text.KeyboardOptions
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.Spacer
import androidx.compose.foundation.layout.WindowInsets
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.height
import androidx.compose.foundation.layout.heightIn
import androidx.compose.foundation.layout.navigationBars
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.statusBars
import androidx.compose.foundation.layout.width
import androidx.compose.foundation.layout.windowInsetsPadding
import androidx.compose.foundation.lazy.LazyColumn
import androidx.compose.foundation.lazy.items
import androidx.compose.foundation.rememberScrollState
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.foundation.verticalScroll
import androidx.compose.material3.AlertDialog
import androidx.compose.material3.Button
import androidx.compose.material3.Card
import androidx.compose.material3.CardDefaults
import androidx.compose.material3.FilterChip
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.NavigationBar
import androidx.compose.material3.NavigationBarItem
import androidx.compose.material3.OutlinedButton
import androidx.compose.material3.OutlinedTextField
import androidx.compose.material3.Scaffold
import androidx.compose.material3.Text
import androidx.compose.material3.TextButton
import androidx.compose.ui.text.input.PasswordVisualTransformation
import androidx.compose.ui.text.input.KeyboardType
import androidx.compose.runtime.Composable
import androidx.compose.runtime.LaunchedEffect
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableIntStateOf
import androidx.compose.runtime.mutableLongStateOf
import androidx.compose.runtime.mutableStateListOf
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.rememberCoroutineScope
import androidx.compose.runtime.setValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.platform.LocalContext
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.unit.dp
import com.lanchesrapido.bloco.data.BlocoStore
import com.lanchesrapido.bloco.data.NoteRecord
import com.lanchesrapido.bloco.data.OrderItem
import com.lanchesrapido.bloco.data.OrderRecord
import com.lanchesrapido.bloco.net.BlocoApi
import com.lanchesrapido.bloco.net.ServerInfo
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.delay
import kotlinx.coroutines.launch
import kotlinx.coroutines.withContext
import java.text.SimpleDateFormat
import java.util.Date
import java.util.Locale

private enum class Tab(val label: String, val icon: String) {
    ORDERS("Pedidos", "📋"),
    NOTES("Bloco", "📝"),
    TRASH("Lixeira", "🗑️"),
    SETTINGS("Ajustes", "⚙️"),
}

@Composable
fun BlocoApp() {
    val context = LocalContext.current
    val store = remember(context) { BlocoStore(context.applicationContext) }
    var tab by remember { mutableStateOf(Tab.ORDERS) }
    var revision by remember { mutableIntStateOf(0) }
    val refresh: () -> Unit = { revision++ }

    Scaffold(
        bottomBar = {
            NavigationBar(windowInsets = WindowInsets.navigationBars) {
                Tab.entries.forEach { item ->
                    NavigationBarItem(
                        selected = tab == item,
                        onClick = { tab = item },
                        icon = { Text(item.icon) },
                        label = { Text(item.label) },
                    )
                }
            }
        },
    ) { padding ->
        Box(
            Modifier
                .fillMaxSize()
                .padding(padding)
                .windowInsetsPadding(WindowInsets.statusBars),
        ) {
            when (tab) {
                Tab.ORDERS -> OrdersScreen(store, revision, refresh)
                Tab.NOTES -> NotesScreen(store, revision, refresh)
                Tab.TRASH -> TrashScreen(store, revision, refresh)
                Tab.SETTINGS -> SettingsScreen(store, revision, refresh)
            }
        }
    }
}

@Composable
private fun OrdersScreen(store: BlocoStore, revision: Int, onChanged: () -> Unit) {
    val context = LocalContext.current
    val scope = rememberCoroutineScope()
    var orders by remember { mutableStateOf<List<OrderRecord>>(emptyList()) }
    var hasMore by remember { mutableStateOf(false) }
    var loadingMore by remember { mutableStateOf(false) }
    var error by remember { mutableStateOf("") }
    var showCreate by remember { mutableStateOf(false) }
    var refreshTime by remember { mutableLongStateOf(System.currentTimeMillis()) }

    LaunchedEffect(store, revision) {
        try {
            val page = withContext(Dispatchers.IO) { store.orders(inTrash = false) }
            orders = page.items
            hasMore = page.hasMore
            error = ""
        } catch (e: Exception) {
            error = e.message ?: "Não foi possível carregar os pedidos."
        }
    }
    LaunchedEffect(Unit) {
        while (true) {
            delay(1_000)
            refreshTime = System.currentTimeMillis()
        }
    }

    Column(Modifier.fillMaxSize().padding(horizontal = 16.dp, vertical = 12.dp)) {
        Row(
            Modifier.fillMaxWidth(),
            verticalAlignment = Alignment.CenterVertically,
            horizontalArrangement = Arrangement.SpaceBetween,
        ) {
            Column {
                Text("Bloco de Pedidos", style = MaterialTheme.typography.headlineSmall, fontWeight = FontWeight.Bold)
                Text("Dados salvos somente neste aparelho")
            }
            Button(onClick = { showCreate = true }) { Text("+ Novo") }
        }
        Spacer(Modifier.height(8.dp))
        if (error.isNotBlank()) Text(error, color = MaterialTheme.colorScheme.error)
        if (orders.isEmpty()) {
            Text("Nenhum pedido ativo. Toque em + Novo para começar.")
        } else {
            LazyColumn(
                modifier = Modifier.weight(1f),
                verticalArrangement = Arrangement.spacedBy(8.dp),
            ) {
                items(orders, key = { it.id }) { order ->
                    OrderCard(
                        order = order,
                        nowMillis = refreshTime,
                        onPrint = {
                            scope.launch {
                                try {
                                    BlocoApi.printOrder(context, order)
                                    error = "Pedido #${order.number} enviado para a impressora."
                                } catch (e: Exception) {
                                    error = e.message ?: "Não foi possível imprimir o pedido."
                                }
                            }
                        },
                        onStatus = { status ->
                            scope.launch {
                                try {
                                    withContext(Dispatchers.IO) { store.updateOrderStatus(order.id, status) }
                                    error = ""
                                    onChanged()
                                } catch (e: Exception) {
                                    error = e.message ?: "Não foi possível atualizar o pedido."
                                }
                            }
                        },
                        onArchive = {
                            scope.launch {
                                try {
                                    withContext(Dispatchers.IO) { store.moveOrderToTrash(order.id) }
                                    error = ""
                                    onChanged()
                                } catch (e: Exception) {
                                    error = e.message ?: "Não foi possível arquivar o pedido."
                                }
                            }
                        },
                    )
                }
                if (hasMore) {
                    item {
                        OutlinedButton(
                            enabled = !loadingMore,
                            onClick = {
                                val beforeId = orders.lastOrNull()?.id ?: return@OutlinedButton
                                loadingMore = true
                                scope.launch {
                                    try {
                                        val page = withContext(Dispatchers.IO) { store.orders(false, beforeId) }
                                        orders = orders + page.items
                                        hasMore = page.hasMore
                                        error = ""
                                    } catch (e: Exception) {
                                        error = e.message ?: "Não foi possível carregar mais pedidos."
                                    } finally {
                                        loadingMore = false
                                    }
                                }
                            },
                            modifier = Modifier.fillMaxWidth(),
                        ) { Text(if (loadingMore) "Carregando…" else "Carregar pedidos anteriores") }
                    }
                }
            }
        }
    }

    if (showCreate) {
        NewOrderDialog(
            store = store,
            onDismiss = { showCreate = false },
            onSaved = {
                showCreate = false
                onChanged()
            },
        )
    }
}

@Composable
private fun OrderCard(
    order: OrderRecord,
    nowMillis: Long,
    onPrint: () -> Unit,
    onStatus: (String) -> Unit,
    onArchive: () -> Unit,
) {
    val context = LocalContext.current
    val elapsed = order.elapsedMillis +
        if (order.status == "preparing" && order.startedAtMillis != null) {
            (nowMillis - order.startedAtMillis).coerceAtLeast(0L)
        } else {
            0L
        }
    val overdue = order.status == "preparing" && elapsed >= order.limitMinutes * 60_000L
    val total = order.items.sumOf { it.price * it.quantity }
    Card(
        colors = CardDefaults.cardColors(
            containerColor = if (overdue) MaterialTheme.colorScheme.errorContainer else MaterialTheme.colorScheme.surfaceVariant,
        ),
    ) {
        Column(
            Modifier.fillMaxWidth().padding(12.dp),
            verticalArrangement = Arrangement.spacedBy(5.dp),
        ) {
            Text(
                "#${order.number} · ${order.customer}",
                fontWeight = FontWeight.Bold,
                style = MaterialTheme.typography.titleMedium,
            )
            Text("${if (order.type == "entrega") "Entrega" else "Retirada"} · ${statusLabel(order.status)} · ${order.payment}")
            Text("Criado ${formatDate(order.createdAtMillis)}")
            order.items.forEach { Text("${it.quantity}× ${it.name} · ${formatMoney(it.price * it.quantity)}") }
            if (order.type == "entrega" && order.address.isNotBlank()) Text("Endereço: ${order.address}")
            if (order.phone.isNotBlank()) Text("Telefone: ${order.phone}")
            if (order.note.isNotBlank()) Text("Obs.: ${order.note}")
            Text("Total ${formatMoney(total)}", color = MaterialTheme.colorScheme.primary, fontWeight = FontWeight.Bold)
            if (order.status == "preparing" || order.status == "paused") {
                val remaining = order.limitMinutes * 60_000L - elapsed
                Text(
                    if (overdue) "ATRASADO · ${formatDuration(-remaining)} além do prazo"
                    else "${if (order.status == "paused") "Pausado" else "Preparo"} · ${formatDuration(remaining)} restantes",
                    color = if (overdue) MaterialTheme.colorScheme.error else MaterialTheme.colorScheme.onSurface,
                    fontWeight = FontWeight.SemiBold,
                )
            } else {
                Text("Prazo: ${order.limitMinutes} min")
            }
            Row(horizontalArrangement = Arrangement.spacedBy(6.dp)) {
                OutlinedButton(onClick = onPrint) { Text("🖨 Imprimir") }
                when (order.status) {
                    "open" -> {
                        Button(onClick = { onStatus("preparing") }) { Text("Iniciar") }
                        OutlinedButton(onClick = { onStatus("canceled") }) { Text("Cancelar") }
                    }
                    "preparing" -> {
                        OutlinedButton(onClick = { onStatus("paused") }) { Text("Pausar") }
                        Button(onClick = { onStatus("done") }) { Text("Concluir") }
                    }
                    "paused" -> {
                        OutlinedButton(onClick = { onStatus("preparing") }) { Text("Retomar") }
                        Button(onClick = { onStatus("done") }) { Text("Concluir") }
                    }
                    "done", "canceled" -> TextButton(onClick = onArchive) { Text("Mover para lixeira") }
                }
                TextButton(
                    onClick = {
                        val text = buildString {
                            appendLine("Pedido #${order.number} - ${order.customer}")
                            appendLine(order.items.joinToString("\n") { "${it.quantity}x ${it.name}" })
                            if (order.type == "entrega") appendLine("Entrega: ${order.address}")
                            appendLine("Total: ${formatMoney(total)}")
                            if (order.note.isNotBlank()) appendLine("Obs.: ${order.note}")
                        }
                        context.startActivity(Intent.createChooser(
                            Intent(Intent.ACTION_SEND).apply {
                                type = "text/plain"
                                putExtra(Intent.EXTRA_TEXT, text)
                            },
                            "Compartilhar pedido",
                        ))
                    },
                ) { Text("Compartilhar") }
            }
        }
    }
}

private data class DraftItem(val name: String = "", val quantity: String = "1", val price: String = "")

@Composable
private fun NewOrderDialog(store: BlocoStore, onDismiss: () -> Unit, onSaved: () -> Unit) {
    val scope = rememberCoroutineScope()
    var customer by remember { mutableStateOf("") }
    var phone by remember { mutableStateOf("") }
    var address by remember { mutableStateOf("") }
    var note by remember { mutableStateOf("") }
    var payment by remember { mutableStateOf("Pix") }
    var type by remember { mutableStateOf("retirada") }
    var limit by remember { mutableStateOf("20") }
    var error by remember { mutableStateOf("") }
    var saving by remember { mutableStateOf(false) }
    val items = remember { mutableStateListOf(DraftItem()) }

    LaunchedEffect(store) {
        try {
            limit = withContext(Dispatchers.IO) { store.settings().defaultLimitMinutes }.toString()
        } catch (e: Exception) {
            error = e.message ?: "Não foi possível ler o prazo padrão."
        }
    }

    AlertDialog(
        onDismissRequest = onDismiss,
        title = { Text("Novo pedido") },
        text = {
            Column(
                Modifier.fillMaxWidth().heightIn(max = 560.dp).verticalScroll(rememberScrollState()),
                verticalArrangement = Arrangement.spacedBy(8.dp),
            ) {
                OutlinedTextField(customer, { customer = it }, label = { Text("Cliente *") }, singleLine = true)
                OutlinedTextField(phone, { phone = it }, label = { Text("Telefone") }, singleLine = true)
                Row(horizontalArrangement = Arrangement.spacedBy(8.dp)) {
                    FilterChip(type == "retirada", { type = "retirada" }, label = { Text("Retirada") })
                    FilterChip(type == "entrega", { type = "entrega" }, label = { Text("Entrega") })
                }
                if (type == "entrega") {
                    OutlinedTextField(address, { address = it }, label = { Text("Endereço *") })
                }
                items.forEachIndexed { index, item ->
                    Card {
                        Column(
                            Modifier.fillMaxWidth().padding(8.dp),
                            verticalArrangement = Arrangement.spacedBy(6.dp),
                        ) {
                            OutlinedTextField(
                                value = item.name,
                                onValueChange = { items[index] = item.copy(name = it) },
                                label = { Text("Item ${index + 1} *") },
                                singleLine = true,
                                modifier = Modifier.fillMaxWidth(),
                            )
                            Row(verticalAlignment = Alignment.CenterVertically) {
                                OutlinedTextField(
                                    value = item.quantity,
                                    onValueChange = { items[index] = item.copy(quantity = it.filter(Char::isDigit).take(4)) },
                                    label = { Text("Qtd.") },
                                    singleLine = true,
                                    modifier = Modifier.weight(1f),
                                )
                                Spacer(Modifier.width(8.dp))
                                OutlinedTextField(
                                    value = item.price,
                                    onValueChange = { items[index] = item.copy(price = it.take(12)) },
                                    label = { Text("Preço R$") },
                                    singleLine = true,
                                    modifier = Modifier.weight(1.5f),
                                )
                                if (items.size > 1) {
                                    TextButton(onClick = { items.removeAt(index) }) { Text("−") }
                                }
                            }
                        }
                    }
                }
                OutlinedButton(onClick = { items.add(DraftItem()) }) { Text("+ Adicionar item") }
                Row(horizontalArrangement = Arrangement.spacedBy(6.dp)) {
                    listOf("Pix", "Dinheiro", "Cartão", "A combinar").forEach { option ->
                        FilterChip(payment == option, { payment = option }, label = { Text(option) })
                    }
                }
                OutlinedTextField(limit, { limit = it.filter(Char::isDigit).take(4) }, label = { Text("Prazo em minutos") }, singleLine = true)
                OutlinedTextField(note, { note = it }, label = { Text("Observação") })
                if (error.isNotBlank()) Text(error, color = MaterialTheme.colorScheme.error)
            }
        },
        confirmButton = {
            TextButton(
                enabled = !saving,
                onClick = {
                    val parsedItems = items.map { item ->
                        val quantity = item.quantity.toIntOrNull() ?: 0
                        val price = item.price.replace(',', '.').toDoubleOrNull()
                        if (item.name.isBlank() || quantity <= 0 || price == null || !price.isFinite() || price < 0.0) {
                            null
                        } else {
                            OrderItem(item.name, quantity, price)
                        }
                    }
                    val minutes = limit.toIntOrNull()
                    if (parsedItems.any { it == null }) {
                        error = "Confira nome, quantidade e preço de cada item."
                    } else if (minutes == null || minutes !in 1..1440) {
                        error = "Informe um prazo entre 1 e 1440 minutos."
                    } else {
                        saving = true
                        scope.launch {
                            try {
                                withContext(Dispatchers.IO) {
                                    store.createOrder(
                                        customer = customer,
                                        phone = phone,
                                        type = type,
                                        address = address,
                                        note = note,
                                        payment = payment,
                                        limitMinutes = minutes,
                                        items = parsedItems.filterNotNull(),
                                    )
                                }
                                onSaved()
                            } catch (e: Exception) {
                                error = e.message ?: "Não foi possível salvar o pedido."
                                saving = false
                            }
                        }
                    }
                },
            ) { Text(if (saving) "Salvando…" else "Salvar pedido") }
        },
        dismissButton = { TextButton(onClick = onDismiss, enabled = !saving) { Text("Cancelar") } },
    )
}

@Composable
private fun NotesScreen(store: BlocoStore, revision: Int, onChanged: () -> Unit) {
    val context = LocalContext.current
    val scope = rememberCoroutineScope()
    var notes by remember { mutableStateOf<List<NoteRecord>>(emptyList()) }
    var hasMore by remember { mutableStateOf(false) }
    var loadingMore by remember { mutableStateOf(false) }
    var text by remember { mutableStateOf("") }
    var color by remember { mutableStateOf("amarelo") }
    var error by remember { mutableStateOf("") }
    var confirmClear by remember { mutableStateOf(false) }
    var busy by remember { mutableStateOf(false) }

    LaunchedEffect(store, revision) {
        try {
            val page = withContext(Dispatchers.IO) { store.notes() }
            notes = page.items
            hasMore = page.hasMore
            error = ""
        } catch (e: Exception) {
            error = e.message ?: "Não foi possível carregar os lembretes."
        }
    }

    Column(Modifier.fillMaxSize().padding(16.dp), verticalArrangement = Arrangement.spacedBy(8.dp)) {
        Text("Bloco de notas", style = MaterialTheme.typography.headlineSmall, fontWeight = FontWeight.Bold)
        OutlinedTextField(
            value = text,
            onValueChange = { text = it },
            label = { Text("Novo lembrete") },
            modifier = Modifier.fillMaxWidth(),
        )
        Row(horizontalArrangement = Arrangement.spacedBy(4.dp)) {
            BlocoStore.NOTE_COLORS.forEach { option ->
                FilterChip(color == option, { color = option }, label = { Text(option.replaceFirstChar(Char::uppercase)) })
            }
        }
        Row(horizontalArrangement = Arrangement.spacedBy(8.dp)) {
            Button(
                enabled = text.isNotBlank() && !busy,
                onClick = {
                    busy = true
                    scope.launch {
                        try {
                            withContext(Dispatchers.IO) { store.addNote(text, color) }
                            text = ""
                            error = ""
                            onChanged()
                        } catch (e: Exception) {
                            error = e.message ?: "Não foi possível salvar o lembrete."
                        } finally {
                            busy = false
                        }
                    }
                },
            ) { Text("Salvar lembrete") }
            OutlinedButton(
                enabled = notes.any { it.done } && !busy,
                onClick = { confirmClear = true },
            ) { Text("Limpar concluídos") }
            OutlinedButton(
                enabled = notes.isNotEmpty() && !busy,
                onClick = {
                    busy = true
                    scope.launch {
                        try {
                            val allNotes = withContext(Dispatchers.IO) { store.notesForPrint() }
                            BlocoApi.printNotes(context, allNotes)
                            error = "Bloco de notas enviado para a impressora."
                        } catch (e: Exception) {
                            error = e.message ?: "Não foi possível imprimir o bloco."
                        } finally {
                            busy = false
                        }
                    }
                },
            ) { Text("Imprimir bloco") }
        }
        if (error.isNotBlank()) Text(error, color = MaterialTheme.colorScheme.error)
        if (notes.isEmpty()) {
            Text("Seus post-its ficam salvos neste aparelho.")
        } else {
            LazyColumn(verticalArrangement = Arrangement.spacedBy(8.dp)) {
                items(notes, key = { it.id }) { item ->
                    Card(
                        colors = CardDefaults.cardColors(containerColor = noteColor(item.color)),
                        onClick = {
                            scope.launch {
                                try {
                                    withContext(Dispatchers.IO) { store.toggleNote(item.id) }
                                    error = ""
                                    onChanged()
                                } catch (e: Exception) {
                                    error = e.message ?: "Não foi possível atualizar o lembrete."
                                }
                            }
                        },
                    ) {
                        Row(
                            Modifier.fillMaxWidth().padding(12.dp),
                            verticalAlignment = Alignment.CenterVertically,
                            horizontalArrangement = Arrangement.SpaceBetween,
                        ) {
                            Text(
                                if (item.done) "✓ ${item.text}" else item.text,
                                modifier = Modifier.weight(1f),
                                color = if (item.done) Color.DarkGray else Color.Black,
                            )
                            TextButton(onClick = {
                                scope.launch {
                                    try {
                                        withContext(Dispatchers.IO) { store.deleteNote(item.id) }
                                        error = ""
                                        onChanged()
                                    } catch (e: Exception) {
                                        error = e.message ?: "Não foi possível excluir o lembrete."
                                    }
                                }
                            }) { Text("Excluir") }
                        }
                    }
                }
                if (hasMore) {
                    item {
                        OutlinedButton(
                            enabled = !loadingMore,
                            onClick = {
                                val beforeId = notes.minOfOrNull { it.id } ?: return@OutlinedButton
                                loadingMore = true
                                scope.launch {
                                    try {
                                        val page = withContext(Dispatchers.IO) { store.notes(beforeId) }
                                        notes = notes + page.items
                                        hasMore = page.hasMore
                                        error = ""
                                    } catch (e: Exception) {
                                        error = e.message ?: "Não foi possível carregar mais lembretes."
                                    } finally {
                                        loadingMore = false
                                    }
                                }
                            },
                            modifier = Modifier.fillMaxWidth(),
                        ) { Text(if (loadingMore) "Carregando…" else "Carregar lembretes anteriores") }
                    }
                }
            }
        }
    }

    if (confirmClear) {
        AlertDialog(
            onDismissRequest = { confirmClear = false },
            title = { Text("Limpar lembretes concluídos?") },
            text = { Text("Somente os lembretes marcados como concluídos serão apagados.") },
            confirmButton = {
                TextButton(onClick = {
                    confirmClear = false
                    scope.launch {
                        try {
                            withContext(Dispatchers.IO) { store.clearCompletedNotes() }
                            error = ""
                            onChanged()
                        } catch (e: Exception) {
                            error = e.message ?: "Não foi possível limpar os lembretes."
                        }
                    }
                }) { Text("Limpar") }
            },
            dismissButton = { TextButton(onClick = { confirmClear = false }) { Text("Cancelar") } },
        )
    }
}

@Composable
private fun TrashScreen(store: BlocoStore, revision: Int, onChanged: () -> Unit) {
    val scope = rememberCoroutineScope()
    var orders by remember { mutableStateOf<List<OrderRecord>>(emptyList()) }
    var hasMore by remember { mutableStateOf(false) }
    var loadingMore by remember { mutableStateOf(false) }
    var error by remember { mutableStateOf("") }
    var confirmEmpty by remember { mutableStateOf(false) }
    var pendingDelete by remember { mutableStateOf<OrderRecord?>(null) }
    var busy by remember { mutableStateOf(false) }

    LaunchedEffect(store, revision) {
        try {
            val page = withContext(Dispatchers.IO) { store.orders(inTrash = true) }
            orders = page.items
            hasMore = page.hasMore
            error = ""
        } catch (e: Exception) {
            error = e.message ?: "Não foi possível carregar a lixeira."
        }
    }

    Column(Modifier.fillMaxSize().padding(16.dp), verticalArrangement = Arrangement.spacedBy(8.dp)) {
        Row(
            Modifier.fillMaxWidth(),
            horizontalArrangement = Arrangement.SpaceBetween,
            verticalAlignment = Alignment.CenterVertically,
        ) {
            Column {
                Text("Lixeira", style = MaterialTheme.typography.headlineSmall, fontWeight = FontWeight.Bold)
                Text("Pedidos arquivados carregados: ${orders.size}${if (hasMore) "+" else ""}")
            }
            TextButton(enabled = orders.isNotEmpty() && !busy, onClick = { confirmEmpty = true }) {
                Text("Esvaziar")
            }
        }
        Text("Pedidos concluídos ou cancelados podem ser restaurados ou apagados para sempre.")
        if (error.isNotBlank()) Text(error, color = MaterialTheme.colorScheme.error)
        if (orders.isEmpty()) {
            Text("A lixeira está vazia.")
        } else {
            LazyColumn(verticalArrangement = Arrangement.spacedBy(8.dp)) {
                items(orders, key = { it.id }) { order ->
                    Card {
                        Column(Modifier.fillMaxWidth().padding(12.dp)) {
                            Text("#${order.number} · ${order.customer}", fontWeight = FontWeight.Bold)
                            Text("${statusLabel(order.status)} · ${formatDate(order.createdAtMillis)}")
                            TextButton(
                                enabled = !busy,
                                onClick = {
                                    busy = true
                                    scope.launch {
                                        try {
                                            withContext(Dispatchers.IO) { store.restoreOrder(order.id) }
                                            error = ""
                                            onChanged()
                                        } catch (e: Exception) {
                                            error = e.message ?: "Não foi possível restaurar o pedido."
                                        } finally {
                                            busy = false
                                        }
                                    }
                                },
                            ) { Text("Restaurar") }
                            TextButton(enabled = !busy, onClick = { pendingDelete = order }) {
                                Text("Excluir para sempre")
                            }
                        }
                    }
                }
                if (hasMore) {
                    item {
                        OutlinedButton(
                            enabled = !loadingMore,
                            onClick = {
                                val beforeId = orders.lastOrNull()?.id ?: return@OutlinedButton
                                loadingMore = true
                                scope.launch {
                                    try {
                                        val page = withContext(Dispatchers.IO) { store.orders(true, beforeId) }
                                        orders = orders + page.items
                                        hasMore = page.hasMore
                                        error = ""
                                    } catch (e: Exception) {
                                        error = e.message ?: "Não foi possível carregar mais itens da lixeira."
                                    } finally {
                                        loadingMore = false
                                    }
                                }
                            },
                            modifier = Modifier.fillMaxWidth(),
                        ) { Text(if (loadingMore) "Carregando…" else "Carregar itens anteriores") }
                    }
                }
            }
        }
    }

    if (confirmEmpty) {
        AlertDialog(
            onDismissRequest = { confirmEmpty = false },
            title = { Text("Esvaziar lixeira?") },
            text = { Text("Todos os pedidos arquivados e seus itens serão removidos permanentemente. Pedidos ativos, lembretes e configurações serão preservados. Essa ação não pode ser desfeita.") },
            confirmButton = {
                TextButton(enabled = !busy, onClick = {
                    confirmEmpty = false
                    busy = true
                    scope.launch {
                        try {
                            withContext(Dispatchers.IO) { store.emptyTrash() }
                            error = ""
                            onChanged()
                        } catch (e: Exception) {
                            error = e.message ?: "Não foi possível esvaziar a lixeira."
                        } finally {
                            busy = false
                        }
                    }
                }) { Text("Apagar definitivamente") }
            },
            dismissButton = { TextButton(onClick = { confirmEmpty = false }) { Text("Cancelar") } },
        )
    }

    pendingDelete?.let { order ->
        AlertDialog(
            onDismissRequest = { pendingDelete = null },
            title = { Text("Excluir pedido para sempre?") },
            text = { Text("O pedido #${order.number} e seus itens serão apagados somente deste aparelho.") },
            confirmButton = {
                TextButton(enabled = !busy, onClick = {
                    pendingDelete = null
                    busy = true
                    scope.launch {
                        try {
                            withContext(Dispatchers.IO) { store.deleteOrderPermanently(order.id) }
                            error = ""
                            onChanged()
                        } catch (e: Exception) {
                            error = e.message ?: "Não foi possível excluir o pedido."
                        } finally {
                            busy = false
                        }
                    }
                }) { Text("Excluir") }
            },
            dismissButton = { TextButton(onClick = { pendingDelete = null }) { Text("Cancelar") } },
        )
    }
}

@Composable
private fun SettingsScreen(store: BlocoStore, revision: Int, onChanged: () -> Unit) {
    val context = LocalContext.current
    val scope = rememberCoroutineScope()
    var storeName by remember { mutableStateOf("") }
    var limit by remember { mutableStateOf("20") }
    var serverUrl by remember { mutableStateOf("") }
    var serverPin by remember { mutableStateOf("") }
    var error by remember { mutableStateOf("") }
    var success by remember { mutableStateOf("") }
    var saving by remember { mutableStateOf(false) }
    var busy by remember { mutableStateOf(false) }
    var serverInfo by remember { mutableStateOf<ServerInfo?>(null) }
    var transferAction by remember { mutableStateOf<String?>(null) }

    LaunchedEffect(store, revision) {
        try {
            val settings = withContext(Dispatchers.IO) { store.settings() }
            storeName = settings.storeName
            limit = settings.defaultLimitMinutes.toString()
            error = ""
        } catch (e: Exception) {
            error = e.message ?: "Não foi possível carregar os ajustes."
        }
    }
    LaunchedEffect(context) {
        val connection = BlocoApi.loadConnection(context)
        serverUrl = connection.baseUrl
        serverPin = connection.pin
    }

    Column(
        Modifier.fillMaxSize().padding(16.dp).verticalScroll(rememberScrollState()),
        verticalArrangement = Arrangement.spacedBy(10.dp),
    ) {
        Text("Ajustes", style = MaterialTheme.typography.headlineSmall, fontWeight = FontWeight.Bold)
        OutlinedTextField(
            value = storeName,
            onValueChange = { storeName = it },
            label = { Text("Nome da loja") },
            modifier = Modifier.fillMaxWidth(),
            singleLine = true,
        )
        OutlinedTextField(
            value = limit,
            onValueChange = { limit = it.filter(Char::isDigit).take(4) },
            label = { Text("Prazo padrão (minutos)") },
            modifier = Modifier.fillMaxWidth(),
            singleLine = true,
        )
        Button(
            enabled = !saving,
            onClick = {
                val minutes = limit.toIntOrNull()
                if (storeName.isBlank()) {
                    error = "Informe o nome da loja."
                } else if (minutes == null || minutes !in 1..1440) {
                    error = "O prazo deve ficar entre 1 e 1440 minutos."
                } else {
                    saving = true
                    scope.launch {
                        try {
                            withContext(Dispatchers.IO) { store.saveSettings(storeName, minutes) }
                            error = ""
                            success = "Ajustes salvos."
                            onChanged()
                        } catch (e: Exception) {
                            error = e.message ?: "Não foi possível salvar os ajustes."
                        } finally {
                            saving = false
                        }
                    }
                }
            },
        ) { Text(if (saving) "Salvando…" else "Salvar ajustes") }
        if (error.isNotBlank()) Text(error, color = MaterialTheme.colorScheme.error)
        if (success.isNotBlank()) Text(success, color = MaterialTheme.colorScheme.primary)
        Spacer(Modifier.height(6.dp))
        Text("Conectar ao Bloco de Pedidos do computador", style = MaterialTheme.typography.titleMedium, fontWeight = FontWeight.SemiBold)
        Text("Digite o IP do computador na rede Wi-Fi e o PIN usado no Bloco de Pedidos. Exemplo: 192.168.1.20:4191")
        OutlinedTextField(
            value = serverUrl,
            onValueChange = { serverUrl = it },
            label = { Text("Endereço do servidor") },
            placeholder = { Text("192.168.1.20:4191") },
            modifier = Modifier.fillMaxWidth(),
            singleLine = true,
            enabled = !busy,
            keyboardOptions = KeyboardOptions(keyboardType = KeyboardType.Uri),
        )
        OutlinedTextField(
            value = serverPin,
            onValueChange = { serverPin = it },
            label = { Text("PIN do servidor") },
            modifier = Modifier.fillMaxWidth(),
            singleLine = true,
            enabled = !busy,
            visualTransformation = PasswordVisualTransformation(),
            keyboardOptions = KeyboardOptions(keyboardType = KeyboardType.NumberPassword),
        )
        Row(horizontalArrangement = Arrangement.spacedBy(8.dp)) {
            Button(
                enabled = !busy && serverUrl.isNotBlank() && serverPin.isNotBlank(),
                onClick = {
                    try {
                        BlocoApi.saveConnection(context, serverUrl, serverPin)
                        busy = true
                        error = ""
                        success = ""
                        scope.launch {
                            try {
                                serverInfo = BlocoApi.testConnection(context)
                                success = "Conectado a ${serverInfo?.storeName}."
                            } catch (e: Exception) {
                                error = e.message ?: "Não foi possível conectar."
                                serverInfo = null
                            } finally {
                                busy = false
                            }
                        }
                    } catch (e: Exception) {
                        error = e.message ?: "Confira o endereço e o PIN."
                    }
                },
            ) { Text(if (busy) "Conectando…" else "Testar conexão") }
            OutlinedButton(
                enabled = !busy && serverInfo != null,
                onClick = {
                    try {
                        BlocoApi.saveConnection(context, serverUrl, serverPin)
                        transferAction = "import"
                    } catch (e: Exception) {
                        error = e.message ?: "Confira o endereço e o PIN."
                    }
                },
            ) { Text("Importar") }
            OutlinedButton(
                enabled = !busy && serverInfo != null,
                onClick = {
                    try {
                        BlocoApi.saveConnection(context, serverUrl, serverPin)
                        transferAction = "export"
                    } catch (e: Exception) {
                        error = e.message ?: "Confira o endereço e o PIN."
                    }
                },
            ) { Text("Exportar") }
        }
        serverInfo?.let { info ->
            Text("Conectado: ${info.storeName}")
            val mode = info.printer.optString("mode", "auto")
            val ip = info.printer.optString("ip")
            Text(if (ip.isNotBlank()) "Impressora configurada: $ip:${info.printer.optInt("port", 9100)} ($mode)" else "Impressora não configurada no computador.")
            OutlinedButton(
                enabled = !busy && ip.isNotBlank() && mode != "bluetooth" && mode != "sistema",
                onClick = {
                    busy = true
                    error = ""
                    success = ""
                    scope.launch {
                        try {
                            BlocoApi.printTest(context)
                            success = "Teste enviado para a impressora."
                        } catch (e: Exception) {
                            error = e.message ?: "Não foi possível imprimir o teste."
                        } finally {
                            busy = false
                        }
                    }
                },
            ) { Text(if (busy) "Enviando…" else "Imprimir teste") }
        }
        Text("Use a Lixeira para restaurar ou apagar o histórico. Limpar a lixeira não remove pedidos ativos, lembretes em aberto ou ajustes.")
        Text("Para instalar atualizações, instale o novo APK sem desinstalar o app. Desinstalar o app apaga o banco local.")
        Text("Compartilhar pedido abre as opções de compartilhamento do Android, incluindo WhatsApp quando instalado.")
        Text("Importar adiciona ou atualiza no celular os pedidos e lembretes do computador com o mesmo identificador; os demais dados locais permanecem.")
        Text("Exportar envia pedidos ativos e lembretes locais ao servidor. Se um registro já existe, o lado que você enviar por último substitui os dados correspondentes; não apaga registros ausentes.")
        Text("A impressão por rede envia o cupom ao servidor do computador, que usa a impressora configurada em Ajustes. Celular e computador precisam estar na mesma rede.")
        Text("A conexão HTTP sem criptografia é indicada somente para uma rede Wi-Fi confiável. Para acessar pela internet, use HTTPS.")
    }

    transferAction?.let { action ->
        val isImport = action == "import"
        AlertDialog(
            onDismissRequest = { if (!busy) transferAction = null },
            title = { Text(if (isImport) "Importar do computador?" else "Exportar para o computador?") },
            text = {
                Text(
                    if (isImport) {
                        "Os pedidos e lembretes do computador serão adicionados ou atualizados no celular. Dados locais sem correspondência serão mantidos."
                    } else {
                        "Os pedidos ativos e lembretes do celular serão enviados ao servidor. Em caso de correspondência, os dados do celular substituirão os do computador. Pedidos na lixeira não serão enviados."
                    },
                )
            },
            confirmButton = {
                TextButton(enabled = !busy, onClick = {
                    transferAction = null
                    busy = true
                    error = ""
                    success = ""
                    scope.launch {
                        try {
                            BlocoApi.saveConnection(context, serverUrl, serverPin)
                            val result = if (isImport) {
                                BlocoApi.importFromServer(context, store)
                            } else {
                                BlocoApi.exportToServer(context, store)
                            }
                            success = if (isImport) {
                                "Importados/atualizados: ${result.orders} pedidos e ${result.notes} lembretes."
                            } else {
                                "Enviados: ${result.orders} pedidos e ${result.notes} lembretes."
                            }
                            serverInfo = BlocoApi.testConnection(context)
                            onChanged()
                        } catch (e: Exception) {
                            error = e.message ?: "A transferência não foi concluída. Seus dados locais foram preservados."
                        } finally {
                            busy = false
                        }
                    }
                }) { Text(if (isImport) "Importar agora" else "Enviar agora") }
            },
            dismissButton = { TextButton(enabled = !busy, onClick = { transferAction = null }) { Text("Cancelar") } },
        )
    }
}

private fun statusLabel(status: String): String = when (status) {
    "open" -> "Aberto"
    "preparing" -> "Em preparo"
    "paused" -> "Pausado"
    "done" -> "Concluído"
    "canceled" -> "Cancelado"
    else -> status
}

private fun noteColor(color: String): Color = when (color) {
    "verde" -> Color(0xFFDFF2D8)
    "azul" -> Color(0xFFDDEBFA)
    "rosa" -> Color(0xFFF9DDE8)
    "cinza" -> Color(0xFFE7E7E7)
    else -> Color(0xFFFFF2B3)
}

private fun formatDate(time: Long): String =
    SimpleDateFormat("dd/MM HH:mm", Locale("pt", "BR")).format(Date(time))

private fun formatDuration(millis: Long): String {
    val seconds = kotlin.math.abs(millis) / 1_000
    return "%02d:%02d".format(Locale.ROOT, seconds / 60, seconds % 60)
}

private fun formatMoney(value: Double): String =
    java.text.NumberFormat.getCurrencyInstance(Locale("pt", "BR")).format(value)

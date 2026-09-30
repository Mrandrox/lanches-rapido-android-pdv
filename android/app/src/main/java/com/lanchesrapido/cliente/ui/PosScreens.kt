package com.lanchesrapido.cliente.ui

import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.Spacer
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.height
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.lazy.LazyColumn
import androidx.compose.foundation.lazy.items
import androidx.compose.material3.AlertDialog
import androidx.compose.material3.Button
import androidx.compose.material3.Card
import androidx.compose.material3.CardDefaults
import androidx.compose.material3.FilterChip
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.OutlinedButton
import androidx.compose.material3.OutlinedTextField
import androidx.compose.material3.Text
import androidx.compose.material3.TextButton
import androidx.compose.runtime.Composable
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateListOf
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.rememberCoroutineScope
import androidx.compose.runtime.setValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.unit.dp
import com.lanchesrapido.cliente.model.Product
import com.lanchesrapido.cliente.state.CashSnapshot
import com.lanchesrapido.cliente.state.LocalOrder
import com.lanchesrapido.cliente.state.LocalStore
import com.lanchesrapido.cliente.state.formatMoney
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.launch
import kotlinx.coroutines.withContext
import java.text.SimpleDateFormat
import java.util.Date
import java.util.Locale

private fun messageOf(error: Exception): String = error.message ?: "Não foi possível salvar os dados."

@Composable
fun PosScreen(store: LocalStore, revision: Int, onChanged: () -> Unit) {
    val scope = rememberCoroutineScope()
    val products = remember(store, revision) { store.products() }
    val cart = remember { mutableStateListOf<Pair<Product, Int>>() }
    var customer by remember { mutableStateOf("") }
    var phone by remember { mutableStateOf("") }
    var address by remember { mutableStateOf("") }
    var deliveryFee by remember { mutableStateOf("0") }
    var note by remember { mutableStateOf("") }
    var type by remember { mutableStateOf("counter") }
    var payment by remember { mutableStateOf("Pix") }
    var error by remember { mutableStateOf("") }
    var addProductDialog by remember { mutableStateOf(false) }
    val parsedDeliveryFee = deliveryFee.replace(',', '.').toDoubleOrNull()
    val deliveryAmount = if (type == "delivery") parsedDeliveryFee ?: 0.0 else 0.0
    val total = cart.sumOf { (product, quantity) -> product.price * quantity } + deliveryAmount

    Column(
        Modifier.fillMaxSize().padding(16.dp),
        verticalArrangement = Arrangement.spacedBy(10.dp),
    ) {
        Text("PDV · funciona offline", style = MaterialTheme.typography.headlineSmall, fontWeight = FontWeight.Bold)
        Text("Cardápio local · ${products.size} produtos")
        Row(horizontalArrangement = Arrangement.spacedBy(8.dp)) {
            FilterChip(type == "counter", { type = "counter" }, label = { Text("Balcão") })
            FilterChip(type == "delivery", { type = "delivery" }, label = { Text("Entrega") })
            OutlinedButton(onClick = { addProductDialog = true }) { Text("+ Produto") }
        }
        OutlinedTextField(
            value = customer,
            onValueChange = { customer = it },
            label = { Text("Cliente (opcional)") },
            singleLine = true,
            modifier = Modifier.fillMaxWidth(),
        )
        if (type == "delivery") {
            OutlinedTextField(
                value = phone,
                onValueChange = { phone = it },
                label = { Text("Telefone") },
                singleLine = true,
                modifier = Modifier.fillMaxWidth(),
            )
            OutlinedTextField(
                value = address,
                onValueChange = { address = it },
                label = { Text("Endereço de entrega *") },
                singleLine = true,
                modifier = Modifier.fillMaxWidth(),
            )
            OutlinedTextField(
                value = deliveryFee,
                onValueChange = { deliveryFee = it },
                label = { Text("Taxa de entrega (R$)") },
                singleLine = true,
                modifier = Modifier.fillMaxWidth(),
            )
        }
        LazyColumn(
            modifier = Modifier.weight(1f),
            verticalArrangement = Arrangement.spacedBy(8.dp),
        ) {
            items(products, key = { it.id }) { product ->
                val quantity = cart.firstOrNull { it.first.id == product.id }?.second ?: 0
                Card {
                    Row(
                        Modifier.fillMaxWidth().padding(horizontal = 12.dp, vertical = 8.dp),
                        verticalAlignment = Alignment.CenterVertically,
                    ) {
                        Column(Modifier.weight(1f)) {
                            Text(product.name, fontWeight = FontWeight.SemiBold)
                            Text(formatMoney(product.price), color = MaterialTheme.colorScheme.primary)
                        }
                        TextButton(onClick = {
                            val index = cart.indexOfFirst { it.first.id == product.id }
                            if (index >= 0) {
                                if (cart[index].second <= 1) cart.removeAt(index)
                                else cart[index] = product to (cart[index].second - 1)
                            }
                        }, enabled = quantity > 0) { Text("−") }
                        Text("$quantity")
                        TextButton(onClick = {
                            val index = cart.indexOfFirst { it.first.id == product.id }
                            if (index >= 0) cart[index] = product to (cart[index].second + 1)
                            else cart.add(product to 1)
                        }) { Text("+") }
                    }
                }
            }
        }
        Row(horizontalArrangement = Arrangement.spacedBy(8.dp)) {
            listOf("Pix", "Dinheiro", "Cartão").forEach { option ->
                FilterChip(payment == option, { payment = option }, label = { Text(option) })
            }
        }
        OutlinedTextField(
            value = note,
            onValueChange = { note = it },
            label = { Text("Observação da comanda") },
            singleLine = true,
            modifier = Modifier.fillMaxWidth(),
        )
        if (error.isNotBlank()) Text(error, color = MaterialTheme.colorScheme.error)
        Button(
            onClick = {
                if (type == "delivery" && (parsedDeliveryFee == null || parsedDeliveryFee < 0.0 || !parsedDeliveryFee.isFinite())) {
                    error = "Informe uma taxa de entrega válida."
                    return@Button
                }
                scope.launch {
                    try {
                        withContext(Dispatchers.IO) {
                            store.createOrder(cart.toList(), customer, phone, type, payment, address, deliveryAmount, note)
                        }
                        cart.clear()
                        customer = ""
                        phone = ""
                        address = ""
                        deliveryFee = "0"
                        note = ""
                        error = ""
                        onChanged()
                    } catch (e: Exception) {
                        error = messageOf(e)
                    }
                }
            },
            enabled = cart.isNotEmpty(),
            modifier = Modifier.fillMaxWidth(),
        ) {
            Text("Salvar comanda · ${formatMoney(total)}")
        }
    }

    if (addProductDialog) {
        AddProductDialog(
            onDismiss = { addProductDialog = false },
            onSave = { name, price ->
                try {
                    store.addProduct(name, price)
                    addProductDialog = false
                    error = ""
                    onChanged()
                } catch (e: Exception) {
                    error = messageOf(e)
                }
            },
        )
    }
}

@Composable
private fun AddProductDialog(onDismiss: () -> Unit, onSave: (String, Double) -> Unit) {
    var name by remember { mutableStateOf("") }
    var price by remember { mutableStateOf("") }
    var error by remember { mutableStateOf("") }
    AlertDialog(
        onDismissRequest = onDismiss,
        title = { Text("Novo produto") },
        text = {
            Column(verticalArrangement = Arrangement.spacedBy(8.dp)) {
                OutlinedTextField(name, { name = it }, label = { Text("Nome") }, singleLine = true)
                OutlinedTextField(price, { price = it }, label = { Text("Preço (R$)") }, singleLine = true)
                if (error.isNotBlank()) Text(error, color = MaterialTheme.colorScheme.error)
            }
        },
        confirmButton = {
            TextButton(onClick = {
                val parsedPrice = price.replace(',', '.').toDoubleOrNull()
                if (name.isBlank() || parsedPrice == null || parsedPrice < 0) error = "Informe nome e preço válidos."
                else onSave(name, parsedPrice)
            }) { Text("Salvar") }
        },
        dismissButton = { TextButton(onClick = onDismiss) { Text("Cancelar") } },
    )
}

@Composable
fun OrdersScreen(store: LocalStore, revision: Int, onChanged: () -> Unit) {
    val scope = rememberCoroutineScope()
    val orders = remember(store, revision) { store.orders(inTrash = false) }
    var error by remember { mutableStateOf("") }
    Column(Modifier.fillMaxSize().padding(16.dp), verticalArrangement = Arrangement.spacedBy(8.dp)) {
        Text("Comandas", style = MaterialTheme.typography.headlineSmall, fontWeight = FontWeight.Bold)
        if (error.isNotBlank()) Text(error, color = MaterialTheme.colorScheme.error)
        if (orders.isEmpty()) {
            Text("Nenhuma comanda ativa.")
        } else {
            LazyColumn(verticalArrangement = Arrangement.spacedBy(10.dp)) {
                items(orders, key = { it.id }) { order ->
                    OrderCard(
                        order = order,
                        trashAction = {
                            scope.launch {
                                try {
                                    withContext(Dispatchers.IO) { store.moveOrderToTrash(order.id) }
                                    error = ""
                                    onChanged()
                                } catch (e: Exception) { error = messageOf(e) }
                            }
                        },
                        statusAction = { status ->
                            scope.launch {
                                try {
                                    withContext(Dispatchers.IO) { store.updateOrderStatus(order.id, status) }
                                    error = ""
                                    onChanged()
                                } catch (e: Exception) { error = messageOf(e) }
                            }
                        },
                    )
                }
            }
        }
    }
}

@Composable
fun TrashScreen(store: LocalStore, revision: Int, onChanged: () -> Unit) {
    val scope = rememberCoroutineScope()
    val orders = remember(store, revision) { store.orders(inTrash = true) }
    var error by remember { mutableStateOf("") }
    var pendingDelete by remember { mutableStateOf<LocalOrder?>(null) }
    Column(Modifier.fillMaxSize().padding(16.dp), verticalArrangement = Arrangement.spacedBy(8.dp)) {
        Text("Lixeira", style = MaterialTheme.typography.headlineSmall, fontWeight = FontWeight.Bold)
        Text("Escolha o que restaurar ou excluir definitivamente.")
        if (error.isNotBlank()) Text(error, color = MaterialTheme.colorScheme.error)
        if (orders.isEmpty()) {
            Text("A lixeira está vazia.")
        } else {
            LazyColumn(verticalArrangement = Arrangement.spacedBy(10.dp)) {
                items(orders, key = { it.id }) { order ->
                    Card(colors = CardDefaults.cardColors(containerColor = MaterialTheme.colorScheme.surfaceVariant)) {
                        Column(Modifier.fillMaxWidth().padding(12.dp), verticalArrangement = Arrangement.spacedBy(6.dp)) {
                            OrderSummary(order)
                            Row(horizontalArrangement = Arrangement.spacedBy(8.dp)) {
                                OutlinedButton(onClick = {
                                    scope.launch {
                                        try {
                                            withContext(Dispatchers.IO) { store.restoreOrder(order.id) }
                                            error = ""
                                            onChanged()
                                        } catch (e: Exception) { error = messageOf(e) }
                                    }
                                }) { Text("Restaurar") }
                                TextButton(onClick = { pendingDelete = order }) { Text("Excluir para sempre") }
                            }
                        }
                    }
                }
            }
        }
    }

    pendingDelete?.let { order ->
        AlertDialog(
            onDismissRequest = { pendingDelete = null },
            title = { Text("Excluir comanda definitivamente?") },
            text = {
                Text(
                    if (order.status == "open" || order.status == "canceled") {
                        "A comanda #${order.number} e seus itens serão removidos deste aparelho. Essa ação não pode ser desfeita."
                    } else {
                        "A comanda #${order.number} faz parte do fluxo do caixa e não pode ser excluída definitivamente. Você ainda pode restaurá-la."
                    },
                )
            },
            confirmButton = {
                TextButton(
                    enabled = order.status == "open" || order.status == "canceled",
                    onClick = {
                    scope.launch {
                        try {
                            withContext(Dispatchers.IO) { store.deleteOrderPermanently(order.id) }
                            pendingDelete = null
                            error = ""
                            onChanged()
                        } catch (e: Exception) { error = messageOf(e) }
                    }
                }) { Text("Excluir") }
            },
            dismissButton = { TextButton(onClick = { pendingDelete = null }) { Text("Cancelar") } },
        )
    }
}

@Composable
private fun OrderCard(order: LocalOrder, trashAction: () -> Unit, statusAction: (String) -> Unit) {
    Card {
        Column(Modifier.fillMaxWidth().padding(12.dp), verticalArrangement = Arrangement.spacedBy(6.dp)) {
            OrderSummary(order)
            Row(horizontalArrangement = Arrangement.spacedBy(8.dp)) {
                when (order.status) {
                    "open" -> {
                        OutlinedButton(onClick = { statusAction("preparing") }) { Text("Preparando") }
                        Button(onClick = { statusAction("finished") }) { Text("Concluir") }
                        TextButton(onClick = { statusAction("canceled") }) { Text("Cancelar") }
                    }
                    "preparing" -> {
                        Button(onClick = { statusAction("finished") }) { Text("Concluir") }
                        TextButton(onClick = { statusAction("canceled") }) { Text("Cancelar") }
                    }
                }
                TextButton(onClick = trashAction) { Text("Mover para lixeira") }
            }
        }
    }
}

@Composable
private fun OrderSummary(order: LocalOrder) {
    val date = runCatching {
        val instant = java.time.Instant.parse(order.createdAt)
        SimpleDateFormat("dd/MM HH:mm", Locale("pt", "BR")).format(Date.from(instant))
    }.getOrDefault("")
    Text("#${order.number} · ${order.customer} · $date", fontWeight = FontWeight.Bold)
    Text("${if (order.type == "delivery") "Entrega" else "Balcão"} · ${statusLabel(order.status)} · ${order.payment}")
    if (order.phone.isNotBlank()) Text("Telefone: ${order.phone}")
    if (order.address.isNotBlank()) Text("Endereço: ${order.address}")
    order.lines.forEach { line -> Text("${line.quantity}× ${line.name} · ${formatMoney(line.price * line.quantity)}") }
    if (order.deliveryFee > 0.0) Text("Taxa de entrega: ${formatMoney(order.deliveryFee)}")
    if (order.note.isNotBlank()) Text("Obs.: ${order.note}")
    Text(formatMoney(order.total), color = MaterialTheme.colorScheme.primary, fontWeight = FontWeight.Bold)
}

private fun statusLabel(status: String): String = when (status) {
    "open" -> "Aberto"
    "preparing" -> "Preparando"
    "finished" -> "Concluído"
    "delivered" -> "Entregue"
    "canceled" -> "Cancelado"
    else -> status
}

@Composable
fun CashScreen(store: LocalStore, revision: Int, onChanged: () -> Unit) {
    val scope = rememberCoroutineScope()
    val cash = remember(store, revision) { store.currentCash() }
    val history = remember(store, revision) { store.cashHistory() }
    var opening by remember { mutableStateOf("") }
    var counted by remember { mutableStateOf("") }
    var entryValue by remember { mutableStateOf("") }
    var description by remember { mutableStateOf("") }
    var error by remember { mutableStateOf("") }

    Column(
        Modifier.fillMaxSize().padding(16.dp),
        verticalArrangement = Arrangement.spacedBy(10.dp),
    ) {
        Text("Caixa do dia", style = MaterialTheme.typography.headlineSmall, fontWeight = FontWeight.Bold)
        if (!cash.isOpen) {
            OutlinedTextField(opening, { opening = it }, label = { Text("Saldo inicial (R$)") }, singleLine = true)
            Button(onClick = {
                scope.launch {
                    try {
                        val amount = opening.moneyValue()
                        withContext(Dispatchers.IO) { store.openCash(amount) }
                        opening = ""
                        error = ""
                        onChanged()
                    } catch (e: Exception) { error = messageOf(e) }
                }
            }) { Text("Abrir caixa") }
        } else {
            CashTotals(cash)
            OutlinedTextField(entryValue, { entryValue = it }, label = { Text("Valor de entrada/retirada (R$)") }, singleLine = true)
            OutlinedTextField(description, { description = it }, label = { Text("Descrição") }, singleLine = true)
            Row(horizontalArrangement = Arrangement.spacedBy(8.dp)) {
                OutlinedButton(onClick = {
                    addCashEntry(scope, store, entryValue, description, "deposit", onChanged, { error = it }, { entryValue = ""; description = "" })
                }) { Text("Suprimento") }
                OutlinedButton(onClick = {
                    addCashEntry(scope, store, entryValue, description, "withdraw", onChanged, { error = it }, { entryValue = ""; description = "" })
                }) { Text("Sangria") }
            }
            OutlinedTextField(counted, { counted = it }, label = { Text("Valor contado para fechar (R$)") }, singleLine = true)
            Button(onClick = {
                scope.launch {
                    try {
                        withContext(Dispatchers.IO) { store.closeCash(counted.moneyValue()) }
                        counted = ""
                        error = ""
                        onChanged()
                    } catch (e: Exception) { error = messageOf(e) }
                }
            }) { Text("Fechar caixa") }
        }
        if (error.isNotBlank()) Text(error, color = MaterialTheme.colorScheme.error)
        Spacer(Modifier.height(4.dp))
        Text("Últimos fechamentos", style = MaterialTheme.typography.titleMedium)
        if (history.isEmpty()) Text("Nenhum caixa fechado ainda.")
        else LazyColumn(verticalArrangement = Arrangement.spacedBy(6.dp)) {
            items(history) { session ->
                Text(
                    "${formatDate(session.openedAt)} · abertura ${formatMoney(session.opening)} · vendas ${formatMoney(session.sales)} · suprimentos ${formatMoney(session.deposits)} · sangrias ${formatMoney(session.withdrawals)} · esperado ${formatMoney(session.expected)} · contado ${formatMoney(session.closing)}",
                    style = MaterialTheme.typography.bodySmall,
                )
            }
        }
    }
}

@Composable
private fun CashTotals(cash: CashSnapshot) {
    Card(colors = CardDefaults.cardColors(containerColor = MaterialTheme.colorScheme.surfaceVariant)) {
        Column(Modifier.fillMaxWidth().padding(12.dp), verticalArrangement = Arrangement.spacedBy(4.dp)) {
            Text("Caixa aberto desde ${cash.openedAt?.let(::formatDate).orEmpty()}")
            Text("Abertura: ${formatMoney(cash.opening)}")
            Text("Vendas: ${formatMoney(cash.sales)}")
            Text("Suprimentos: ${formatMoney(cash.deposits)} · Sangrias: ${formatMoney(cash.withdrawals)}")
            Text("Saldo esperado: ${formatMoney(cash.balance)}", fontWeight = FontWeight.Bold)
        }
    }
}

private fun addCashEntry(
    scope: kotlinx.coroutines.CoroutineScope,
    store: LocalStore,
    value: String,
    description: String,
    kind: String,
    onChanged: () -> Unit,
    onError: (String) -> Unit,
    onSuccess: () -> Unit,
) {
    scope.launch {
        try {
            withContext(Dispatchers.IO) { store.addCashEntry(kind, value.moneyValue(), description) }
            onSuccess()
            onError("")
            onChanged()
        } catch (e: Exception) { onError(messageOf(e)) }
    }
}

private fun String.moneyValue(): Double =
    replace(',', '.').toDoubleOrNull()?.takeIf { it >= 0.0 && it.isFinite() }
        ?: error("Informe um valor válido.")

private fun formatDate(value: String): String = runCatching {
    SimpleDateFormat("dd/MM/yyyy HH:mm", Locale("pt", "BR")).format(Date.from(java.time.Instant.parse(value)))
}.getOrDefault(value)

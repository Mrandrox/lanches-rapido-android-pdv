package com.lanchesrapido.cliente.ui

import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.Spacer
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.height
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.width
import androidx.compose.foundation.rememberScrollState
import androidx.compose.foundation.verticalScroll
import androidx.compose.material3.Button
import androidx.compose.material3.Card
import androidx.compose.material3.CardDefaults
import androidx.compose.material3.CircularProgressIndicator
import androidx.compose.material3.FilterChip
import androidx.compose.material3.FilterChipDefaults
import androidx.compose.material3.IconButton
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.OutlinedTextField
import androidx.compose.material3.SegmentedButton
import androidx.compose.material3.SegmentedButtonDefaults
import androidx.compose.material3.SingleChoiceSegmentedButtonRow
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.runtime.LaunchedEffect
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.rememberCoroutineScope
import androidx.compose.runtime.setValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.platform.LocalContext
import androidx.compose.ui.unit.dp
import com.lanchesrapido.cliente.model.Product
import com.lanchesrapido.cliente.net.Api
import com.lanchesrapido.cliente.net.ApiException
import com.lanchesrapido.cliente.model.TrackOrder
import com.lanchesrapido.cliente.state.AppData
import com.lanchesrapido.cliente.state.Cart
import com.lanchesrapido.cliente.state.formatMoney
import kotlinx.coroutines.launch

@Composable
fun CartScreen(onPlaced: (TrackOrder) -> Unit) {
    val scope = rememberCoroutineScope()
    val context = LocalContext.current

    var store by remember { mutableStateOf(com.lanchesrapido.cliente.model.Store("", "", "", "R$", 0.0, true, "")) }
    var name by remember { mutableStateOf("") }
    var phone by remember { mutableStateOf("") }
    var address by remember { mutableStateOf("") }
    var note by remember { mutableStateOf("") }
    var delivery by remember { mutableStateOf(true) }
    var payment by remember { mutableStateOf("Pix") }
    var sending by remember { mutableStateOf(false) }
    var error by remember { mutableStateOf("") }

    LaunchedEffect(Unit) {
        runCatching { AppData.ensure().store }.onSuccess { store = it }
    }

    val cart = Cart.items.value
    if (cart.isEmpty()) {
        Box(Modifier.fillMaxSize(), contentAlignment = Alignment.Center) {
            Text("🛒 Carrinho vazio.\nAdicione itens no cardápio.", style = MaterialTheme.typography.bodyLarge)
        }
        return
    }

    val subtotal = Cart.subtotal()
    val fee = if (delivery) store.deliveryFee else 0.0
    val total = subtotal + fee

    Column(
        modifier = Modifier.fillMaxSize().verticalScroll(rememberScrollState()).padding(16.dp),
        verticalArrangement = Arrangement.spacedBy(10.dp),
    ) {
        Text("🧾 Seu pedido", style = MaterialTheme.typography.headlineSmall)
        cart.forEach { item ->
            Card(colors = CardDefaults.cardColors(containerColor = MaterialTheme.colorScheme.surface)) {
                Row(
                    modifier = Modifier.fillMaxWidth().padding(horizontal = 12.dp, vertical = 6.dp),
                    verticalAlignment = Alignment.CenterVertically,
                ) {
                    Column(Modifier.weight(1f)) {
                        Text(item.product.name, style = MaterialTheme.typography.titleMedium)
                        Text(
                            "${formatMoney(item.product.price)} cada",
                            style = MaterialTheme.typography.bodySmall,
                            color = MaterialTheme.colorScheme.onSurfaceVariant,
                        )
                    }
                    QtyStepper(
                        qty = item.qty,
                        onMinus = { Cart.setQty(item.product.id, item.qty - 1) },
                        onPlus = { Cart.add(item.product) },
                    )
                    Text(
                        formatMoney(item.product.price * item.qty),
                        style = MaterialTheme.typography.titleMedium,
                        fontWeight = androidx.compose.ui.text.font.FontWeight.Bold,
                        modifier = Modifier.width(90.dp),
                        textAlign = androidx.compose.ui.text.style.TextAlign.End,
                    )
                }
            }
        }

        Spacer(Modifier.height(4.dp))
        SingleChoiceSegmentedButtonRow(modifier = Modifier.fillMaxWidth()) {
            SegmentedButton(
                selected = delivery,
                onClick = { delivery = true },
                shape = SegmentedButtonDefaults.itemShape(index = 0, count = 2),
            ) { Text("🛵 Entrega") }
            SegmentedButton(
                selected = !delivery,
                onClick = { delivery = false },
                shape = SegmentedButtonDefaults.itemShape(index = 1, count = 2),
            ) { Text("🏪 Retirada") }
        }

        if (delivery) {
            OutlinedTextField(
                value = address,
                onValueChange = { address = it },
                label = { Text("Endereço de entrega *") },
                minLines = 2,
                modifier = Modifier.fillMaxWidth(),
            )
        }
        OutlinedTextField(
            value = name,
            onValueChange = { name = it },
            label = { Text("Seu nome") },
            singleLine = true,
            modifier = Modifier.fillMaxWidth(),
        )
        OutlinedTextField(
            value = phone,
            onValueChange = { phone = it },
            label = { Text("WhatsApp/telefone") },
            singleLine = true,
            modifier = Modifier.fillMaxWidth(),
        )
        OutlinedTextField(
            value = note,
            onValueChange = { note = it },
            label = { Text("Observações (opcional)") },
            singleLine = true,
            modifier = Modifier.fillMaxWidth(),
        )

        Text("Pagamento:", style = MaterialTheme.typography.titleMedium)
        Row(horizontalArrangement = Arrangement.spacedBy(8.dp)) {
            listOf("Pix", "Dinheiro", "Cartão").forEach { p ->
                FilterChip(
                    selected = payment == p,
                    onClick = { payment = p },
                    label = { Text(mapOf("Pix" to "Pix", "Dinheiro" to "Dinheiro", "Cartão" to "Cartão").getValue(p)) },
                    colors = FilterChipDefaults.filterChipColors(),
                )
            }
        }

        Card(colors = CardDefaults.cardColors(containerColor = MaterialTheme.colorScheme.surfaceVariant)) {
            Column(Modifier.padding(12.dp), verticalArrangement = Arrangement.spacedBy(4.dp)) {
                SummaryRow("Subtotal", formatMoney(subtotal))
                if (delivery) SummaryRow("Taxa de entrega", formatMoney(fee))
                Row(Modifier.fillMaxWidth(), horizontalArrangement = Arrangement.SpaceBetween) {
                    Text("Total", style = MaterialTheme.typography.titleMedium)
                    Text(
                        formatMoney(total),
                        style = MaterialTheme.typography.titleMedium,
                        color = MaterialTheme.colorScheme.primary,
                        fontWeight = androidx.compose.ui.text.font.FontWeight.Bold,
                    )
                }
            }
        }

        if (error.isNotEmpty()) Text("⚠️ $error", color = MaterialTheme.colorScheme.error)

        Button(
            onClick = {
                scope.launch {
                    sending = true; error = ""
                    try {
                        if (delivery && address.isBlank()) throw ApiException("Informe o endereço de entrega.")
                        val order = Api.createOrder(
                            type = if (delivery) "delivery" else "counter",
                            items = cart.map { it.product.id to it.qty },
                            customerName = name.trim(),
                            phone = phone.trim(),
                            address = address.trim(),
                            payment = payment,
                            note = note.trim(),
                        )
                        Cart.clear()
                        AppData.saveLastOrder(context, order.id)
                        onPlaced(order)
                    } catch (e: Exception) {
                        error = (e as? ApiException)?.message ?: e.message ?: "Falha ao enviar o pedido."
                    }
                    sending = false
                }
            },
            enabled = !sending,
            modifier = Modifier.fillMaxWidth().height(52.dp),
        ) {
            if (sending) CircularProgressIndicator(Modifier.width(22.dp).height(22.dp), strokeWidth = 2.dp)
            else Text("✅ Enviar pedido · ${formatMoney(total)}")
        }
    }
}

@Composable
private fun SummaryRow(label: String, value: String) {
    Row(Modifier.fillMaxWidth(), horizontalArrangement = Arrangement.SpaceBetween) {
        Text(label, style = MaterialTheme.typography.bodyMedium)
        Text(value, style = MaterialTheme.typography.bodyMedium)
    }
}
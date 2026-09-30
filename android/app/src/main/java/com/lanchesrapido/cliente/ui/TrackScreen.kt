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
import androidx.compose.foundation.layout.size
import androidx.compose.foundation.rememberScrollState
import androidx.compose.foundation.verticalScroll
import androidx.compose.material3.Card
import androidx.compose.material3.CardDefaults
import androidx.compose.material3.CircularProgressIndicator
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.OutlinedButton
import androidx.compose.material3.OutlinedTextField
import androidx.compose.material3.Surface
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.runtime.LaunchedEffect
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.setValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.platform.LocalContext
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.unit.dp
import com.lanchesrapido.cliente.model.TrackOrder
import com.lanchesrapido.cliente.net.Api
import com.lanchesrapido.cliente.net.ApiException
import com.lanchesrapido.cliente.state.AppData
import com.lanchesrapido.cliente.state.formatMoney
import kotlinx.coroutines.delay

private val STATUS_TEXT = mapOf(
    "open" to "⏳ Pedido recebido pela loja",
    "preparing" to "🍳 Em preparo",
    "route" to "🛵 Saiu para entrega",
    "delivered" to "✅ Pedido entregue",
    "finished" to "✅ Pronto para retirada",
    "canceled" to "❌ Pedido cancelado",
)

@Composable
fun TrackScreen(refreshKey: Int = 0) {
    val context = LocalContext.current
    var orderId by remember { mutableStateOf(AppData.loadLastOrder(context)) }
    var id by remember { mutableStateOf(AppData.loadLastOrder(context)) }
    var order by remember { mutableStateOf<TrackOrder?>(null) }
    var loading by remember { mutableStateOf(false) }
    var error by remember { mutableStateOf("") }

    LaunchedEffect(refreshKey, id) {
        if (id.isBlank()) return@LaunchedEffect
        var wait = 4000L
        while (true) {
            try {
                val current = Api.track(id)
                order = current
                loading = false
                error = ""
                wait = 4000L
                // Pedido encerrado: para de consultar para não gastar bateria/dados.
                if (current.status == "delivered" || current.status == "finished" || current.status == "canceled") break
            } catch (e: Exception) {
                if (order == null) error = (e as? ApiException)?.message ?: e.message ?: "Pedido não encontrado."
                // Backoff: falha de rede não vira loop apertado (4s -> 8s -> 16s -> 30s).
                wait = (wait * 2).coerceAtMost(30_000L)
            }
            delay(wait)
        }
    }

    Column(
        modifier = Modifier.fillMaxSize().verticalScroll(rememberScrollState()).padding(16.dp),
        verticalArrangement = Arrangement.spacedBy(12.dp),
    ) {
        Text("🚚 Acompanhar pedido", style = MaterialTheme.typography.headlineSmall)
        OutlinedTextField(
            value = orderId,
            onValueChange = { orderId = it },
            label = { Text("Código do pedido") },
            singleLine = true,
            modifier = Modifier.fillMaxWidth(),
        )
        OutlinedButton(
            onClick = {
                val target = orderId.trim()
                if (target.isNotEmpty() && target != id) {
                    order = null
                    error = ""
                    loading = true
                }
                id = target
            },
            modifier = Modifier.fillMaxWidth(),
        ) {
            Text("🔎 Buscar")
        }

        order?.let { o ->
            Card(
                colors = CardDefaults.cardColors(
                    containerColor = when (o.status) {
                        "delivered" -> MaterialTheme.colorScheme.primaryContainer
                        "canceled" -> MaterialTheme.colorScheme.errorContainer
                        else -> MaterialTheme.colorScheme.surface
                    },
                ),
                modifier = Modifier.fillMaxWidth(),
            ) {
                Column(Modifier.padding(14.dp), verticalArrangement = Arrangement.spacedBy(6.dp)) {
                    Text("Pedido #${o.number}", style = MaterialTheme.typography.titleLarge, fontWeight = FontWeight.Bold)
                    Text(
                        STATUS_TEXT[o.status] ?: o.status,
                        style = MaterialTheme.typography.titleMedium,
                        color = when (o.status) {
                            "delivered" -> MaterialTheme.colorScheme.onPrimaryContainer
                            "canceled" -> MaterialTheme.colorScheme.onErrorContainer
                            else -> MaterialTheme.colorScheme.primary
                        },
                    )
                    if (o.status == "route" && o.courierName.isNotBlank()) {
                        Text("Entregador: ${o.courierName}", style = MaterialTheme.typography.bodyMedium)
                    }
                }
            }

            Timeline(o.status)

            Card(colors = CardDefaults.cardColors(containerColor = MaterialTheme.colorScheme.surfaceVariant)) {
                Column(Modifier.padding(12.dp), verticalArrangement = Arrangement.spacedBy(4.dp)) {
                    o.items.forEach { line ->
                        Row(Modifier.fillMaxWidth(), horizontalArrangement = Arrangement.SpaceBetween) {
                            Text("${line.qty}x ${line.name}", style = MaterialTheme.typography.bodyMedium)
                            Text(formatMoney(line.price * line.qty), style = MaterialTheme.typography.bodyMedium)
                        }
                    }
                    Spacer(Modifier.height(2.dp))
                    Row(Modifier.fillMaxWidth(), horizontalArrangement = Arrangement.SpaceBetween) {
                        Text("Subtotal", style = MaterialTheme.typography.bodyMedium)
                        Text(formatMoney(o.subtotal), style = MaterialTheme.typography.bodyMedium)
                    }
                    if (o.deliveryFee > 0) {
                        Row(Modifier.fillMaxWidth(), horizontalArrangement = Arrangement.SpaceBetween) {
                            Text("Entrega", style = MaterialTheme.typography.bodyMedium)
                            Text(formatMoney(o.deliveryFee), style = MaterialTheme.typography.bodyMedium)
                        }
                    }
                    Row(Modifier.fillMaxWidth(), horizontalArrangement = Arrangement.SpaceBetween) {
                        Text("Total", style = MaterialTheme.typography.titleMedium, fontWeight = FontWeight.Bold)
                        Text(formatMoney(o.total), style = MaterialTheme.typography.titleMedium, fontWeight = FontWeight.Bold)
                    }
                    Text("Pagamento: ${o.payment}", style = MaterialTheme.typography.bodySmall)
                    if (o.address.isNotBlank()) {
                        Text("Entrega: ${o.address}", style = MaterialTheme.typography.bodySmall)
                    }
                }
            }
        } ?: run {
            if (loading) {
                Box(Modifier.fillMaxWidth().padding(top = 40.dp), contentAlignment = Alignment.Center) {
                    CircularProgressIndicator(Modifier.size(28.dp))
                }
            }
            if (error.isNotEmpty()) Text("⚠️ $error", color = MaterialTheme.colorScheme.error)
        }
    }
}

@Composable
private fun Timeline(status: String) {
    val steps = listOf("open", "preparing", "route")
    val done = when (status) {
        "delivered", "finished" -> 3
        "route" -> 2
        "preparing" -> 1
        "open" -> 0
        else -> -1
    }
    if (done < 0) return
    Row(Modifier.fillMaxWidth().padding(vertical = 4.dp)) {
        steps.forEachIndexed { i, s ->
            val active = i < done
            Surface(
                color = if (active) MaterialTheme.colorScheme.primary else MaterialTheme.colorScheme.surfaceVariant,
                shape = MaterialTheme.shapes.medium,
                modifier = Modifier.weight(1f).height(6.dp),
            ) {}
            if (i < steps.size - 1) Spacer(Modifier.size(4.dp))
        }
    }
    Spacer(Modifier.height(4.dp))
}
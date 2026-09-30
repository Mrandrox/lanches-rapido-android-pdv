package com.lanchesrapido.cliente.ui

import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.Spacer
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.height
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.rememberScrollState
import androidx.compose.foundation.verticalScroll
import androidx.compose.material3.Button
import androidx.compose.material3.Card
import androidx.compose.material3.CardDefaults
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.OutlinedButton
import androidx.compose.material3.OutlinedTextField
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.rememberCoroutineScope
import androidx.compose.runtime.setValue
import androidx.compose.ui.Modifier
import androidx.compose.ui.unit.dp
import com.lanchesrapido.cliente.model.AiItem
import com.lanchesrapido.cliente.model.Product
import com.lanchesrapido.cliente.net.Api
import com.lanchesrapido.cliente.net.ApiException
import com.lanchesrapido.cliente.state.Cart
import kotlinx.coroutines.launch

@Composable
fun AiScreen() {
    val scope = rememberCoroutineScope()
    var text by remember { mutableStateOf("") }
    var working by remember { mutableStateOf(false) }
    var items by remember { mutableStateOf<List<AiItem>?>(null) }
    var error by remember { mutableStateOf("") }

    Column(
        modifier = Modifier.fillMaxSize().verticalScroll(rememberScrollState()).padding(16.dp),
        verticalArrangement = Arrangement.spacedBy(12.dp),
    ) {
        Text("🤖 Peça do seu jeito", style = MaterialTheme.typography.headlineSmall)
        Text(
            "Escreva o pedido como você falaria e a inteligência artificial entende. " +
                "Funciona offline também (sem chave de IA a loja usa o reconhecimento local).",
            style = MaterialTheme.typography.bodyMedium,
        )
        OutlinedTextField(
            value = text,
            onValueChange = { text = it },
            label = { Text("Ex.: 2 X-Salada e 1 batata frita") },
            minLines = 3,
            modifier = Modifier.fillMaxWidth(),
        )
        Button(
            onClick = {
                scope.launch {
                    working = true; error = ""; items = null
                    try {
                        val (ok, list) = Api.aiParse(text)
                        if (!ok || list.isEmpty()) {
                            error = "Não entendi o pedido. Tente escrever os itens do cardápio, ex.: \"1 X-Burger e 1 refrigerante\"."
                            items = list
                        } else {
                            items = list
                        }
                    } catch (e: Exception) {
                        error = (e as? ApiException)?.message ?: e.message ?: "Falha ao interpretar."
                        items = null
                    }
                    working = false
                }
            },
            enabled = text.isNotBlank() && !working,
            modifier = Modifier.fillMaxWidth(),
        ) {
            Text(if (working) "Interpretando…" else "🧠 Entender pedido")
        }

        items?.let { found ->
            if (found.isNotEmpty()) {
                Text("Encontrado no cardápio:", style = MaterialTheme.typography.titleMedium)
                for (item in found) {
                    AiResultCard(item = item, onAdd = { aiItem -> addToCart(aiItem) })
                }
                Button(
                    onClick = {
                        Cart.clear()
                        found.forEach { aiItem -> addToCart(aiItem) }
                    },
                    modifier = Modifier.fillMaxWidth(),
                ) { Text("🛒 Adicionar tudo ao carrinho") }
            } else {
                error = "Não entendi o pedido. Tente escrever os itens do cardápio, ex.: \"1 X-Burger e 1 refrigerante\"."
            }
        }

        if (error.isNotEmpty()) {
            Text("⚠️ $error", color = MaterialTheme.colorScheme.error)
        }
        Spacer(Modifier.height(40.dp))
    }
}

private fun addToCart(aiItem: AiItem) {
    val product = Product(aiItem.id, "", aiItem.name, "", aiItem.price)
    repeat(aiItem.qty) { Cart.add(product) }
}

@Composable
private fun AiResultCard(item: AiItem, onAdd: (AiItem) -> Unit) {
    Card(
        colors = CardDefaults.cardColors(containerColor = MaterialTheme.colorScheme.surface),
        modifier = Modifier.fillMaxWidth(),
    ) {
        Row(
            modifier = Modifier.fillMaxWidth().padding(12.dp),
            horizontalArrangement = Arrangement.SpaceBetween,
        ) {
            Column(Modifier.weight(1f)) {
                Text(item.name, style = MaterialTheme.typography.titleMedium)
                Text(
                    "${item.qty}x  ${com.lanchesrapido.cliente.state.formatMoney(item.total)}",
                    style = MaterialTheme.typography.bodyMedium,
                    color = MaterialTheme.colorScheme.onSurfaceVariant,
                )
            }
            OutlinedButton(onClick = { onAdd(item) }) { Text("+ Adicionar") }
        }
    }
}
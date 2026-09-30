package com.lanchesrapido.cliente.ui

import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.Spacer
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.height
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.width
import androidx.compose.foundation.lazy.LazyColumn
import androidx.compose.foundation.lazy.itemsIndexed
import androidx.compose.material3.Card
import androidx.compose.material3.CardDefaults
import androidx.compose.material3.CircularProgressIndicator
import androidx.compose.material3.IconButton
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.OutlinedButton
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
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.unit.dp
import com.lanchesrapido.cliente.model.Bootstrap
import com.lanchesrapido.cliente.model.Category
import com.lanchesrapido.cliente.model.Product
import com.lanchesrapido.cliente.state.AppData
import com.lanchesrapido.cliente.state.Cart
import com.lanchesrapido.cliente.state.formatMoney

private sealed class Row {
    data class Header(val cat: Category) : Row()
    data class Item(val product: Product) : Row()
}

@Composable
fun MenuScreen() {
    var data by remember { mutableStateOf<Bootstrap?>(null) }
    var loading by remember { mutableStateOf(true) }
    var error by remember { mutableStateOf("") }

    LaunchedEffect(Unit) {
        try {
            data = AppData.ensure()
        } catch (e: Exception) {
            error = e.message ?: "Não foi possível carregar o cardápio."
        }
        loading = false
    }

    when {
        loading -> BoxCentered { CircularProgressIndicator() }
        error.isNotEmpty() -> BoxCentered {
            Column(horizontalAlignment = Alignment.CenterHorizontally) {
                Text("❌ $error", color = MaterialTheme.colorScheme.error)
                OutlinedButton(onClick = {
                    error = ""; loading = true; AppData.invalidate()
                }) { Text("Tentar novamente") }
            }
        }
        data != null -> MenuContent(data!!)
    }
}

@Composable
private fun BoxCentered(content: @Composable () -> Unit) {
    androidx.compose.foundation.layout.Box(
        modifier = Modifier.fillMaxSize(),
        contentAlignment = Alignment.Center,
    ) { content() }
}

@Composable
private fun MenuContent(data: Bootstrap) {
    val rows = remember(data) {
        val list = mutableListOf<Row>()
        val byCat = LinkedHashMap<String, MutableList<Product>>()
        data.products.forEach {
            byCat.getOrPut(it.categoryId) { mutableListOf() }.add(it)
        }
        data.categories.forEach { cat ->
            byCat[cat.id]?.let { prods ->
                list.add(Row.Header(cat))
                prods.forEach { list.add(Row.Item(it)) }
            }
        }
        byCat.forEach { (catId, prods) ->
            if (data.categories.none { it.id == catId }) {
                list.add(Row.Header(Category(catId, "Outros", "📦")))
                prods.forEach { list.add(Row.Item(it)) }
            }
        }
        list
    }

    LazyColumn(
        modifier = Modifier.fillMaxSize(),
        contentPadding = androidx.compose.foundation.layout.PaddingValues(16.dp),
        verticalArrangement = Arrangement.spacedBy(8.dp),
    ) {
        item {
            Column {
                Text(data.store.name, style = MaterialTheme.typography.headlineSmall, fontWeight = FontWeight.Bold)
                if (data.store.announcement.isNotEmpty()) {
                    Spacer(Modifier.height(6.dp))
                    AnnouncementBanner(data.store.announcement)
                }
                Spacer(Modifier.height(4.dp))
            }
        }
        itemsIndexed(rows) { _, row ->
            when (row) {
                is Row.Header -> Text(
                    "${row.cat.icon} ${row.cat.name}",
                    style = MaterialTheme.typography.titleMedium,
                    fontWeight = FontWeight.SemiBold,
                    modifier = Modifier.padding(top = 8.dp),
                )
                is Row.Item -> ProductRow(row.product)
            }
        }
    }
}

@Composable
private fun AnnouncementBanner(text: String) {
    Surface(
        color = MaterialTheme.colorScheme.primaryContainer,
        shape = MaterialTheme.shapes.medium,
        modifier = Modifier.fillMaxWidth(),
    ) {
        Text("📣 $text", modifier = Modifier.padding(10.dp), style = MaterialTheme.typography.bodyMedium)
    }
}

@Composable
private fun ProductRow(product: Product) {
    val cart = Cart.items.value
    val qty = cart.firstOrNull { it.product.id == product.id }?.qty ?: 0

    Card(
        colors = CardDefaults.cardColors(containerColor = MaterialTheme.colorScheme.surface),
        modifier = Modifier.fillMaxWidth(),
    ) {
        Row(
            modifier = Modifier.fillMaxWidth().padding(12.dp),
            verticalAlignment = Alignment.CenterVertically,
        ) {
            Column(Modifier.weight(1f)) {
                Text(product.name, style = MaterialTheme.typography.titleMedium, fontWeight = FontWeight.SemiBold)
                if (product.description.isNotEmpty()) {
                    Text(
                        product.description,
                        style = MaterialTheme.typography.bodySmall,
                        color = MaterialTheme.colorScheme.onSurfaceVariant,
                    )
                }
                Spacer(Modifier.height(4.dp))
                Text(
                    formatMoney(product.price),
                    style = MaterialTheme.typography.titleMedium,
                    color = MaterialTheme.colorScheme.primary,
                    fontWeight = FontWeight.Bold,
                )
            }
            QtyStepper(qty = qty, onMinus = { Cart.setQty(product.id, qty - 1) }, onPlus = { Cart.add(product) })
        }
    }
}

@Composable
fun QtyStepper(qty: Int, onMinus: () -> Unit, onPlus: () -> Unit) {
    Row(verticalAlignment = Alignment.CenterVertically) {
        IconButton(onClick = onMinus, enabled = qty > 0) {
            Text("−", style = MaterialTheme.typography.titleLarge)
        }
        Text(
            if (qty > 0) "$qty" else "0",
            style = MaterialTheme.typography.titleMedium,
            modifier = Modifier.width(24.dp),
            textAlign = androidx.compose.ui.text.style.TextAlign.Center,
        )
        IconButton(onClick = onPlus) {
            Text("+", style = MaterialTheme.typography.titleLarge)
        }
    }
}
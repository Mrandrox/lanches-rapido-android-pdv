package com.lanchesrapido.cliente.state

import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.setValue
import com.lanchesrapido.cliente.model.CartItem
import com.lanchesrapido.cliente.model.Product
import java.text.NumberFormat
import java.util.Locale

object Cart {
    val items = mutableStateOf<List<CartItem>>(emptyList())

    fun count() = items.value.sumOf { it.qty }

    fun add(product: Product) {
        val list = items.value.toMutableList()
        val idx = list.indexOfFirst { it.product.id == product.id }
        if (idx >= 0) list[idx] = CartItem(product, list[idx].qty + 1)
        else list.add(CartItem(product, 1))
        items.value = list
    }

    fun remove(productId: String) {
        items.value = items.value.filterNot { it.product.id == productId }
    }

    fun setQty(productId: String, qty: Int) {
        if (qty <= 0) {
            remove(productId)
            return
        }
        items.value = items.value.map {
            if (it.product.id == productId) CartItem(it.product, qty) else it
        }
    }

    fun subtotal() = items.value.sumOf { it.product.price * it.qty }

    fun clear() {
        items.value = emptyList()
    }
}

fun formatMoney(value: Double): String {
    val fmt = NumberFormat.getCurrencyInstance(Locale("pt", "BR"))
    return fmt.format(value)
}
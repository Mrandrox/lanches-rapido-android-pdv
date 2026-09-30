package com.lanchesrapido.cliente.model

import org.json.JSONObject

data class Product(
    val id: String,
    val categoryId: String,
    val name: String,
    val description: String,
    val price: Double,
) {
    companion object {
        fun fromJson(o: JSONObject) = Product(
            id = o.getString("id"),
            categoryId = o.optString("categoryId", ""),
            name = o.getString("name"),
            description = o.optString("description", ""),
            price = o.optDouble("price", 0.0),
        )
    }
}

data class Category(val id: String, val name: String, val icon: String) {
    companion object {
        fun fromJson(o: JSONObject) = Category(
            id = o.getString("id"),
            name = o.getString("name"),
            icon = o.optString("icon", ""),
        )
    }
}

data class Store(
    val name: String,
    val address: String,
    val phone: String,
    val currency: String,
    val deliveryFee: Double,
    val orderAppEnabled: Boolean,
    val announcement: String,
) {
    companion object {
        fun fromJson(o: JSONObject) = Store(
            name = o.optString("name", "Lanches Rápido"),
            address = o.optString("address", ""),
            phone = o.optString("phone", ""),
            currency = o.optString("currency", "R$"),
            deliveryFee = o.optDouble("deliveryFee", 0.0),
            orderAppEnabled = o.optJSONObject("orderApp")?.optBoolean("enabled", true) ?: true,
            announcement = o.optJSONObject("orderApp")?.optString("announcement", "") ?: "",
        )
    }
}

data class Bootstrap(val store: Store, val categories: List<Category>, val products: List<Product>)

data class AiItem(val id: String, val name: String, val price: Double, val qty: Int, val total: Double)

data class CartItem(val product: Product, var qty: Int)

data class TrackLine(val name: String, val price: Double, val qty: Int)

data class TrackOrder(
    val id: String,
    val number: Int,
    val status: String,
    val type: String,
    val customer: String,
    val phone: String,
    val address: String,
    val subtotal: Double,
    val deliveryFee: Double,
    val total: Double,
    val payment: String,
    val note: String,
    val courierName: String,
    val storeName: String,
    val items: List<TrackLine>,
)
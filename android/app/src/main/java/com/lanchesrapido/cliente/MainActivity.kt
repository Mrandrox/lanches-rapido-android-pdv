package com.lanchesrapido.cliente

import android.os.Bundle
import androidx.activity.ComponentActivity
import androidx.activity.compose.setContent
import androidx.activity.enableEdgeToEdge
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.padding
import androidx.compose.material3.Badge
import androidx.compose.material3.BadgedBox
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.NavigationBar
import androidx.compose.material3.NavigationBarItem
import androidx.compose.material3.Scaffold
import androidx.compose.material3.Text
import androidx.compose.foundation.layout.WindowInsets
import androidx.compose.foundation.layout.navigationBars
import androidx.compose.foundation.layout.statusBars
import androidx.compose.foundation.layout.windowInsetsPadding
import androidx.compose.runtime.Composable
import androidx.compose.runtime.LaunchedEffect
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableIntStateOf
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.setValue
import androidx.compose.ui.Modifier
import androidx.compose.ui.platform.LocalContext
import com.lanchesrapido.cliente.net.Api
import com.lanchesrapido.cliente.state.AppData
import com.lanchesrapido.cliente.state.Cart
import com.lanchesrapido.cliente.ui.AiScreen
import com.lanchesrapido.cliente.ui.CartScreen
import com.lanchesrapido.cliente.ui.LanchesTheme
import com.lanchesrapido.cliente.ui.MenuScreen
import com.lanchesrapido.cliente.ui.ServerScreen
import com.lanchesrapido.cliente.ui.TrackScreen

private enum class Tab(val emoji: String, val label: String) {
    MENU("🍔", "Cardápio"),
    AI("🤖", "IA"),
    CART("🛒", "Carrinho"),
    TRACK("🚚", "Pedido"),
    SERVER("⚙️", "Servidor"),
}

class MainActivity : ComponentActivity() {
    override fun onCreate(savedInstanceState: Bundle?) {
        super.onCreate(savedInstanceState)
        enableEdgeToEdge()
        setContent {
            LanchesTheme {
                AppShell()
            }
        }
    }
}

@Composable
private fun AppShell() {
    val context = LocalContext.current

    LaunchedEffect(Unit) {
        if (Api.baseUrl.isBlank()) {
            val saved = AppData.loadBaseUrl(context)
            Api.baseUrl = Api.normalizeUrl(saved)
        }
    }

    var tab by remember { mutableStateOf(Tab.MENU) }
    var refreshKey by remember { mutableIntStateOf(0) }

    Scaffold(
        bottomBar = {
            NavigationBar(modifier = Modifier.windowInsetsPadding(WindowInsets.navigationBars)) {
                Tab.entries.forEach { t ->
                    val count = if (t == Tab.CART) Cart.count() else 0
                    NavigationBarItem(
                        selected = tab == t,
                        onClick = { tab = t },
                        icon = {
                            BadgedBox(badge = {
                                if (count > 0) Badge { Text("$count") }
                            }) {
                                Text(t.emoji, style = MaterialTheme.typography.titleLarge)
                            }
                        },
                        label = { Text(t.label) },
                    )
                }
            }
        },
    ) { padding ->
        // statusBars: com targetSdk 35 o Android desenha sob a barra de status.
        Box(
            Modifier
                .fillMaxSize()
                .padding(padding)
                .windowInsetsPadding(WindowInsets.statusBars),
        ) {
            when (tab) {
                Tab.MENU -> MenuScreen()
                Tab.AI -> AiScreen()
                Tab.CART -> CartScreen { order ->
                    AppData.saveLastOrder(context, order.id)
                    refreshKey++
                    tab = Tab.TRACK
                }
                Tab.TRACK -> TrackScreen(refreshKey)
                Tab.SERVER -> ServerScreen(onConnected = { tab = Tab.MENU })
            }
        }
    }
}
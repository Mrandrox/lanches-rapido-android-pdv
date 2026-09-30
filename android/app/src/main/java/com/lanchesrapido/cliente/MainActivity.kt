package com.lanchesrapido.cliente

import android.os.Bundle
import androidx.activity.ComponentActivity
import androidx.activity.compose.setContent
import androidx.activity.enableEdgeToEdge
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.WindowInsets
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.navigationBars
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.statusBars
import androidx.compose.foundation.layout.windowInsetsPadding
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.NavigationBar
import androidx.compose.material3.NavigationBarItem
import androidx.compose.material3.Scaffold
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.runtime.mutableIntStateOf
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.getValue
import androidx.compose.runtime.setValue
import androidx.compose.ui.Modifier
import androidx.compose.ui.platform.LocalContext
import com.lanchesrapido.cliente.state.LocalStore
import com.lanchesrapido.cliente.ui.CashScreen
import com.lanchesrapido.cliente.ui.LanchesTheme
import com.lanchesrapido.cliente.ui.OrdersScreen
import com.lanchesrapido.cliente.ui.PosScreen
import com.lanchesrapido.cliente.ui.TrashScreen

private enum class Tab(val emoji: String, val label: String) {
    POS("🧾", "PDV"),
    ORDERS("📋", "Comandas"),
    CASH("💰", "Caixa"),
    TRASH("🗑️", "Lixeira"),
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
    val store = remember(context) { LocalStore(context) }
    var tab by remember { mutableStateOf(Tab.POS) }
    var revision by remember { mutableIntStateOf(0) }
    val refresh: () -> Unit = { revision++ }

    Scaffold(
        bottomBar = {
            NavigationBar(modifier = Modifier.windowInsetsPadding(WindowInsets.navigationBars)) {
                Tab.entries.forEach { item ->
                    NavigationBarItem(
                        selected = tab == item,
                        onClick = { tab = item },
                        icon = { Text(item.emoji, style = MaterialTheme.typography.titleLarge) },
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
                Tab.POS -> PosScreen(store, revision, refresh)
                Tab.ORDERS -> OrdersScreen(store, revision, refresh)
                Tab.CASH -> CashScreen(store, revision, refresh)
                Tab.TRASH -> TrashScreen(store, revision, refresh)
            }
        }
    }
}

package com.lanchesrapido.cliente.ui

import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Column
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
import androidx.compose.material3.CircularProgressIndicator
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.OutlinedTextField
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.rememberCoroutineScope
import androidx.compose.runtime.setValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.platform.LocalContext
import androidx.compose.ui.text.input.KeyboardType
import androidx.compose.ui.unit.dp
import androidx.compose.foundation.text.KeyboardOptions
import com.lanchesrapido.cliente.state.AppData
import com.lanchesrapido.cliente.net.ApiException
import kotlinx.coroutines.launch

@Composable
fun ServerScreen(onConnected: () -> Unit) {
    val context = LocalContext.current
    val scope = rememberCoroutineScope()
    var url by remember { mutableStateOf(AppData.loadBaseUrl(context)) }
    var testing by remember { mutableStateOf(false) }
    var message by remember { mutableStateOf("") }
    var error by remember { mutableStateOf(false) }

    Column(
        modifier = Modifier.fillMaxSize().verticalScroll(rememberScrollState()).padding(20.dp),
        verticalArrangement = Arrangement.spacedBy(14.dp),
    ) {
        Text("🛰️ Endereço da loja", style = MaterialTheme.typography.headlineSmall)
        Text(
            "Digite o IP do servidor da lanchonete (mostrado no caderno em Configurações → Aplicativo de pedidos).\n\n" +
                "Ex.: http://192.168.0.10:4175\n\n" +
                "O app e o servidor precisam estar na mesma rede.",
            style = MaterialTheme.typography.bodyMedium,
        )
        OutlinedTextField(
            value = url,
            onValueChange = { url = it },
            label = { Text("Endereço do servidor") },
            placeholder = { Text("http://192.168.0.10:4175") },
            singleLine = true,
            keyboardOptions = KeyboardOptions(keyboardType = KeyboardType.Uri),
            modifier = Modifier.fillMaxWidth(),
        )
        RowButtons(
            testing = testing,
            onTest = {
                scope.launch {
                    testing = true
                    AppData.saveBaseUrl(context, url)
                    try {
                        val name = AppData.testConnection()
                        message = "Conectado a \"$name\" ✅"
                        error = false
                    } catch (e: Exception) {
                        message = (e as? ApiException)?.message ?: e.message ?: "Falha na conexão."
                        error = true
                    }
                    testing = false
                }
            },
            onSave = {
                scope.launch {
                    testing = true
                    AppData.saveBaseUrl(context, url)
                    AppData.invalidate()
                    try {
                        AppData.ensure()
                        message = "Cardápio carregado de \"${AppData.serverName()}\" ✅"
                        error = false
                        onConnected()
                    } catch (e: Exception) {
                        message = (e as? ApiException)?.message ?: e.message ?: "Falha na conexão."
                        error = true
                    }
                    testing = false
                }
            },
        )
        if (testing) {
            CircularProgressIndicator(modifier = Modifier.align(Alignment.CenterHorizontally))
        }
        if (message.isNotEmpty()) {
            Card(
                colors = CardDefaults.cardColors(
                    containerColor = if (error) MaterialTheme.colorScheme.errorContainer
                    else MaterialTheme.colorScheme.primaryContainer,
                ),
                modifier = Modifier.fillMaxWidth(),
            ) {
                Text(message, modifier = Modifier.padding(14.dp))
            }
        }
    }
}

@Composable
private fun RowButtons(
    testing: Boolean,
    onTest: () -> Unit,
    onSave: () -> Unit,
) {
    Column(verticalArrangement = Arrangement.spacedBy(10.dp)) {
        Button(onClick = onTest, enabled = !testing, modifier = Modifier.fillMaxWidth()) {
            Text("🛜 Testar conexão")
        }
        Button(
            onClick = onSave,
            enabled = !testing,
            modifier = Modifier.fillMaxWidth(),
            colors = androidx.compose.material3.ButtonDefaults.buttonColors(
                containerColor = MaterialTheme.colorScheme.primary,
            ),
        ) {
            Text("💾 Salvar e carregar cardápio")
        }
    }
}
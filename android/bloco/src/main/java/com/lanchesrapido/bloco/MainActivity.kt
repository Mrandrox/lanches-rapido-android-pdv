package com.lanchesrapido.bloco

import android.os.Bundle
import androidx.activity.ComponentActivity
import androidx.activity.enableEdgeToEdge
import androidx.activity.compose.setContent
import androidx.compose.foundation.isSystemInDarkTheme
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.darkColorScheme
import androidx.compose.material3.lightColorScheme
import androidx.compose.runtime.Composable
import androidx.compose.ui.graphics.Color
import com.lanchesrapido.bloco.ui.BlocoApp

class MainActivity : ComponentActivity() {
    override fun onCreate(savedInstanceState: Bundle?) {
        super.onCreate(savedInstanceState)
        enableEdgeToEdge()
        setContent {
            BlocoTheme {
                BlocoApp()
            }
        }
    }
}

@Composable
private fun BlocoTheme(content: @Composable () -> Unit) {
    val light = lightColorScheme(
        primary = Color(0xFFE8590C),
        onPrimary = Color.White,
        secondary = Color(0xFFB45309),
        background = Color(0xFFFFF8F5),
        surface = Color.White,
        surfaceVariant = Color(0xFFF5E6DE),
    )
    val dark = darkColorScheme(
        primary = Color(0xFFFFB68C),
        onPrimary = Color(0xFF5A1D00),
        secondary = Color(0xFFF59E0B),
        background = Color(0xFF1C120E),
        surface = Color(0xFF241812),
        surfaceVariant = Color(0xFF2F2018),
    )
    MaterialTheme(colorScheme = if (isSystemInDarkTheme()) dark else light, content = content)
}

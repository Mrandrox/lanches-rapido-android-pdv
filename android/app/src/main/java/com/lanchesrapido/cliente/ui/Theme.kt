package com.lanchesrapido.cliente.ui

import androidx.compose.foundation.isSystemInDarkTheme
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.darkColorScheme
import androidx.compose.material3.lightColorScheme
import androidx.compose.runtime.Composable
import androidx.compose.ui.graphics.Color

private val Light = lightColorScheme(
    primary = Color(0xFFE8590C),
    onPrimary = Color.White,
    primaryContainer = Color(0xFFFFDBCA),
    onPrimaryContainer = Color(0xFF3A0A00),
    secondary = Color(0xFFB45309),
    background = Color(0xFFFFF8F5),
    surface = Color.White,
    surfaceVariant = Color(0xFFF5E6DE),
)

private val Dark = darkColorScheme(
    primary = Color(0xFFFFB68C),
    onPrimary = Color(0xFF5A1D00),
    primaryContainer = Color(0xFF7A2E00),
    onPrimaryContainer = Color(0xFFFFDBCA),
    secondary = Color(0xFFF59E0B),
    background = Color(0xFF1C120E),
    surface = Color(0xFF241812),
    surfaceVariant = Color(0xFF2F2018),
)

@Composable
fun LanchesTheme(content: @Composable () -> Unit) {
    MaterialTheme(
        colorScheme = if (isSystemInDarkTheme()) Dark else Light,
        content = content,
    )
}
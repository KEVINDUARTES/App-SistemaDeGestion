# Mejoras del Frontend - Luciano Cargas

## 📋 Resumen de Cambios

Se han implementado dos mejoras principales en el frontend de la aplicación:

1. **Sidebar con Categorías Agrupadas**: Menú lateral con secciones organizadas por categorías desplegables
2. **Dashboard con Gráfico de Métricas**: Panel de inicio con visualización de datos mediante gráfico de barras

---

## 🎯 1. Sidebar con Categorías Agrupadas

### Estructura Nueva

El menú lateral ahora está organizado en las siguientes categorías:

#### 🏠 **Inicio**
- Dashboard principal

#### 🛒 **Comercial**
- Clientes
- Productos
- Pedidos
- Precios

#### 🚚 **Logística**
- Pedido a Proveedores
- Recepción
- Stock

#### 📦 **Compras**
- Proveedores
- Pagos

#### 💰 **Finanzas**
- Cobranzas
- Cierre
- Historial

### Características

- **Menús Desplegables**: Cada categoría puede expandirse/contraerse haciendo clic
- **Iconos Visuales**: Cada sección tiene un emoji/icono identificativo
- **Animaciones Suaves**: Transiciones fluidas al expandir/contraer
- **Header del Sidebar**: Título "Luciano Cargas" destacado en la parte superior
- **Estado Activo**: La categoría activa permanece expandida automáticamente

### Código HTML

```html
<nav class="sidebar">
    <div class="sidebar-header">
        <h2>Luciano Cargas</h2>
    </div>
    <ul class="nav-menu">
        <!-- Categorías con submenús -->
        <li class="nav-category">
            <a href="#" class="nav-category-toggle">
                <span class="nav-icon">🛒</span>
                <span class="nav-text">Comercial</span>
                <span class="nav-arrow">▼</span>
            </a>
            <ul class="nav-submenu">
                <li><a href="#" data-page="clientes" class="nav-link">Clientes</a></li>
                <!-- ... más opciones -->
            </ul>
        </li>
    </ul>
</nav>
```

### JavaScript

```javascript
// Funcionalidad de menús desplegables
document.querySelectorAll('.nav-category-toggle').forEach(toggle => {
    toggle.addEventListener('click', (e) => {
        e.preventDefault();
        const category = toggle.parentElement;
        
        // Cerrar otras categorías
        document.querySelectorAll('.nav-category').forEach(cat => {
            if (cat !== category) {
                cat.classList.remove('active');
            }
        });
        
        // Toggle categoría actual
        category.classList.toggle('active');
    });
});
```

---

## 📊 2. Dashboard con Gráfico de Métricas

### Características del Dashboard

#### Gráfico Principal: Top 5 Productos Más Vendidos

- **Tipo**: Gráfico de barras horizontales
- **Librería**: Chart.js v4.4.1
- **Datos**: Se calculan dinámicamente desde los pedidos de la última semana
- **Animaciones**: Transiciones suaves y tooltips interactivos
- **Diseño**: Colores degradados en azul (tema de la aplicación)

#### Cards Informativos

El dashboard muestra 4 tarjetas con métricas clave:

1. **📋 Pedidos del día**
   - Contador de pedidos actuales
   - Click para ir a la sección de Pedidos

2. **💵 Cobranzas pendientes**
   - Total por cobrar en pesos
   - Click para ir a Cobranzas

3. **💳 Proveedores a pagar**
   - Saldo total pendiente
   - Click para ir a Pagos

4. **📦 Stock bajo**
   - Cantidad de productos con stock crítico
   - Click para ir a Stock

### Código HTML

```html
<div id="dashboard" class="page active">
    <!-- Gráfico de métricas -->
    <div class="metrics-section">
        <div class="metrics-card">
            <h3 class="metrics-title">Top 5 Productos Más Vendidos (Semana)</h3>
            <div class="chart-container">
                <canvas id="topProductsChart"></canvas>
            </div>
        </div>
    </div>
    
    <!-- Cards informativos -->
    <div class="dashboard-grid">
        <div class="dashboard-card" onclick="Navigation.navigateTo('pedidos')">
            <h3>📋 Pedidos del día</h3>
            <div class="card-value" id="dashboard-pedidos-count">0</div>
            <p class="card-label">Total</p>
        </div>
        <!-- ... más cards -->
    </div>
</div>
```

### JavaScript del Dashboard

```javascript
const Dashboard = {
    chart: null,
    
    async load() {
        // Cargar datos en paralelo
        const [pedidos, cobranzas, stock] = await Promise.all([
            API.getPedidos(AppState.currentDate),
            API.getCobranzas(),
            API.getStock()
        ]);
        
        // Actualizar contadores
        this.updateCounters(pedidos, cobranzas, stock);
        
        // Cargar gráfico
        await this.loadTopProductsChart();
    },
    
    loadTopProductsChart() {
        // Procesar datos de pedidos
        // Agrupar por producto
        // Ordenar y tomar top 5
        // Renderizar con Chart.js
    }
};
```

### Configuración del Gráfico

```javascript
new Chart(ctx, {
    type: 'bar',
    data: {
        labels: ['Producto 1', 'Producto 2', ...],
        datasets: [{
            label: 'Unidades vendidas',
            data: [850, 720, 680, 520, 450],
            backgroundColor: 'rgba(59, 130, 246, 0.8)',
            borderRadius: 6
        }]
    },
    options: {
        indexAxis: 'y', // Barras horizontales
        responsive: true,
        maintainAspectRatio: false
    }
});
```

---

## 🎨 Estilos CSS Agregados

### Sidebar Header

```css
.sidebar-header {
    padding: 28px 20px;
    background: var(--color-primary-gradient);
    box-shadow: var(--shadow-md);
}
```

### Categorías Desplegables

```css
.nav-category-toggle {
    display: flex;
    align-items: center;
    justify-content: space-between;
    /* ... */
}

.nav-submenu {
    max-height: 0;
    overflow: hidden;
    transition: max-height 0.3s ease;
}

.nav-category.active .nav-submenu {
    max-height: 500px;
}
```

### Gráfico y Métricas

```css
.metrics-card {
    background: linear-gradient(135deg, rgba(255, 255, 255, 0.95) 0%, rgba(255, 255, 255, 0.85) 100%);
    backdrop-filter: blur(10px);
    border-radius: var(--radius-xl);
    padding: 32px;
}

.chart-container {
    position: relative;
    height: 350px;
}

.card-value {
    font-size: 36px;
    font-weight: 700;
    background: var(--color-primary-gradient);
    -webkit-background-clip: text;
    -webkit-text-fill-color: transparent;
}
```

---

## 📦 Dependencias Agregadas

### Chart.js

Se agregó la librería Chart.js para la visualización de datos:

```html
<script src="https://cdn.jsdelivr.net/npm/chart.js@4.4.1/dist/chart.umd.min.js"></script>
```

**Características de Chart.js:**
- Gráficos responsivos
- Múltiples tipos de gráficos
- Animaciones suaves
- Tooltips interactivos
- Fácil personalización

---

## 🚀 Cómo Usar las Nuevas Características

### Navegación por Categorías

1. Haz clic en cualquier categoría (Comercial, Logística, Compras, Finanzas)
2. El menú se expandirá mostrando las opciones disponibles
3. Haz clic en una opción para navegar a esa sección
4. Las otras categorías se cerrarán automáticamente

### Dashboard

1. Al abrir la aplicación, verás el Dashboard por defecto
2. El gráfico muestra los 5 productos más vendidos de la semana
3. Las tarjetas muestran métricas actualizadas en tiempo real
4. Haz clic en cualquier tarjeta para ir a la sección correspondiente

---

## 🔧 Personalización

### Cambiar Colores del Gráfico

En `app.js`, dentro de `Dashboard.renderChart()`:

```javascript
backgroundColor: [
    'rgba(59, 130, 246, 0.8)',  // Azul principal
    'rgba(96, 165, 250, 0.8)',  // Azul claro
    // ... más colores
]
```

### Agregar Más Categorías al Sidebar

En `index.html`:

```html
<li class="nav-category">
    <a href="#" class="nav-category-toggle">
        <span class="nav-icon">🔧</span>
        <span class="nav-text">Nueva Categoría</span>
        <span class="nav-arrow">▼</span>
    </a>
    <ul class="nav-submenu">
        <li><a href="#" data-page="nueva-seccion" class="nav-link">Nueva Sección</a></li>
    </ul>
</li>
```

### Cambiar Periodo del Gráfico

En `app.js`, modifica la lógica en `loadTopProductsChart()`:

```javascript
// Cambiar de 7 días a 30 días
lastWeek.setDate(today.getDate() - 30);
```

---

## 📱 Responsive Design

Ambas características son completamente responsivas:

- **Móvil**: El sidebar se colapsa a iconos solamente
- **Tablet**: Sidebar de ancho reducido
- **Desktop**: Vista completa con todas las características

---

## ✅ Testing

### Probar el Sidebar

1. ✅ Hacer clic en cada categoría verifica que se expanda
2. ✅ Verificar que solo una categoría esté abierta a la vez
3. ✅ Comprobar que las animaciones sean suaves
4. ✅ Verificar que los links funcionen correctamente

### Probar el Dashboard

1. ✅ Verificar que el gráfico se muestre correctamente
2. ✅ Comprobar que los datos sean reales (o de ejemplo si no hay datos)
3. ✅ Verificar que las tarjetas sean clickeables
4. ✅ Comprobar que los contadores se actualicen
5. ✅ Verificar la responsividad en diferentes tamaños de pantalla

---

## 🐛 Troubleshooting

### El gráfico no se muestra

- Verifica que Chart.js esté cargado correctamente
- Revisa la consola del navegador en busca de errores
- Asegúrate de que el elemento `<canvas id="topProductsChart">` exista

### Los menús no se despliegan

- Verifica que el JavaScript de navegación se haya inicializado
- Revisa los event listeners en la consola
- Comprueba que las clases CSS estén aplicadas correctamente

### Los datos no se actualizan

- Verifica la conexión con la API de Google Sheets
- Revisa los logs en la consola
- Comprueba que los datos estén siendo recuperados correctamente

---

## 📚 Recursos

- [Chart.js Documentation](https://www.chartjs.org/docs/latest/)
- [CSS Transitions](https://developer.mozilla.org/es/docs/Web/CSS/CSS_Transitions/Using_CSS_transitions)
- [Flexbox Guide](https://css-tricks.com/snippets/css/a-guide-to-flexbox/)

---

## 🎉 Resultado Final

### Antes
- ❌ Menú plano sin organización
- ❌ Dashboard simple con listas estáticas
- ❌ Sin visualización de datos

### Después
- ✅ Menú organizado por categorías
- ✅ Submenús desplegables con animaciones
- ✅ Dashboard moderno con gráfico de barras
- ✅ Tarjetas informativas clickeables
- ✅ Métricas actualizadas en tiempo real

---

**¡Las mejoras están listas para usar! 🚀**














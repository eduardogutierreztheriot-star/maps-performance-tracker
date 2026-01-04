# MAPS Performance Tracker Pro 🔥

## Características Principales

### ✅ Implementadas:

1. **📅 Programación Flexible de Fechas**
   - Programa cada día de entrenamiento según tu horario
   - Visualiza fechas programadas en los botones de selección
   - Las sesiones guardadas usan las fechas programadas

2. **📊 Gráficas de Progreso con Chart.js**
   - Tracking automático de ejercicios clave (Squat, Deadlift, Bench Press)
   - Visualización de progreso de peso a lo largo del tiempo
   - Se actualiza automáticamente con cada sesión guardada
   - Responsive y se adapta al tema claro/oscuro

3. **🌓 Modo Claro/Oscuro**
   - Toggle en la esquina superior derecha
   - Se guarda tu preferencia en localStorage
   - Todos los componentes (incluyendo gráficas) se adaptan

4. **📱 PWA - App Instalable**
   - Funciona offline (básico)
   - Instalable en iOS, Android, Windows, Mac
   - Ícono en pantalla de inicio
   - Se abre como app nativa
   - Aparece prompt de instalación automáticamente

5. **🎥 Links de Videos de Ejercicios**
   - Botón "🎥 Ver Demo" en cada ejercicio
   - Abre video en nueva pestaña
   - IMPORTANTE: Ver instrucciones de personalización abajo

## 📝 Cómo Personalizar los Links de Videos

Los links de videos están en la línea **~42** del archivo HTML. Busca el objeto `exerciseLinks`:

```javascript
const exerciseLinks = {
    // Phase 1
    "Phase 1 Squat": "TU_LINK_AQUI",
    "Phase 1 Bench Press": "TU_LINK_AQUI",
    "High Pull": "TU_LINK_AQUI",
    // ... más ejercicios
};
```

### Pasos para agregar tus links:

1. **Abre el archivo HTML** en un editor de texto (VS Code, Notepad++, etc.)

2. **Busca la sección** `const exerciseLinks = {` (línea ~42)

3. **Reemplaza los URLs** con tus links del MAPS Performance Membership site:
   ```javascript
   "Phase 1 Squat": "https://tu-sitio.com/videos/phase1-squat",
   "Phase 1 Bench Press": "https://tu-sitio.com/videos/phase1-bench",
   ```

4. **Guarda el archivo** y recarga la página

### Ejemplo de links reales:

Si tus videos están en el membership site de Mind Pump, sería algo como:

```javascript
const exerciseLinks = {
    "Phase 1 Squat": "https://members.mindpumpmedia.com/programs/maps-performance/exercises/phase-1-squat",
    "Phase 1 Bench Press": "https://members.mindpumpmedia.com/programs/maps-performance/exercises/phase-1-bench",
    // etc...
};
```

### Si no tienes el link de un ejercicio:

Simplemente déjalo con el link genérico o bórralo:
```javascript
// Opción 1: Link genérico a la página principal
"Ejercicio Sin Video": "https://www.mindpumpmedia.com/maps-performance",

// Opción 2: No incluirlo (no aparecerá el botón)
// Simplemente no lo pongas en la lista
```

## 🚀 Cómo Instalar como App (PWA)

### En Chrome/Edge (Desktop):
1. Abre el archivo HTML en el navegador
2. Verás un botón de instalación en la barra superior o un banner en la página
3. Click en "Instalar" y listo

### En iPhone/iPad:
1. Abre en Safari
2. Tap en el botón de compartir
3. Selecciona "Agregar a pantalla de inicio"
4. Confirma

### En Android:
1. Abre en Chrome
2. Tap en el menú (3 puntos)
3. Selecciona "Agregar a pantalla de inicio" o aparecerá un banner automático
4. Confirma

**⚠️ Nota Importante sobre PWA:**
- Los 4 archivos (HTML, manifest.json, service-worker.js, README) deben estar en la misma carpeta
- Si abres el HTML directamente (doble-click), el Service Worker puede fallar - esto es normal
- Para PWA completo con offline: súbelos a un hosting web o usa un servidor local
- La app funciona perfectamente sin Service Worker, solo no tendrás modo offline

## 💡 Funcionalidades Extra

### Programación de Fechas:
- En la sección "📅 Programar Días de Entrenamiento"
- Selecciona la fecha que planeas hacer cada entrenamiento
- Click en "Guardar Programación"
- Las fechas aparecerán en los botones de días

### Temporizador de Descanso:
- Se activa automáticamente según la fase
- Phase I/III: 3-5 minutos
- Phase II: 30-90 segundos
- Phase IV: Mínimo (circuito)
- Suena un beep al terminar

### Cargar Sesión Anterior:
- Al iniciar un entrenamiento, usa "📂 Cargar Última Sesión Similar"
- Autocompleta con los pesos de tu última sesión del mismo día
- Útil para tracking progresivo de carga

### Gráficas de Progreso:
- Automáticamente rastrea: Phase 1 Squat, Deadlift, Bench Press, Front Squat
- Muestra tu progreso de peso a lo largo del tiempo
- Se actualiza con cada sesión guardada

## 📂 Archivos Incluidos

- `maps_tracker_ultimate.html` - Aplicación principal
- `manifest.json` - Configuración PWA (debe estar en la misma carpeta)
- `service-worker.js` - Service Worker para funcionamiento offline (debe estar en la misma carpeta)
- `README.md` - Este archivo

**IMPORTANTE:** Los 3 archivos principales (HTML, manifest.json, service-worker.js) DEBEN estar en la misma carpeta para que la PWA funcione correctamente.

## 🔧 Requisitos

- Navegador moderno (Chrome, Firefox, Safari, Edge)
- JavaScript habilitado
- Para PWA: HTTPS o localhost (para testing local no hay problema)

## 💾 Datos Guardados

Toda tu información se guarda en el navegador (localStorage):
- `maps_logs` - Historial de entrenamientos
- `workout_schedule` - Fechas programadas
- `theme` - Preferencia de tema claro/oscuro

**IMPORTANTE:** Si borras los datos del navegador, perderás tu historial. Para backup, puedes exportar desde la consola del navegador:

```javascript
// En la consola del navegador (F12)
console.log(localStorage.getItem('maps_logs'));
// Copia el resultado y guárdalo en un archivo de texto
```

## 🎨 Personalización Adicional

### Cambiar Colores:
Edita las variables CSS al inicio del archivo (línea ~14):

```css
:root {
    --primary: #4CAF50;        /* Verde principal */
    --accent: #76ff03;         /* Verde acento */
    --accent-secondary: #00bcd4; /* Cyan para mobility */
    --orange: #ff9800;         /* Naranja para alertas */
    /* etc... */
}
```

### Agregar más ejercicios al gráfico:
Busca la línea que dice:
```javascript
const keyExercises = ['Phase 1 Squat', 'Phase 1 Deadlift', 'Phase 1 Bench Press', 'Front Squat'];
```

Agrega los ejercicios que quieras trackear:
```javascript
const keyExercises = ['Phase 1 Squat', 'Phase 1 Deadlift', 'Phase 1 Bench Press', 'Front Squat', 'Walking Lunges'];
```

## 🐛 Solución de Problemas

**La app no se instala:**
- Asegúrate de que manifest.json Y service-worker.js estén en la misma carpeta que el HTML
- En producción, necesitas HTTPS (en localhost funciona sin HTTPS)
- Verifica en DevTools > Application > Service Workers que se registró correctamente

**"Service Worker registration failed":**
- Los 3 archivos (HTML, manifest.json, service-worker.js) deben estar juntos
- Si usas un servidor web, asegúrate de que service-worker.js sea accesible
- En Chrome: F12 > Application > Service Workers para ver detalles del error

**No aparecen las gráficas:**
- Necesitas al menos una sesión guardada con pesos
- Los ejercicios deben coincidir con los nombres exactos en keyExercises

**Los videos no abren:**
- Verifica que los links estén correctos
- Asegúrate de tener acceso al membership site

**Perdí mis datos:**
- Revisa que no hayas borrado cookies/localStorage del navegador
- Los datos solo persisten en el navegador donde los guardaste

## 🎯 Tips de Uso

1. **Programa tus entrenamientos** al inicio de la semana
2. **Usa el temporizador** para descansos consistentes
3. **Carga sesión anterior** para ver tu progreso inmediato
4. **Agrega notas** sobre cómo te sentiste, ajustes, etc.
5. **Revisa las gráficas** semanalmente para ver tu progreso
6. **Usa modo claro** durante el día en el gym si hay mucha luz
7. **Instala como app** para acceso rápido desde tu teléfono

## 📈 Roadmap Futuro (Sugerencias)

- Export/Import de datos (JSON, CSV)
- Backup automático en la nube
- Más tipos de gráficas (volumen total, 1RM estimado)
- Calculadora de 1RM
- Notificaciones de recordatorio
- Comparación entre fases
- Estadísticas avanzadas

---

**¡A romperla en el gym! 💪🔥**

Cualquier duda o sugerencia, ajusta el código según necesites. Todo está en un solo archivo HTML para facilidad máxima.
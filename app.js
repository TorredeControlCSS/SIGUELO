class DashboardHub {
    constructor() {
        this.currentDashboard = null;
        this.init();
    }

    init() {
        this.setupEventListeners();
        this.checkPWAInstall();
    }

    setupEventListeners() {
        document.querySelectorAll('.dashboard-card').forEach(card => {
            card.addEventListener('click', () => {
                const dashboardId = card.dataset.dashboard;
                this.loadDashboard(dashboardId);
            });
        });

        document.getElementById('backButton').addEventListener('click', () => {
            this.showMainMenu();
        });
    }

    loadDashboard(dashboardId) {
        this.currentDashboard = dashboardId;
        
        document.getElementById('mainMenu').classList.add('hidden');
        document.getElementById('dashboardContainer').classList.remove('hidden');

        this.loadDashboardContent(dashboardId);
    }

    loadDashboardContent(dashboardId) {
        const contentContainer = document.getElementById('dashboardContent');
        contentContainer.innerHTML = this.getDashboardTemplate(dashboardId);

        this.loadDashboardData(dashboardId);
    }

    getDashboardTemplate(dashboardId) {
        const templates = {
            '1': `<h2>Dashboard 1</h2><p>Contenido específico del primer dashboard</p><div id="dataContainer1"></div>`,
            '2': `<h2>Dashboard 2</h2><p>Contenido del segundo dashboard</p><div id="dataContainer2"></div>`,
            '3': `
                <div class="calendario-module">
                    <div class="module-header">
                        <h2>📅 Calendario de Citas - CEDIS PANAMA CSS</h2>
                        <button class="back-btn" onclick="window.dashboardHub.showMainMenu()">← Volver al Hub</button>
                    </div>
                    <div id="calendarioContainer"></div>
                </div>
            `,
            '4': `<h2>Dashboard 4</h2><p>Contenido en desarrollo</p>`,
            '5': `<h2>Dashboard 5</h2><p>Contenido en desarrollo</p>`,
            '6': `<h2>Dashboard 6</h2><p>Contenido en desarrollo</p>`,
            '7': `<h2>Dashboard 7</h2><p>Contenido en desarrollo</p>`,
            '8': `<h2>Dashboard 8</h2><p>Contenido en desarrollo</p>`
        };
        return templates[dashboardId] || `<h2>Dashboard ${dashboardId}</h2><p>Contenido en desarrollo</p>`;
    }

    async loadDashboardData(dashboardId) {
        try {
            if (dashboardId === '3') {
                await this.inicializarCalendario();
            } else {
                // PARA LOS OTROS DASHBOARDS - USAR JSONP TAMBIÉN
                const data = await this.fetchFromGoogleSheets(dashboardId);
                this.renderDashboardData(dashboardId, data);
            }
        } catch (error) {
            console.error('Error cargando datos:', error);
            this.showError(dashboardId, error);
        }
    }

    // ========== FUNCIONES ESPECÍFICAS PARA CALENDARIO (DASHBOARD 3) ==========
    
    async inicializarCalendario() {
        const container = document.getElementById('calendarioContainer');
        container.innerHTML = '<div class="calendario-loading">Cargando Calendario de Citas...</div>';
        
        try {
            const response = await this.fetchCalendarioData();
            
            if (response.success) {
                this.cargarInterfazCalendario(container, response.data);
            } else {
                container.innerHTML = `<div class="calendario-error">Error: ${response.error}</div>`;
            }
        } catch (error) {
            container.innerHTML = `<div class="calendario-error">Error cargando el calendario: ${error.message}</div>`;
        }
    }

    async fetchCalendarioData() {
        return new Promise((resolve, reject) => {
            // REEMPLAZA ESTA_URL_CON_LA_NUEVA con la URL que copiaste al republicar
            const APPS_SCRIPT_URL = 'https://script.google.com/macros/s/AKfycbyPX8tQIRDhAOjlKfSi_Pv56WbWMZVdP4yywVWv5oXFyLNnquQsz4OsiMh2CurP-bnO/exec?callback=handleCitasData';
            
            const script = document.createElement('script');
            script.src = APPS_SCRIPT_URL;
            
            window.handleCitasData = (response) => {
                document.head.removeChild(script);
                delete window.handleCitasData;
                resolve(response);
            };
            
            script.onerror = () => {
                document.head.removeChild(script);
                delete window.handleCitasData;
                reject(new Error('Error cargando datos del calendario'));
            };
            
            document.head.appendChild(script);
        });
    }

    // ========== FUNCIONES GENÉRICAS PARA TODOS LOS DASHBOARDS ==========

    async fetchFromGoogleSheets(dashboardId) {
        return new Promise((resolve, reject) => {
            // MISMA URL PERO CON PARÁMETROS DIFERENTES
            const APPS_SCRIPT_URL = `https://script.google.com/macros/s/AKfycbyPX8tQIRDhAOjlKfSi_Pv56WbWMZVdP4yywVWv5oXFyLNnquQsz4OsiMh2CurP-bnO/exec?action=getData&dashboard=${dashboardId}&callback=handleDashboardData`;
            
            const script = document.createElement('script');
            script.src = APPS_SCRIPT_URL;
            
            window.handleDashboardData = (response) => {
                document.head.removeChild(script);
                delete window.handleDashboardData;
                resolve(response);
            };
            
            script.onerror = () => {
                document.head.removeChild(script);
                delete window.handleDashboardData;
                reject(new Error('Error cargando datos del dashboard'));
            };
            
            document.head.appendChild(script);
        });
    }

    // FUNCIÓN PARA ESCRITURA (PARA DASHBOARDS BIDIRECCIONALES)
    async writeToGoogleSheets(dashboardId, data) {
        // PARA ESCRITURA USAMOS POST NORMAL (NO JSONP)
        const APPS_SCRIPT_URL = 'https://script.google.com/macros/s/AKfycbyPX8tQIRDhAOjlKfSi_Pv56WbWMZVdP4yywVWv5oXFyLNnquQsz4OsiMh2CurP-bnO/exec';
        
        const response = await fetch(APPS_SCRIPT_URL, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
            },
            body: JSON.stringify({
                action: 'writeData',
                dashboard: dashboardId,
                data: data
            })
        });

        return await response.json();
    }

    renderDashboardData(dashboardId, data) {
        // Tu lógica específica de renderizado para cada dashboard
        const container = document.getElementById(`dataContainer${dashboardId}`);
        if (container) {
            container.innerHTML = `<pre>${JSON.stringify(data, null, 2)}</pre>`;
        }
    }

    showMainMenu() {
        document.getElementById('dashboardContainer').classList.add('hidden');
        document.getElementById('mainMenu').classList.remove('hidden');
        this.currentDashboard = null;
    }

    checkPWAInstall() {
        if (window.matchMedia('(display-mode: standalone)').matches) {
            console.log('Running as PWA');
        }
    }

    showError(dashboardId, error) {
        const container = document.getElementById(`dataContainer${dashboardId}`);
        if (container) {
            container.innerHTML = `<div class="error">Error: ${error.message}</div>`;
        }
    }

    // ========== FUNCIONES PÚBLICAS PARA CALENDARIO ==========
    
    recargarCalendario() {
        console.log('Recargando datos del calendario...');
        this.inicializarCalendario();
    }

    limpiarFiltrosCalendario() {
        console.log('Limpiando filtros del calendario...');
        // Tu código para limpiar filtros del calendario
    }

    // ========== INTERFAZ COMPLETA DEL CALENDARIO ==========
    
   cargarInterfazCalendario(container, citasData) {
    console.log('Cargando interfaz COMPLETA del calendario con', citasData.length, 'citas');
    
    container.innerHTML = `
        <!-- Header del Calendario -->
        <div class="calendario-header">
            <div class="calendario-header-top">
                <img src="data:image/png;base64,TU_BASE64_AQUI" alt="Logo Institucional" class="calendario-logo">
                <div class="calendario-header-title">          
                    <h1>Calendario de Citas de Proveedores - CEDIS PANAMA CSS</h1>
                    <div class="calendario-date-info" id="calendarioCurrentDateTime"></div>
                </div>
                <div class="calendario-theme-selector">
                    <label for="calendarioThemeMode">Tema:</label>
                    <select id="calendarioThemeMode">
                        <option value="auto">Sistema</option>
                        <option value="light">Claro</option>
                        <option value="dark">Oscuro</option>
                    </select>
                </div>
            </div>

            <!-- Filtros -->
            <div class="calendario-filters">
                <div class="calendario-filter-group">
                    <label for="calendarioModoVisualizacion">Modo de Visualización:</label>
                    <select id="calendarioModoVisualizacion">
                        <option value="dia">Día Individual</option>
                        <option value="rango">Rango de Fechas</option>
                    </select>
                </div>
                
                <div class="calendario-filter-group">
                    <label for="calendarioFechaVisualizar">Fecha a Visualizar:</label>
                    <input type="date" id="calendarioFechaVisualizar">
                </div>
                
                <div class="calendario-filter-group">
                    <label for="calendarioFechaInicio">Fecha Inicio:</label>
                    <input type="date" id="calendarioFechaInicio">
                </div>

                <div class="calendario-filter-group">
                    <label for="calendarioFechaFin">Fecha Fin:</label>
                    <input type="date" id="calendarioFechaFin">
                </div>
                
                <div class="calendario-filter-group">
                    <label for="calendarioFiltroProveedor">Nombre del Proveedor:</label>
                    <select id="calendarioFiltroProveedor">
                        <option value="">Todos los proveedores</option>
                    </select>
                </div>
                
                <div class="calendario-filter-group">
                    <label for="calendarioFiltroArea">Área Correspondiente:</label>
                    <select id="calendarioFiltroArea">
                        <option value="">Todas las áreas</option>
                    </select>
                </div>
                
                <div class="calendario-filter-group">
                    <label for="calendarioFiltroProducto">Descripción del Producto:</label>
                    <select id="calendarioFiltroProducto">
                        <option value="">Todos los productos</option>
                    </select>
                </div>
                
                <div class="calendario-filter-group">
                    <label for="calendarioFiltroEstado">Estado de la Cita:</label>
                    <select id="calendarioFiltroEstado">
                        <option value="">Todos los estados</option>
                    </select>
                </div>
            </div>

            <!-- Botones -->
            <div class="calendario-btn-container">
                <button class="calendario-refresh-btn" id="calendarioRefreshBtn">🔄 Actualizar datos</button>
                <button class="calendario-clear-btn" id="calendarioClearBtn">🧹 Limpiar Filtros</button>
            </div>

            <!-- Panel de Métricas -->
            <div class="calendario-metrics-panel" id="calendarioMetricsPanel">
                <!-- Las métricas se generarán dinámicamente -->
            </div>

            <!-- Gráfico Semanal -->
            <div class="calendario-chart-card">
                <h3>📊 Carga Semanal: Citas vs Pallets</h3>
                <div class="calendario-chart-container">
                    <canvas id="calendarioCargaSemanalChart"></canvas>
                </div>
            </div>
        </div>

        <!-- Contenido Principal -->
        <div class="calendario-main-content">
            <!-- Bloque Izquierdo: Citas del Día Seleccionado -->
            <div class="calendario-card">
                <h2>Citas del Período Seleccionado</h2>
                <div class="calendario-citas-list" id="calendarioCitasDia">
                    <div class="calendario-loading">Cargando citas desde Google Sheets...</div>
                </div>
            </div>

            <!-- Bloque Derecho: Próximos Días -->
            <div class="calendario-card">
                <h2>Próximos Días</h2>
                <div class="calendario-proximas-citas" id="calendarioProximasCitas">
                    <div class="calendario-empty-state">Los datos se cargarán automáticamente</div>
                </div>
            </div>
        </div>
    `;

    // Inicializar la funcionalidad COMPLETA del calendario
    this.inicializarCalendarioCompleto(citasData);
}

inicializarCalendarioCompleto(citasData) {
    console.log('Inicializando calendario COMPLETO con', citasData.length, 'citas');
    
    // Aquí va TODO el JavaScript de tu calendario original
    // Pero adaptado para usar los nuevos IDs con prefijo "calendario"
    
    // Guardar los datos globalmente para el calendario
    window.calendarioData = citasData;
    
    // Inicializar variables del calendario
    this.calendarioCitasData = citasData;
    this.calendarioCargaSemanalChart = null;
    
    // Inicializar elementos del DOM del calendario
    this.calendarioFechaVisualizar = document.getElementById('calendarioFechaVisualizar');
    this.calendarioFechaInicio = document.getElementById('calendarioFechaInicio');
    this.calendarioFechaFin = document.getElementById('calendarioFechaFin');
    this.calendarioModoVisualizacion = document.getElementById('calendarioModoVisualizacion');
    this.calendarioFiltroProveedor = document.getElementById('calendarioFiltroProveedor');
    this.calendarioFiltroArea = document.getElementById('calendarioFiltroArea');
    this.calendarioFiltroProducto = document.getElementById('calendarioFiltroProducto');
    this.calendarioFiltroEstado = document.getElementById('calendarioFiltroEstado');
    this.calendarioCitasDia = document.getElementById('calendarioCitasDia');
    this.calendarioProximasCitas = document.getElementById('calendarioProximasCitas');
    this.calendarioCurrentDateTime = document.getElementById('calendarioCurrentDateTime');
    this.calendarioThemeMode = document.getElementById('calendarioThemeMode');

    // Configuración inicial de fechas
    const hoy = new Date();
    const haceUnaSemana = new Date();
    haceUnaSemana.setDate(hoy.getDate() - 7);
    
    this.calendarioFechaVisualizar.value = hoy.toISOString().split('T')[0];
    this.calendarioFechaInicio.value = haceUnaSemana.toISOString().split('T')[0];
    this.calendarioFechaFin.value = hoy.toISOString().split('T')[0];
    
    // Actualizar fecha y hora actual
    this.actualizarFechaHoraCalendario();
    setInterval(() => this.actualizarFechaHoraCalendario(), 60000);
    
    // Poblar filtros
    this.poblarFiltrosCalendario();
    
    // Configurar event listeners
    this.configurarEventListenersCalendario();
    
    // Cargar datos iniciales
    this.calendarioCargarDatos();
    
    // Configurar botones
    document.getElementById('calendarioRefreshBtn').addEventListener('click', () => {
        this.recargarCalendario();
    });
    
    document.getElementById('calendarioClearBtn').addEventListener('click', () => {
        this.limpiarFiltrosCalendario();
    });
}

// AGREGAR TODAS LAS FUNCIONES DE TU CALENDARIO ORIGINAL AQUÍ
// Pero cambia los nombres para usar "calendario" como prefijo

actualizarFechaHoraCalendario() {
    const now = new Date();
    const options = { 
        weekday: 'long', 
        year: 'numeric', 
        month: 'long', 
        day: 'numeric',
        hour: '2-digit',
        minute: '2-digit'
    };
    const dateTimeStr = now.toLocaleDateString('es-ES', options);
    if (this.calendarioCurrentDateTime) {
        this.calendarioCurrentDateTime.textContent = dateTimeStr;
    }
}

poblarFiltrosCalendario() {
    if (!this.calendarioCitasData.length) return;
    
    // Obtener valores únicos para cada filtro
    const proveedores = [...new Set(this.calendarioCitasData.map(cita => cita.nombre_proveedor).filter(Boolean))].sort();
    const areas = [...new Set(this.calendarioCitasData.map(cita => cita.area_correspondiente).filter(Boolean))].sort();
    const productos = [...new Set(this.calendarioCitasData.map(cita => cita.descripcion_producto).filter(Boolean))].sort();
    const estados = [...new Set(this.calendarioCitasData.map(cita => cita.estado_cita).filter(Boolean))].sort();
    
    // Poblar dropdowns
    this.poblarDropdownCalendario(this.calendarioFiltroProveedor, proveedores);
    this.poblarDropdownCalendario(this.calendarioFiltroArea, areas);
    this.poblarDropdownCalendario(this.calendarioFiltroProducto, productos);
    this.poblarDropdownCalendario(this.calendarioFiltroEstado, estados);
}

poblarDropdownCalendario(dropdown, opciones) {
    while (dropdown.options.length > 1) {
        dropdown.remove(1);
    }
    
    opciones.forEach(opcion => {
        const option = document.createElement('option');
        option.value = opcion;
        option.textContent = opcion;
        dropdown.appendChild(option);
    });
}

configurarEventListenersCalendario() {
    this.calendarioModoVisualizacion.addEventListener('change', () => {
        this.calendarioCambiarModoVisualizacion();
    });
    
    this.calendarioFechaVisualizar.addEventListener('change', () => {
        this.calendarioCargarDatos();
    });
    
    this.calendarioFechaInicio.addEventListener('change', () => {
        this.calendarioCargarDatos();
    });
    
    this.calendarioFechaFin.addEventListener('change', () => {
        this.calendarioCargarDatos();
    });
    
    this.calendarioFiltroProveedor.addEventListener('change', () => {
        this.calendarioCargarDatos();
    });
    
    this.calendarioFiltroArea.addEventListener('change', () => {
        this.calendarioCargarDatos();
    });
    
    this.calendarioFiltroProducto.addEventListener('change', () => {
        this.calendarioCargarDatos();
    });
    
    this.calendarioFiltroEstado.addEventListener('change', () => {
        this.calendarioCargarDatos();
    });
}

calendarioCambiarModoVisualizacion() {
    const modo = this.calendarioModoVisualizacion.value;
    const esRango = modo === 'rango';
    
    this.calendarioFechaVisualizar.style.display = esRango ? 'none' : 'block';
    this.calendarioFechaInicio.style.display = esRango ? 'block' : 'none';
    this.calendarioFechaFin.style.display = esRango ? 'block' : 'none';
    
    this.calendarioCargarDatos();
}

calendarioCargarDatos() {
    console.log('Cargando datos del calendario...');
    
    const proveedorFiltro = this.calendarioFiltroProveedor.value;
    const areaFiltro = this.calendarioFiltroArea.value;
    const productofiltro = this.calendarioFiltroProducto.value;
    const estadoFiltro = this.calendarioFiltroEstado.value;
    const modo = this.calendarioModoVisualizacion.value;
    
    let citasFiltradas = [];
    let proximas = [];
    
    if (modo === 'dia') {
        const fechaSeleccionada = this.calendarioFechaVisualizar.value;
        
        citasFiltradas = this.calendarioCitasData.filter(cita => {
            const cumpleFecha = cita.fecha_confirmada === fechaSeleccionada;
            const cumpleProveedor = !proveedorFiltro || cita.nombre_proveedor === proveedorFiltro;
            const cumpleArea = !areaFiltro || cita.area_correspondiente === areaFiltro;
            const cumpleProducto = !productofiltro || cita.descripcion_producto === productofiltro;
            const cumpleEstado = !estadoFiltro || cita.estado_cita === estadoFiltro;
            
            return cumpleFecha && cumpleProveedor && cumpleArea && cumpleProducto && cumpleEstado;
        });
        
        proximas = this.calendarioCitasData.filter(cita => {
            const cumpleFecha = cita.fecha_confirmada > fechaSeleccionada;
            const cumpleProveedor = !proveedorFiltro || cita.nombre_proveedor === proveedorFiltro;
            const cumpleArea = !areaFiltro || cita.area_correspondiente === areaFiltro;
            const cumpleProducto = !productofiltro || cita.descripcion_producto === productofiltro;
            const cumpleEstado = !estadoFiltro || cita.estado_cita === estadoFiltro;
            
            return cumpleFecha && cumpleProveedor && cumpleArea && cumpleProducto && cumpleEstado;
        });
    } else {
        citasFiltradas = this.calendarioCitasData.filter(cita => {
            const fechaCita = cita.fecha_confirmada;
            const cumpleFecha = fechaCita >= this.calendarioFechaInicio.value && fechaCita <= this.calendarioFechaFin.value;
            const cumpleProveedor = !proveedorFiltro || cita.nombre_proveedor === proveedorFiltro;
            const cumpleArea = !areaFiltro || cita.area_correspondiente === areaFiltro;
            const cumpleProducto = !productofiltro || cita.descripcion_producto === productofiltro;
            const cumpleEstado = !estadoFiltro || cita.estado_cita === estadoFiltro;
            
            return cumpleFecha && cumpleProveedor && cumpleArea && cumpleProducto && cumpleEstado;
        });
        
        proximas = [];
    }
    
    // Actualizar métricas
    this.actualizarMetricasCalendario(citasFiltradas);
    
    // Renderizar citas
    this.renderCitasCalendario(citasFiltradas, modo);
    this.renderProximasCitasCalendario(proximas, modo);
    
    // Actualizar gráfico
    this.actualizarGraficoCalendario(citasFiltradas, modo);
}

// CONTINÚA CON TODAS LAS DEMÁS FUNCIONES DE TU CALENDARIO...
// Necesito que me des tu JavaScript completo del calendario para adaptarlo

actualizarMetricasCalendario(citas) {
    // Tu código de métricas aquí
    console.log('Actualizando métricas con', citas.length, 'citas');
}

renderCitasCalendario(citas, modo) {
    // Tu código de renderizado de citas aquí
    if (citas.length === 0) {
        this.calendarioCitasDia.innerHTML = '<div class="calendario-empty-state">No hay citas para mostrar</div>';
        return;
    }
    
    // Tu lógica de renderizado completa
}

renderProximasCitasCalendario(citas, modo) {
    // Tu código de próximas citas aquí
}

actualizarGraficoCalendario(citas, modo) {
    // Tu código del gráfico aquí
}

// Service Worker Registration
/*
if ('serviceWorker' in navigator) {
    window.addEventListener('load', () => {
        navigator.serviceWorker.register('/sw.js')
            .then(registration => {
                console.log('PWA: Service Worker registrado');
            })
            .catch(error => {
                console.log('PWA: Error en registro:', error);
            });
    });
}
*/
// Inicializar la aplicación
window.dashboardHub = new DashboardHub();
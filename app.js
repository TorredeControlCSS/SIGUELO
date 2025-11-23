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
    console.log('Inicializando interfaz del calendario con', citasData.length, 'citas');
    
    container.innerHTML = `
        <!-- Header del Calendario -->
        <div class="calendario-header">
            <div class="calendario-header-top">
                <img src="data:image/png;base64,TU_BASE64_AQUI" alt="Logo Institucional" class="calendario-logo">
                <div class="calendario-header-title">          
                    <h1>Calendario de Citas de Proveedores - CEDIS PANAMA CSS</h1>
                    <div class="calendario-date-info" id="calendarioCurrentDateTime">Cargando fecha...</div>
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
                    <label for="calendarioFiltroProveedor">Proveedor:</label>
                    <select id="calendarioFiltroProveedor">
                        <option value="">Todos los proveedores</option>
                    </select>
                </div>
                
                <div class="calendario-filter-group">
                    <label for="calendarioFiltroArea">Área:</label>
                    <select id="calendarioFiltroArea">
                        <option value="">Todas las áreas</option>
                    </select>
                </div>
            </div>

            <!-- Botones -->
            <div class="calendario-btn-container">
                <button class="calendario-refresh-btn" onclick="window.dashboardHub.recargarCalendario()">🔄 Actualizar</button>
                <button class="calendario-clear-btn" onclick="window.dashboardHub.limpiarFiltrosCalendario()">🧹 Limpiar</button>
            </div>

            <!-- Panel de Métricas SIMPLIFICADO -->
            <div class="calendario-metrics-panel" id="calendarioMetricsPanel">
                <div class="calendario-metric-card">
                    <div class="calendario-metric-value">${citasData.length}</div>
                    <div class="calendario-metric-label">Total Citas</div>
                </div>
                <div class="calendario-metric-card">
                    <div class="calendario-metric-value">${new Set(citasData.map(c => c.nombre_proveedor)).size}</div>
                    <div class="calendario-metric-label">Proveedores</div>
                </div>
                <div class="calendario-metric-card">
                    <div class="calendario-metric-value">${citasData.reduce((sum, c) => sum + (c.cantidad_pallets || 0), 0)}</div>
                    <div class="calendario-metric-label">Pallets</div>
                </div>
            </div>
        </div>

        <!-- Contenido Principal SIMPLIFICADO -->
        <div class="calendario-main-content">
            <div class="calendario-card">
                <h2>📋 Lista de Citas (${citasData.length} total)</h2>
                <div class="calendario-citas-list" id="calendarioCitasDia">
                    ${this.renderCitasLista(citasData)}
                </div>
            </div>

            <div class="calendario-card">
                <h2>📊 Resumen</h2>
                <div class="calendario-proximas-citas" id="calendarioProximasCitas">
                    ${this.renderResumenCitas(citasData)}
                </div>
            </div>
        </div>
    `;

    // Inicializar funcionalidad básica
    this.inicializarFuncionalidadBasica(citasData);
}

renderCitasLista(citas) {
    if (citas.length === 0) {
        return '<div class="calendario-empty-state">No hay citas para mostrar</div>';
    }

    return citas.slice(0, 50).map(cita => `
        <div class="calendario-cita-item">
            <div class="calendario-cita-header">
                <div class="calendario-cita-hora">${cita.hora_confirmada?.substring(0,5) || '--:--'}</div>
                <div class="calendario-fecha-cita">${cita.fecha_confirmada}</div>
                <div class="calendario-cita-estado calendario-estado-${(cita.estado_cita || 'PENDIENTE').toLowerCase()}">
                    ${cita.estado_cita || 'PENDIENTE'}
                </div>
            </div>
            <div class="calendario-cita-proveedor">${cita.nombre_proveedor || 'Proveedor no especificado'}</div>
            <div class="calendario-cita-detalles">
                <div class="calendario-cita-detalle-item">
                    <span class="calendario-detalle-label">Producto</span>
                    <div>${cita.descripcion_producto || 'N/A'}</div>
                </div>
                <div class="calendario-cita-detalle-item">
                    <span class="calendario-detalle-label">Área</span>
                    <div>${cita.area_correspondiente || 'N/A'}</div>
                </div>
                <div class="calendario-cita-detalle-item">
                    <span class="calendario-detalle-label">Pallets</span>
                    <div>${cita.cantidad_pallets || 0}</div>
                </div>
            </div>
        </div>
    `).join('');
}

renderResumenCitas(citas) {
    const hoy = new Date().toISOString().split('T')[0];
    const citasHoy = citas.filter(c => c.fecha_confirmada === hoy).length;
    
    const areas = {};
    citas.forEach(cita => {
        const area = cita.area_correspondiente || 'Sin área';
        areas[area] = (areas[area] || 0) + 1;
    });

    return `
        <div style="margin-bottom: 20px;">
            <h3 style="color: #2c3e50; margin-bottom: 10px;">📈 Estadísticas</h3>
            <div style="display: grid; gap: 10px;">
                <div><strong>Citas hoy:</strong> ${citasHoy}</div>
                <div><strong>Total citas:</strong> ${citas.length}</div>
                <div><strong>Proveedores únicos:</strong> ${new Set(citas.map(c => c.nombre_proveedor)).size}</div>
            </div>
        </div>
        <div>
            <h3 style="color: #2c3e50; margin-bottom: 10px;">🏥 Distribución por Área</h3>
            <div style="display: grid; gap: 8px;">
                ${Object.entries(areas).map(([area, count]) => `
                    <div style="display: flex; justify-content: space-between; padding: 5px 0; border-bottom: 1px solid #eee;">
                        <span>${area}</span>
                        <span style="font-weight: bold;">${count}</span>
                    </div>
                `).join('')}
            </div>
        </div>
    `;
}

inicializarFuncionalidadBasica(citasData) {
    console.log('Inicializando funcionalidad básica del calendario');
    
    // Configurar fecha actual
    const hoy = new Date().toISOString().split('T')[0];
    document.getElementById('calendarioFechaVisualizar').value = hoy;
    document.getElementById('calendarioFechaInicio').value = hoy;
    document.getElementById('calendarioFechaFin').value = hoy;
    
    // Actualizar fecha/hora
    this.actualizarFechaHoraCalendario();
    setInterval(() => this.actualizarFechaHoraCalendario(), 60000);
    
    // Poblar filtros básicos
    this.poblarFiltrosBasicos(citasData);
    
    // Configurar event listeners básicos
    this.configurarEventListenersBasicos(citasData);
}

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
    const element = document.getElementById('calendarioCurrentDateTime');
    if (element) {
        element.textContent = dateTimeStr;
    }
}

poblarFiltrosBasicos(citasData) {
    // Proveedores únicos
    const proveedores = [...new Set(citasData.map(c => c.nombre_proveedor).filter(Boolean))].sort();
    const filtroProveedor = document.getElementById('calendarioFiltroProveedor');
    
    proveedores.forEach(proveedor => {
        const option = document.createElement('option');
        option.value = proveedor;
        option.textContent = proveedor;
        filtroProveedor.appendChild(option);
    });
    
    // Áreas únicas
    const areas = [...new Set(citasData.map(c => c.area_correspondiente).filter(Boolean))].sort();
    const filtroArea = document.getElementById('calendarioFiltroArea');
    
    areas.forEach(area => {
        const option = document.createElement('option');
        option.value = area;
        option.textContent = area;
        filtroArea.appendChild(option);
    });
}

configurarEventListenersBasicos(citasData) {
    // Modo de visualización
    document.getElementById('calendarioModoVisualizacion').addEventListener('change', (e) => {
        const esRango = e.target.value === 'rango';
        document.getElementById('calendarioFechaVisualizar').style.display = esRango ? 'none' : 'block';
        document.getElementById('calendarioFechaInicio').style.display = esRango ? 'block' : 'none';
        document.getElementById('calendarioFechaFin').style.display = esRango ? 'block' : 'none';
    });
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
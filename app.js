const APPS_SCRIPT_URL = 'https://script.google.com/macros/s/AKfycbyPX8tQIRDhAOjlKfSi_Pv56WbWMZVdP4yywVWv5oXFyLNnquQsz4OsiMh2CurP-bnO/exec';

class DashboardHub {
    constructor() {
        this.currentDashboard = null;
        this.calendarioCitasData = [];
        this.confSolicitudes = [];
        this.confCitasConfirmadas = [];
        this.confSemanaActiva = null;
        this.confSolicitudActivaId = null;
        this.confReporteExpandido = false;
        this.confCodigosCriticosKey = 'kanbanCodigosCriticos';
        this.confRechazadasKey = 'solicitudesRechazadasLocal';
        this.kanbanMonthCursor = new Date(new Date().getFullYear(), new Date().getMonth(), 1);
        this.kanbanReporteExpandido = false;
        this.kanbanDragPayload = null;
        this.kanbanModalSolicitudId = null;
        this.kanbanModalFecha = '';
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

        const backButton = document.getElementById('backButton');
        if (backButton) {
            backButton.addEventListener('click', () => this.showMainMenu());
        }
    }

    loadDashboard(dashboardId) {
        this.currentDashboard = dashboardId;

        const mainMenu = document.getElementById('mainMenu');
        const dashboardContainer = document.getElementById('dashboardContainer');

        if (mainMenu) {
            mainMenu.classList.add('hidden');
        }

        if (dashboardContainer) {
            dashboardContainer.classList.remove('hidden');
        }

        this.loadDashboardContent(dashboardId);
    }

    loadDashboardContent(dashboardId) {
        const contentContainer = document.getElementById('dashboardContent');
        if (!contentContainer) return;

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
            '4': `
                <div class="conf-module">
                    <div class="module-header">
                        <h2>📋 Confirmacion de Citas</h2>
                        <button class="back-btn" onclick="window.dashboardHub.showMainMenu()">← Volver al Hub</button>
                    </div>
                    <div id="confirmacionContainer">
                        <div class="kanban-header-card">
                            <div class="kanban-header-top">
                                <div>
                                    <h3>Kanban mensual de solicitudes</h3>
                                    <p>Arrastra solicitudes al calendario y reprograma citas confirmadas entre días hábiles.</p>
                                </div>
                                <button class="conf-btn-detalle" onclick="window.dashboardHub.toggleKanbanReportePanel()">📊 Reporte de abastecimiento</button>
                            </div>
                            <div class="kanban-reporte-panel ${this.kanbanReporteExpandido ? 'is-open' : ''}">
                                <label for="kanbanCodigosCriticosTextarea">Códigos críticos (coma, punto y coma o salto de línea)</label>
                                <textarea id="kanbanCodigosCriticosTextarea" placeholder="Ejemplo: REF001, REF002"></textarea>
                                <div class="conf-reporte-actions">
                                    <button class="conf-btn-confirmar" onclick="window.dashboardHub.aplicarCodigosCriticosKanban()">Aplicar</button>
                                    <button class="conf-btn-detalle" onclick="window.dashboardHub.limpiarCodigosCriticosKanban()">Limpiar</button>
                                </div>
                            </div>
                            <div class="kanban-month-nav">
                                <button class="conf-btn-detalle" onclick="window.dashboardHub.cambiarMesKanban(-1)">◀ Mes anterior</button>
                                <strong id="kanbanMonthLabel"></strong>
                                <button class="conf-btn-detalle" onclick="window.dashboardHub.cambiarMesKanban(1)">Mes siguiente ▶</button>
                            </div>
                        </div>
                        <div class="kanban-layout">
                            <aside class="kanban-sidebar">
                                <h4>Solicitudes pendientes</h4>
                                <div id="kanbanSidebarList"></div>
                            </aside>
                            <section class="kanban-calendar">
                                <div class="kanban-weekdays">
                                    <span>Lun</span><span>Mar</span><span>Mié</span><span>Jue</span><span>Vie</span><span>Sáb</span><span>Dom</span>
                                </div>
                                <div id="kanbanCalGrid" class="kanban-cal-grid"></div>
                            </section>
                        </div>
                        <div id="kanbanModalOverlay" class="kanban-mini-modal-overlay"></div>
                    </div>
                </div>
            `,
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
                return;
            }

            if (dashboardId === '4') {
                await this.inicializarKanbanCitas();
                return;
            }

            const data = await this.fetchFromGoogleSheets(dashboardId);
            this.renderDashboardData(dashboardId, data);
        } catch (error) {
            console.error('Error cargando datos:', error);
            this.showError(dashboardId, error);
        }
    }

    async fetchJsonp(url, callbackName, errorMessage) {
        return new Promise((resolve, reject) => {
            const script = document.createElement('script');
            script.src = url;

            window[callbackName] = response => {
                if (script.parentNode) {
                    script.parentNode.removeChild(script);
                }
                delete window[callbackName];
                resolve(response);
            };

            script.onerror = () => {
                if (script.parentNode) {
                    script.parentNode.removeChild(script);
                }
                delete window[callbackName];
                reject(new Error(errorMessage));
            };

            document.head.appendChild(script);
        });
    }

    async fetchCalendarioData() {
        return this.fetchJsonp(
            `${APPS_SCRIPT_URL}?callback=handleCitasData`,
            'handleCitasData',
            'Error cargando datos del calendario'
        );
    }

    async fetchFromGoogleSheets(dashboardId) {
        return this.fetchJsonp(
            `${APPS_SCRIPT_URL}?action=getData&dashboard=${encodeURIComponent(dashboardId)}&callback=handleDashboardData`,
            'handleDashboardData',
            'Error cargando datos del dashboard'
        );
    }

    async writeToGoogleSheets(dashboardId, data) {
        const response = await fetch(APPS_SCRIPT_URL, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json'
            },
            body: JSON.stringify({
                action: 'writeData',
                dashboard: dashboardId,
                data
            })
        });

        return await response.json();
    }

    renderDashboardData(dashboardId, data) {
        const container = document.getElementById(`dataContainer${dashboardId}`);
        if (container) {
            container.innerHTML = `<pre>${this.escapeHtml(JSON.stringify(data, null, 2))}</pre>`;
        }
    }

    showMainMenu() {
        const dashboardContainer = document.getElementById('dashboardContainer');
        const mainMenu = document.getElementById('mainMenu');

        if (dashboardContainer) {
            dashboardContainer.classList.add('hidden');
        }

        if (mainMenu) {
            mainMenu.classList.remove('hidden');
        }

        this.currentDashboard = null;
    }

    checkPWAInstall() {
        const matchMedia = window.matchMedia ? window.matchMedia.bind(window) : null;
        if (matchMedia && matchMedia('(display-mode: standalone)').matches) {
            console.log('Running as PWA');
        }
    }

    showError(dashboardId, error) {
        const targetId = dashboardId === '4' ? 'confirmacionContainer' : `dataContainer${dashboardId}`;
        const container = document.getElementById(targetId);
        if (container) {
            container.innerHTML = `<div class="error">Error: ${this.escapeHtml(error.message)}</div>`;
        }
    }

    recargarCalendario() {
        this.inicializarCalendario();
    }

    limpiarFiltrosCalendario() {
        console.log('Limpiando filtros del calendario...');
    }

    async inicializarCalendario() {
        const container = document.getElementById('calendarioContainer');
        if (!container) return;

        container.innerHTML = '<div class="calendario-loading">Cargando Calendario de Citas...</div>';

        try {
            const response = await this.fetchCalendarioData();
            if (response.success) {
                this.cargarInterfazCalendario(container, response.data || []);
            } else {
                container.innerHTML = `<div class="calendario-error">Error: ${this.escapeHtml(response.error || 'Respuesta inválida del backend')}</div>`;
            }
        } catch (error) {
            container.innerHTML = `<div class="calendario-error">Error cargando el calendario: ${this.escapeHtml(error.message)}</div>`;
        }
    }

    cargarInterfazCalendario(container, citasData) {
        container.innerHTML = `
            <div class="calendario-header">
                <div class="calendario-header-top">
                    <img src="data:image/png;base64,TU_BASE64_AQUI" alt="Logo Institucional" class="calendario-logo">
                    <div class="calendario-header-title">
                        <h1>Calendario de Citas de Proveedores - CEDIS PANAMA CSS</h1>
                        <div class="calendario-date-info" id="calendarioCurrentDateTime"></div>
                    </div>
                </div>
                <div class="calendario-btn-container">
                    <button class="calendario-refresh-btn" id="calendarioRefreshBtn">🔄 Actualizar datos</button>
                </div>
            </div>
            <div class="calendario-main-content">
                <div class="calendario-card">
                    <h2>Citas registradas</h2>
                    <div class="calendario-citas-list" id="calendarioCitasDia"></div>
                </div>
                <div class="calendario-card">
                    <h2>Próximos Días</h2>
                    <div class="calendario-proximas-citas" id="calendarioProximasCitas"></div>
                </div>
            </div>
        `;

        this.calendarioCitasData = citasData;
        this.calendarioCitasDia = document.getElementById('calendarioCitasDia');
        this.calendarioProximasCitas = document.getElementById('calendarioProximasCitas');
        this.calendarioCurrentDateTime = document.getElementById('calendarioCurrentDateTime');

        this.actualizarFechaHoraCalendario();
        window.clearInterval(this.calendarioClockInterval);
        this.calendarioClockInterval = window.setInterval(() => this.actualizarFechaHoraCalendario(), 60000);

        document.getElementById('calendarioRefreshBtn')?.addEventListener('click', () => this.recargarCalendario());

        this.renderCitasCalendario(citasData);
        this.renderProximasCitasCalendario(citasData.filter(cita => cita.fecha_confirmada));
    }

    actualizarFechaHoraCalendario() {
        if (!this.calendarioCurrentDateTime) return;
        this.calendarioCurrentDateTime.textContent = new Date().toLocaleDateString('es-ES', {
            weekday: 'long',
            year: 'numeric',
            month: 'long',
            day: 'numeric',
            hour: '2-digit',
            minute: '2-digit'
        });
    }

    renderCitasCalendario(citas) {
        if (!this.calendarioCitasDia) return;
        if (!citas.length) {
            this.calendarioCitasDia.innerHTML = '<div class="calendario-empty-state">No hay citas para mostrar</div>';
            return;
        }

        this.calendarioCitasDia.innerHTML = citas.map(cita => `
            <div class="calendario-cita-item">
                <div class="calendario-cita-header">
                    <div class="calendario-cita-hora">${this.escapeHtml(cita.hora_confirmada || '--:--')}</div>
                    <span class="calendario-cita-estado">${this.escapeHtml(cita.estado_cita || 'PENDIENTE')}</span>
                </div>
                <div class="calendario-cita-proveedor">${this.escapeHtml(cita.nombre_proveedor || 'Proveedor sin nombre')}</div>
                <div class="calendario-cita-detalles">
                    <div class="calendario-cita-detalle-item"><span class="calendario-detalle-label">OC</span><div>${this.escapeHtml(cita.numero_orden_compra || 'N/D')}</div></div>
                    <div class="calendario-cita-detalle-item"><span class="calendario-detalle-label">Producto</span><div>${this.escapeHtml(cita.descripcion_producto || 'Sin descripción')}</div></div>
                    <div class="calendario-cita-detalle-item"><span class="calendario-detalle-label">Pallets</span><div>${this.escapeHtml(String(cita.cantidad_pallets || 0))}</div></div>
                </div>
            </div>
        `).join('');
    }

    renderProximasCitasCalendario(citas) {
        if (!this.calendarioProximasCitas) return;
        if (!citas.length) {
            this.calendarioProximasCitas.innerHTML = '<div class="calendario-empty-state">No hay próximas citas</div>';
            return;
        }

        this.calendarioProximasCitas.innerHTML = citas.slice(0, 10).map(cita => `
            <div class="calendario-proxima-cita-item">
                <div class="calendario-proxima-fecha">${this.escapeHtml(this.formatearFechaCorta(cita.fecha_confirmada))}</div>
                <div class="calendario-proxima-cantidad">${this.escapeHtml(cita.nombre_proveedor || 'Proveedor')}</div>
            </div>
        `).join('');
    }

    async inicializarModuloConfirmacion(options = {}) {
        const { limpiarRechazadas = false } = options;
        const container = document.getElementById('confirmacionContainer');
        if (!container) return;

        if (limpiarRechazadas) {
            sessionStorage.removeItem(this.confRechazadasKey);
        }

        container.innerHTML = '<div class="calendario-loading">Cargando solicitudes pendientes...</div>';

        try {
            const [solicitudesResponse, citasResponse] = await Promise.all([
                this.fetchSolicitudesPendientes(),
                this.fetchCalendarioData()
            ]);

            if (!solicitudesResponse.success) {
                throw new Error(solicitudesResponse.error || 'No se pudieron leer las solicitudes pendientes');
            }

            if (!citasResponse.success) {
                throw new Error(citasResponse.error || 'No se pudieron leer las citas confirmadas');
            }

            const citasConfirmadas = (citasResponse.data || []).map((cita, index) => this.normalizarCitaConfirmada(cita, index));
            const ordenesConfirmadas = new Set(citasConfirmadas.map(cita => cita.numero_orden_compra).filter(Boolean));

            this.confSolicitudes = (solicitudesResponse.data || [])
                .map((solicitud, index) => this.normalizarSolicitud(solicitud, index))
                .filter(solicitud => solicitud.fecha_solicitada)
                .filter(solicitud => !ordenesConfirmadas.has(solicitud.numero_orden_compra));

            this.confCitasConfirmadas = citasConfirmadas;
            this.confSolicitudActivaId = null;
            this.cargarInterfazConfirmacion(container, this.confSolicitudes, this.confCitasConfirmadas);
        } catch (error) {
            container.innerHTML = `<div class="conf-empty-state">❌ Error cargando módulo de confirmación: ${this.escapeHtml(error.message)}</div>`;
        }
    }

    async fetchSolicitudesPendientes() {
        return this.fetchJsonp(
            `${APPS_SCRIPT_URL}?action=getSolicitudesPendientes&callback=handleSolicitudesPendientes`,
            'handleSolicitudesPendientes',
            'Error cargando solicitudes pendientes'
        );
    }

    async inicializarKanbanCitas() {
        const container = document.getElementById('confirmacionContainer');
        if (!container) return;

        const sidebar = document.getElementById('kanbanSidebarList');
        const grid = document.getElementById('kanbanCalGrid');
        if (sidebar) sidebar.innerHTML = '<div class="conf-empty-state">Cargando solicitudes...</div>';
        if (grid) grid.innerHTML = '<div class="conf-empty-state">Cargando calendario...</div>';

        try {
            const [solicitudesResponse, citasResponse] = await Promise.all([
                this.fetchSolicitudesPendientes(),
                this.fetchJsonp(
                    `${APPS_SCRIPT_URL}?action=getCitasData&callback=handleCitasData`,
                    'handleCitasData',
                    'Error cargando citas confirmadas'
                )
            ]);

            if (!solicitudesResponse.success) {
                throw new Error(solicitudesResponse.error || 'No se pudieron cargar solicitudes pendientes');
            }
            if (!citasResponse.success) {
                throw new Error(citasResponse.error || 'No se pudieron cargar citas confirmadas');
            }

            const confirmadas = (citasResponse.data || []).map((cita, index) => this.normalizarCitaConfirmada(cita, index));
            const ordenesConfirmadas = new Set(confirmadas.map(cita => cita.numero_orden_compra).filter(Boolean));
            const codigosCriticos = this.obtenerCodigosCriticos();

            this.confSolicitudes = (solicitudesResponse.data || [])
                .map((solicitud, index) => this.normalizarSolicitud(solicitud, index))
                .filter(solicitud => solicitud.numero_orden_compra && !ordenesConfirmadas.has(solicitud.numero_orden_compra))
                .map(solicitud => ({
                    ...solicitud,
                    prioridad: this.calcularPrioridadKanban(solicitud, codigosCriticos)
                }))
                .sort((a, b) => {
                    if (b.prioridad.score !== a.prioridad.score) {
                        return b.prioridad.score - a.prioridad.score;
                    }
                    return (a.fecha_vencimiento || '').localeCompare(b.fecha_vencimiento || '');
                });

            this.confCitasConfirmadas = confirmadas;
            this.renderKanbanCitas();
        } catch (error) {
            container.innerHTML = `<div class="conf-empty-state">❌ Error cargando Kanban: ${this.escapeHtml(error.message)}</div>`;
        }
    }

    renderKanbanCitas() {
        const monthLabel = document.getElementById('kanbanMonthLabel');
        const sidebar = document.getElementById('kanbanSidebarList');
        const grid = document.getElementById('kanbanCalGrid');
        const overlay = document.getElementById('kanbanModalOverlay');
        const textarea = document.getElementById('kanbanCodigosCriticosTextarea');

        if (!sidebar || !grid || !overlay) return;

        if (monthLabel) {
            monthLabel.textContent = this.kanbanMonthCursor.toLocaleDateString('es-ES', { month: 'long', year: 'numeric' });
        }

        if (textarea && document.activeElement !== textarea) {
            textarea.value = this.obtenerCodigosCriticos().join('\n');
        }

        sidebar.innerHTML = this.renderKanbanSidebar();
        grid.innerHTML = this.renderKanbanCalendar();
        overlay.innerHTML = this.renderKanbanModalContent();
        overlay.classList.toggle('is-open', Boolean(this.kanbanModalSolicitudId));

        const reportPanel = document.querySelector('.kanban-reporte-panel');
        if (reportPanel) {
            reportPanel.classList.toggle('is-open', this.kanbanReporteExpandido);
        }

        this.configurarKanbanDnD();
    }

    renderKanbanSidebar() {
        if (!this.confSolicitudes.length) {
            return '<div class="conf-empty-state">No hay solicitudes pendientes.</div>';
        }

        return this.confSolicitudes.map(solicitud => {
            const nivelClase = this.getKanbanPrioridadClase((solicitud.prioridad || {}).score || 0);
            const dias = (solicitud.prioridad || {}).diasParaVencer;
            const diasTexto = dias === null || dias === undefined
                ? 'Sin fecha de vencimiento'
                : dias < 0
                    ? `Vencida hace ${Math.abs(dias)} días`
                    : `Vence en ${dias} días`;

            return `
                <article class="kanban-tarjeta ${nivelClase}" draggable="true" data-pending-id="${this.escapeHtml(String(solicitud.id))}">
                    <h5>${this.escapeHtml(solicitud.nombre_proveedor || 'Proveedor sin nombre')}</h5>
                    <p><strong>OC:</strong> ${this.escapeHtml(solicitud.numero_orden_compra || 'N/D')}</p>
                    <p><strong>Código:</strong> ${this.escapeHtml(solicitud.codigo_referencia || 'N/D')}</p>
                    <p>${this.escapeHtml(diasTexto)}</p>
                    <span class="conf-score">Score ${this.escapeHtml(String((solicitud.prioridad || {}).score || 0))}</span>
                </article>
            `;
        }).join('');
    }

    renderKanbanCalendar() {
        const firstDay = new Date(this.kanbanMonthCursor.getFullYear(), this.kanbanMonthCursor.getMonth(), 1);
        const dayOfWeek = (firstDay.getDay() + 6) % 7;
        const start = new Date(firstDay);
        start.setDate(firstDay.getDate() - dayOfWeek);

        let html = '';
        for (let i = 0; i < 42; i++) {
            const date = new Date(start);
            date.setDate(start.getDate() + i);
            const isoDate = this.toISODate(date);
            const inMonth = date.getMonth() === this.kanbanMonthCursor.getMonth();
            const weekday = date.getDay();
            const isWeekend = weekday === 0 || weekday === 6;
            const citasDia = this.confCitasConfirmadas.filter(cita => cita.fecha_confirmada === isoDate);

            html += `
                <div class="kanban-dia ${inMonth ? '' : 'is-other-month'} ${isWeekend ? 'is-weekend' : ''}" data-date="${isoDate}" data-weekday="${isWeekend ? '0' : '1'}">
                    <div class="kanban-dia-head">${date.getDate()}</div>
                    <div class="kanban-dia-items">
                        ${citasDia.map(cita => `
                            <article class="kanban-tarjeta kanban-prioridad-verde" draggable="true" data-confirmed-oc="${this.escapeHtml(cita.numero_orden_compra)}">
                                <h5>${this.escapeHtml(cita.nombre_proveedor || 'Proveedor')}</h5>
                                <p><strong>OC:</strong> ${this.escapeHtml(cita.numero_orden_compra || 'N/D')}</p>
                                <p>${this.escapeHtml(cita.hora_confirmada || '--:--')} · ${this.escapeHtml(cita.estado_cita || 'CONFIRMADA')}</p>
                            </article>
                        `).join('')}
                    </div>
                </div>
            `;
        }
        return html;
    }

    renderKanbanModalContent() {
        if (!this.kanbanModalSolicitudId) return '';
        const solicitud = this.confSolicitudes.find(item => String(item.id) === String(this.kanbanModalSolicitudId));
        if (!solicitud) return '';

        return `
            <div class="kanban-mini-modal" onclick="event.stopPropagation()">
                <div class="conf-modal-header">
                    <div>
                        <h3>Confirmar cita</h3>
                        <p>${this.escapeHtml(solicitud.nombre_proveedor || 'Proveedor')} · OC ${this.escapeHtml(solicitud.numero_orden_compra || 'N/D')}</p>
                    </div>
                    <button class="conf-btn-detalle" onclick="window.dashboardHub.cerrarKanbanModal()">✕</button>
                </div>
                <div class="conf-modal-body">
                    <div class="conf-form-grid">
                        <label>
                            <span>Fecha confirmada</span>
                            <input type="date" id="kanbanModalFecha" value="${this.escapeHtml(this.kanbanModalFecha || solicitud.fecha_solicitada || '')}">
                        </label>
                        <label>
                            <span>Hora confirmada</span>
                            <input type="time" id="kanbanModalHora" value="${this.escapeHtml(solicitud.hora_solicitada || '')}">
                        </label>
                        <label>
                            <span>Estado</span>
                            <select id="kanbanModalEstado">
                                <option value="CONFIRMADA">CONFIRMADA</option>
                                <option value="REPROGRAMADA">REPROGRAMADA</option>
                            </select>
                        </label>
                    </div>
                </div>
                <div class="conf-modal-footer">
                    <button class="conf-btn-detalle" onclick="window.dashboardHub.cerrarKanbanModal()">Cancelar</button>
                    <button class="conf-btn-confirmar" onclick="window.dashboardHub.confirmarCitaKanban()">Confirmar</button>
                </div>
            </div>
        `;
    }

    configurarKanbanDnD() {
        document.querySelectorAll('.kanban-tarjeta[draggable="true"]').forEach(card => {
            card.addEventListener('dragstart', event => {
                const pendingId = card.dataset.pendingId;
                const confirmedOc = card.dataset.confirmedOc;
                this.kanbanDragPayload = pendingId
                    ? { type: 'pending', id: pendingId }
                    : { type: 'confirmed', oc: confirmedOc };
                event.dataTransfer.setData('text/plain', JSON.stringify(this.kanbanDragPayload));
            });
        });

        document.querySelectorAll('.kanban-dia[data-weekday="1"]').forEach(dayCell => {
            dayCell.addEventListener('dragover', event => {
                event.preventDefault();
                dayCell.classList.add('is-drag-over');
            });
            dayCell.addEventListener('dragleave', () => dayCell.classList.remove('is-drag-over'));
            dayCell.addEventListener('drop', async event => {
                event.preventDefault();
                dayCell.classList.remove('is-drag-over');

                const date = dayCell.dataset.date;
                if (!date) return;

                let payload = this.kanbanDragPayload;
                try {
                    payload = payload || JSON.parse(event.dataTransfer.getData('text/plain'));
                } catch (error) {}
                if (!payload) return;

                if (payload.type === 'pending') {
                    this.abrirKanbanModal(payload.id, date);
                    return;
                }
                if (payload.type === 'confirmed' && payload.oc) {
                    await this.actualizarCitaKanban(payload.oc, date);
                }
            });
        });

        const overlay = document.getElementById('kanbanModalOverlay');
        if (overlay) {
            overlay.onclick = () => this.cerrarKanbanModal();
        }
    }

    abrirKanbanModal(solicitudId, fecha) {
        this.kanbanModalSolicitudId = String(solicitudId);
        this.kanbanModalFecha = fecha || '';
        this.renderKanbanCitas();
    }

    cerrarKanbanModal() {
        this.kanbanModalSolicitudId = null;
        this.kanbanModalFecha = '';
        this.renderKanbanCitas();
    }

    async confirmarCitaKanban() {
        const solicitud = this.confSolicitudes.find(item => String(item.id) === String(this.kanbanModalSolicitudId));
        if (!solicitud) return;

        const fechaConfirmada = document.getElementById('kanbanModalFecha')?.value || '';
        const horaConfirmada = document.getElementById('kanbanModalHora')?.value || '';
        const estadoCita = document.getElementById('kanbanModalEstado')?.value || 'CONFIRMADA';

        if (!fechaConfirmada) {
            window.alert('Debes indicar una fecha confirmada.');
            return;
        }

        try {
            const response = await fetch(APPS_SCRIPT_URL, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    action: 'confirmarCita',
                    data: {
                        fecha_confirmada: fechaConfirmada,
                        estado_cita: estadoCita,
                        hora_confirmada: horaConfirmada,
                        src_row: solicitud._srcRow || [],
                        numero_orden_compra: solicitud.numero_orden_compra,
                        codigo_referencia: solicitud.codigo_referencia,
                        descripcion_producto: solicitud.descripcion_producto,
                        cantidad_unidades: solicitud.cantidad_unidades,
                        cantidad_bultos: solicitud.cantidad_bultos,
                        cantidad_pallets: solicitud.cantidad_pallets,
                        tipo_ambiente: solicitud.tipo_ambiente,
                        area_correspondiente: solicitud.area_correspondiente,
                        nombre_solicitante: solicitud.nombre_solicitante,
                        correo_solicitante: solicitud.correo_solicitante,
                        telefono: solicitud.telefono,
                        tipo_unidad_movil: solicitud.tipo_unidad_movil,
                        personal_empresa_entrega: solicitud.personal_empresa_entrega,
                        tipo_entrega: solicitud.tipo_entrega
                    }
                })
            });

            const result = await response.json();
            if (!result.success) {
                throw new Error(result.error || 'No se pudo confirmar la cita');
            }

            this.kanbanModalSolicitudId = null;
            this.kanbanModalFecha = '';
            await this.inicializarKanbanCitas();
        } catch (error) {
            window.alert(`Error confirmando cita: ${error.message}`);
        }
    }

    async actualizarCitaKanban(numeroOrdenCompra, nuevaFecha) {
        const cita = this.confCitasConfirmadas.find(item => item.numero_orden_compra === numeroOrdenCompra);
        if (!cita) return;

        try {
            const response = await fetch(APPS_SCRIPT_URL, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    action: 'actualizarCita',
                    data: {
                        numero_orden_compra: numeroOrdenCompra,
                        fecha_confirmada: nuevaFecha,
                        estado_cita: cita.estado_cita || 'REPROGRAMADA',
                        hora_confirmada: cita.hora_confirmada || ''
                    }
                })
            });

            const result = await response.json();
            if (!result.success) {
                throw new Error(result.error || 'No se pudo actualizar la cita');
            }

            await this.inicializarKanbanCitas();
        } catch (error) {
            window.alert(`Error reprogramando cita: ${error.message}`);
        }
    }

    cambiarMesKanban(delta) {
        this.kanbanMonthCursor = new Date(this.kanbanMonthCursor.getFullYear(), this.kanbanMonthCursor.getMonth() + delta, 1);
        this.renderKanbanCitas();
    }

    toggleKanbanReportePanel() {
        this.kanbanReporteExpandido = !this.kanbanReporteExpandido;
        this.renderKanbanCitas();
    }

    aplicarCodigosCriticosKanban() {
        const textarea = document.getElementById('kanbanCodigosCriticosTextarea');
        const codigos = this.parsearCodigosCriticos(textarea ? textarea.value : '');
        sessionStorage.setItem(this.confCodigosCriticosKey, JSON.stringify(codigos));
        this.confSolicitudes = this.confSolicitudes.map(solicitud => ({
            ...solicitud,
            prioridad: this.calcularPrioridadKanban(solicitud, codigos)
        })).sort((a, b) => b.prioridad.score - a.prioridad.score);
        this.renderKanbanCitas();
    }

    limpiarCodigosCriticosKanban() {
        sessionStorage.removeItem(this.confCodigosCriticosKey);
        this.confSolicitudes = this.confSolicitudes.map(solicitud => ({
            ...solicitud,
            prioridad: this.calcularPrioridadKanban(solicitud, [])
        })).sort((a, b) => b.prioridad.score - a.prioridad.score);
        this.renderKanbanCitas();
    }

    calcularPrioridadKanban(solicitud, codigosCriticos) {
        const fechaVencimiento = this.parseDateValue(solicitud.fecha_vencimiento);
        const hoy = this.stripTime(new Date());
        const diasParaVencer = fechaVencimiento ? Math.round((fechaVencimiento - hoy) / 86400000) : null;
        const codigo = this.normalizarCodigoReferencia(solicitud.codigo_referencia);
        const esCritico = codigosCriticos.includes(codigo);

        let score = 0;
        if (diasParaVencer !== null) {
            if (diasParaVencer < 0) {
                score = 100;
            } else if (diasParaVencer <= 7) {
                score = 80;
            } else if (diasParaVencer <= 21) {
                score = 50;
            } else if (diasParaVencer <= 45) {
                score = 20;
            }
        }

        if (esCritico) score += 40;

        return {
            score,
            diasParaVencer,
            stockCritico: esCritico
        };
    }

    getKanbanPrioridadClase(score) {
        if (score >= 100) return 'kanban-prioridad-roja';
        if (score >= 80) return 'kanban-prioridad-naranja';
        if (score >= 50) return 'kanban-prioridad-amarilla';
        return 'kanban-prioridad-verde';
    }

    cargarInterfazConfirmacion(container, solicitudes, citasConfirmadas) {
        const codigosCriticos = this.obtenerCodigosCriticos();
        const rechazadasLocalmente = this.obtenerSolicitudesRechazadasLocal();

        const solicitudesEnriquecidas = solicitudes.map(solicitud => {
            const prioridad = this.calcularPrioridad(solicitud, codigosCriticos);
            const validacion = this.validarReglaSemana(solicitud.marca_temporal, solicitud.fecha_solicitada);
            const semana = this.getInfoSemana(solicitud.fecha_solicitada);

            return {
                ...solicitud,
                prioridad,
                validacion,
                semana,
                rechazadaLocalmente: rechazadasLocalmente.includes(String(solicitud.id))
            };
        });

        const semanas = this.agruparPorSemana(solicitudesEnriquecidas);
        const semanasDisponibles = Object.keys(semanas).sort();
        const proximoJueves = this.getInfoProximoJueves();
        const totalFueraDePlazo = solicitudesEnriquecidas.filter(solicitud => !solicitud.validacion.valida).length;

        if (!this.confSemanaActiva || !semanasDisponibles.includes(this.confSemanaActiva)) {
            this.confSemanaActiva = semanasDisponibles[0] || null;
        }

        const semanaActiva = this.confSemanaActiva;
        const semanaHtml = semanaActiva
            ? this.renderSemanaConfirmacion(semanaActiva, semanas[semanaActiva] || [], citasConfirmadas)
            : '<div class="conf-empty-state">No hay solicitudes pendientes por confirmar en este momento.</div>';

        container.innerHTML = `
            <div class="conf-header-card">
                <div class="conf-deadline-banner">Próximo cierre: jueves ${this.escapeHtml(proximoJueves.label)} (${this.escapeHtml(proximoJueves.mensaje)})</div>
                <div class="conf-toolbar">
                    <div>
                        <h3>📋 Confirmación de Citas de Proveedores</h3>
                        <p>${solicitudesEnriquecidas.length} solicitudes pendientes · ${citasConfirmadas.length} citas confirmadas registradas</p>
                    </div>
                    <div class="conf-toolbar-actions">
                        <button class="conf-btn-detalle" onclick="window.dashboardHub.toggleReportePanel()">📊 Cargar Reporte de Abastecimiento</button>
                        <button class="conf-btn-confirmar" onclick="window.dashboardHub.recargarModuloConfirmacion()">🔄 Actualizar</button>
                    </div>
                </div>
                <div class="conf-summary-row">
                    <span class="conf-summary-pill">⚠️ ${totalFueraDePlazo} fuera de plazo</span>
                    <span class="conf-summary-pill">📦 ${codigosCriticos.length} códigos críticos cargados</span>
                    <span class="conf-summary-pill">🗂️ ${semanasDisponibles.length} semanas con solicitudes</span>
                </div>
                <div class="conf-reporte-panel ${this.confReporteExpandido ? 'is-open' : ''}">
                    <label for="confCodigosCriticosTextarea">Pega aquí los códigos de referencia con stock crítico (0 o bajo) separados por coma, punto y coma o salto de línea:</label>
                    <textarea id="confCodigosCriticosTextarea" placeholder="Ejemplo: 300501346
REF-9988; ABC123">${this.escapeHtml(codigosCriticos.join('\n'))}</textarea>
                    <div class="conf-reporte-actions">
                        <button class="conf-btn-confirmar" onclick="window.dashboardHub.aplicarCodigosCriticos()">Aplicar</button>
                        <button class="conf-btn-detalle" onclick="window.dashboardHub.limpiarCodigosCriticos()">Limpiar</button>
                    </div>
                </div>
            </div>
            ${semanasDisponibles.length ? `
                <div class="conf-semana-nav">
                    ${semanasDisponibles.map(semanaKey => `
                        <button class="${semanaKey === semanaActiva ? 'is-active' : ''}" onclick="window.dashboardHub.seleccionarSemanaConfirmacion('${this.escapeHtml(semanaKey)}')">
                            ${this.escapeHtml((semanas[semanaKey][0].semana || {}).shortLabel || semanaKey)}
                        </button>
                    `).join('')}
                </div>
            ` : ''}
            <div class="conf-weeks-wrapper">${semanaHtml}</div>
            ${this.renderModalConfirmacion()}
        `;

        this.confSolicitudes = solicitudesEnriquecidas;
        this.configurarModalConfirmacionSiAplica();
    }

    calcularPrioridad(solicitud, codigosCriticos) {
        const fechaVencimiento = this.parseDateValue(solicitud.fecha_vencimiento);
        const hoy = this.stripTime(new Date());
        const diasParaVencer = fechaVencimiento ? Math.round((fechaVencimiento - hoy) / 86400000) : null;
        const stockCritico = codigosCriticos.includes(this.normalizarCodigoReferencia(solicitud.codigo_referencia));
        const pallets = this.parseNumber(solicitud.cantidad_pallets);

        let nivel = 'normal';
        let score = 100;
        const detalle = [];

        if (diasParaVencer !== null) {
            if (diasParaVencer <= 7) {
                nivel = 'critica';
                score = 400;
                detalle.push('🔴 Vencimiento crítico (≤ 7 días o vencida)');
            } else if (diasParaVencer <= 21) {
                nivel = 'urgente';
                score = 300;
                detalle.push('🟠 Vencimiento urgente (8 a 21 días)');
            } else if (diasParaVencer <= 45) {
                nivel = 'proximo';
                score = 200;
                detalle.push('🟡 Vencimiento próximo (22 a 45 días)');
            } else {
                detalle.push('🟢 Vencimiento normal (> 45 días)');
            }
        } else {
            detalle.push('ℹ️ Sin fecha de vencimiento válida');
        }

        if (stockCritico) {
            score += 60;
            detalle.push('📦 Código presente en reporte de abastecimiento crítico');
        }

        if (pallets > 0) {
            score += Math.min(pallets, 25);
            detalle.push(`🏗️ ${pallets} pallets solicitados`);
        }

        return { nivel, score, detalle, stockCritico, diasParaVencer };
    }

    validarReglaSemana(marcaTemporal, fechaSolicitada) {
        const fechaSolicitud = this.parseDateValue(fechaSolicitada);
        if (!fechaSolicitud) {
            return { valida: false, mensaje: 'Fecha solicitada inválida' };
        }

        if (!this.esDiaHabil(fechaSolicitud)) {
            return { valida: false, mensaje: 'La fecha solicitada debe caer entre lunes y viernes' };
        }

        const semanaPermitida = this.getSemanaPermitida(marcaTemporal);
        if (!semanaPermitida) {
            return { valida: true, mensaje: 'No se pudo validar la marca temporal; revisar manualmente' };
        }

        if (fechaSolicitud < semanaPermitida) {
            return {
                valida: false,
                mensaje: `Solicitud enviada fuera del plazo. Semana mínima permitida: ${this.formatearFechaLarga(semanaPermitida)}`
            };
        }

        return {
            valida: true,
            mensaje: `En ventana. Semana mínima permitida: ${this.formatearFechaLarga(semanaPermitida)}`
        };
    }

    agruparPorSemana(solicitudes) {
        return solicitudes.reduce((acc, solicitud) => {
            const semanaInfo = solicitud.semana || this.getInfoSemana(solicitud.fecha_solicitada);
            if (!acc[semanaInfo.semanaKey]) {
                acc[semanaInfo.semanaKey] = [];
            }

            acc[semanaInfo.semanaKey].push({ ...solicitud, semana: semanaInfo });
            acc[semanaInfo.semanaKey].sort((a, b) => {
                if (b.prioridad.score !== a.prioridad.score) {
                    return b.prioridad.score - a.prioridad.score;
                }
                return (a.fecha_vencimiento || '').localeCompare(b.fecha_vencimiento || '');
            });

            return acc;
        }, {});
    }

    renderSemanaConfirmacion(semanaKey, solicitudes, citasConfirmadas) {
        if (!solicitudes.length) {
            return '<div class="conf-empty-state">No hay solicitudes para esta semana.</div>';
        }

        const infoSemana = solicitudes[0].semana;
        const pallets = this.calcularPalletsSemanales(semanaKey, solicitudes, citasConfirmadas);
        const fueraDePlazo = solicitudes.filter(solicitud => !solicitud.validacion.valida).length;
        const capacidadVisual = pallets.total > 0 ? Math.min(100, Math.round((pallets.total / Math.max(pallets.total, 80)) * 100)) : 0;

        return `
            <section class="conf-semana-section">
                <div class="conf-semana-header">
                    <div>
                        <h3>${this.escapeHtml(infoSemana.label)}</h3>
                        <p>🏗️ ${pallets.confirmados} pallets confirmados + ${pallets.pendientes} pallets solicitados pendientes = ${pallets.total} total</p>
                    </div>
                    <div>${fueraDePlazo ? `<span class="conf-badge conf-badge-warning">⚠️ ${fueraDePlazo} FUERA DE PLAZO</span>` : ''}</div>
                </div>
                <div class="conf-pallets-bar"><span style="width: ${capacidadVisual}%"></span></div>
                <div class="conf-solicitudes-grid">
                    ${solicitudes.map(solicitud => {
                        const clasePrioridad = `conf-prioridad-${solicitud.prioridad.nivel}`;
                        const diasTexto = solicitud.prioridad.diasParaVencer === null
                            ? 'Sin fecha válida'
                            : solicitud.prioridad.diasParaVencer < 0
                                ? `hace ${Math.abs(solicitud.prioridad.diasParaVencer)} días`
                                : `en ${solicitud.prioridad.diasParaVencer} días`;

                        return `
                            <article class="conf-solicitud-card ${clasePrioridad} ${solicitud.rechazadaLocalmente ? 'conf-estado-rechazada' : ''}">
                                <div class="conf-card-top">
                                    <div class="conf-card-badges">
                                        <span class="conf-badge">${this.getEtiquetaPrioridad(solicitud.prioridad.nivel)}</span>
                                        ${solicitud.prioridad.stockCritico ? '<span class="conf-badge conf-badge-stock">📦 STOCK CRÍTICO</span>' : ''}
                                        ${!solicitud.validacion.valida ? '<span class="conf-badge conf-badge-warning">⚠️ FUERA DE PLAZO</span>' : ''}
                                        ${solicitud.rechazadaLocalmente ? '<span class="conf-badge">RECHAZADA LOCAL</span>' : ''}
                                    </div>
                                    <span class="conf-score">Score ${solicitud.prioridad.score}</span>
                                </div>
                                <h4>${this.escapeHtml(solicitud.nombre_proveedor || 'Proveedor sin nombre')} — OC ${this.escapeHtml(solicitud.numero_orden_compra || 'N/D')}</h4>
                                <p class="conf-producto">${this.escapeHtml(solicitud.descripcion_producto || 'Sin descripción')}</p>
                                <div class="conf-meta">
                                    <span>Código: ${this.escapeHtml(solicitud.codigo_referencia || 'N/D')}</span>
                                    <span>Fecha sol.: ${this.escapeHtml(this.formatearFechaCorta(solicitud.fecha_solicitada))}</span>
                                    <span>Hora: ${this.escapeHtml(solicitud.hora_solicitada || '--:--')}</span>
                                </div>
                                <div class="conf-meta">
                                    <span>Vence: ${this.escapeHtml(this.formatearFechaCorta(solicitud.fecha_vencimiento))} (${this.escapeHtml(diasTexto)})</span>
                                    <span>${this.escapeHtml(String(this.parseNumber(solicitud.cantidad_pallets)))} pallets</span>
                                </div>
                                <div class="conf-meta conf-detalle-lista">
                                    ${solicitud.prioridad.detalle.map(item => `<span>${this.escapeHtml(item)}</span>`).join('')}
                                </div>
                                <div class="conf-acciones">
                                    <button class="conf-btn-confirmar" ${solicitud.rechazadaLocalmente ? 'disabled' : ''} onclick="window.dashboardHub.abrirModalConfirmacion('${this.escapeHtml(String(solicitud.id))}')">✅ Confirmar</button>
                                    <button class="conf-btn-rechazar" onclick="window.dashboardHub.rechazarSolicitud('${this.escapeHtml(String(solicitud.id))}')">❌ Rechazar</button>
                                    <button class="conf-btn-detalle" onclick="window.dashboardHub.abrirModalConfirmacion('${this.escapeHtml(String(solicitud.id))}')">👁 Detalle</button>
                                </div>
                            </article>
                        `;
                    }).join('')}
                </div>
            </section>
        `;
    }

    abrirModalConfirmacion(solicitudId) {
        this.confSolicitudActivaId = String(solicitudId);
        const container = document.getElementById('confirmacionContainer');
        if (container) {
            this.cargarInterfazConfirmacion(container, this.confSolicitudes, this.confCitasConfirmadas);
        }
    }

    cerrarModalConfirmacion() {
        this.confSolicitudActivaId = null;
        const container = document.getElementById('confirmacionContainer');
        if (container) {
            this.cargarInterfazConfirmacion(container, this.confSolicitudes, this.confCitasConfirmadas);
        }
    }

    async confirmarCitaDesdeModal() {
        const solicitud = this.confSolicitudes.find(item => String(item.id) === String(this.confSolicitudActivaId));
        if (!solicitud) {
            window.alert('No se encontró la solicitud seleccionada.');
            return;
        }

        const estado = document.getElementById('confEstadoCita')?.value || 'CONFIRMADA';
        const fechaConfirmada = document.getElementById('confFechaConfirmada')?.value || '';
        const horaConfirmada = document.getElementById('confHoraConfirmada')?.value || '';
        const observaciones = document.getElementById('confObservaciones')?.value.trim() || '';
        const override = document.getElementById('confOverrideCheckbox')?.checked || false;

        if (estado !== 'RECHAZADA') {
            const fecha = this.parseDateValue(fechaConfirmada);
            if (!fecha) {
                window.alert('Debes indicar una fecha confirmada válida.');
                return;
            }

            if (!this.esDiaHabil(fecha)) {
                window.alert('La fecha confirmada debe caer entre lunes y viernes.');
                return;
            }

            const validacionVentana = this.validarReglaSemana(solicitud.marca_temporal, fechaConfirmada);
            const semanaActual = this.getInfoSemana(new Date()).semanaKey;
            const semanaConfirmada = this.getInfoSemana(fecha).semanaKey;
            const requiereOverride = !validacionVentana.valida || semanaConfirmada === semanaActual;
            if (requiereOverride && !override) {
                window.alert('La fecha confirmada cae fuera de la ventana permitida o en la semana actual. Activa el override excepcional si necesitas continuar.');
                return;
            }
        }

        const payload = {
            fecha_confirmada: estado === 'RECHAZADA' ? '' : fechaConfirmada,
            estado_cita: estado,
            hora_confirmada: estado === 'RECHAZADA' ? '' : horaConfirmada,
            observaciones,
            nombre_proveedor: solicitud.nombre_proveedor,
            numero_orden_compra: solicitud.numero_orden_compra,
            codigo_referencia: solicitud.codigo_referencia,
            descripcion_producto: solicitud.descripcion_producto,
            cantidad_unidades: solicitud.cantidad_unidades,
            cantidad_bultos: solicitud.cantidad_bultos,
            cantidad_pallets: solicitud.cantidad_pallets,
            tipo_ambiente: solicitud.tipo_ambiente,
            area_correspondiente: solicitud.area_correspondiente,
            nombre_solicitante: solicitud.nombre_solicitante,
            correo_solicitante: solicitud.correo_solicitante,
            telefono: solicitud.telefono,
            tipo_unidad_movil: solicitud.tipo_unidad_movil,
            personal_empresa_entrega: solicitud.personal_empresa_entrega
        };

        try {
            const response = await fetch(APPS_SCRIPT_URL, {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json'
                },
                body: JSON.stringify({
                    action: 'confirmarCita',
                    data: payload
                })
            });

            const result = await response.json();
            if (!result.success) {
                throw new Error(result.error || 'No fue posible registrar la cita');
            }

            this.confSolicitudActivaId = null;
            await this.inicializarModuloConfirmacion();
            window.alert('Solicitud procesada correctamente.');
        } catch (error) {
            console.error('Error confirmando cita:', error);
            window.alert(`Error confirmando la cita: ${error.message}`);
        }
    }

    rechazarSolicitud(solicitudId) {
        const rechazadas = this.obtenerSolicitudesRechazadasLocal();
        const id = String(solicitudId);
        const siguienteLista = rechazadas.includes(id)
            ? rechazadas.filter(item => item !== id)
            : [...rechazadas, id];

        sessionStorage.setItem(this.confRechazadasKey, JSON.stringify(siguienteLista));

        const container = document.getElementById('confirmacionContainer');
        if (container) {
            this.cargarInterfazConfirmacion(container, this.confSolicitudes, this.confCitasConfirmadas);
        }
    }

    parsearCodigosCriticos(texto) {
        return [...new Set(
            String(texto || '')
                .split(/[\n,;]+/)
                .map(codigo => this.normalizarCodigoReferencia(codigo))
                .filter(Boolean)
        )];
    }

    calcularPalletsSemanales(semanaKey, solicitudes, citasConfirmadas) {
        const pendientes = solicitudes.reduce((acc, solicitud) => acc + this.parseNumber(solicitud.cantidad_pallets), 0);
        const confirmados = citasConfirmadas.reduce((acc, cita) => {
            const infoSemana = this.getInfoSemana(cita.fecha_confirmada || cita.fecha_solicitada);
            return infoSemana.semanaKey === semanaKey ? acc + this.parseNumber(cita.cantidad_pallets) : acc;
        }, 0);

        return {
            pendientes,
            confirmados,
            total: pendientes + confirmados
        };
    }

    recargarModuloConfirmacion() {
        this.inicializarModuloConfirmacion({ limpiarRechazadas: true });
    }

    seleccionarSemanaConfirmacion(semanaKey) {
        this.confSemanaActiva = semanaKey;
        const container = document.getElementById('confirmacionContainer');
        if (container) {
            this.cargarInterfazConfirmacion(container, this.confSolicitudes, this.confCitasConfirmadas);
        }
    }

    toggleReportePanel() {
        this.confReporteExpandido = !this.confReporteExpandido;
        const container = document.getElementById('confirmacionContainer');
        if (container) {
            this.cargarInterfazConfirmacion(container, this.confSolicitudes, this.confCitasConfirmadas);
        }
    }

    aplicarCodigosCriticos() {
        const textarea = document.getElementById('confCodigosCriticosTextarea');
        const codigos = this.parsearCodigosCriticos(textarea ? textarea.value : '');
        sessionStorage.setItem(this.confCodigosCriticosKey, JSON.stringify(codigos));
        const container = document.getElementById('confirmacionContainer');
        if (container) {
            this.cargarInterfazConfirmacion(container, this.confSolicitudes, this.confCitasConfirmadas);
        }
    }

    limpiarCodigosCriticos() {
        sessionStorage.removeItem(this.confCodigosCriticosKey);
        const container = document.getElementById('confirmacionContainer');
        if (container) {
            this.cargarInterfazConfirmacion(container, this.confSolicitudes, this.confCitasConfirmadas);
        }
    }

    renderModalConfirmacion() {
        const solicitud = this.confSolicitudes.find(item => String(item.id) === String(this.confSolicitudActivaId));
        if (!solicitud) return '';

        const fechaVencimiento = this.parseDateValue(solicitud.fecha_vencimiento);
        const diasVencimiento = fechaVencimiento ? Math.round((fechaVencimiento - this.stripTime(new Date())) / 86400000) : null;
        const diasTexto = diasVencimiento === null
            ? 'sin dato'
            : diasVencimiento < 0
                ? `hace ${Math.abs(diasVencimiento)} días`
                : `en ${diasVencimiento} días`;

        return `
            <div class="conf-modal-overlay" onclick="window.dashboardHub.cerrarModalConfirmacion()">
                <div class="conf-modal" onclick="event.stopPropagation()">
                    <div class="conf-modal-header">
                        <div>
                            <h3>Confirmar Cita</h3>
                            <p>${this.escapeHtml(solicitud.nombre_proveedor || 'Proveedor')} — OC ${this.escapeHtml(solicitud.numero_orden_compra || 'N/D')}</p>
                        </div>
                        <button class="conf-btn-detalle" onclick="window.dashboardHub.cerrarModalConfirmacion()">✕</button>
                    </div>
                    <div class="conf-modal-body">
                        <div class="conf-modal-summary">
                            <p><strong>Producto:</strong> ${this.escapeHtml(solicitud.descripcion_producto || 'Sin descripción')}</p>
                            <p><strong>Código Ref:</strong> ${this.escapeHtml(solicitud.codigo_referencia || 'N/D')}</p>
                            <p>⚠️ Vence el ${this.escapeHtml(this.formatearFechaCorta(solicitud.fecha_vencimiento))} → ${this.escapeHtml(diasTexto)}</p>
                            <p>📦 Unidades: ${this.escapeHtml(String(this.parseNumber(solicitud.cantidad_unidades)))} | Bultos: ${this.escapeHtml(String(this.parseNumber(solicitud.cantidad_bultos)))} | Pallets: ${this.escapeHtml(String(this.parseNumber(solicitud.cantidad_pallets)))}</p>
                        </div>
                        <div class="conf-form-grid">
                            <label>
                                <span>Fecha Confirmada</span>
                                <input type="date" id="confFechaConfirmada" value="${this.escapeHtml(solicitud.fecha_solicitada || '')}">
                            </label>
                            <label>
                                <span>Hora Confirmada</span>
                                <input type="time" id="confHoraConfirmada" value="${this.escapeHtml(solicitud.hora_solicitada || '')}">
                            </label>
                            <label>
                                <span>Estado</span>
                                <select id="confEstadoCita" onchange="window.dashboardHub.toggleCamposConfirmacion()">
                                    <option value="CONFIRMADA">CONFIRMADA</option>
                                    <option value="REPROGRAMADA">REPROGRAMADA</option>
                                    <option value="RECHAZADA">RECHAZADA</option>
                                </select>
                            </label>
                            <label class="conf-form-full conf-override-row">
                                <input type="checkbox" id="confOverrideCheckbox">
                                <span>Confirmar fuera de ventana - motivo excepcional</span>
                            </label>
                            <label class="conf-form-full">
                                <span>Observaciones</span>
                                <textarea id="confObservaciones" rows="4" placeholder="Notas operativas, motivo excepcional, reprogramación, etc."></textarea>
                            </label>
                        </div>
                    </div>
                    <div class="conf-modal-footer">
                        <button class="conf-btn-detalle" onclick="window.dashboardHub.cerrarModalConfirmacion()">Cancelar</button>
                        <button class="conf-btn-confirmar" onclick="window.dashboardHub.confirmarCitaDesdeModal()">Confirmar y Enviar →</button>
                    </div>
                </div>
            </div>
        `;
    }

    configurarModalConfirmacionSiAplica() {
        if (document.getElementById('confEstadoCita')) {
            this.toggleCamposConfirmacion();
        }
    }

    toggleCamposConfirmacion() {
        const estado = document.getElementById('confEstadoCita')?.value;
        const ocultar = estado === 'RECHAZADA';
        ['confFechaConfirmada', 'confHoraConfirmada', 'confOverrideCheckbox'].forEach(id => {
            const element = document.getElementById(id);
            if (element) {
                element.closest('label').style.display = ocultar ? 'none' : 'flex';
            }
        });
    }

    normalizarSolicitud(solicitud, index) {
        const numeroOrdenCompra = String(solicitud.numero_orden_compra || solicitud.oc || '').trim();
        const fallbackId = [
            'SOL',
            solicitud.marca_temporal || solicitud.timestamp || `IDX${index + 1}`,
            solicitud.codigo_referencia || 'SINREF',
            solicitud.fecha_solicitada || solicitud.fecha_entrega_solicitada || 'SINFECHA'
        ].join('-');

        return {
            id: String(solicitud.id || fallbackId),
            marca_temporal: this.normalizarFechaSalida(solicitud.marca_temporal || solicitud.timestamp),
            fecha_solicitada: this.normalizarFechaSalida(solicitud.fecha_solicitada || solicitud.fecha_entrega_solicitada),
            fecha_vencimiento: this.normalizarFechaSalida(solicitud.fecha_vencimiento),
            hora_solicitada: String(solicitud.hora_solicitada || '').trim(),
            nombre_proveedor: String(solicitud.nombre_proveedor || solicitud.añadir_proveedor || '').trim(),
            numero_orden_compra: numeroOrdenCompra,
            codigo_referencia: String(solicitud.codigo_referencia || '').trim(),
            descripcion_producto: String(solicitud.descripcion_producto || '').trim(),
            cantidad_unidades: this.parseNumber(solicitud.cantidad_unidades),
            cantidad_bultos: this.parseNumber(solicitud.cantidad_bultos),
            cantidad_pallets: this.parseNumber(solicitud.cantidad_pallets),
            tipo_ambiente: String(solicitud.tipo_ambiente || '').trim(),
            area_correspondiente: String(solicitud.area_correspondiente || '').trim(),
            nombre_solicitante: String(solicitud.nombre_solicitante || '').trim(),
            correo_solicitante: String(solicitud.correo_solicitante || solicitud.correo || '').trim(),
            telefono: String(solicitud.telefono || '').trim(),
            tipo_unidad_movil: String(solicitud.tipo_unidad_movil || '').trim(),
            personal_empresa_entrega: String(solicitud.personal_empresa_entrega || '').trim(),
            tipo_entrega: String(solicitud.tipo_entrega || '').trim(),
            _srcRow: Array.isArray(solicitud._srcRow) ? solicitud._srcRow : []
        };
    }

    normalizarCitaConfirmada(cita, index) {
        return {
            id: String(cita.id || cita.numero_orden_compra || `CITA-${index + 1}`),
            fecha_confirmada: this.normalizarFechaSalida(cita.fecha_confirmada || cita.fecha),
            fecha_solicitada: this.normalizarFechaSalida(cita.fecha_solicitada),
            numero_orden_compra: String(cita.numero_orden_compra || '').trim(),
            cantidad_pallets: this.parseNumber(cita.cantidad_pallets),
            estado_cita: String(cita.estado_cita || '').trim(),
            nombre_proveedor: String(cita.nombre_proveedor || '').trim(),
            descripcion_producto: String(cita.descripcion_producto || '').trim(),
            area_correspondiente: String(cita.area_correspondiente || '').trim(),
            hora_confirmada: String(cita.hora_confirmada || '').trim()
        };
    }

    obtenerCodigosCriticos() {
        try {
            const data = JSON.parse(sessionStorage.getItem(this.confCodigosCriticosKey) || '[]');
            return Array.isArray(data) ? data.map(codigo => this.normalizarCodigoReferencia(codigo)).filter(Boolean) : [];
        } catch (error) {
            return [];
        }
    }

    obtenerSolicitudesRechazadasLocal() {
        try {
            const data = JSON.parse(sessionStorage.getItem(this.confRechazadasKey) || '[]');
            return Array.isArray(data) ? data.map(String) : [];
        } catch (error) {
            return [];
        }
    }

    getInfoSemana(fecha) {
        const fechaDate = this.parseDateValue(fecha) || this.stripTime(new Date());
        const lunes = this.getMonday(fechaDate);
        const viernes = new Date(lunes);
        viernes.setDate(lunes.getDate() + 4);
        const semanaNumero = this.getIsoWeekNumber(lunes);
        const year = lunes.getFullYear();

        return {
            semanaKey: `${year}-W${String(semanaNumero).padStart(2, '0')}`,
            label: `Semana ${semanaNumero} — ${this.formatearDiaMes(lunes)} al ${this.formatearDiaMes(viernes)} ${viernes.getFullYear()}`,
            shortLabel: `Sem ${semanaNumero}`,
            lunes,
            viernes
        };
    }

    getSemanaPermitida(marcaTemporal) {
        const marca = this.parseDateValue(marcaTemporal);
        if (!marca) return null;

        const inicioSemanaActual = this.getMonday(marca);
        const dia = marca.getDay();
        const semanaPermitida = new Date(inicioSemanaActual);
        semanaPermitida.setDate(semanaPermitida.getDate() + (dia >= 1 && dia <= 4 ? 7 : 14));
        return semanaPermitida;
    }

    getInfoProximoJueves() {
        const hoy = this.stripTime(new Date());
        const weekday = hoy.getDay() || 7;
        const diasHastaJueves = (4 - weekday + 7) % 7;
        const proximoJueves = new Date(hoy);
        proximoJueves.setDate(hoy.getDate() + diasHastaJueves);

        return {
            fecha: proximoJueves,
            label: proximoJueves.toLocaleDateString('es-ES', {
                weekday: 'long',
                day: 'numeric',
                month: 'short',
                year: 'numeric'
            }),
            mensaje: diasHastaJueves === 0 ? 'cierra hoy' : `en ${diasHastaJueves} día${diasHastaJueves === 1 ? '' : 's'}`
        };
    }

    getEtiquetaPrioridad(nivel) {
        return {
            critica: '🔴 CRÍTICO',
            urgente: '🟠 URGENTE',
            proximo: '🟡 PRÓXIMO',
            normal: '🟢 NORMAL'
        }[nivel] || '🟢 NORMAL';
    }

    normalizarCodigoReferencia(codigo) {
        return String(codigo || '').trim().toUpperCase();
    }

    normalizarFechaSalida(value) {
        const fecha = this.parseDateValue(value);
        return fecha ? this.toISODate(fecha) : '';
    }

    parseDateValue(value) {
        if (!value) return null;
        if (value instanceof Date && !Number.isNaN(value.getTime())) {
            return this.stripTime(value);
        }

        const texto = String(value).trim();
        if (!texto) return null;

        if (/^\d{4}-\d{2}-\d{2}$/.test(texto)) {
            const [year, month, day] = texto.split('-').map(Number);
            return new Date(year, month - 1, day);
        }

        if (/^\d{1,2}[/-]\d{1,2}[/-]\d{4}$/.test(texto)) {
            const [day, month, year] = texto.split(/[/-]/).map(Number);
            return new Date(year, month - 1, day);
        }

        const fecha = new Date(texto);
        return Number.isNaN(fecha.getTime()) ? null : this.stripTime(fecha);
    }

    parseNumber(value) {
        const raw = String(value ?? '').trim();
        if (!raw) return 0;

        let normalized = raw;
        if (raw.includes(',') && raw.includes('.')) {
            normalized = raw.replace(/,/g, '');
        } else if (/^\d{1,3}(,\d{3})+$/.test(raw)) {
            normalized = raw.replace(/,/g, '');
        } else if ((raw.match(/,/g) || []).length > 1) {
            normalized = raw.replace(/,/g, '');
        } else {
            normalized = raw.replace(/,/g, '.');
        }

        const number = Number(normalized);
        return Number.isFinite(number) ? number : 0;
    }

    stripTime(fecha) {
        const copy = new Date(fecha);
        copy.setHours(0, 0, 0, 0);
        return copy;
    }

    getMonday(fecha) {
        const date = this.stripTime(fecha);
        const day = date.getDay() || 7;
        if (day !== 1) {
            date.setDate(date.getDate() - (day - 1));
        }
        return date;
    }

    getIsoWeekNumber(fecha) {
        const date = new Date(Date.UTC(fecha.getFullYear(), fecha.getMonth(), fecha.getDate()));
        const dayNum = date.getUTCDay() || 7;
        date.setUTCDate(date.getUTCDate() + 4 - dayNum);
        const yearStart = new Date(Date.UTC(date.getUTCFullYear(), 0, 1));
        return Math.ceil((((date - yearStart) / 86400000) + 1) / 7);
    }

    esDiaHabil(fecha) {
        const dia = fecha.getDay();
        return dia >= 1 && dia <= 5;
    }

    toISODate(fecha) {
        return `${fecha.getFullYear()}-${String(fecha.getMonth() + 1).padStart(2, '0')}-${String(fecha.getDate()).padStart(2, '0')}`;
    }

    formatearFechaCorta(fecha) {
        const fechaDate = this.parseDateValue(fecha);
        if (!fechaDate) return 'Fecha no definida';
        return fechaDate.toLocaleDateString('es-ES', {
            day: '2-digit',
            month: '2-digit',
            year: 'numeric'
        });
    }

    formatearFechaLarga(fecha) {
        const fechaDate = this.parseDateValue(fecha);
        if (!fechaDate) return 'Fecha no definida';
        return fechaDate.toLocaleDateString('es-ES', {
            day: 'numeric',
            month: 'short',
            year: 'numeric'
        });
    }

    formatearDiaMes(fecha) {
        return fecha.toLocaleDateString('es-ES', {
            day: 'numeric',
            month: 'short'
        });
    }

    escapeHtml(value) {
        return String(value ?? '')
            .replace(/&/g, '&amp;')
            .replace(/</g, '&lt;')
            .replace(/>/g, '&gt;')
            .replace(/"/g, '&quot;')
            .replace(/'/g, '&#39;');
    }
}

window.dashboardHub = new DashboardHub();

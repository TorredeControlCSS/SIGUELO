class DashboardHub {
    constructor() {
        this.init();
    }

    init() {
        this.setupEventListeners();
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
        document.getElementById('mainMenu').classList.add('hidden');
        document.getElementById('dashboardContainer').classList.remove('hidden');
        
        const content = document.getElementById('dashboardContent');
        content.innerHTML = `<h2>Dashboard ${dashboardId}</h2><p>Contenido específico aquí</p>`;
    }

    showMainMenu() {
        document.getElementById('dashboardContainer').classList.add('hidden');
        document.getElementById('mainMenu').classList.remove('hidden');
    }
}

new DashboardHub();
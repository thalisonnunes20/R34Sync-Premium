document.addEventListener('DOMContentLoaded', async () => {
    // ==========================================
    // SISTEMA DE AUTENTICAÇÃO
    // ==========================================
    const authContainer = document.getElementById('authContainer');
    const appContainer = document.getElementById('appContainer');
    const setupCard = document.getElementById('setupCard');
    const loginCard = document.getElementById('loginCard');

    let token = localStorage.getItem('r34sync_token') || '';

    // Interceptador global do Fetch para injetar o JWT automaticamente
    const originalFetch = window.fetch;
    window.fetch = async function() {
        let [resource, config] = arguments;
        if (typeof resource === 'string' && resource.startsWith('/api/') && !resource.startsWith('/api/auth')) {
            config = config || {};
            config.headers = config.headers || {};
            if (token) {
                config.headers['Authorization'] = `Bearer ${token}`;
            }
        }
        return originalFetch.call(this, resource, config);
    };

    async function checkAuthStatus() {
        try {
            const res = await fetch('/api/auth/status');
            const data = await res.json();
            
            if (!data.hasUsers) {
                authContainer.classList.remove('hidden');
                setupCard.classList.remove('hidden');
            } else if (!token) {
                authContainer.classList.remove('hidden');
                loginCard.classList.remove('hidden');
            } else {
                const confRes = await fetch('/api/config');
                if (confRes.status === 401 || confRes.status === 403) {
                    token = '';
                    localStorage.removeItem('r34sync_token');
                    authContainer.classList.remove('hidden');
                    loginCard.classList.remove('hidden');
                } else {
                    startApp();
                }
            }
        } catch (e) { console.error('Auth error', e); }
    }

    function startApp() {
        authContainer.classList.add('hidden');
        appContainer.classList.remove('hidden');
        switchTab('manual');
    }

    document.getElementById('setupForm')?.addEventListener('submit', async (e) => {
        e.preventDefault();
        const btn = document.getElementById('setupBtn');
        const err = document.getElementById('setupError');
        btn.disabled = true; btn.textContent = 'Criando...';
        
        try {
            const res = await fetch('/api/auth/setup', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    username: document.getElementById('setupUser').value,
                    password: document.getElementById('setupPass').value
                })
            });
            const data = await res.json();
            if (!res.ok) throw new Error(data.error);
            
            setupCard.classList.add('hidden');
            loginCard.classList.remove('hidden');
            document.getElementById('setupForm').reset();
        } catch(e) {
            err.textContent = e.message; err.classList.remove('hidden');
        } finally {
            btn.disabled = false; btn.textContent = 'Criar Administrador';
        }
    });

    document.getElementById('loginForm')?.addEventListener('submit', async (e) => {
        e.preventDefault();
        const btn = document.getElementById('loginBtn');
        const err = document.getElementById('loginError');
        btn.disabled = true; btn.textContent = 'Entrando...';
        
        try {
            const res = await fetch('/api/auth/login', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    username: document.getElementById('loginUser').value,
                    password: document.getElementById('loginPass').value
                })
            });
            const data = await res.json();
            if (!res.ok) throw new Error(data.error);
            
            token = data.token;
            localStorage.setItem('r34sync_token', token);
            err.classList.add('hidden');
            startApp();
        } catch(e) {
            err.textContent = e.message; err.classList.remove('hidden');
        } finally {
            btn.disabled = false; btn.textContent = 'Entrar no Painel';
        }
    });

    document.getElementById('logoutBtn')?.addEventListener('click', () => {
        token = '';
        localStorage.removeItem('r34sync_token');
        appContainer.classList.add('hidden');
        authContainer.classList.remove('hidden');
        loginCard.classList.remove('hidden');
        document.getElementById('loginForm').reset();
    });

    // Inicializa a verificação de auth
    checkAuthStatus();
    
    // ==========================================
    // SISTEMA PRINCIPAL
    // ==========================================
    const form = document.getElementById('downloadForm');
    const submitBtn = document.getElementById('submitBtn');
    const btnText = document.querySelector('.btn-text');
    const btnLoader = document.getElementById('btnLoader');
    
    const progressContainer = document.getElementById('progressContainer');
    const statusTitle = document.getElementById('statusTitle');
    const statusMessage = document.getElementById('statusMessage');
    const progressFill = document.getElementById('progressFill');
    const percentage = document.getElementById('percentage');
    const totalFilesEl = document.getElementById('totalFiles');
    const downloadedFilesEl = document.getElementById('downloadedFiles');
    const cancelBtn = document.getElementById('cancelBtn');

    let eventSource = null;
    let currentTaskId = null;

    form.addEventListener('submit', async (e) => {
        e.preventDefault();
        
        let tags = document.getElementById('tags').value.trim();
        const searchType = document.getElementById('searchType').value;
        
        if (!tags) return;

        if (searchType === 'user' && !tags.startsWith('user:')) {
            tags = 'user:' + tags;
        }

        // UI Reset
        submitBtn.disabled = true;
        btnText.classList.add('hidden');
        btnLoader.classList.remove('hidden');
        progressContainer.classList.remove('hidden');
        
        statusTitle.textContent = 'Iniciando...';
        statusTitle.className = '';
        statusMessage.textContent = 'Conectando ao servidor...';
        progressFill.style.width = '0%';
        percentage.textContent = '0%';
        totalFilesEl.textContent = '0';
        downloadedFilesEl.textContent = '0';

        try {
            // Inicia o processo no backend
            const response = await fetch('/api/download', {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json'
                },
                body: JSON.stringify({ tags })
            });

            const data = await response.json();

            if (!response.ok) {
                throw new Error(data.error || 'Erro ao iniciar download');
            }

            // Conecta ao SSE para receber atualizações
            currentTaskId = data.taskId;
            cancelBtn.style.display = 'block';
            connectSSE(data.taskId);

        } catch (error) {
            showError(error.message);
            resetBtn();
        }
    });

    function connectSSE(taskId) {
        if (eventSource) {
            eventSource.close();
        }

        eventSource = new EventSource(`/api/progress/${taskId}?token=${token}`);

        eventSource.onmessage = (event) => {
            const data = JSON.parse(event.data);
            updateUI(data);

            if (data.state === 'completed' || data.state === 'error') {
                eventSource.close();
                resetBtn();
                cancelBtn.style.display = 'none';
                currentTaskId = null;
                if (data.state === 'completed') {
                    statusTitle.textContent = 'Concluído!';
                    statusTitle.classList.add('success-text');
                    progressFill.style.width = '100%';
                    percentage.textContent = '100%';
                }
                if (data.state === 'error') {
                    showError(data.message);
                }
            }
        };

        eventSource.onerror = () => {
            showError('Conexão com o servidor perdida.');
            eventSource.close();
            resetBtn();
            cancelBtn.style.display = 'none';
            currentTaskId = null;
        };
    }

    function updateUI(data) {
        if (data.message) {
            statusMessage.textContent = data.message;
        }
        
        if (data.totalFiles !== undefined) {
            totalFilesEl.textContent = data.totalFiles;
        }
        
        if (data.downloadedFiles !== undefined) {
            downloadedFilesEl.textContent = data.downloadedFiles;
            
            // Calcula porcentagem
            if (data.totalFiles > 0) {
                const perc = Math.round((data.downloadedFiles / data.totalFiles) * 100);
                progressFill.style.width = `${perc}%`;
                percentage.textContent = `${perc}%`;
            }
        }

        switch (data.state) {
            case 'fetching_info':
                statusTitle.textContent = 'Buscando Dados...';
                break;
            case 'downloading':
                statusTitle.textContent = 'Baixando Arquivos...';
                break;
        }
    }

    function showError(msg) {
        statusTitle.textContent = 'Erro';
        statusTitle.classList.add('error-text');
        statusMessage.textContent = msg;
        progressFill.style.background = 'var(--error)';
    }

    function resetBtn() {
        submitBtn.disabled = false;
        btnText.classList.remove('hidden');
        btnLoader.classList.add('hidden');
    }

    cancelBtn.addEventListener('click', async () => {
        if (!currentTaskId) return;
        const deleteFolder = confirm('Deseja apagar as imagens que já foram baixadas desse criador/tag?');
        try {
            await fetch(`/api/cancel/${currentTaskId}`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ deleteFolder })
            });
            cancelBtn.textContent = 'Cancelando...';
            cancelBtn.disabled = true;
        } catch (e) {
            console.error(e);
        }
    });

    // --- LÓGICA DE ABAS ---
    const tabManual = document.getElementById('tabManual');
    const tabAuto = document.getElementById('tabAuto');
    const tabManager = document.getElementById('tabManager');
    const sectionManual = document.getElementById('sectionManual');
    const sectionAuto = document.getElementById('sectionAuto');
    const sectionManager = document.getElementById('sectionManager');

    function switchTab(tabName) {
        // Reset ALL tabs
        [tabManual, tabAuto, tabManager].forEach(t => {
            t.classList.remove('active');
            t.style.background = 'transparent';
            t.style.color = 'var(--text-secondary)';
            t.style.borderColor = 'var(--text-secondary)';
        });
        
        // Hide ALL sections
        [sectionManual, sectionAuto, sectionManager].forEach(s => {
            s.classList.add('hidden');
            s.classList.remove('tab-content-active');
        });

        if (tabName === 'auto') {
            tabAuto.classList.add('active');
            tabAuto.style.background = 'var(--accent)';
            tabAuto.style.color = '#121812';
            tabAuto.style.borderColor = 'var(--accent)';
            sectionAuto.classList.remove('hidden');
            sectionAuto.classList.add('tab-content-active');
            loadTracked();
        } else if (tabName === 'manager') {
            tabManager.classList.add('active');
            tabManager.style.background = 'var(--accent)';
            tabManager.style.color = '#121812';
            tabManager.style.borderColor = 'var(--accent)';
            sectionManager.classList.remove('hidden');
            sectionManager.classList.add('tab-content-active');
            if (typeof loadConfig === 'function') loadConfig();
            loadFolders();
        } else {
            tabManual.classList.add('active');
            tabManual.style.background = 'var(--accent)';
            tabManual.style.color = '#121812';
            tabManual.style.borderColor = 'var(--accent)';
            sectionManual.classList.remove('hidden');
            sectionManual.classList.add('tab-content-active');
        }
    }

    tabManual.addEventListener('click', () => switchTab('manual'));
    tabAuto.addEventListener('click', () => switchTab('auto'));
    tabManager.addEventListener('click', () => switchTab('manager'));

    // --- LÓGICA DE MONITORAMENTO ---
    const trackForm = document.getElementById('trackForm');
    const trackTags = document.getElementById('trackTags');
    const trackSearchType = document.getElementById('trackSearchType');
    const trackedList = document.getElementById('trackedList');

    async function loadConfig() {
        try {
            const configRes = await fetch('/api/config');
            const configData = await configRes.json();
            const cronTimeDisplay = document.getElementById('cronTimeDisplay');
            if (cronTimeDisplay && configData.cronTime) {
                cronTimeDisplay.textContent = configData.cronTime;
            }
            const configDownloadDir = document.getElementById('configDownloadDir');
            if (configDownloadDir && configData.downloadDir !== undefined) {
                configDownloadDir.value = configData.downloadDir;
            }
            const configCronTime = document.getElementById('configCronTime');
            if (configCronTime && configData.cronTime) {
                configCronTime.value = configData.cronTime;
            }
        } catch(e) {}
    }

    if (document.getElementById('saveConfigBtn')) {
        document.getElementById('saveConfigBtn').addEventListener('click', async (e) => {
            const btn = e.target;
            btn.textContent = 'Salvando...';
            btn.disabled = true;
            try {
                await fetch('/api/config', {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({
                        downloadDir: document.getElementById('configDownloadDir').value.trim(),
                        cronTime: document.getElementById('configCronTime').value
                    })
                });
                
                // Atualiza o horário dinâmico na tela de Agendamentos também
                const cronTimeDisplay = document.getElementById('cronTimeDisplay');
                if (cronTimeDisplay) {
                    cronTimeDisplay.textContent = document.getElementById('configCronTime').value || '03:00';
                }
                
                setTimeout(() => { btn.textContent = 'Salvar'; btn.disabled = false; }, 1000);
            } catch (err) {
                btn.textContent = 'Erro';
            }
        });
    }

    async function loadTracked() {
        try {
            // Atualiza configurações e a lista
            await loadConfig();

            const response = await fetch('/api/tracked');
            const data = await response.json();
            
            trackedList.innerHTML = '';
            
            if (data.length === 0) {
                trackedList.innerHTML = '<p style="text-align: center; color: var(--text-secondary); font-size: 0.85rem; padding: 1rem;">Nenhuma tag sendo monitorada.</p>';
                return;
            }
            
            data.forEach(item => {
                const el = document.createElement('div');
                el.style.display = 'flex';
                el.style.justifyContent = 'space-between';
                el.style.alignItems = 'center';
                el.style.padding = '0.75rem 1rem';
                el.style.background = 'rgba(15, 23, 42, 0.5)';
                el.style.borderRadius = '8px';
                el.style.border = '1px solid rgba(255,255,255,0.05)';
                
                el.innerHTML = `
                    <span style="font-weight: 600; color: var(--accent);">${item.tags}</span>
                    <button class="delete-btn" data-id="${item.id}" style="width: auto; padding: 0.3rem 0.8rem; background: var(--error); color: white; font-size: 0.75rem; border: none; border-radius: 4px; cursor: pointer;">Remover</button>
                `;
                
                trackedList.appendChild(el);
            });

            document.querySelectorAll('.delete-btn').forEach(btn => {
                btn.addEventListener('click', async (e) => {
                    const id = e.target.getAttribute('data-id');
                    await fetch('/api/tracked/' + id, { method: 'DELETE' });
                    loadTracked();
                });
            });
        } catch (err) {
            console.error(err);
        }
    }

    trackForm.addEventListener('submit', async (e) => {
        e.preventDefault();
        const btn = document.getElementById('trackBtn');
        btn.disabled = true;
        btn.textContent = '...';
        
        try {
            await fetch('/api/tracked', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    tags: trackTags.value,
                    searchType: trackSearchType.value
                })
            });
            trackTags.value = '';
            loadTracked();
        } catch (err) {
            alert('Erro ao adicionar tag');
        } finally {
            btn.disabled = false;
            btn.textContent = 'Adicionar';
        }
    });

    // --- LÓGICA DO GERENCIADOR ---
    async function loadFolders() {
        const foldersList = document.getElementById('foldersList');
        const refreshBtn = document.getElementById('refreshFoldersBtn');
        
        if (refreshBtn) refreshBtn.classList.add('spinning');
        foldersList.innerHTML = '<div style="display: flex; justify-content: center; padding: 2rem;"><div class="loader"></div></div>';
        
        try {
            const res = await fetch('/api/folders');
            const data = await res.json();
            foldersList.innerHTML = '';
            
            if (data.length === 0) {
                foldersList.innerHTML = '<p class="fade-in" style="text-align: center; color: var(--text-secondary); font-size: 0.85rem; padding: 1rem;">Nenhuma pasta encontrada.</p>';
                if (refreshBtn) refreshBtn.classList.remove('spinning');
                return;
            }
            
            data.forEach(folder => {
                const el = document.createElement('div');
                el.className = 'fade-in';
                el.style.display = 'flex';
                el.style.justifyContent = 'space-between';
                el.style.alignItems = 'center';
                el.style.padding = '0.75rem 1rem';
                el.style.background = 'rgba(15, 23, 42, 0.5)';
                el.style.borderRadius = '8px';
                el.style.border = '1px solid rgba(255,255,255,0.05)';
                el.innerHTML = `
                    <div>
                        <div style="font-weight: 600; color: var(--text-primary); margin-bottom: 0.2rem;">${folder.name}</div>
                        <div style="font-size: 0.75rem; color: var(--text-secondary);">${folder.fileCount} arquivos (${folder.sizeMb} MB)</div>
                    </div>
                    <div style="display: flex; gap: 5px;">
                        <a href="/api/zip/${folder.name}?token=${token}" target="_blank" onclick="this.textContent = 'Gerando...'; setTimeout(() => this.textContent = 'Baixar ZIP', 3000);" style="text-decoration: none; padding: 0.5rem 0.8rem; background: var(--success); color: white; font-size: 0.75rem; border-radius: 4px; font-weight: bold;">Baixar ZIP</a>
                        <button class="delete-folder-btn" data-name="${folder.name}" style="padding: 0.5rem 0.8rem; background: var(--error); color: white; font-size: 0.75rem; border: none; border-radius: 4px; cursor: pointer; font-weight: bold;">Apagar</button>
                    </div>
                `;
                foldersList.appendChild(el);
            });

            document.querySelectorAll('.delete-folder-btn').forEach(btn => {
                btn.addEventListener('click', async (e) => {
                    if (confirm('Certeza absoluta que deseja apagar essa pasta? Todo o conteúdo será perdido.')) {
                        e.target.disabled = true;
                        e.target.textContent = 'Apagando...';
                        const name = e.target.getAttribute('data-name');
                        await fetch('/api/folders/' + name, { method: 'DELETE' });
                        loadFolders();
                    }
                });
            });
        } catch (err) {
            console.error(err);
            foldersList.innerHTML = '<p style="color: var(--error); text-align: center;">Erro ao carregar pastas.</p>';
        } finally {
            if (refreshBtn) refreshBtn.classList.remove('spinning');
        }
    }

    if(document.getElementById('refreshFoldersBtn')) {
        document.getElementById('refreshFoldersBtn').addEventListener('click', loadFolders);
    }
});

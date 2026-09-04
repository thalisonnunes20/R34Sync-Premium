document.addEventListener('DOMContentLoaded', () => {
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

    let eventSource = null;

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

        eventSource = new EventSource(`/api/progress/${taskId}`);

        eventSource.onmessage = (event) => {
            const data = JSON.parse(event.data);
            updateUI(data);

            if (data.state === 'completed' || data.state === 'error') {
                eventSource.close();
                resetBtn();
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
});

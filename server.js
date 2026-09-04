require('dotenv').config();
const express = require('express');
const cors = require('cors');
const axios = require('axios');
const fs = require('fs');
const path = require('path');

const app = express();
const PORT = process.env.PORT || 3000;

app.use(cors());
app.use(express.json());
app.use(express.static('public'));

// Estado dos downloads em andamento para o SSE
const activeDownloads = {};

// Função auxiliar para esperar (sleep) e evitar rate limits pesados
const sleep = (ms) => new Promise(resolve => setTimeout(resolve, ms));

// Rota para SSE (Server-Sent Events) para enviar progresso
app.get('/api/progress/:taskId', (req, res) => {
    const taskId = req.params.taskId;
    
    res.setHeader('Content-Type', 'text/event-stream');
    res.setHeader('Cache-Control', 'no-cache');
    res.setHeader('Connection', 'keep-alive');

    const sendUpdate = (data) => {
        res.write(`data: ${JSON.stringify(data)}\n\n`);
    };

    // Associa o sendUpdate ao state do download
    if (activeDownloads[taskId]) {
        activeDownloads[taskId].sendUpdate = sendUpdate;
        // Envia o status inicial
        sendUpdate(activeDownloads[taskId].status);
    } else {
        sendUpdate({ status: 'error', message: 'Download não encontrado' });
        res.end();
    }

    // Se o cliente fechar a conexão
    req.on('close', () => {
        if (activeDownloads[taskId]) {
            activeDownloads[taskId].sendUpdate = null;
        }
    });
});

// Inicia o processo de download
app.post('/api/download', async (req, res) => {
    const { tags, userId, apiKey } = req.body;

    if (!tags || tags.trim() === '') {
        return res.status(400).json({ error: 'A tag ou nome do criador é obrigatória.' });
    }

    const taskId = Date.now().toString();
    const tagSafeName = tags.replace(/[^a-zA-Z0-9_-]/g, '_');
    const downloadDir = path.join(__dirname, 'downloads', tagSafeName);

    // Cria a pasta de download se não existir
    if (!fs.existsSync(downloadDir)) {
        fs.mkdirSync(downloadDir, { recursive: true });
    }

    // Inicializa o state do download
    activeDownloads[taskId] = {
        status: {
            state: 'initializing',
            totalFiles: 0,
            downloadedFiles: 0,
            message: 'Iniciando busca...'
        },
        sendUpdate: null
    };

    res.json({ taskId, message: 'Download iniciado' });

    // Inicia o processamento em background
    processDownload(taskId, tags, downloadDir, userId, apiKey);
});

async function processDownload(taskId, tags, downloadDir, userId, apiKey) {
    const apiBase = 'https://api.rule34.xxx/index.php?page=dapi&s=post&q=index&json=1';
    let page = 0;
    const limit = 100;
    let keepGoing = true;
    let allPosts = [];

    const updateStatus = (newState) => {
        activeDownloads[taskId].status = { ...activeDownloads[taskId].status, ...newState };
        if (activeDownloads[taskId].sendUpdate) {
            activeDownloads[taskId].sendUpdate(activeDownloads[taskId].status);
        }
    };

    try {
        updateStatus({ state: 'fetching_info', message: 'Buscando informações da API...' });

        // Fase 1: Buscar todos os links
        const seenIds = new Set();
        while (keepGoing) {
            let url = `${apiBase}&tags=${encodeURIComponent(tags)}&pid=${page}&limit=${limit}`;
            
            // Usa as credenciais do front-end ou as do arquivo .env
            const activeUserId = userId || process.env.RULE34_USER_ID;
            const activeApiKey = apiKey || process.env.RULE34_API_KEY;
            
            if (activeUserId && activeApiKey) {
                url += `&user_id=${encodeURIComponent(activeUserId)}&api_key=${encodeURIComponent(activeApiKey)}`;
            }
            const response = await axios.get(url, { headers: { 'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36' }});
            
            let data = response.data;
            
            // --- DEBUG LOGS ---
            console.log('================= DEBUG API =================');
            console.log('URL Chamada:', url);
            console.log('Tipo do Retorno:', typeof data);
            if (typeof data === 'string') {
                console.log('Conteúdo RAW (início):', data.substring(0, 500));
            } else {
                console.log('É um Array?', Array.isArray(data));
                console.log('Tamanho:', data ? data.length : 0);
            }
            console.log('=============================================');

            if (typeof data === 'string') {
                if (data.trim() === '') {
                    data = [];
                } else {
                    try {
                        data = JSON.parse(data);
                    } catch (err) {
                        data = [];
                    }
                }
            }

            if (data && Array.isArray(data) && data.length > 0) {
                // A API do Rule34 retorna a página 0 se o 'pid' passar do limite.
                // Verificamos se o primeiro post já foi visto para parar a busca.
                if (seenIds.has(data[0].id)) {
                    keepGoing = false;
                    break;
                }

                data.forEach(post => {
                    if (!seenIds.has(post.id)) {
                        seenIds.add(post.id);
                        allPosts.push(post);
                    }
                });

                updateStatus({ message: `Encontrados ${allPosts.length} arquivos até o momento...` });
                
                if (data.length < limit) {
                    keepGoing = false; // Última página atingida
                } else {
                    page++;
                    await sleep(500); // Pausa gentil para a API
                }
            } else {
                keepGoing = false;
            }
        }

        if (allPosts.length === 0) {
            updateStatus({ state: 'error', message: 'Nenhum resultado encontrado para essa tag.' });
            return;
        }

        updateStatus({ state: 'downloading', totalFiles: allPosts.length, message: `Iniciando o download de ${allPosts.length} arquivos...` });

        // Fase 2: Fazer o download dos arquivos
        let downloadedCount = 0;

        for (const post of allPosts) {
            if (!post.file_url) continue;

            const fileUrl = post.file_url;
            const fileName = `${post.id}_${path.basename(new URL(fileUrl).pathname)}`;
            const filePath = path.join(downloadDir, fileName);

            // Verifica se o arquivo já existe para não baixar de novo
            if (fs.existsSync(filePath)) {
                downloadedCount++;
                updateStatus({ downloadedFiles: downloadedCount, message: `Arquivo já existe: ${fileName}` });
                continue;
            }

            try {
                const fileResponse = await axios({
                    method: 'GET',
                    url: fileUrl,
                    responseType: 'stream',
                    headers: { 'User-Agent': 'Mozilla/5.0' }
                });

                const writer = fs.createWriteStream(filePath);
                fileResponse.data.pipe(writer);

                await new Promise((resolve, reject) => {
                    writer.on('finish', resolve);
                    writer.on('error', reject);
                });

                downloadedCount++;
                updateStatus({ downloadedFiles: downloadedCount, message: `Baixado: ${fileName}` });

                await sleep(200); // Pausa gentil entre downloads
            } catch (err) {
                console.error(`Erro ao baixar ${fileUrl}:`, err.message);
                updateStatus({ message: `Erro ao baixar ${fileName}, pulando...` });
            }
        }

        updateStatus({ state: 'completed', message: 'Download concluído com sucesso!' });

    } catch (error) {
        console.error("Erro geral no processo:", error.message);
        updateStatus({ state: 'error', message: `Ocorreu um erro: ${error.message}` });
    }
}

app.listen(PORT, () => {
    console.log(`Servidor rodando em http://localhost:${PORT}`);
});

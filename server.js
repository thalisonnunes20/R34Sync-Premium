require('dotenv').config();
const express = require('express');
const cors = require('cors');
const axios = require('axios');
const fs = require('fs');
const path = require('path');
const cron = require('node-cron');
const { ZipArchive } = require('archiver');
const sqlite3 = require('sqlite3').verbose();
const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');

const JWT_SECRET = process.env.JWT_SECRET || 'r34sync-super-secret-key-2026';

const app = express();
const PORT = process.env.PORT || 3000;

const CONFIG_FILE = path.join(__dirname, 'config.json');

function getAppConfig() {
    if (fs.existsSync(CONFIG_FILE)) {
        try {
            return JSON.parse(fs.readFileSync(CONFIG_FILE, 'utf8'));
        } catch (e) {
            return {};
        }
    }
    return {};
}

function saveAppConfig(config) {
    fs.writeFileSync(CONFIG_FILE, JSON.stringify(config, null, 2));
}

function getBaseDownloadDir() {
    const config = getAppConfig();
    return config.downloadDir || process.env.DOWNLOAD_DIR || path.join(__dirname, 'downloads');
}

app.use(cors());
app.use(express.json());

const dbPath = path.join(__dirname, 'database.sqlite');
const db = new sqlite3.Database(dbPath);

db.serialize(() => {
    db.run(`CREATE TABLE IF NOT EXISTS users (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        username TEXT UNIQUE,
        password TEXT
    )`);
});

// Middleware de Autenticação
function authMiddleware(req, res, next) {
    const authHeader = req.headers.authorization;
    const token = (authHeader && authHeader.split(' ')[1]) || req.query.token;

    if (!token) return res.status(401).json({ error: 'Token não fornecido' });

    jwt.verify(token, JWT_SECRET, (err, user) => {
        if (err) return res.status(403).json({ error: 'Token inválido' });
        req.user = user;
        next();
    });
}

// Rotas de Autenticação
app.get('/api/auth/status', (req, res) => {
    db.get('SELECT COUNT(*) as count FROM users', (err, row) => {
        if (err) return res.status(500).json({ error: 'Erro no banco' });
        res.json({ hasUsers: row.count > 0 });
    });
});

app.post('/api/auth/setup', (req, res) => {
    const { username, password } = req.body;
    db.get('SELECT COUNT(*) as count FROM users', (err, row) => {
        if (row.count > 0) return res.status(403).json({ error: 'Setup já realizado' });

        const hash = bcrypt.hashSync(password, 10);
        db.run('INSERT INTO users (username, password) VALUES (?, ?)', [username, hash], function (err) {
            if (err) return res.status(500).json({ error: 'Erro ao criar usuário' });
            res.json({ success: true });
        });
    });
});

app.post('/api/auth/login', (req, res) => {
    const { username, password } = req.body;
    db.get('SELECT * FROM users WHERE username = ?', [username], (err, row) => {
        if (err || !row) return res.status(401).json({ error: 'Usuário não encontrado' });

        if (bcrypt.compareSync(password, row.password)) {
            const token = jwt.sign({ id: row.id, username: row.username }, JWT_SECRET, { expiresIn: '7d' });
            res.json({ success: true, token });
        } else {
            res.status(401).json({ error: 'Senha incorreta' });
        }
    });
});

app.use('/api', (req, res, next) => {
    if (req.path.startsWith('/auth')) {
        return next();
    }
    return authMiddleware(req, res, next);
});

// Serve o front-end
app.use(express.static('public'));

// Estado dos downloads em andamento para o SSE
const activeDownloads = {};

// Função auxiliar para esperar (sleep) e evitar rate limits pesados
const sleep = (ms) => new Promise(resolve => setTimeout(resolve, ms));

const TRACKED_FILE = path.join(__dirname, 'tracked_tags.json');

function getTrackedTags() {
    if (!fs.existsSync(TRACKED_FILE)) return [];
    try {
        const data = fs.readFileSync(TRACKED_FILE, 'utf8');
        return JSON.parse(data).tracked || [];
    } catch (e) {
        return [];
    }
}

function saveTrackedTags(tagsArray) {
    fs.writeFileSync(TRACKED_FILE, JSON.stringify({ tracked: tagsArray }, null, 2));
}

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
    const downloadDir = path.join(getBaseDownloadDir(), tagSafeName);

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

// Cancela o download em andamento
app.post('/api/cancel/:taskId', (req, res) => {
    const taskId = req.params.taskId;
    const { deleteFolder } = req.body;
    if (activeDownloads[taskId]) {
        activeDownloads[taskId].cancelled = true;
        activeDownloads[taskId].deleteOnCancel = deleteFolder;
        res.json({ success: true, message: 'Cancelamento solicitado' });
    } else {
        res.status(404).json({ error: 'Download não encontrado ou já finalizado' });
    }
});

// Gerenciamento de Pastas (Listar)
app.get('/api/folders', (req, res) => {
    const baseDir = getBaseDownloadDir();
    if (!fs.existsSync(baseDir)) return res.json([]);

    const folders = fs.readdirSync(baseDir).filter(f => fs.statSync(path.join(baseDir, f)).isDirectory());

    const result = folders.map(folder => {
        const folderPath = path.join(baseDir, folder);
        const files = fs.readdirSync(folderPath);
        let totalSize = 0;
        files.forEach(file => {
            totalSize += fs.statSync(path.join(folderPath, file)).size;
        });

        return {
            name: folder,
            fileCount: files.length,
            sizeMb: (totalSize / (1024 * 1024)).toFixed(2)
        };
    });

    res.json(result);
});

// Gerenciamento de Pastas (Deletar)
app.delete('/api/folders/:name', (req, res) => {
    const folderName = req.params.name.replace(/[^a-zA-Z0-9_-]/g, '_');
    const folderPath = path.join(getBaseDownloadDir(), folderName);
    if (fs.existsSync(folderPath)) {
        fs.rmSync(folderPath, { recursive: true, force: true });
        res.json({ success: true });
    } else {
        res.status(404).json({ error: 'Pasta não encontrada' });
    }
});

// Gerenciamento de Pastas (Download ZIP)
app.get('/api/zip/:name', (req, res) => {
    const folderName = req.params.name.replace(/[^a-zA-Z0-9_-]/g, '_');
    const folderPath = path.join(getBaseDownloadDir(), folderName);

    if (!fs.existsSync(folderPath)) {
        return res.status(404).json({ error: 'Pasta não encontrada' });
    }

    res.attachment(`${folderName}.zip`);
    const archive = new ZipArchive({ zlib: { level: 5 } });

    archive.on('error', (err) => {
        res.status(500).send({ error: err.message });
    });

    archive.pipe(res);
    archive.directory(folderPath, false);
    archive.finalize();
});

// Rotas da API de Configurações Gerais
app.get('/api/config', (req, res) => {
    const config = getAppConfig();
    const cronTime = config.cronTime || process.env.CRON_TIME || '03:00';
    const downloadDir = config.downloadDir || '';
    res.json({ cronTime, downloadDir });
});

app.post('/api/config', (req, res) => {
    const config = getAppConfig();
    let cronUpdated = false;
    if (req.body.downloadDir !== undefined) {
        config.downloadDir = req.body.downloadDir;
    }
    if (req.body.cronTime !== undefined) {
        config.cronTime = req.body.cronTime;
        cronUpdated = true;
    }
    saveAppConfig(config);
    if (cronUpdated && typeof startCronTask === 'function') {
        startCronTask();
    }
    res.json({ success: true, config });
});

// Rotas da API de Monitoramento
app.get('/api/tracked', (req, res) => {
    res.json(getTrackedTags());
});

app.post('/api/tracked', (req, res) => {
    const { tags, searchType } = req.body;
    if (!tags) return res.status(400).json({ error: 'Tags obrigatórias' });

    let finalTags = tags.trim();
    if (searchType === 'user' && !finalTags.startsWith('user:')) {
        finalTags = 'user:' + finalTags;
    }

    const tracked = getTrackedTags();
    if (tracked.some(t => t.tags === finalTags)) {
        return res.status(400).json({ error: 'Esta tag já está sendo rastreada' });
    }

    const newEntry = {
        id: Date.now().toString(),
        tags: finalTags,
        addedAt: new Date().toISOString()
    };

    tracked.push(newEntry);
    saveTrackedTags(tracked);
    res.json(newEntry);
});

app.delete('/api/tracked/:id', (req, res) => {
    let tracked = getTrackedTags();
    tracked = tracked.filter(t => t.id !== req.params.id);
    saveTrackedTags(tracked);
    res.json({ success: true });
});

async function processDownload(taskId, tags, downloadDir, userId, apiKey) {
    const apiBase = 'https://api.rule34.xxx/index.php?page=dapi&s=post&q=index&json=1';
    let page = 0;
    const limit = 100;
    let keepGoing = true;
    let allPosts = [];

    const updateStatus = (newState) => {
        if (!taskId || !activeDownloads[taskId]) return;
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
            if (taskId && activeDownloads[taskId]?.cancelled) break;
            let url = `${apiBase}&tags=${encodeURIComponent(tags)}&pid=${page}&limit=${limit}`;

            // Usa as credenciais do front-end ou as do arquivo .env
            const activeUserId = userId || process.env.RULE34_USER_ID;
            const activeApiKey = apiKey || process.env.RULE34_API_KEY;

            if (activeUserId && activeApiKey) {
                url += `&user_id=${encodeURIComponent(activeUserId)}&api_key=${encodeURIComponent(activeApiKey)}`;
            }
            const response = await axios.get(url, { headers: { 'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36' } });

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
            if (taskId && activeDownloads[taskId]?.cancelled) break;

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

        if (taskId && activeDownloads[taskId]?.cancelled) {
            updateStatus({ state: 'error', message: 'Download cancelado pelo usuário.' });
            if (activeDownloads[taskId].deleteOnCancel) {
                try { fs.rmSync(downloadDir, { recursive: true, force: true }); } catch (e) { }
            }
            return;
        }

        updateStatus({ state: 'completed', message: 'Download concluído com sucesso!' });

    } catch (error) {
        console.error("Erro geral no processo:", error.message);
        updateStatus({ state: 'error', message: `Ocorreu um erro: ${error.message}` });
    }
}

// Agendador Automático configurável
let activeCronTask = null;

function startCronTask() {
    if (activeCronTask) {
        activeCronTask.stop();
    }
    const config = getAppConfig();
    const cronTime = config.cronTime || process.env.CRON_TIME || '03:00';
    const [cronHour, cronMinute] = cronTime.split(':');
    const cronSchedule = `${cronMinute || '0'} ${cronHour || '3'} * * *`;

    activeCronTask = cron.schedule(cronSchedule, async () => {
        console.log('=============================================');
        console.log(`[Cron] Iniciando rotina automática às ${new Date().toLocaleString()}`);

        const tracked = getTrackedTags();
        if (tracked.length === 0) {
            console.log('[Cron] Nenhuma tag para monitorar. Encerrando rotina.');
            return;
        }

        for (const item of tracked) {
            console.log(`[Cron] Verificando e baixando: ${item.tags}`);
            const tagSafeName = item.tags.replace(/[^a-zA-Z0-9_-]/g, '_');
            const downloadDir = path.join(getBaseDownloadDir(), tagSafeName);

            if (!fs.existsSync(downloadDir)) {
                fs.mkdirSync(downloadDir, { recursive: true });
            }

            // Passa taskId null para não emitir SSE e usa as credenciais padrão do .env
            await processDownload(null, item.tags, downloadDir, process.env.RULE34_USER_ID, process.env.RULE34_API_KEY);
        }

        console.log('[Cron] Rotina automática finalizada!');
        console.log('=============================================');
    });

    console.log(`[Cron] Tarefa agendada para rodar diariamente às ${cronHour || '03'}:${cronMinute || '00'}`);
}

startCronTask();

app.listen(PORT, () => {
    console.log(`Servidor rodando em http://localhost:${PORT}`);
});

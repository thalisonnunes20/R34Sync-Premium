<div align="center">
  
  # 🟢 R34Sync Premium
  
  Um gerenciador avançado, automatizado e inteligente para realizar backups e downloads em massa do Rule34.xxx.

  <p align="center">
    <a href="#-sobre-o-projeto">Sobre</a> •
    <a href="#-funcionalidades">Funcionalidades</a> •
    <a href="#-instalação">Instalação</a> •
    <a href="#-como-usar">Como Usar</a> •
    <a href="#-tecnologias-e-tutorial">Tecnologias</a>
  </p>

</div>

---

## 📖 Sobre o Projeto

O **R34Sync** não é apenas um script de download, é um *Daemon* autônomo projetado para usuários que desejam arquivar conteúdos de seus criadores e tags favoritas de forma inteligente. 

Ele conta com uma interface web (Dark/Green Mode) construída nos padrões visuais premium, um sistema nativo de paginação para contornar o limite de *1.000 posts* da API oficial e suporta autenticação segura via `.env` para evitar bloqueios de *Rate Limit (HTTP 429)*.

---

## ✨ Funcionalidades

- **Download Manual Dinâmico:** Baixe milhares de imagens de uma tag ou usuário com um único clique. Possui um botão de cancelamento imediato caso mude de ideia.
- **Painel de Monitoramento (CronJob):** Cadastre artistas favoritos. O robô irá verificar automaticamente o servidor todos os dias no horário que você configurar.
- **Baixo Consumo e Anti-Redundância:** O sistema verifica sua pasta local antes de iniciar. Ele ignora arquivos já existentes e baixa apenas imagens **inéditas**.
- **Gerenciador Embutido:** Conta com uma terceira aba para gerenciar todos os artistas baixados. Lá você consegue alterar o diretório padrão onde tudo é salvo, além de conseguir empacotar as fotos direto em arquivo ZIP pelo próprio navegador.
- **Autenticação Nativa:** Integração com sua API Key e User ID, desbloqueando consultas completas na API do Rule34.
- **Progresso em Tempo Real (SSE):** Acompanhe a barra de carregamento e as estatísticas do download em tempo real pela interface, sem travamentos.

---

## 🚀 Instalação

O projeto foi construído para ser fácil de instalar em qualquer ambiente. Nós preparamos scripts executáveis que cuidam de tudo para você, desde o `Node.js` até as bibliotecas (`npm`).

### 🪟 Windows
1. Clone ou baixe este repositório.
2. Dê dois cliques no arquivo `install.bat`.
3. O script irá instalar o Node.js silenciosamente e baixar as dependências.
4. Crie um arquivo `.env` baseado no `.env.example` e coloque suas chaves.

### 🐧 Linux (Debian / Ubuntu)
1. Abra o terminal e navegue até a pasta do projeto.
2. Dê permissão de execução aos scripts:
   ```bash
   chmod +x install.sh start.sh
   ```
3. Execute o instalador:
   ```bash
   ./install.sh
   ```
4. Crie o arquivo `.env` com suas credenciais.

---

## 🎯 Como Usar

### Iniciando o Servidor
- **Windows:** Dê dois cliques em `start.bat`.
- **Linux:** Execute `./start.sh` no terminal.
  
O terminal informará que o servidor está rodando. Abra o seu navegador e acesse: `http://localhost:3000`.

Lembre-se: Pelo método acima, a janela preta do terminal precisa ficar aberta/minimizada. Para rodar o sistema em segundo plano sem janela, veja o tutorial abaixo.

### 🤖 Como deixar o Robô sempre ligado (24/7)

Se você não quer deixar o terminal aberto na barra de tarefas o tempo todo, você pode rodar o sistema em segundo plano (background) de forma invisível. A melhor ferramenta oficial para isso é o **PM2**.

#### Passo 1: Instalar o PM2 (Windows/Linux)
Abra o seu terminal (CMD, PowerShell ou bash) e instale o gerenciador globalmente:
```bash
npm install -g pm2
```

#### Passo 2: Iniciar o Projeto em Segundo Plano
Navegue até a pasta do seu projeto R34Sync e inicie o servidor informando um nome:
```bash
pm2 start server.js --name "r34sync"
```
*Pronto! O seu painel e os downloads agendados continuarão funcionando de forma silenciosa e autônoma, sem nenhuma janela te atrapalhando.*

#### Comandos Úteis do PM2
- `pm2 status` - Mostra se o robô está online e quanto de memória está usando.
- `pm2 logs r34sync` - Visualiza os textos que apareceriam na "janela preta".
- `pm2 stop r34sync` - Desliga o robô.
- `pm2 restart r34sync` - Reinicia o servidor (útil caso tenha modificado o código).
- `pm2 startup` - Exibe o comando necessário para fazer o seu PC ligar o robô automaticamente sempre que for reiniciado.
---

## 💻 Tecnologias e Tutorial

O desenvolvimento desta aplicação foca em estabilidade no servidor e beleza no frontend, utilizando as seguintes tecnologias nativas:

<div align="center">
  
  ### Backend
  <img src="https://img.shields.io/badge/Node.js-339933?style=for-the-badge&logo=nodedotjs&logoColor=white" />
  <img src="https://img.shields.io/badge/Express.js-000000?style=for-the-badge&logo=express&logoColor=white" />
  
  ### Frontend
  <img src="https://img.shields.io/badge/HTML5-E34F26?style=for-the-badge&logo=html5&logoColor=white" />
  <img src="https://img.shields.io/badge/CSS3-1572B6?style=for-the-badge&logo=css3&logoColor=white" />
  <img src="https://img.shields.io/badge/JavaScript-F7DF1E?style=for-the-badge&logo=javascript&logoColor=black" />
  
</div>

### Entendendo o Fluxo (Tutorial de Uso)
1. **Baixar Agora:** A primeira aba é o download imediato. Ao clicar em `Iniciar Download`, o **Axios** (no backend) fará as requisições de página em página. Você pode usar o botão vermelho para cancelar o download (acionando `POST /api/cancel`). O frontend usa **Server-Sent Events (SSE)** para desenhar a barra de progresso perfeitamente.
2. **Agendamentos:** Salva dados no arquivo leve `tracked_tags.json`. O pacote **node-cron** observa o relógio da sua máquina e acorda o motor de download para checar as pastas locais contra as requisições da API de forma autônoma.
3. **Gerenciador:** A aba para ter controle do seu disco. A ferramenta **archiver** do Node.js é utilizada aqui para compactar as pastas via _stream_ e entregar na sua tela como um `.zip` limpo e super rápido, sem precisar ocupar espaço extra na sua máquina! Nela também é salvo o `config.json` de personalização.

---
<p align="center">Desenvolvido com 💚</p>

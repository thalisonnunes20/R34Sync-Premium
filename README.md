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

O projeto pode ser executado de forma nativa ou através do Docker (método mais simples e rápido). Escolha a melhor opção para o seu ambiente:

### 🐳 Via Docker (Recomendado - Windows, Linux e Mac)
Você não precisa instalar Node.js, código-fonte ou qualquer dependência. Basta ter o Docker instalado:

1. Crie uma pasta vazia no seu computador (ex: `r34sync-bot`).
2. Baixe o arquivo `docker-compose.example.yml` deste repositório e salve dentro dessa pasta com o nome `docker-compose.yml`.
3. Baixe o arquivo `.env.example`, salve como `.env` e preencha com suas configurações.
4. Abra o terminal dentro da pasta e execute o comando:
   ```bash
   docker-compose up -d
   ```
5. Pronto! Acesse `http://localhost:3000` no seu navegador.
*(O Docker baixará a imagem, e todos os seus downloads, configurações e banco de dados serão salvos automaticamente e organizados dentro de uma nova pasta chamada `r34_data` no seu computador).*

### 🪟 Instalação Nativa (Windows)
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

### 🤖 Como deixar o Robô sempre ligado (24/7) em Segundo Plano

> **Nota:** Se você instalou o projeto usando o **Docker**, ele já roda em segundo plano nativamente. As instruções abaixo são apenas para quem escolheu a **Instalação Nativa**.

Se você não quer deixar o terminal aberto na barra de tarefas o tempo todo, você pode rodar o sistema de forma invisível:

#### 🐧 Linux (Serviço Nativo Systemd)
A melhor forma de rodar aplicações em segundo plano no Linux é utilizando o gerenciador nativo `systemd`.
1. Crie o arquivo de serviço:
   ```bash
   sudo nano /etc/systemd/system/r34sync.service
   ```
2. Cole a configuração abaixo (não se esqueça de alterar o `User` e o `WorkingDirectory` com o caminho real do projeto na sua máquina):
   ```ini
   [Unit]
   Description=R34Sync Premium Daemon
   After=network.target

   [Service]
   Type=simple
   User=root
   WorkingDirectory=/caminho/para/R34Sync-Premium
   ExecStart=/usr/bin/node server.js
   Restart=on-failure

   [Install]
   WantedBy=multi-user.target
   ```
3. Salve o arquivo (`Ctrl+O`, `Enter`, `Ctrl+X`) e ative o serviço:
   ```bash
   sudo systemctl daemon-reload
   sudo systemctl enable r34sync
   sudo systemctl start r34sync
   ```
*(Agora o robô ligará automaticamente sempre que o servidor for reiniciado e operará de forma invisível).*

#### 🪟 Windows (Inicialização Nativa Invisível)
Embora seja possível transformar o Node.js em um Serviço nativo do Windows, isso exige instalação de aplicativos de terceiros (como o NSSM). A forma 100% nativa e mais simples de iniciar o robô junto com o computador, e sem nenhuma tela preta, é usando um pequeno script `.vbs`:

1. No teclado, aperte `Windows + R`, digite `shell:startup` e dê `Enter`. (Isso abrirá a pasta de Inicialização oficial do Windows).
2. Dentro dessa pasta, crie um novo arquivo e chame-o de `iniciar_r34sync.vbs` (certifique-se de apagar o `.txt` no final).
3. Abra esse arquivo com o Bloco de Notas e cole o código abaixo (alterando o caminho para o local real do projeto no seu PC):
   ```vbscript
   Set WshShell = CreateObject("WScript.Shell") 
   WshShell.Run chr(34) & "C:\caminho\para\R34Sync-Premium\start.bat" & Chr(34), 0
   Set WshShell = Nothing
   ```
4. Salve e feche.
*(Pronto! Sempre que você ligar o computador, o Windows chamará o seu `start.bat`, mas aquele "0" no final do código mandará esconder completamente a janela).*

> **Dica:** Para desligar o robô futuramente, basta abrir o "Gerenciador de Tarefas" do Windows (Ctrl+Shift+Esc), ir na aba "Detalhes" ou "Processos", procurar por `node.exe` e Finalizar a Tarefa.
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

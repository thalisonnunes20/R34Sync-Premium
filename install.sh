#!/bin/bash
echo "======================================="
echo "Instalador R34Sync - Debian/Ubuntu"
echo "======================================="

if ! command -v node &> /dev/null
then
    echo "Node.js nao encontrado. Instalando..."
    curl -fsSL https://deb.nodesource.com/setup_20.x | sudo -E bash -
    sudo apt-get install -y nodejs
else
    echo "Node.js ja esta instalado!"
fi

echo "Instalando dependencias do projeto (npm install)..."
npm install
npm install archiver sqlite3 bcryptjs jsonwebtoken

echo ""
echo "Tudo pronto! Para iniciar, de permissao de execucao e rode o script start.sh:"
echo "chmod +x start.sh && ./start.sh"

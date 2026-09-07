FROM node:20-alpine

# Define o diretório de trabalho dentro do container
WORKDIR /app

# Copia os arquivos de dependência
COPY package*.json ./

# Instala as dependências (sqlite3 pode precisar de pacotes de compilação, o node:20-alpine já costuma lidar bem, mas se falhar, podemos adicionar python3, make, g++)
RUN apk add --no-cache python3 make g++ && npm install

# Copia o restante do código
COPY . .

# Expõe a porta que a aplicação usa
EXPOSE 3000

# Comando para iniciar a aplicação
CMD ["node", "server.js"]

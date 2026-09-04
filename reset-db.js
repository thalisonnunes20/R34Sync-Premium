const fs = require('fs');
const path = require('path');

const dbPath = path.join(__dirname, 'database.sqlite');

if (fs.existsSync(dbPath)) {
    fs.unlinkSync(dbPath);
    console.log('Banco de dados apagado com sucesso. Você pode criar um novo usuário ao iniciar o painel novamente.');
} else {
    console.log('O banco de dados já não existe.');
}

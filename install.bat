@echo off
echo =======================================
echo Instalador R34Sync - Windows
echo =======================================

node -v >nul 2>&1
IF %ERRORLEVEL% NEQ 0 (
    echo Node.js nao encontrado. Tentando instalar via winget...
    winget install OpenJS.NodeJS --silent
    echo Node.js instalado! Feche e abra o terminal novamente se houver erros.
) ELSE (
    echo Node.js ja esta instalado!
)

echo Instalando dependencias do projeto (npm install)...
call npm install
call npm install archiver sqlite3 bcryptjs jsonwebtoken

echo.
echo Tudo pronto! Para iniciar, execute o arquivo start.bat
pause

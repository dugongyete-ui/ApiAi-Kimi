#!/bin/bash

echo "============================================"
echo "  SANSEKAI API - Auto Setup Script"
echo "  Kimi Free API Fix v1.0.2"
echo "============================================"
echo ""

if ! command -v node &> /dev/null; then
    echo "[ERROR] Node.js tidak ditemukan!"
    echo "Silakan install Node.js 18+ terlebih dahulu."
    echo "  - Download: https://nodejs.org/"
    echo "  - Atau gunakan nvm: nvm install 20"
    exit 1
fi

NODE_VERSION=$(node -v)
echo "[OK] Node.js terdeteksi: $NODE_VERSION"

if ! command -v npm &> /dev/null; then
    echo "[ERROR] npm tidak ditemukan!"
    exit 1
fi

NPM_VERSION=$(npm -v)
echo "[OK] npm terdeteksi: v$NPM_VERSION"
echo ""

echo "[1/3] Menginstall dependencies..."
echo "-------------------------------------------"
npm install
if [ $? -ne 0 ]; then
    echo "[ERROR] Gagal menginstall dependencies!"
    exit 1
fi
echo "[OK] Dependencies berhasil diinstall."
echo ""

echo "[2/3] Build project (TypeScript -> JavaScript)..."
echo "-------------------------------------------"
npx tsup src/index.ts --format cjs,esm --sourcemap --dts --clean --publicDir public
if [ $? -ne 0 ]; then
    echo "[ERROR] Gagal build project!"
    exit 1
fi
echo "[OK] Build berhasil."
echo ""

echo "[3/3] Verifikasi..."
echo "-------------------------------------------"
if [ -f "dist/index.js" ]; then
    echo "[OK] dist/index.js ditemukan."
else
    echo "[WARN] dist/index.js tidak ditemukan."
fi
echo ""

echo "============================================"
echo "  Setup selesai!"
echo ""
echo "  Cara menjalankan:"
echo "    Development : npm run dev"
echo "    Production  : npm start"
echo ""
echo "  Server akan berjalan di http://0.0.0.0:5000"
echo "  Buka browser ke http://localhost:5000"
echo "============================================"

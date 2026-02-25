#!/bin/bash

echo "============================================"
echo "  SANSEKAI API - Auto Setup Script"
echo "  Kimi Free API Fix v1.0.2"
echo "============================================"
echo ""

# ── Node.js check ──────────────────────────────
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

# ── Python check (untuk tools python) ─────────
if command -v python3 &> /dev/null; then
    PY_VERSION=$(python3 -V 2>&1)
    echo "[OK] Python terdeteksi: $PY_VERSION"
else
    echo "[WARN] Python3 tidak ditemukan. Tools debug_code/run_code (python) tidak akan berfungsi."
fi

# ── System tools check ─────────────────────────
for tool in patch grep tar zip; do
    if command -v $tool &> /dev/null; then
        echo "[OK] $tool tersedia"
    else
        echo "[WARN] $tool tidak ditemukan. Install dengan: apt-get install $tool"
    fi
done
echo ""

# ── Step 1: Install npm dependencies ──────────
echo "[1/4] Menginstall npm dependencies..."
echo "-------------------------------------------"
npm install
if [ $? -ne 0 ]; then
    echo "[ERROR] Gagal menginstall npm dependencies!"
    exit 1
fi
echo "[OK] npm dependencies berhasil diinstall."
echo ""

# ── Step 2: Install Playwright browsers ───────
echo "[2/4] Menginstall Playwright browser (Chromium)..."
echo "-------------------------------------------"
echo "      (diperlukan untuk generate_pdf, browser_*, screenshot)"
npx playwright install chromium 2>/dev/null
if [ $? -eq 0 ]; then
    echo "[OK] Chromium terinstall."
else
    echo "[WARN] Gagal install Chromium. Browser tools dan generate_pdf mungkin tidak berfungsi."
    echo "       Coba manual: npx playwright install chromium"
fi
echo ""

# ── Step 3: Build TypeScript ───────────────────
echo "[3/4] Build project (TypeScript -> JavaScript)..."
echo "-------------------------------------------"
npx tsup src/index.ts --format cjs,esm --sourcemap --dts --clean --publicDir public
if [ $? -ne 0 ]; then
    echo "[ERROR] Gagal build project!"
    exit 1
fi
echo "[OK] Build berhasil."
echo ""

# ── Step 4: Verifikasi ─────────────────────────
echo "[4/4] Verifikasi..."
echo "-------------------------------------------"
if [ -f "dist/index.js" ]; then
    echo "[OK] dist/index.js ditemukan."
else
    echo "[WARN] dist/index.js tidak ditemukan."
fi

# Buat agent-workspace jika belum ada
mkdir -p agent-workspace
echo "[OK] agent-workspace/ directory siap."
echo ""

# ── Ringkasan tools ────────────────────────────
echo "============================================"
echo "  Setup selesai!"
echo ""
echo "  Tools yang tersedia (57 total):"
echo "  +-- Basic File Ops     : read_file, write_file, list_directory,"
echo "  |                        create_directory, delete_file, move_file, copy_file"
echo "  +-- Code Execution     : run_code, run_shell, code_execute, shell,"
echo "  |                        install_package, debug_code, apply_patch"
echo "  +-- Project Mgmt       : create_project, delete_project, switch_workspace,"
echo "  |                        get_project_structure, search_in_files"
echo "  +-- Web & Network      : web_search, web_open_url, http_request,"
echo "  |                        fetch_url_content, check_website_status"
echo "  +-- Browser Auto       : browser, browser_navigate, browser_screenshot,"
echo "  |                        browser_click, browser_type, browser_scroll,"
echo "  |                        browser_get_text, browser_eval"
echo "  +-- Image Search       : search_image_by_text, search_image_by_image"
echo "  +-- Data Sources       : get_data_source (yahoo_finance, binance_crypto,"
echo "  |                        world_bank, arxiv, google_scholar)"
echo "  +-- File Generation    : generate_pdf, generate_markdown, generate_json,"
echo "  |                        generate_csv, generate_html, generate_zip"
echo "  +-- Agent Intelligence : planner_phase, step_tracker, loop_supervisor,"
echo "  |                        tool_validator, reflection_pass,"
echo "  |                        memory_store, memory_retrieve, memory_space_edits"
echo "  +-- Archives           : archive_create_zip, archive_extract_zip,"
echo "  |                        archive_create_tar, archive_extract_tar, archive_list"
echo "  +-- System Utils       : get_environment_variables, set_environment_variable,"
echo "                           get_system_info, check_disk_usage"
echo ""
echo "  Cara menjalankan:"
echo "    Development : npm run dev"
echo "    Production  : npm start"
echo ""
echo "  Server berjalan di http://0.0.0.0:5000"
echo "  Endpoint agent: POST /v1/agent/completions"
echo "    { \"list_tools\": true }          --> lihat semua tools"
echo "    { \"task\": \"...\" }               --> jalankan task"
echo "    { \"messages\": [...] }            --> OpenAI-style chat"
echo "============================================"

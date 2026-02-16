# SANSEKAI API Documentation - Project Summary

## Overview

**SANSEKAI API** (Kimi Free API Fix) adalah server API proxy yang mengubah layanan Kimi AI (dari Moonshot AI) menjadi API yang kompatibel dengan format OpenAI, Google Gemini, dan Anthropic Claude. Server ini ditulis dalam TypeScript menggunakan framework Koa.js.

Project ini di-clone dari GitHub (`kimi-free-api-fix`) dan telah dikonfigurasi untuk berjalan sepenuhnya di Replit pada port 5000.

### Status: Berjalan (Running)
- Server aktif di port 5000
- Semua endpoint sudah ditest dan berfungsi
- Swagger-style API Documentation UI tersedia di halaman utama (REST API only)

## Project Architecture

### Tech Stack
- **Runtime**: Node.js 20
- **Language**: TypeScript
- **Framework**: Koa.js
- **Build Tool**: tsup
- **Key Libraries**: axios, lodash, eventsource-parser, koa-router, koa-body, koa2-cors

### Directory Structure
```
├── configs/dev/          # Konfigurasi service & system (YAML)
├── public/               # Static files (welcome.html - Swagger-style API docs)
├── src/
│   ├── api/
│   │   ├── controllers/  # Business logic
│   │   │   ├── chat.ts           # Traditional REST API (refresh_token)
│   │   │   ├── chat-v2.ts        # Connect RPC API (JWT/kimi-auth)
│   │   │   ├── gemini-adapter.ts # Gemini format adapter
│   │   │   └── claude-adapter.ts # Claude format adapter
│   │   ├── routes/       # Route definitions
│   │   │   ├── chat.ts   # POST /v1/chat/completions
│   │   │   ├── ping.ts   # GET /ping
│   │   │   ├── token.ts  # POST /token/check
│   │   │   ├── models.ts # GET /v1/models (16 models termasuk K2.5)
│   │   │   ├── gemini.ts # Gemini endpoints (/v1beta/...)
│   │   │   ├── claude.ts # Claude endpoint (POST /v1/messages)
│   │   │   └── auth.ts   # Token management endpoints
│   │   └── consts/       # Exception constants
│   ├── lib/              # Core utilities
│   │   ├── connect-rpc/  # Connect RPC protocol implementation
│   │   ├── server.ts     # Koa server setup
│   │   ├── config.ts     # Config loader
│   │   ├── logger.ts     # Logging
│   │   └── util.ts       # Utilities
│   └── index.ts          # Entry point
├── dist/                 # Built output (auto-generated)
├── setup.sh              # Auto-download dependencies script
├── package.json
├── tsconfig.json
└── vercel.json           # Vercel deployment config
```

## Model AI yang Didukung (16 Model)

### K2.5 Series (Terbaru)
| Model ID | Nama | Deskripsi |
|----------|------|-----------|
| `kimi-k2.5-instant` | K2.5 Instant | Quick response, 256k context, fast 3-8s |
| `kimi-k2.5-thinking` | K2.5 Thinking | Deep thinking, chain-of-thought reasoning |
| `kimi-k2.5-agent` | K2.5 Agent | Research, slides, websites, docs, sheets |
| `kimi-k2.5-agent-swarm` | K2.5 Agent Swarm | Multi-agent orchestration, 100 parallel sub-agents |

### K2 Series
| Model ID | Nama | Deskripsi |
|----------|------|-----------|
| `kimi-k2-0905-preview` | K2-0905 | 256k context, enhanced Agentic Coding |
| `kimi-k2-0711-preview` | K2-0711 | 128k context, 1T params MoE |
| `kimi-k2-turbo-preview` | K2-Turbo | High-speed, 60-100 tokens/s |
| `kimi-k2-thinking` | K2-Thinking | Long-thinking model, deep reasoning |
| `kimi-k2-thinking-turbo` | K2-Thinking-Turbo | Thinking high-speed |

### Moonshot V1 Series
| Model ID | Deskripsi |
|----------|-----------|
| `moonshot-v1-8k` | Short text, 8k context |
| `moonshot-v1-32k` | Long text, 32k context |
| `moonshot-v1-128k` | Ultra-long text, 128k context |

### Vision & Latest
| Model ID | Deskripsi |
|----------|-----------|
| `moonshot-v1-8k-vision-preview` | Vision 8k |
| `moonshot-v1-32k-vision-preview` | Vision 32k |
| `moonshot-v1-128k-vision-preview` | Vision 128k |
| `kimi-latest` | Latest model, 128k context |

## API Endpoints

### Endpoint Tanpa Autentikasi
| Endpoint | Method | Deskripsi | Status |
|----------|--------|-----------|--------|
| `/` | GET | Swagger-style API Documentation | OK |
| `/ping` | GET | Health check, return "pong" | OK |
| `/v1/models` | GET | Daftar 16 model (termasuk K2.5) | OK |
| `/v1beta/models` | GET | Daftar model Gemini-compatible | OK |

### Endpoint Autentikasi (Butuh Kimi Auth Token)
| Endpoint | Method | Deskripsi | Token |
|----------|--------|-----------|-------|
| `/v1/chat/completions` | POST | Chat completion (OpenAI format) | refresh_token / JWT |
| `/v1/messages` | POST | Chat completion (Claude format) | JWT (kimi-auth) |
| `/v1beta/models/:model:generateContent` | POST | Content generation (Gemini) | JWT |
| `/v1beta/models/:model:streamGenerateContent` | POST | Streaming content (Gemini) | JWT |
| `/token/check` | POST | Cek validitas token | refresh_token |

### Endpoint Token Management (Server-Side)
| Endpoint | Method | Deskripsi | Status |
|----------|--------|-----------|--------|
| `/auth/extract` | POST | Extract kimi-auth dari cookie string | OK |
| `/auth/save` | POST | Simpan token ke server (auto-used for all API calls) | OK |
| `/auth/status` | GET | Cek status token di server (expiry, user info) | OK |
| `/auth/clear` | GET | Hapus token dari server | OK |

## Swagger-style API Documentation UI

1. **Base URL & Server Selector** - Dropdown server selector di header
2. **Authorize Section** - Save/cek/hapus token langsung dari halaman
3. **Endpoint Groups** - Dikelompokkan per kategori (Health, OpenAI, Claude, Gemini, Token Management)
4. **Execute & Test** - Setiap endpoint bisa di-execute langsung dari browser
5. **Curl Command** - Auto-generate curl command yang bisa di-copy untuk test di terminal
6. **Request URL** - Menampilkan full request URL
7. **Response Viewer** - JSON syntax highlighting, download response, response headers
8. **Model Selector** - Dropdown 16 model AI untuk endpoint yang butuh model

## Auto Setup Script

```bash
chmod +x setup.sh
./setup.sh
```
Script ini otomatis: install dependencies, build TypeScript, verifikasi output.

## Dual API System
- **Traditional API** (refresh_token): Fitur lengkap - multi-turn chat, file upload, image parsing, search
- **Connect RPC API** (kimi-auth JWT): Basic chat, streaming, K2.5 support

## Recent Changes
- 2026-02-16: Redesign UI jadi Swagger-style REST API documentation (hapus Chat AI test)
- 2026-02-16: Tambah curl command generator + copy button
- 2026-02-16: Tambah Request URL display
- 2026-02-16: Tambah response headers viewer + download response
- 2026-02-16: Tambah endpoint groups (Health, OpenAI, Claude, Gemini, Token)
- 2026-02-16: Buat setup.sh auto-download dependencies script
- 2026-02-16: Test semua endpoint - semua berfungsi
- 2026-02-16: Server-side token storage
- 2026-02-16: Tambah model K2.5 Series

## User Preferences
- Bahasa komunikasi: Bahasa Indonesia
- Project di-clone dari GitHub, dikembangkan di Replit
- Prefer REST API documentation style (Swagger-like), tanpa chat AI test UI

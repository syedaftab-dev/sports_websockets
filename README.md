<div align="center">
  <img src="./assets/image.png" alt="Sportz Banner" width="100%" />

  <h1>⚡ Sportz - Real-Time AI Sports Dashboard</h1>
  <p><strong>A blazingly fast, real-time multi-sport scoreboard and AI-generated play-by-play commentary platform powered by WebSockets, ESPN data, and Groq LLM.</strong></p>

  <p>
    <a href="#features">Features</a> •
    <a href="#tech-stack">Tech Stack</a> •
    <a href="#backend-architecture">Backend Architecture</a> •
    <a href="#getting-started">Getting Started</a>
  </p>
</div>

---

## ✨ Features

- **🔴 True Real-Time Updates:** WebSockets power sub-second score and commentary updates on the React client — zero page refreshes, zero polling from the frontend.
- **⚽🏀⚾ Multi-Sport Coverage:** Unified data pipeline ingests live scoreboard and play-by-play data from ESPN APIs across **4 sports** (Soccer, Basketball, Baseball, Cricket) and **8+ leagues** (MLS, EPL, La Liga, NBA, MLB, IPL, and more).
- **🤖 AI Color Commentary:** Groq Llama 3.1 generates dynamic, sport-specific analysis for every major in-game event. Ambient AI commentary fills in gaps during slow API response windows to keep the feed alive.
- **🛡️ Enterprise-Grade Security:** Express routes are guarded by Arcjet sliding-window rate limiters to prevent API abuse and DDoS attacks.
- **🔄 Resilient Fallbacks:** Custom Redis proxy with automatic fallback to in-memory pub/sub prevents crashes when external Upstash Redis connections fail. Simulation mode auto-activates when no live matches are available.
- **🎨 Brutalist & Premium UI:** Designed with a sleek brutalist aesthetic featuring smooth micro-animations, pulse effects on score changes, and a real-time commentary feed panel.
- **📊 Smart Match State Management:** Correctly differentiates between Upcoming, Live, and Finished match states with appropriate UI treatments for each.

---

## 🛠 Tech Stack

### 💻 Frontend (Client)
![React](https://img.shields.io/badge/react-%2320232a.svg?style=for-the-badge&logo=react&logoColor=%2361DAFB)
![TypeScript](https://img.shields.io/badge/typescript-%23007ACC.svg?style=for-the-badge&logo=typescript&logoColor=white)
![Vite](https://img.shields.io/badge/vite-%23646CFF.svg?style=for-the-badge&logo=vite&logoColor=white)
![CSS3](https://img.shields.io/badge/css3-%231572B6.svg?style=for-the-badge&logo=css3&logoColor=white)

### ⚙️ Backend (Server & Worker)
![NodeJS](https://img.shields.io/badge/node.js-6DA55F?style=for-the-badge&logo=node.js&logoColor=white)
![Express.js](https://img.shields.io/badge/express.js-%23404d59.svg?style=for-the-badge&logo=express&logoColor=%2361DAFB)
![PostgreSQL](https://img.shields.io/badge/postgresql-%23316192.svg?style=for-the-badge&logo=postgresql&logoColor=white)
![Neon](https://img.shields.io/badge/Neon-00E599?style=for-the-badge&logo=neon&logoColor=black)
![Drizzle](https://img.shields.io/badge/drizzle-%23C5F74F.svg?style=for-the-badge&logo=drizzle&logoColor=black)
![Redis](https://img.shields.io/badge/redis-%23DD0031.svg?style=for-the-badge&logo=redis&logoColor=white)

### 🧠 AI & Security Providers
![Groq](https://img.shields.io/badge/Groq-F55036?style=for-the-badge&logo=groq&logoColor=white)
![Arcjet](https://img.shields.io/badge/Arcjet-000000?style=for-the-badge&logo=security&logoColor=white)
![WebSockets](https://img.shields.io/badge/WebSockets-black?style=for-the-badge&logo=socket.io&badgeColor=010101)

### 🔍 Code Quality & Monitoring
![CodeRabbit](https://img.shields.io/badge/CodeRabbit-000000?style=for-the-badge&logo=rabbit&logoColor=white)
![Site24x7](https://img.shields.io/badge/Site24x7-4285F4?style=for-the-badge&logo=google-cloud&logoColor=white)

- **CodeRabbit** — AI-powered code review on every pull request. Automated review of code quality, security vulnerabilities, and best practices across 42+ commits.
- **Site24x7 (APM Insight)** — Application performance monitoring, uptime tracking, and real-time error logging for the production Node.js backend via the `apminsight` agent.

---

## 🏗 Backend Architecture

The backend is completely decoupled into two primary services working in harmony over local REST and WebSockets:

```
┌──────────────────────────────────────────────────────────────────┐
│                        CLIENTS (React)                          │
│   WebSocket subscribe ───────── REST GET /matches               │
└──────────┬────────────────────────────┬─────────────────────────┘
           │ ws://                      │ HTTP
           ▼                            ▼
┌──────────────────────────────────────────────────────────────────┐
│                   EXPRESS API SERVER (port 8000)                 │
│                                                                  │
│  ┌─────────────┐  ┌──────────────┐  ┌─────────────────────┐    │
│  │ Match Routes │  │ Commentary   │  │ WebSocket Server    │    │
│  │ PATCH /score │  │ POST /comm   │  │ Broadcast to subs   │    │
│  └──────┬──────┘  └──────┬───────┘  └──────────┬──────────┘    │
│         │                │                      │                │
│         ▼                ▼                      ▼                │
│  ┌──────────────────────────────────────────────────────────┐   │
│  │          Redis Pub/Sub (Upstash / Mock Fallback)         │   │
│  └──────────────────────────────────────────────────────────┘   │
│         │                                                        │
│         ▼                                                        │
│  ┌──────────────────────────────────────────────────────────┐   │
│  │         Neon PostgreSQL (Drizzle ORM + Zod schemas)      │   │
│  └──────────────────────────────────────────────────────────┘   │
└──────────────────────────────────────────────────────────────────┘
           ▲
           │ HTTP PATCH/POST (internal)
           │
┌──────────────────────────────────────────────────────────────────┐
│                   LIVE MATCH WORKER (background)                 │
│                                                                  │
│  ┌───────────────────┐  ┌─────────────────────────────────┐    │
│  │ ESPN Scoreboard    │  │ ESPN Summary (Play-by-Play)     │    │
│  │ Poller (25s cycle) │  │ Fetcher                         │    │
│  └────────┬──────────┘  └────────────┬────────────────────┘    │
│           │                          │                           │
│           ▼                          ▼                           │
│  ┌──────────────────────────────────────────────────────────┐   │
│  │  Simulation Engine (chronological play-by-play replay)   │   │
│  │  • Tracks running scores per tick                        │   │
│  │  • Single source of truth via PATCH /score               │   │
│  └────────────────────────┬─────────────────────────────────┘   │
│                           │                                      │
│                           ▼                                      │
│  ┌──────────────────────────────────────────────────────────┐   │
│  │           Groq LLM (Llama 3.1 8B) Commentary            │   │
│  │  • Sport-specific prompts (Soccer/Basketball/Baseball)   │   │
│  │  • Ambient AI commentary during slow API windows         │   │
│  └──────────────────────────────────────────────────────────┘   │
└──────────────────────────────────────────────────────────────────┘
```

### Key Design Decisions

1. **Single Source of Truth for Scores:** The `PATCH /matches/:id/score` endpoint is the **only** path that writes scores to the database and broadcasts via WebSocket. The worker's `upsertMatch()` skips score writes during simulation to prevent the ESPN scoreboard's final score from overwriting the simulated running score.

2. **Chronological Play Replay:** ESPN play-by-play data is sorted by `sequenceNumber` (not reversed) and replayed one play per 25-second tick. Each play carries a cumulative running score that is synced to the simulation state.

3. **Graceful Redis Degradation:** A custom `MockRedis` EventEmitter-based proxy seamlessly replaces the real Upstash Redis pub/sub when the connection fails, keeping the app fully functional on localhost without external dependencies.

---

## 🚀 Getting Started

Follow these instructions to get a copy of the project up and running on your local machine for development and testing.

### Prerequisites

Ensure you have the following installed:
- Node.js (v18+)
- A Neon Postgres Database connection string
- Groq API Key
- Arcjet Key
- (Optional) Upstash Redis URL

### 1. Clone & Install

```bash
git clone https://github.com/syedaftab-dev/sports_websockets.git
cd sportz

# Install backend dependencies
cd backend
npm install

# Install frontend dependencies
cd ../frontend
npm install
```

### 2. Environment Variables

Create a `.env` file in the `backend` directory:

```env
DATABASE_URL="postgresql://user:password@neon.tech/neondb"
PORT=8000
HOST=0.0.0.0

ARCJET_KEY="your_arcjet_key"
ARCJET_ENV="development"

GROQ_API_KEY="your_groq_key"
REDIS_URL="your_upstash_redis_url"
```

### 3. Database Setup

Push the Drizzle schema to your Neon database:

```bash
cd backend
npx drizzle-kit push
```

### 4. Running the Application

You need **two** terminal tabs:

**Terminal 1: Start the Backend (API + Worker)**
```bash
cd backend
npm run dev
```

**Terminal 2: Start the Frontend Client**
```bash
cd frontend
npm run dev
```

Visit `https://sports-websockets-seven.vercel.app/` to view the live dashboard!

---
</CodeContent>

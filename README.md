<div align="center">
  <img src="./assets/image.png" alt="Sportz Banner" width="100%" />

  <h1>⚡ Sportz - Real-Time AI Sports Dashboard</h1>
  <p><strong>A blazingly fast, real-time sports scoreboard and AI-generated play-by-play commentary platform.</strong></p>

  <p>
    <a href="#features">Features</a> •
    <a href="#tech-stack">Tech Stack</a> •
    <a href="#getting-started">Getting Started</a> •
    <a href="#backend-architecture">Backend Architecture</a>
  </p>
</div>

---

## ✨ Features

- **🔴 True Real-Time Updates:** WebSockets power sub-second score and timeline updates on the React client without any page refreshing.
- **🏏 Blazing Fast Data Integration:** Dedicated Node.js background worker fetches global Cricket scores from the Flashscore API (`sportdb.dev`), perfectly mimicking the speed of Cricbuzz.
- **🤖 AI Color Commentary:** The backend triggers the Groq Llama 3.1 model to generate witty, dynamic, and insightful commentary for major in-game events in real-time.
- **🛡️ Enterprise Grade Security:** Express routes are guarded by Arcjet rate-limiting to prevent API abuse and DDoS attacks.
- **🔄 Resilient Fallbacks:** Features a custom local Redis proxy to prevent crashes if external Upstash Redis connections fail.
- **🎨 Brutalist & Premium UI:** Designed with a sleek, dark-mode brutalist aesthetic featuring glassmorphism and smooth micro-animations.

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

---

## 🏗 Backend Architecture

The backend is completely decoupled into two primary services working in harmony over local REST and WebSockets:

1. **The Express WebSocket Server (`src/index.js`)**
   - Hosts the REST API routes for matching and commentary (`/matches`, `/matches/:id/commentary`).
   - Uses **Drizzle ORM** connected to a **Neon Postgres** database to enforce strict typing and schema validation using **Zod**.
   - Maintains active `ws` WebSocket connections with clients, broadcasting `score_update` and `commentary` events whenever the database is mutated.
   - Guarded by **Arcjet** sliding-window rate limiters.

2. **The Data Poller Worker (`workers/liveMatchWorker.js`)**
   - A standalone Node process that polls the `sportdb.dev` Flashscore API every 5 seconds.
   - It hashes global String-based event IDs into 32-bit integers to fit our Postgres relational schema.
   - Utilizes a graceful `400ms` micro-delay queue to strictly respect third-party API rate limits.
   - For every major play, it offloads a prompt to the **Groq API** to generate AI commentary before pushing the data to the local Express server via HTTP `PATCH`/`POST`.

---

## 🚀 Getting Started

Follow these instructions to get a copy of the project up and running on your local machine for development and testing.

### Prerequisites

Ensure you have the following installed:
- Node.js (v18+)
- A Neon Postgres Database connection string
- Groq API Key
- SportDB API Key (for Flashscore data)
- Arcjet Key

### 1. Clone & Install

```bash
git clone https://github.com/yourusername/sportz.git
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
API_SPORTS_KEY="your_sportdb_key"
REDIS_URL="your_upstash_redis_url"
```

### 3. Database Setup

Push the Drizzle schema to your Neon database:

```bash
cd backend
npx drizzle-kit push
```

### 4. Running the Application

You will need three terminal tabs to run the full stack locally:

**Terminal 1: Start the Backend Server**
```bash
cd backend
npm run dev
```

**Terminal 2: Start the Background Worker (Syncs Live Data)**
```bash
cd backend
node workers/liveMatchWorker.js
```

**Terminal 3: Start the Frontend Client**
```bash
cd frontend
npm run dev
```

Visit `http://localhost:3000` to view the live dashboard!

---



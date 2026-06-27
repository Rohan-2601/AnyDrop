# AnyDrop

Peer-to-peer file transfer application.

## Project Structure

```
AnyDrop/
├── frontend/       → Next.js 15 (App Router, TypeScript, Tailwind CSS)
├── backend/        → Node.js, Express, Socket.IO (TypeScript)
└── package.json    → Root scripts (concurrently)
```

## Getting Started

### Install all dependencies

```bash
npm install           # root (concurrently)
npm run install:all   # frontend + backend
```

### Run in development

```bash
npm run dev
```

This starts both:
- **Frontend** → http://localhost:3000
- **Backend**  → http://localhost:4000

### Run individually

```bash
npm run dev:frontend   # Next.js on :3000
npm run dev:backend    # Express + Socket.IO on :4000
```

## Tech Stack

| Layer    | Technology                        |
|----------|-----------------------------------|
| Frontend | Next.js 15, TypeScript, Tailwind  |
| Backend  | Express, Socket.IO, TypeScript    |
| Realtime | Socket.IO (client ↔ server)       |

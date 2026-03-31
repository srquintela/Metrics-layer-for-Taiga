# Taiga Metrics Dashboard

A premium, glassmorphic dashboard for visualizing and analyzing Taiga project metrics. Track Lead Time, Cycle Time, Throughput, and WIP with a modern, responsive interface.

## 🚀 Features

- **Dynamic Configuration:** Easily set your Taiga server domain and credentials via the built-in Settings page.
- **Real-time Metrics:** Automatically calculates Lead Time, Cycle Time, WIP, and Throughput.
- **Interactive Dashboard:** Browse projects and drill down into specific user story histories.
- **Advanced Filtering:** Filter stories by date ranges and specific attributes.
- **Premium Design:** Modern dark-themed UI with glassmorphism effects and smooth transitions.
- **Data Synchronization:** Includes a Python-based worker to fetch and normalize data from Taiga.

## 🏗️ Architecture

- **Frontend:** Built with Vanilla JavaScript, HTML5, and CSS3, served by Vite. Located in `/frontend`.
- **Backend:** Node.js Express server providing an in-memory data store and proxy for Taiga API requests. Located in `/backend`.
- **Worker:** Python script (`client.py`) for data extraction. Located in `/backend`.

---

## 🐳 Running with Docker (Recommended)

The easiest way to run the entire stack is using Docker Compose:

```powershell
docker compose up --build
```

- **Frontend:** `http://localhost:5173`
- **Backend:** `http://localhost:3000`

---

## 🛠️ Manual Setup & Running

### 1. Prerequisites
- Node.js (v18+)
- Python (v3.9+)

### 2. Start the Backend
```powershell
cd backend
npm install
node server.js
```

### 3. Start the Frontend
```powershell
cd frontend
npm install
npm run dev
```

### 4. Fetch Data
Run the Python worker (from the `backend` directory):
```powershell
cd backend
pip install requests urllib3
python client.py
```

## 📝 GitHub Description
*A modern, glassmorphic dashboard for visualizing Taiga project metrics (Lead Time, Cycle Time, WIP, Throughput) with a custom Node.js backend and Python data sync worker.*

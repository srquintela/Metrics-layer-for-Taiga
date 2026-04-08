<<<<<<< HEAD
# Metrics-layer-for-Taiga
A premium, glassmorphic dashboard for visualizing Taiga project metrics (Lead Time, Cycle Time, WIP, Throughput) with a custom Node.js backend and Python data sync worker.  You can find the updated README.md in the project root.
=======
# Taiga Metrics Dashboard

A premium, glassmorphic dashboard for visualizing and analyzing Taiga project metrics. Track Lead Time, Cycle Time, Throughput, WIP, and **QA Time** with a modern, responsive interface.

## 🚀 Features

- **Automated Data Sync:** No more manual script running! Data is refreshed automatically whenever you click the "Actualizar" or "Calcular" buttons.
- **Advanced Metrics:** 
    - **Lead Time & Cycle Time:** Track how fast stories reach Production.
    - **Tiempo en QA:** Monitor the accumulated time stories spend specifically in the "Enviado a QA" status.
    - **WIP & Throughput:** Understand team capacity and delivery rate in real-time.
- **Tag Management:** 
    - **Color-Coded Tags:** Taiga tags are automatically parsed and displayed with their original hex colors.
    - **Tag Filtering:** Quickly filter your story list by typing any tag name in the table header.
- **Dynamic Configuration:** Easily set your Taiga server domain and credentials via the built-in Settings page.
- **Interactive Dashboard:** Browse categories and drill down into specific user story histories.

## 🏗️ Architecture

- **Frontend:** Built with Vanilla JavaScript, HTML5, and CSS3, served by Vite for high performance. Located in `/frontend`.
- **Backend:** Node.js Express server providing an in-memory data store, CORS-enabled API, and a custom controller to trigger Python data imports. Located in `/backend`.
- **Integrated Importer:** A specialized Python script (`client.py`) that handles complex Taiga API data extraction and normalization.

---

## 🐳 Running with Docker (Recommended)

The entire stack is containerized for a smooth experience in Windows/WSL environments.

### 1. Start the Stack
Run the following command in the root directory:
```bash
docker compose up --build
```

### 2. Access the Application
- **Frontend UI:** `http://localhost:5173`
- **Backend API:** `http://localhost:3000`

### 3. Initialize Data
The first time you run the app, the dashboard will be empty. Simply:
1. Go to the **Dashboard**.
2. Click **Actualizar** to trigger the first data sync from your Taiga project.

---

## 🛠️ Manual Setup

### Prerequisites
- Node.js (v20+)
- Python (v3.11+) with `requests` library.

### 1. Backend
```bash
cd backend
npm install
node server.js
```

### 2. Frontend
```bash
cd frontend
npm install
npm run dev
```

## 📝 GitHub Description
*A modern, glassmorphic dashboard for visualizing Taiga project metrics (Lead Time, Cycle Time, QA Time, WIP, Throughput) with an automated Node.js backend and integrated Python data sync worker.*
>>>>>>> dev

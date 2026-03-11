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

- **Frontend:** Built with Vanilla JavaScript, HTML5, and CSS3, served by Vite for optimal performance.
- **Backend:** Node.js Express server (`server.js`) providing an in-memory data store and proxy for Taiga API requests.
- **Worker:** Python script (`client.py`) for efficient data extraction and normalization from the Taiga API.
- **Configuration:** Shared `config.json` for seamless synchronization between the web app and the Python worker.

## 🛠️ Setup & Running

### 1. Prerequisites
- Node.js (v16+)
- Python (v3.9+)
- `pip install requests urllib3`

### 2. Start the Backend Server
From the root directory:
```powershell
npm install
node server.js
```
The backend will be available at `http://localhost:3000`.

### 3. Start the Frontend Dashboard
Navigate to the `frontend` folder and start the development server:
```powershell
cd frontend
npm install
npm run dev
```
Open the provided URL (typically `http://localhost:5173`) in your browser.

### 4. Configure Taiga Settings
1. Open the dashboard in your browser.
2. Navigate to the **Settings** page.
3. Enter your Taiga server domain (e.g., `taiga.yourdomain.com`), username, and password.
4. Click **Save Settings**. This creates a `config.json` file in the root directory.

### 5. Fetch Data
Run the Python worker to import your project data into the local dashboard:
```powershell
python client.py
```

## 📝 GitHub Description
*A modern, glassmorphic dashboard for visualizing Taiga project metrics (Lead Time, Cycle Time, WIP, Throughput) with a custom Node.js backend and Python data sync worker.*

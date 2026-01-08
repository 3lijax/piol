# Deploying to Render.com

## Quick Start
1.  Push your code to **GitHub**.
2.  Log in to [Render.com](https://render.com).
3.  Click **New +** -> **Blueprint**.
4.  Connect your GitHub repository.
5.  Render will automatically detect `render.yaml` and set everything up.
6.  Click **Apply**.

## Manual Configuration (If not using Blueprint)

If you prefer to set it up manually, here are the settings:

### 1. Backend (Web Service)
*   **Name**: `tradingpoolfx-collector`
*   **Runtime**: Node
*   **Build Command**: `npm install`
*   **Start Command**: `node collector.js`
*   **Free Tier**: Yes. (We added a dummy server to `collector.js` so it works on the free tier).

### 2. Frontend (Static Site)
*   **Name**: `tradingpoolfx-web`
*   **Runtime**: Static
*   **Build Command**: `npm install` (or leave empty if no build needed)
*   **Publish Directory**: `.` (Dot means root directory)

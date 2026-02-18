# Ice Knockout

A multiplayer physics-based arena game where the last ball standing wins! built with Node.js, Socket.IO, and Matter.js.

## Features
- **Real-time Multiplayer**: Up to 4 players per room.
- **Physics Engine**: Realistic collisions and friction on ice.
- **Powerups**: (Planned) Speed boosts, shields, etc.
- **Sound Effects**: Immersive audio feedback.

## Setup
1. Clone the repository:
   ```bash
   git clone https://github.com/MarkoseM-mp4/Ice-Knockout.git
   cd Ice-Knockout
   ```
2. Install dependencies:
   ```bash
   npm install
   ```
3. Start the server:
   ```bash
   npm start
   ```
4. Open `http://localhost:3000` in your browser.

## Deployment (Recommended: Render / Railway)
**Note:** Netlify does not support the persistent WebSocket server required for this game. Use Render or Railway instead.

### Deploy on Render (Free Tier Available)
1. Sign up at [render.com](https://render.com).
2. Click "New +" -> "Web Service".
3. Connect your GitHub repository.
4. Settings:
   - **Environment**: Node
   - **Build Command**: `npm install`
   - **Start Command**: `node server/index.js`
5. Click "Create Web Service".

### Deploy on Railway
1. Sign up at [railway.app](https://railway.app).
2. Click "New Project" -> "Deploy from GitHub repo".
3. Select this repository.
4. Railway will auto-detect Node.js and deploy.

Enjoy knocking your friends off the ice! 🧊🥊

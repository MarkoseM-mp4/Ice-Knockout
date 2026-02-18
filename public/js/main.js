const socket = io();
const canvas = document.getElementById('game-canvas');

// Initialize Modules
const game = new Game();
const renderer = new Renderer(canvas, game.engine);
const input = new InputHandler(canvas, socket, game);

// UI Elements
const lobbyUI = document.getElementById('lobby-ui');
const gameUI = document.getElementById('game-ui');
const createRoomBtn = document.getElementById('create-room-btn');
const joinRoomBtn = document.getElementById('join-room-btn');
const roomInput = document.getElementById('room-input');
const roomList = document.getElementById('room-list');
const turnIndicator = document.getElementById('turn-indicator');
const usernameInput = document.getElementById('username-input');

// Client State
let mySocketId = null;
let currentRoomId = null;
let currentHostId = null;
let isMyTurn = false;

// Resize handling
function resizeCanvas() {
    renderer.setSize(window.innerWidth, window.innerHeight);
    game.updateArenaSize();
}
window.addEventListener('resize', resizeCanvas);
resizeCanvas();

socket.on('connect', () => {
    console.log('Connected with ID:', socket.id);
    mySocketId = socket.id;
});

// UI Events
const loginScreen = document.getElementById('login-screen');
const waitingScreen = document.getElementById('waiting-screen');
const displayRoomCode = document.getElementById('display-room-code');
const playerList = document.getElementById('player-list');
const playerCount = document.getElementById('player-count');
const startGameBtn = document.getElementById('start-game-btn');
const waitingMessage = document.getElementById('waiting-message');
const roomError = document.getElementById('room-error');

// UI Events
createRoomBtn.addEventListener('click', () => {
    const username = usernameInput.value.trim() || "Guest";
    socket.emit('createRoom', username);
});

joinRoomBtn.addEventListener('click', () => {
    const roomId = roomInput.value.trim();
    const username = usernameInput.value.trim() || "Guest";
    if (roomId) {
        socket.emit('joinRoom', { roomId, username });
    }
});

startGameBtn.addEventListener('click', () => {
    socket.emit('startGame');
});

socket.on('roomCreated', (roomId) => {
    console.log('Room created:', roomId);
    currentRoomId = roomId;
    showWaitingScreen(roomId);
});

socket.on('roomJoined', (roomId) => {
    console.log('Joined room:', roomId);
    currentRoomId = roomId;
    showWaitingScreen(roomId);
});

socket.on('lobbyUpdate', (data) => {
    // data: { roomId, players: [{name, id}], hostId }
    currentHostId = data.hostId;
    updatePlayerList(data.players, data.hostId);
});

socket.on('gameStart', (config) => {
    if (config.arenaRadius) {
        game.arenaRadius = config.arenaRadius;
    }
    lobbyUI.style.display = 'none';
    document.getElementById('winner-screen').style.display = 'none'; // Hide winner screen if it was open
    gameUI.style.display = 'block';
    resizeCanvas(); // Ensure canvas is sized right
});

socket.on('error', (msg) => {
    roomError.textContent = msg;
    setTimeout(() => roomError.textContent = '', 3000);
});

function showWaitingScreen(roomId) {
    loginScreen.style.display = 'none';
    waitingScreen.style.display = 'block';
    displayRoomCode.textContent = roomId;
}

function updatePlayerList(players, hostId) {
    playerList.innerHTML = '';
    playerCount.textContent = players.length;

    players.forEach(p => {
        const li = document.createElement('li');
        li.textContent = p.name + (p.id === mySocketId ? " (You)" : "");
        li.style.padding = "10px";
        li.style.borderBottom = "1px solid #444";
        playerList.appendChild(li);
    });

    // Show start button only to host
    if (hostId === mySocketId) {
        startGameBtn.style.display = 'inline-block';
        waitingMessage.style.display = 'none';
    } else {
        startGameBtn.style.display = 'none';
        waitingMessage.style.display = 'block';
        waitingMessage.textContent = "Waiting for host to start...";
    }
}

socket.on('gameState', (data) => {
    // Support both formats during transition valid or invalid
    const serverState = data.players || [];
    const activePlayerId = data.activePlayerId;
    // const isMoving = data.isMoving;

    // Fixed colors per slot: P1=red, P2=green, P3=blue, P4=yellow
    const PLAYER_COLORS = ['#f44336', '#4CAF50', '#2196F3', '#FFEB3B'];
    // Darker versions for turn indicator background
    const PLAYER_COLORS_DARK = ['#7a1a1a', '#1b5e20', '#0d3b6e', '#7a6b00'];

    // Find active player's slot color
    const activePlayer = serverState.find(p => p.id === activePlayerId);
    const activeSlotIndex = activePlayer ? activePlayer.slotIndex : -1;

    // Update Turn UI
    if (activePlayerId) {
        const activePlayerName = activePlayer ? activePlayer.name : 'Unknown';
        if (activePlayerId === mySocketId) {
            turnIndicator.textContent = "YOUR TURN";
            turnIndicator.style.color = "#fff";
            turnIndicator.style.fontWeight = "bold";
            isMyTurn = true;
        } else {
            turnIndicator.textContent = activePlayerName + "'s Turn";
            turnIndicator.style.color = "#fff";
            isMyTurn = false;
        }
        // Set canvas background to dark version of active player's color
        canvas.style.backgroundColor = PLAYER_COLORS_DARK[activeSlotIndex] || '#334';
    } else {
        turnIndicator.textContent = "Waiting for players...";
        turnIndicator.style.color = "#fff";
        canvas.style.backgroundColor = '#334';
        isMyTurn = false;
    }

    // Map server state to local players
    const newPlayers = [];
    serverState.forEach(pData => {
        let localP = game.players.find(p => p.id === pData.id);

        const slotColor = PLAYER_COLORS[pData.slotIndex] || '#999';
        const displayName = pData.id === mySocketId
            ? (pData.name || 'Unknown') + ' (You)'
            : (pData.name || 'Unknown');

        if (!localP) {
            // New player
            localP = {
                id: pData.id,
                name: displayName,
                radius: 15,
                color: slotColor,
                body: { position: { x: pData.x, y: pData.y }, velocity: { x: pData.vx, y: pData.vy } }
            };
        } else {
            localP.body.position.x = pData.x;
            localP.body.position.y = pData.y;
            localP.body.velocity.x = pData.vx;
            localP.body.velocity.y = pData.vy;
            localP.color = slotColor;
            localP.name = displayName;
        }
        newPlayers.push(localP);
    });

    game.players = newPlayers;
});

const soundManager = new SoundManager();

// Resume audio context on first user interaction
document.addEventListener('click', () => {
    soundManager.resume();
}, { once: true });

socket.on('playerEliminated', (eliminatedId) => {
    console.log('Eliminated:', eliminatedId);
    soundManager.playElimination();
    if (eliminatedId === mySocketId) {
        turnIndicator.textContent = "ELIMINATED";
        turnIndicator.style.color = "red";
    }
});

socket.on('collision', (data) => {
    game.createSparks(data.x, data.y);
    const volume = Math.min(1, Math.random() * 0.5 + 0.5); // Random volume variation
    soundManager.playCollision(); // Simplified, volume handled in class
});

socket.on('gameOver', (data) => {
    soundManager.playWin();
    // data: { winnerId, winnerName }
    const winnerScreen = document.getElementById('winner-screen');
    const winnerName = document.getElementById('winner-name');
    const winnerMessage = document.getElementById('winner-message');
    const restartBtn = document.getElementById('restart-game-btn');
    const waitingMsg = document.getElementById('restart-waiting-msg');

    gameUI.style.display = 'none';

    if (data.winnerId === mySocketId) {
        winnerName.textContent = 'YOU WIN!';
        winnerMessage.textContent = 'You are the last ball standing!';
    } else {
        winnerName.textContent = data.winnerName + ' Wins!';
        winnerMessage.textContent = 'Better luck next time!';
    }

    // Show appropriate buttons
    if (currentHostId === mySocketId) {
        restartBtn.style.display = 'inline-block';
        waitingMsg.style.display = 'none';
    } else {
        restartBtn.style.display = 'none';
        waitingMsg.style.display = 'block';
    }

    winnerScreen.style.display = 'block';
});

const restartGameBtn = document.getElementById('restart-game-btn');
restartGameBtn.addEventListener('click', () => {
    socket.emit('restartGame');
});

const leaveRoomBtn = document.getElementById('leave-room-btn');
leaveRoomBtn.addEventListener('click', () => {
    window.location.reload();
});

socket.on('gameStart', (config) => {
    // Handled above now
});

// Input Hook
input.onMouseDown = function (e) {
    if (!isMyTurn && turnIndicator.textContent !== "Waiting for players...") return; // Allow interaction in lobby? No.

    // Only allow if it IS my turn
    if (!isMyTurn) return;

    // Logic from InputHandler:
    const pos = this.getMousePos(e);
    const clickedPlayer = this.game.players.find(p => p.id === mySocketId);

    if (clickedPlayer) {
        const dx = clickedPlayer.body.position.x - pos.x;
        const dy = clickedPlayer.body.position.y - pos.y;
        if (Math.sqrt(dx * dx + dy * dy) < clickedPlayer.radius * 2) { // Increased hit area slightly
            this.isDragging = true;
            this.selectedBody = clickedPlayer.body;
            this.startPos = pos;
            this.currentPos = pos;
        }
    }
};

input.onMouseUp = function (e) {
    if (!this.isDragging) return;

    soundManager.playShoot();

    const pos = this.getMousePos(e);
    const dx = this.startPos.x - pos.x;
    const dy = this.startPos.y - pos.y;

    const dist = Math.sqrt(dx * dx + dy * dy);
    const power = Math.min(dist, this.MAX_POWER);
    const angle = Math.atan2(dy, dx);

    socket.emit('shoot', { angle, power });

    this.isDragging = false;
    this.selectedBody = null;
    this.game.arrows = [];
};

// Render Loop
function loop() {
    game.update(); // Update particles
    renderer.render(game.arenaRadius, game.players, game.arrows, game.particles);
    requestAnimationFrame(loop);
}

loop();

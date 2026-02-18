const PhysicsEngine = require('./physics');

class GameRoom {
    constructor(roomId, io) {
        this.roomId = roomId;
        this.io = io;
        this.players = []; // Array of objects: { id, name }
        this.physics = new PhysicsEngine();
        this.physics.onEliminate = (id) => this.handleElimination(id);
        this.physics.onCollision = (collision) => this.handleCollision(collision);

        this.isActive = false;
        this.interval = null;

        // Game Settings
        this.MAX_PLAYERS = 4;
        this.physics.arenaRadius = 300; // Need to sync this with client

        // Turn System
        this.currentTurnIndex = 0;
        this.isMoving = false;
    }

    addPlayer(socketId, username) {
        if (this.players.length >= this.MAX_PLAYERS) return false;
        if (this.isActive) return false; // Cannot join active game

        this.players.push({ id: socketId, name: username || `Player ${this.players.length + 1}` });
        this.physics.addPlayer(socketId);

        // Broadcast lobby update
        this.broadcastLobbyState();

        return true;
    }

    broadcastLobbyState() {
        this.io.to(this.roomId).emit('lobbyUpdate', {
            roomId: this.roomId,
            players: this.players.map(p => ({ name: p.name, id: p.id })),
            hostId: this.players[0].id
        });
    }

    removePlayer(socketId) {
        this.players = this.players.filter(p => p.id !== socketId);
        this.physics.removePlayer(socketId);
        if (this.players.length === 0) {
            this.stopGame();
        } else {
            this.broadcastLobbyState();
        }
    }

    calculateSpawnPositions() {
        const count = this.players.length;
        const radius = this.physics.arenaRadius - 40; // Indent slightly
        const angleStep = (Math.PI * 2) / count;

        this.players.forEach((p, index) => {
            const body = this.physics.players.get(p.id);
            if (body) {
                const angle = angleStep * index;
                const x = Math.cos(angle) * radius;
                const y = Math.sin(angle) * radius;
                // Matter.Body.setPosition(body, { x, y }); 
                // Need to use Matter directly, or expose method in PhysicsEngine
                // Let's modify PhysicsEngine to support repositioning or just set it here if we access body props.
                // Best to keep PhysicsEngine encapsulation, but for speed:
                const Matter = require('matter-js');
                Matter.Body.setPosition(body, { x, y });
                Matter.Body.setVelocity(body, { x: 0, y: 0 });
            }
        });
    }

    startGame() {
        if (this.isActive) return;
        this.isActive = true;
        this.calculateSpawnPositions();
        this.interval = setInterval(() => this.loop(), 1000 / 60);
        this.io.to(this.roomId).emit('gameStart', { arenaRadius: this.physics.arenaRadius });
    }

    stopGame() {
        clearInterval(this.interval);
        this.isActive = false;
    }

    restartGame() {
        if (this.interval) clearInterval(this.interval);
        this.isActive = false;

        // Reset Physics
        for (const [id, body] of this.physics.players) {
            this.physics.removePlayer(id);
        }
        this.physics.players.clear(); // just to be sure map is clear

        // Re-add players to physics
        this.players.forEach(p => {
            this.physics.addPlayer(p.id);
        });

        // Reset Game State
        this.currentTurnIndex = 0;
        this.isMoving = false;

        // Start again
        this.startGame();
    }

    handleShoot(socketId, angle, power) {
        // TODO: Validate turn
        this.physics.applyShootForce(socketId, angle, power);
    }

    handleCollision(collision) {
        this.io.to(this.roomId).emit('collision', collision);
    }

    handleElimination(socketId) {
        this.io.to(this.roomId).emit('playerEliminated', socketId);
    }

    loop() {
        this.physics.update();

        // Check win condition AFTER physics update (removals are done)
        if (this.physics.players.size === 1 && this.players.length > 1) {
            const winnerId = this.physics.players.keys().next().value;
            const winnerPlayer = this.players.find(p => p.id === winnerId);
            const winnerName = winnerPlayer ? winnerPlayer.name : 'Unknown';

            this.io.to(this.roomId).emit('gameOver', {
                winnerId: winnerId,
                winnerName: winnerName
            });
            this.stopGame();
            return;
        } else if (this.physics.players.size === 0 && this.players.length > 0) {
            this.io.to(this.roomId).emit('gameOver', {
                winnerId: null,
                winnerName: 'Nobody'
            });
            this.stopGame();
            return;
        }

        // Check for turn end conditions
        const isMoving = this.physics.isSomethingMoving();

        if (this.isMoving && !isMoving) {
            // Movement JUST stopped
            this.handleTurnEnd();
        }
        this.isMoving = isMoving;

        const state = this.physics.getState();
        // Enrich with names and slot index
        const enrichedState = state.map(p => {
            const playerIndex = this.players.findIndex(pl => pl.id === p.id);
            const playerInfo = this.players[playerIndex];
            return {
                ...p,
                name: playerInfo ? playerInfo.name : 'Unknown',
                slotIndex: playerIndex
            };
        });
        this.io.to(this.roomId).emit('gameState', {
            players: enrichedState,
            activePlayerId: this.players[this.currentTurnIndex]?.id,
            isMoving: this.isMoving
        });
    }

    handleTurnEnd() {
        // Rotate turn
        // Filter out eliminated players if we implement that fully later (physics removes them, so check existance)
        // Simple rotation for now
        let nextIndex = (this.currentTurnIndex + 1) % this.players.length;

        // Find next valid player
        let attempts = 0;
        while (!this.physics.players.has(this.players[nextIndex]) && attempts < this.players.length) {
            nextIndex = (nextIndex + 1) % this.players.length;
            attempts++;
        }

        this.currentTurnIndex = nextIndex;
        // this.io.to(this.roomId).emit('turnChange', this.players[this.currentTurnIndex]);
        // We send it in gameState every tick so explicit event not strictly needed but good for UI events
    }

    handleShoot(socketId, angle, power) {
        // Validate Turn
        if (this.isMoving) return; // Cannot shoot while moving
        if (this.players[this.currentTurnIndex].id !== socketId) return; // Not your turn

        this.physics.applyShootForce(socketId, angle, power);
        this.isMoving = true; // Mark as moving immediately so we waiting for stop
    }
}

class RoomManager {
    constructor(io) {
        this.io = io;
        this.rooms = new Map(); // roomId -> GameRoom
    }

    createRoom() {
        const roomId = Math.random().toString(36).substring(7);
        const room = new GameRoom(roomId, this.io);
        this.rooms.set(roomId, room);
        return roomId;
    }

    joinRoom(roomId, socketId) {
        const room = this.rooms.get(roomId);
        if (room && room.addPlayer(socketId)) {
            return room;
        }
        return null;
    }

    getRoom(roomId) {
        return this.rooms.get(roomId);
    }

    // Helper to find which room a socket is in
    getRoomBySocket(socketId) {
        for (const [id, room] of this.rooms) {
            // Check formatted players array
            if (room.players.find(p => p.id === socketId)) return room;
        }
        return null;
    }
}

module.exports = RoomManager;

const PhysicsEngine = require('./physics');

class GameRoom {
    constructor(roomId, io, arenaType = "round") {
        this.roomId = roomId;
        this.io = io;
        this.players = []; // Array of objects: { id, name }
        this.physics = new PhysicsEngine(arenaType);
        this.physics.onEliminate = (id, killerId) => this.handleElimination(id, killerId);
        this.physics.onCollision = (collision) => this.handleCollision(collision);

        this.isActive = false;
        this.interval = null;

        // Game Settings
        this.MAX_PLAYERS = 4;
        this.physics.arenaRadius = 300; // Need to sync this with client
        this.arenaType = arenaType;


        // Turn System
        this.currentTurnIndex = 0;
        this.isMoving = false;
        this.remainingPlayers = [];
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

        // Remove from remainingPlayers if present
        const remIndex = this.remainingPlayers.findIndex(p => p.id === socketId);
        if (remIndex !== -1) {
            this.remainingPlayers.splice(remIndex, 1);
            if (remIndex < this.currentTurnIndex) {
                this.currentTurnIndex--;
            }
            // Ensure index is valid
            this.currentTurnIndex = this.currentTurnIndex % (this.remainingPlayers.length || 1);
        }

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
                let x, y;

                if (this.arenaType === 'square') {
                    // For square, spawn near corners or edges depending on count
                    // Simple circle distribution works fine inside a square too, 
                    // but let's clamp or adjust if needed.
                    // Actually, circle distribution inside the square radius is safe.
                    x = Math.cos(angle) * (radius - 20);
                    y = Math.sin(angle) * (radius - 20);
                } else {
                    x = Math.cos(angle) * radius;
                    y = Math.sin(angle) * radius;
                }

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

        // Initialize remaining players
        this.remainingPlayers = [...this.players];
        this.currentTurnIndex = 0;

        this.interval = setInterval(() => this.loop(), 1000 / 60);
        this.io.to(this.roomId).emit('gameStart', {
            arenaRadius: this.physics.arenaRadius,
            arenaType: this.arenaType
        });
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

    handleElimination(socketId, killerId) {
        // Find killer name
        let killerName = null;
        if (killerId) {
            const killer = this.players.find(p => p.id === killerId);
            if (killer) killerName = killer.name;
        }

        // Update remainingPlayers
        const eliminatedIndex = this.remainingPlayers.findIndex(p => p.id === socketId);
        if (eliminatedIndex !== -1) {
            this.remainingPlayers.splice(eliminatedIndex, 1);
            // Adjust turn index if needed
            if (eliminatedIndex < this.currentTurnIndex) {
                this.currentTurnIndex--;
            }
            // If eliminatedIndex === currentTurnIndex, we don't change index, 
            // effectively pointing to the next player.
            // But if we are at the end of the array, we might need wrapping, handled in turn logic or access.
        }

        this.io.to(this.roomId).emit('playerEliminated', {
            eliminatedId: socketId,
            killerId: killerId,
            killerName: killerName
        });
    }

    loop() {
        this.physics.update();

        // Check win condition AFTER physics update (removals are done)
        // Use remainingPlayers instead of physics size for consistency?
        // Physics removes bodies, so physics.players.size is accurate for "alive bodies".
        // remainingPlayers should match physics.players.size roughly.

        if (this.remainingPlayers.length === 1 && this.players.length > 1) {
            const winnerId = this.remainingPlayers[0].id;
            const winnerPlayer = this.players.find(p => p.id === winnerId);
            const winnerName = winnerPlayer ? winnerPlayer.name : 'Unknown';

            this.io.to(this.roomId).emit('gameOver', {
                winnerId: winnerId,
                winnerName: winnerName
            });
            this.stopGame();
            return;
        } else if (this.remainingPlayers.length === 0 && this.players.length > 0) {
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
            activePlayerId: this.remainingPlayers[this.currentTurnIndex]?.id,
            isMoving: this.isMoving
        });
    }

    handleTurnEnd() {
        if (this.remainingPlayers.length === 0) return;

        // Determine if we need to increment index.
        // If the active player (who just played) is still in remainingPlayers, we increment to next.
        // If they were eliminated, currentTurnIndex already points to the next guy (due to splice shift).
        // Wait, currentTurnIndex points to the index. 
        // We need to know who *was* the active player. 
        // But activePlayerId is derived from currentTurnIndex in the loop.

        // Let's assume the turn index logic update in handleElimination handles the shift.
        // If current player (index i) dies:
        //   splice(i, 1). Array shifts left. New element at i is the next player.
        //   So we should NOT increment i.
        // If current player (index i) survives:
        //   We want next player (i+1).
        //   So we increment i.

        // But how do we know if they died?
        // We can check if the player *currently* at currentTurnIndex was the one who just played?
        // No, currentTurnIndex points to valid player now.

        // Better strategy:
        // We need to know who *took* the turn. Use a stored `turnPlayerId`.
        // But we don't have that easily unless we stored it.
        // However, we know `isMoving` was true. The player who shot caused `isMoving`.

        // Actually, simpler:
        // If the player who just moved is still in remainingPlayers, increment.
        // But `this.activePlayerId` is recalculated every loop based on index.

        // Let's assume we always increment, UNLESS the previous player died?
        // Let's rely on `handleShoot`.
        // When shooting, we can store `this.lastShooterId`.
        // Then in `handleTurnEnd`:
        // if (this.remainingPlayers.find(p => p.id === this.lastShooterId)) {
        //      this.currentTurnIndex++;
        // }
        // this.currentTurnIndex %= this.remainingPlayers.length;

        // Wait, what if the shooter survived but someone BEFORE them died?
        // handleElimination decrements index. So index matches shooter.
        // Then shooter survives -> increment. Correct.

        // What if shooter survived, someone AFTER them died?
        // Index matches shooter. Increment. Correct.

        // What if shooter died?
        // handleElimination does NOT decrement (since index == eliminatedIndex).
        // currentTurnIndex still points to the slot (now occupied by next player).
        // If we increment, we skip the player who slid into the slot?
        // Yes. So if shooter died, we should NOT increment.

        // So we need to know if the CURRENT index currently points to the player who just finished their turn.
        // But we don't know who "just finished" without storing it.

        // BUT, we only shoot if `activePlayer` shoots.
        // So let's store `currentTurnPlayerId` in `handleTurnEnd`? No, too late.

        // Let's simply check if the player at `currentTurnIndex` has `velocity > 0`? No, they stopped.

        // I will add `lastActivePlayerId` to class.
        // Or better: In `handleShoot`, `this.shootingPlayerId = socketId`.

        if (this.remainingPlayers.find(p => p.id === this.shootingPlayerId)) {
            this.currentTurnIndex = (this.currentTurnIndex + 1) % this.remainingPlayers.length;
        } else {
            // Shooter died. calculated active index now points to next player automatically (due to splice).
            // However, currentTurnIndex might be out of bounds if it was the last element.
            this.currentTurnIndex = this.currentTurnIndex % this.remainingPlayers.length;
        }

        this.shootingPlayerId = null;
    }

    handleShoot(socketId, angle, power) {
        // Validate Turn
        if (this.isMoving) return; // Cannot shoot while moving

        const activeId = this.remainingPlayers[this.currentTurnIndex]?.id;

        if (activeId !== socketId) return; // Not your turn

        this.shootingPlayerId = socketId; // Track who shot
        this.physics.applyShootForce(socketId, angle, power);
        this.isMoving = true; // Mark as moving immediately so we waiting for stop
    }
}

class RoomManager {
    constructor(io) {
        this.io = io;
        this.rooms = new Map(); // roomId -> GameRoom
    }

    createRoom(arenaType = "round") {
        const roomId = Math.random().toString(36).substring(7);
        const room = new GameRoom(roomId, this.io, arenaType);
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

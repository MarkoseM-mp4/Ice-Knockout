const express = require('express');
const http = require('http');
const { Server } = require('socket.io');
const path = require('path');
const RoomManager = require('./gameRooms');

const app = express();
const server = http.createServer(app);
const io = new Server(server, {
    cors: {
        origin: "*",
        methods: ["GET", "POST"]
    }
});
const roomManager = new RoomManager(io); // Pass io to manager

app.use(express.static(path.join(__dirname, '../public')));

app.get('/', (req, res) => {
    res.sendFile(path.join(__dirname, '../public/index.html'));
});

io.on('connection', (socket) => {
    console.log('User connected:', socket.id);

    socket.on('createRoom', (data) => {
        let username = "Guest";
        let arenaType = "round";

        if (typeof data === 'string') {
            username = data;
        } else if (data && typeof data === 'object') {
            username = data.username || "Guest";
            arenaType = data.arenaType || "round";
        }

        const roomId = roomManager.createRoom(arenaType);
        const room = roomManager.getRoom(roomId);
        socket.join(roomId); // Join room FIRST so broadcast reaches this socket
        room.addPlayer(socket.id, username); // Add creator
        socket.emit('roomCreated', roomId);
        console.log(`Room ${roomId} created by ${socket.id} (${username}) [${arenaType}]`);
    });

    socket.on('startGame', () => {
        const room = roomManager.getRoomBySocket(socket.id);
        if (room && room.players.length > 0 && room.players[0].id === socket.id) { // Only host can start
            room.startGame();
        }
    });

    socket.on('restartGame', () => {
        const room = roomManager.getRoomBySocket(socket.id);
        if (room && room.players.length > 0 && room.players[0].id === socket.id) {
            room.restartGame();
        }
    });

    socket.on('joinRoom', ({ roomId, username }) => {
        const room = roomManager.getRoom(roomId);
        if (room) {
            socket.join(roomId); // Join room FIRST so broadcast reaches this socket
            if (room.addPlayer(socket.id, username)) {
                socket.emit('roomJoined', roomId);
                console.log(`${socket.id} joined room ${roomId}`);
            } else {
                socket.leave(roomId);
                socket.emit('error', 'Room is full or already started');
            }
        } else {
            socket.emit('error', 'Room not found');
        }
    });

    socket.on('shoot', ({ angle, power }) => {
        // Find which room this socket is in
        // A bit inefficient to search, but ok for prototype
        // Better: socket.rooms (but that includes socket.id)
        // Or store roomId on socket object

        // Since we didn't store it, let's just search
        // OR better, client sends roomId? Secure? No.
        // Let's assume 1 room per socket for now.

        // Use helper from RoomManager if we had it, or just:
        let room = null;
        for (const [id, r] of roomManager.rooms) {
            if (r.players.find(p => p.id === socket.id)) {
                room = r;
                break;
            }
        }

        if (room) {
            room.handleShoot(socket.id, angle, power);
        }
    });

    socket.on('disconnect', () => {
        console.log('User disconnected:', socket.id);
        // Find room and remove
        for (const [id, room] of roomManager.rooms) {
            if (room.players.find(p => p.id === socket.id)) {
                room.removePlayer(socket.id);
                if (room.players.length === 0) {
                    roomManager.rooms.delete(id);
                }
                break;
            }
        }
    });
});

const PORT = process.env.PORT || 3000;
server.listen(PORT, () => {
    console.log(`Server running on port ${PORT}`);
});

const express = require('express');
const http = require('http');
const cors = require('cors');
const { Server } = require('socket.io');
const { randomUUID } = require('crypto');

const app = express();
const server = http.createServer(app);
const io = new Server(server, {
  cors: {
    origin: '*',
    methods: ['GET', 'POST']
  }
});

app.use(cors());
app.use(express.json());

const PORT = process.env.PORT || 3000;
const MAX_MESSAGES_PER_ROOM = 200;

const rooms = new Map();
const socketUsers = new Map();
const onlineUsers = new Map();

const getRoom = (roomId, roomName) => {
  if (!rooms.has(roomId)) {
    rooms.set(roomId, {
      id: roomId,
      name: roomName || roomId,
      createdAt: new Date().toISOString(),
      messages: [],
      participants: new Set()
    });
  }

  const room = rooms.get(roomId);
  if (roomName && room.name !== roomName) {
    room.name = roomName;
  }

  return room;
};

const addMessage = (roomId, message) => {
  const room = getRoom(roomId);
  room.messages.push(message);

  if (room.messages.length > MAX_MESSAGES_PER_ROOM) {
    room.messages.shift();
  }
};

const toRoomResponse = (room) => ({
  id: room.id,
  name: room.name,
  createdAt: room.createdAt,
  participants: Array.from(room.participants),
  onlineParticipants: Array.from(room.participants).filter((username) => onlineUsers.has(username)),
  messageCount: room.messages.length
});

const updateOnlineStatus = (username, isJoining) => {
  const current = onlineUsers.get(username) || 0;

  if (isJoining) {
    onlineUsers.set(username, current + 1);
    io.emit('user_status_changed', { username, status: 'online' });
    return;
  }

  if (current <= 1) {
    onlineUsers.delete(username);
    io.emit('user_status_changed', { username, status: 'offline' });
    return;
  }

  onlineUsers.set(username, current - 1);
};

app.get('/api/rooms', (_req, res) => {
  const allRooms = Array.from(rooms.values()).map(toRoomResponse);
  res.json({ rooms: allRooms });
});

app.get('/api/rooms/:roomId/messages', (req, res) => {
  const room = rooms.get(req.params.roomId);

  if (!room) {
    return res.status(404).json({ error: 'Room not found' });
  }

  return res.json({
    room: toRoomResponse(room),
    messages: room.messages
  });
});

app.get('/api/users/presence', (_req, res) => {
  res.json({
    onlineUsers: Array.from(onlineUsers.keys())
  });
});

io.on('connection', (socket) => {
  socket.emit('connection_ready', {
    socketId: socket.id,
    rooms: Array.from(rooms.values()).map(toRoomResponse)
  });

  socket.on('join_room', ({ username, roomId, roomName }) => {
    if (!username || !roomId) {
      socket.emit('error_message', { error: 'username and roomId are required' });
      return;
    }

    const room = getRoom(roomId, roomName);
    socket.join(roomId);

    socketUsers.set(socket.id, { username, roomId });
    room.participants.add(username);
    updateOnlineStatus(username, true);

    socket.emit('room_history', {
      room: toRoomResponse(room),
      messages: room.messages
    });

    io.to(roomId).emit('user_joined_room', {
      roomId,
      username,
      participants: Array.from(room.participants)
    });
  });

  socket.on('send_message', ({ roomId, content }) => {
    const user = socketUsers.get(socket.id);

    if (!user || user.roomId !== roomId) {
      socket.emit('error_message', { error: 'User is not in this room' });
      return;
    }

    if (!content || typeof content !== 'string' || !content.trim()) {
      socket.emit('error_message', { error: 'Message content is required' });
      return;
    }

    const message = {
      id: randomUUID(),
      roomId,
      sender: user.username,
      content: content.trim(),
      timestamp: new Date().toISOString()
    };

    addMessage(roomId, message);
    io.to(roomId).emit('new_message', message);
  });

  socket.on('leave_room', ({ roomId }) => {
    const user = socketUsers.get(socket.id);
    const room = rooms.get(roomId);

    if (!user || !room || user.roomId !== roomId) {
      return;
    }

    socket.leave(roomId);
    socketUsers.delete(socket.id);
    updateOnlineStatus(user.username, false);

    room.participants.forEach((participant) => {
      const isOnlineInRoom = Array.from(socketUsers.values()).some(
        (entry) => entry.username === participant && entry.roomId === roomId
      );

      if (!isOnlineInRoom && participant === user.username) {
        room.participants.delete(participant);
      }
    });

    io.to(roomId).emit('user_left_room', {
      roomId,
      username: user.username,
      participants: Array.from(room.participants)
    });
  });

  socket.on('disconnect', () => {
    const user = socketUsers.get(socket.id);

    if (!user) {
      return;
    }

    socketUsers.delete(socket.id);
    updateOnlineStatus(user.username, false);

    const room = rooms.get(user.roomId);
    if (room) {
      const isStillInRoom = Array.from(socketUsers.values()).some(
        (entry) => entry.username === user.username && entry.roomId === user.roomId
      );

      if (!isStillInRoom) {
        room.participants.delete(user.username);
      }

      io.to(user.roomId).emit('user_left_room', {
        roomId: user.roomId,
        username: user.username,
        participants: Array.from(room.participants)
      });
    }
  });
});

server.listen(PORT, () => {
  console.log(`Chat server running on port ${PORT}`);
});

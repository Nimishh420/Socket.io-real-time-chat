const express = require("express");
const http = require("http");
const cors = require("cors");
const { Server } = require("socket.io");

const PORT = process.env.PORT || 3000;
const MAX_ROOM_MESSAGES = 200;

const app = express();
app.use(cors());
app.use(express.json());

const server = http.createServer(app);
const io = new Server(server, {
  cors: {
    origin: "*",
    methods: ["GET", "POST"]
  }
});

const rooms = new Map();
const socketUsers = new Map();
const userSockets = new Map();
const users = new Map();

const ensureRoom = (roomId, roomName = roomId) => {
  if (!rooms.has(roomId)) {
    rooms.set(roomId, {
      id: roomId,
      name: roomName,
      members: new Set(),
      messages: []
    });
  }
  return rooms.get(roomId);
};

const toRoomResponse = (room) => ({
  id: room.id,
  name: room.name,
  activeUsers: room.members.size,
  totalMessages: room.messages.length,
  lastMessageAt: room.messages[room.messages.length - 1]?.timestamp || null
});

const emitPresence = (userId) => {
  const user = users.get(userId);
  if (!user) return;
  io.emit("presence:update", user);
};

const addSocketForUser = (userId, socketId) => {
  if (!userSockets.has(userId)) {
    userSockets.set(userId, new Set());
  }
  userSockets.get(userId).add(socketId);
};

const removeSocketForUser = (userId, socketId) => {
  const sockets = userSockets.get(userId);
  if (!sockets) return 0;
  sockets.delete(socketId);
  if (sockets.size === 0) {
    userSockets.delete(userId);
    return 0;
  }
  return sockets.size;
};

const removeUserFromRoom = (socketId, reason = "left") => {
  const userSession = socketUsers.get(socketId);
  if (!userSession) return;

  const room = rooms.get(userSession.roomId);
  if (room) {
    room.members.delete(userSession.userId);
    io.to(userSession.roomId).emit("room:user_left", {
      roomId: userSession.roomId,
      userId: userSession.userId,
      username: userSession.username,
      reason
    });
  }

  socketUsers.delete(socketId);
};

app.get("/health", (_req, res) => {
  res.json({ status: "ok" });
});

app.get("/api/rooms", (_req, res) => {
  const roomData = Array.from(rooms.values()).map(toRoomResponse);
  res.json({ rooms: roomData });
});

app.get("/api/rooms/:roomId/messages", (req, res) => {
  const room = rooms.get(req.params.roomId);
  if (!room) {
    return res.status(404).json({ error: "Room not found" });
  }
  return res.json({
    room: toRoomResponse(room),
    messages: room.messages
  });
});

app.get("/api/users/:userId/presence", (req, res) => {
  const user = users.get(req.params.userId);
  if (!user) {
    return res.status(404).json({ error: "User not found" });
  }
  return res.json({ user });
});

io.on("connection", (socket) => {
  socket.emit("presence:bootstrap", {
    users: Array.from(users.values())
  });

  socket.on("join_room", (payload = {}) => {
    const { userId, username, roomId, roomName } = payload;
    if (!userId || !username || !roomId) {
      socket.emit("error:event", {
        message: "userId, username and roomId are required"
      });
      return;
    }

    removeUserFromRoom(socket.id, "switched-room");
    socket.join(roomId);

    const room = ensureRoom(roomId, roomName);
    room.members.add(userId);

    socketUsers.set(socket.id, {
      userId,
      username,
      roomId
    });

    addSocketForUser(userId, socket.id);
    users.set(userId, {
      userId,
      username,
      online: true,
      lastSeen: null
    });
    emitPresence(userId);

    io.to(roomId).emit("room:user_joined", {
      roomId,
      userId,
      username
    });
  });

  socket.on("send_message", (payload = {}) => {
    const { roomId, content } = payload;
    const userSession = socketUsers.get(socket.id);
    if (!userSession || !roomId || !content || !content.trim()) {
      socket.emit("error:event", { message: "Invalid message payload" });
      return;
    }

    if (userSession.roomId !== roomId) {
      socket.emit("error:event", { message: "You are not in this room" });
      return;
    }

    const room = ensureRoom(roomId);
    const message = {
      id: `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
      roomId,
      sender: {
        userId: userSession.userId,
        username: userSession.username
      },
      content: content.trim(),
      timestamp: new Date().toISOString()
    };

    room.messages.push(message);
    if (room.messages.length > MAX_ROOM_MESSAGES) {
      room.messages.shift();
    }

    io.to(roomId).emit("message:new", message);
  });

  socket.on("leave_room", (payload = {}) => {
    const userSession = socketUsers.get(socket.id);
    if (!userSession) return;
    if (payload.roomId && payload.roomId !== userSession.roomId) return;

    socket.leave(userSession.roomId);
    removeUserFromRoom(socket.id, "left");
  });

  socket.on("disconnect", () => {
    const userSession = socketUsers.get(socket.id);
    if (!userSession) return;

    removeUserFromRoom(socket.id, "disconnected");
    const remainingSockets = removeSocketForUser(userSession.userId, socket.id);

    if (remainingSockets === 0) {
      users.set(userSession.userId, {
        userId: userSession.userId,
        username: userSession.username,
        online: false,
        lastSeen: new Date().toISOString()
      });
      emitPresence(userSession.userId);
    }
  });
});

server.listen(PORT, () => {
  console.log(`Server listening on port ${PORT}`);
});

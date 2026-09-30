const cors = require("cors");
const express = require("express");
const http = require("http");
const { Server } = require("socket.io");

const PORT = process.env.PORT || 3000;

const app = express();
app.use(cors());
app.use(express.json());

const server = http.createServer(app);
const io = new Server(server, {
  cors: {
    origin: "*",
  },
});

const rooms = new Map();
let messageId = 0;

function getOrCreateRoom(roomId) {
  if (!rooms.has(roomId)) {
    rooms.set(roomId, {
      roomId,
      createdAt: new Date().toISOString(),
      users: new Map(),
      messages: [],
    });
  }
  return rooms.get(roomId);
}

function roomMembers(room) {
  return Array.from(room.users.entries()).map(([username, member]) => ({
    username,
    online: member.online,
    lastSeen: member.lastSeen,
  }));
}

function roomSummary(room) {
  const members = roomMembers(room);
  return {
    roomId: room.roomId,
    createdAt: room.createdAt,
    messageCount: room.messages.length,
    members,
    onlineCount: members.filter((member) => member.online).length,
  };
}

function leaveRoom(socket) {
  const { roomId, username } = socket.data || {};
  if (!roomId || !username) {
    return;
  }

  const room = rooms.get(roomId);
  if (!room) {
    socket.data = {};
    return;
  }

  const member = room.users.get(username);
  if (member) {
    member.socketIds.delete(socket.id);
    if (member.socketIds.size === 0) {
      member.online = false;
      member.lastSeen = new Date().toISOString();
      io.to(roomId).emit("presence:update", {
        roomId,
        username,
        status: "offline",
        timestamp: member.lastSeen,
      });
    }
  }

  socket.leave(roomId);
  socket.data = {};
  io.to(roomId).emit("room:users", roomMembers(room));
}

app.get("/api/rooms", (_req, res) => {
  const roomList = Array.from(rooms.values()).map(roomSummary);
  res.json(roomList);
});

app.get("/api/rooms/:roomId/messages", (req, res) => {
  const room = rooms.get(req.params.roomId);
  if (!room) {
    return res.status(404).json({ error: "Room not found" });
  }

  const limit = Number.parseInt(req.query.limit, 10);
  const messages =
    Number.isInteger(limit) && limit > 0
      ? room.messages.slice(-limit)
      : room.messages;

  return res.json(messages);
});

io.on("connection", (socket) => {
  socket.on("room:join", ({ roomId, username } = {}) => {
    if (
      typeof roomId !== "string" ||
      roomId.trim().length === 0 ||
      typeof username !== "string" ||
      username.trim().length === 0
    ) {
      socket.emit("room:error", {
        error: "Both roomId and username are required",
      });
      return;
    }

    leaveRoom(socket);

    const room = getOrCreateRoom(roomId.trim());
    const cleanUsername = username.trim();
    socket.join(room.roomId);
    socket.data = { roomId: room.roomId, username: cleanUsername };

    if (!room.users.has(cleanUsername)) {
      room.users.set(cleanUsername, {
        online: true,
        lastSeen: null,
        socketIds: new Set(),
      });
    }

    const member = room.users.get(cleanUsername);
    member.socketIds.add(socket.id);
    member.online = true;
    member.lastSeen = null;

    io.to(room.roomId).emit("presence:update", {
      roomId: room.roomId,
      username: cleanUsername,
      status: "online",
      timestamp: new Date().toISOString(),
    });

    io.to(room.roomId).emit("room:users", roomMembers(room));
    socket.emit("room:history", room.messages);
  });

  socket.on("message:send", ({ text, roomId } = {}) => {
    const activeRoomId = socket.data?.roomId;
    const username = socket.data?.username;
    const normalizedRoomId =
      typeof roomId === "string" && roomId.trim().length > 0
        ? roomId.trim()
        : activeRoomId;

    if (!normalizedRoomId || normalizedRoomId !== activeRoomId || !username) {
      socket.emit("room:error", {
        error: "Join a room before sending messages",
      });
      return;
    }

    if (typeof text !== "string" || text.trim().length === 0) {
      socket.emit("room:error", { error: "Message text is required" });
      return;
    }

    const room = getOrCreateRoom(normalizedRoomId);
    const message = {
      id: ++messageId,
      roomId: normalizedRoomId,
      username,
      text: text.trim(),
      createdAt: new Date().toISOString(),
    };

    room.messages.push(message);
    io.to(normalizedRoomId).emit("message:new", message);
  });

  socket.on("room:leave", () => {
    leaveRoom(socket);
  });

  socket.on("disconnect", () => {
    leaveRoom(socket);
  });
});

server.listen(PORT, () => {
  console.log(`Chat server listening on port ${PORT}`);
});

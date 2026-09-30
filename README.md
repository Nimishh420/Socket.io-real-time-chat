# Socket.io-real-time-chat

Real-time chat server built with Node.js, Express, and Socket.io.

## Features

- Multi-room chat support
- Online/offline user presence tracking per room
- In-memory message history (easy to replace with a database)
- REST APIs for room and message history

## Run

```bash
npm install
npm start
```

Server runs on `http://localhost:3000` by default (`PORT` can be overridden).

## REST APIs

- `GET /api/rooms` - list rooms with members, online count, and message count
- `GET /api/rooms/:roomId/messages?limit=50` - list message history for a room

## Socket events

Client -> server:

- `room:join` `{ roomId, username }`
- `message:send` `{ roomId?, text }`
- `room:leave`

Server -> client:

- `presence:update`
- `room:users`
- `room:history`
- `message:new`
- `room:error`
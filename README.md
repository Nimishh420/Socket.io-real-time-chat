# Socket.io Real-Time Chat

Complete real-time chat server implementation using **Node.js**, **Express**, and **Socket.io**.

## Features

- Real-time room-based chat with Socket.io
- User presence tracking (`online` / `offline`)
- In-memory message history per room (easy to replace with DB)
- REST APIs to fetch rooms and historical messages

## Tech Stack

- Node.js
- Express
- Socket.io

## Setup

```bash
npm install
npm start
```

Server runs on:

```text
http://localhost:3000
```

## REST APIs

### `GET /api/rooms`

Returns all rooms with metadata:

- room id and name
- active user count
- total messages
- last message timestamp

### `GET /api/rooms/:roomId/messages`

Returns message history for a room.

### `GET /api/users/:userId/presence`

Returns user presence information.

## Socket Events

### Client -> Server

- `join_room` `{ userId, username, roomId, roomName? }`
- `leave_room` `{ roomId? }`
- `send_message` `{ roomId, content }`

### Server -> Client

- `presence:update`
- `room:user_joined`
- `room:user_left`
- `message:new`
- `error:event`

## Notes

- Message history is in-memory and capped at 200 messages per room.
- Replace in-memory Maps with MongoDB/PostgreSQL repositories to persist data.
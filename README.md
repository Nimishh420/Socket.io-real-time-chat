# Socket.io Real-Time Chat Server

A complete real-time chat server built with **Node.js**, **Express**, and **Socket.io**.

## Features

- Chat rooms
- User presence tracking (online/offline)
- In-memory message history per room
- REST APIs for room and message history

## Tech Stack

- Node.js
- Express
- Socket.io
- CORS

## Setup

```bash
npm install
```

## Run

```bash
npm start
```

Server runs on `http://localhost:3000` by default.

Use a different port with:

```bash
PORT=4000 npm start
```

## Socket Events

### Client -> Server

- `join_room`
  - payload: `{ username, roomId, roomName? }`
- `send_message`
  - payload: `{ roomId, content }`
- `leave_room`
  - payload: `{ roomId }`

### Server -> Client

- `connection_ready`
- `room_history`
- `new_message`
- `user_joined_room`
- `user_left_room`
- `user_status_changed`
- `error_message`

## REST APIs

### `GET /api/rooms`
Returns all rooms with participants and message counts.

### `GET /api/rooms/:roomId/messages`
Returns message history for a room.

### `GET /api/users/presence`
Returns currently online usernames.

## Notes

- Message and room storage is in-memory for simplicity.
- For production, replace in-memory structures with a persistent store like MongoDB or PostgreSQL.

const express = require("express");
const http = require("http");
const cors = require("cors");
const { Server } = require("socket.io");

const app = express();
app.use(cors());

// Create HTTP server and attach Socket.io
const server = http.createServer(app);
const io = new Server(server, {
  cors: {
    origin: "*", // Change to your frontend domain in production
    methods: ["GET", "POST"]
  }
});

// Health check root route
app.get('/', (req, res) => {
  res.send('🎉 Backend with Socket.io is working!');
});

// In-memory room data
const rooms = {}; // { roomId: { players: [ { id, symbol } ], board: [], isXTurn, gameOver } }

const checkWinner = (board) => {
  const lines = [
    [0,1,2],[3,4,5],[6,7,8], // rows
    [0,3,6],[1,4,7],[2,5,8], // columns
    [0,4,8],[2,4,6]          // diagonals
  ];
  for (const [a,b,c] of lines) {
    if (board[a] && board[a] === board[b] && board[a] === board[c]) {
      return board[a]; // "X" or "O"
    }
  }
  return board.includes(null) ? null : "draw";
};

io.on("connection", (socket) => {
  console.log(`User connected: ${socket.id}`);

  socket.on("joinRoom", (roomId) => {
    if (!rooms[roomId]) {
      rooms[roomId] = {
        players: [],
        board: Array(9).fill(null),
        isXTurn: true,
        gameOver: false
      };
    }

    const room = rooms[roomId];

    if (room.players.length < 2) {
      const symbol = room.players.length === 0 ? "X" : "O";
      room.players.push({ id: socket.id, symbol });
      socket.join(roomId);
      socket.emit("assignSymbol", symbol);
      console.log(`Player ${symbol} joined room ${roomId}`);

      if (room.players.length === 2) {
        io.to(roomId).emit("startGame", {
          board: room.board,
          isXTurn: room.isXTurn
        });
      }
    } else {
      socket.emit("roomFull");
    }
  });

  socket.on("makeMove", ({ room: roomId, index }) => {
    const room = rooms[roomId];
    if (!room || room.gameOver) return;

    const player = room.players.find(p => p.id === socket.id);
    if (!player) return;

    const currentSymbol = room.isXTurn ? "X" : "O";

    if (player.symbol !== currentSymbol) return;
    if (room.board[index] !== null) return;

    room.board[index] = currentSymbol;
    const result = checkWinner(room.board);

    if (result === "X" || result === "O") {
      room.gameOver = true;
      io.to(roomId).emit("updateGame", {
        board: room.board,
        isXTurn: room.isXTurn,
        winner: result
      });
    } else if (result === "draw") {
      room.gameOver = true;
      io.to(roomId).emit("updateGame", {
        board: room.board,
        isXTurn: room.isXTurn,
        winner: "draw"
      });
    } else {
      room.isXTurn = !room.isXTurn;
      io.to(roomId).emit("updateGame", {
        board: room.board,
        isXTurn: room.isXTurn
      });
    }
  });

  socket.on("restartGame", (roomId) => {
    const room = rooms[roomId];
    if (!room) return;

    room.board = Array(9).fill(null);
    room.isXTurn = true;
    room.gameOver = false;

    io.to(roomId).emit("startGame", {
      board: room.board,
      isXTurn: room.isXTurn
    });
  });

  socket.on("disconnect", () => {
    console.log(`User disconnected: ${socket.id}`);
    for (const roomId in rooms) {
      const room = rooms[roomId];
      room.players = room.players.filter(p => p.id !== socket.id);
      if (room.players.length === 0) {
        delete rooms[roomId];
      } else {
        io.to(roomId).emit("opponentLeft");
      }
    }
  });
});

// ✅ Socket.io-compatible listener
const PORT = process.env.PORT || 4000;
server.listen(PORT, () => {
  console.log(`Server running on port ${PORT}`);
});

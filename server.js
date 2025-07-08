const express = require("express");
const http = require("http");
const { Server } = require("socket.io");
const cors = require("cors");

const app = express();
app.use(cors());

const server = http.createServer(app);
const io = new Server(server, {
  cors: {
    origin: "https://armourgames.netlify.app", // Adjust in production
    methods: ["GET", "POST"],
  },
});


app.get("/", (req, res) => {
  res.send("🎉 Backend with Socket.io is working!");
});

// Game rooms and states
const rooms = {};

const checkWinner = (board) => {
  const lines = [
    [0, 1, 2],
    [3, 4, 5],
    [6, 7, 8],

    [0, 3, 6],
    [1, 4, 7],
    [2, 5, 8],

    [0, 4, 8],
    [2, 4, 6],
  ];
  for (let [a, b, c] of lines) {
    if (board[a] && board[a] === board[b] && board[a] === board[c]) {
      return board[a];
    }
  }
  if (board.every((cell) => cell !== null)) return "draw";
  return null;
};

io.on("connection", (socket) => {
  console.log("User connected:", socket.id);

  socket.on("joinRoom", ({ room, name }) => {
    socket.join(room);

    // Initialize room if not exist
    if (!rooms[room]) {
      rooms[room] = {
        players: [],
        board: Array(9).fill(null),
        turn: "X",
        sockets: {},
        names: {},
      };
    }

    const roomData = rooms[room];

    // Only allow 2 players
    if (roomData.players.length >= 2) {
      socket.emit("message", "Room is full.");
      return;
    }

    const symbol = roomData.players.includes("X") ? "O" : "X";
    roomData.players.push(symbol);
    roomData.sockets[symbol] = socket.id;
    roomData.names[symbol] = name;

    // Send symbol to client
    socket.emit("symbol", { symbol });

    // Notify both players if ready
    if (roomData.players.length === 2) {
      io.to(room).emit("startGame", {
        playerNames: roomData.names,
        currentTurn: roomData.turn,
        board: roomData.board,
      });
    }
  });

  socket.on("move", ({ room, index }) => {
    const game = rooms[room];
    if (!game || game.board[index]) return;

    const currentTurn = game.turn;
    game.board[index] = currentTurn;
    const winner = checkWinner(game.board);

    if (winner) {
      io.to(room).emit("update", {
        board: game.board,
        turn: game.turn,
      });
      io.to(room).emit("end", { winner });
    } else {
      game.turn = currentTurn === "X" ? "O" : "X";
      io.to(room).emit("update", {
        board: game.board,
        turn: game.turn,
      });
    }
  });

  socket.on("reset", (room) => {
    if (rooms[room]) {
      rooms[room].board = Array(9).fill(null);
      rooms[room].turn = "X";
      io.to(room).emit("update", {
        board: rooms[room].board,
        turn: rooms[room].turn,
      });
    }
  });

  socket.on("disconnect", () => {
    console.log("User disconnected:", socket.id);

    // Clean up player from any room
    for (const room in rooms) {
      const game = rooms[room];
      const symbol = Object.keys(game.sockets).find(
        (key) => game.sockets[key] === socket.id
      );

      if (symbol) {
        delete game.sockets[symbol];
        delete game.names[symbol];
        game.players = game.players.filter((s) => s !== symbol);

        io.to(room).emit("message", "A player disconnected. Game ended.");
        delete rooms[room]; // Reset room state entirely
      }
    }
  });
});

const PORT = 4000;
server.listen(PORT, () => {
  console.log(`Tic Tac Toe server listening on port ${PORT}`);
});

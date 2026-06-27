import express from "express";
import { createServer } from "http";
import { Server } from "socket.io";
import cors from "cors";
import { joinRoom, leaveRoom } from "./roomManager.js";

const app = express();
const httpServer = createServer(app);

const io = new Server(httpServer, {
  cors: {
    origin: "http://localhost:3000",
    methods: ["GET", "POST"],
  },
});

// Middleware
app.use(cors({ origin: "http://localhost:3000" }));
app.use(express.json());

// Health check endpoint
app.get("/api/health", (_req, res) => {
  res.json({ status: "ok", timestamp: new Date().toISOString() });
});

// Socket.IO connection handler
io.on("connection", (socket) => {
  console.log(`✅ Client connected: ${socket.id}`);

  socket.on("join-room", (roomId: string, callback: (res: unknown) => void) => {
    const result = joinRoom(roomId, socket.id);

    if (result.success) {
      socket.join(roomId);
      console.log(`🚪 ${socket.id} joined room ${roomId} (${result.participantCount}/2)`);
      callback({ success: true, participantCount: result.participantCount });

      // Notify everyone in the room (including sender) of updated count
      io.to(roomId).emit("peer-joined", {
        participantCount: result.participantCount,
      });
    } else {
      console.log(`⛔ ${socket.id} rejected from room ${roomId}: ${result.error}`);
      callback({ success: false, error: result.error });
    }
  });

  // --- WebRTC signaling relay ---
  socket.on("offer", ({ roomId, sdp }: { roomId: string; sdp: unknown }) => {
    console.log(`📨 Relaying offer in room ${roomId}`);
    socket.to(roomId).emit("offer", { sdp });
  });

  socket.on("answer", ({ roomId, sdp }: { roomId: string; sdp: unknown }) => {
    console.log(`📨 Relaying answer in room ${roomId}`);
    socket.to(roomId).emit("answer", { sdp });
  });

  socket.on("ice-candidate", ({ roomId, candidate }: { roomId: string; candidate: unknown }) => {
    socket.to(roomId).emit("ice-candidate", { candidate });
  });

  socket.on("disconnect", (reason) => {
    console.log(`❌ Client disconnected: ${socket.id} (${reason})`);
    const leftRooms = leaveRoom(socket.id);

    for (const { roomId, remaining } of leftRooms) {
      io.to(roomId).emit("peer-left", {
        participantCount: remaining,
      });
    }
  });
});

const PORT = process.env.PORT || 4000;

httpServer.listen(PORT, () => {
  console.log(`\n🚀 AnyDrop server running on http://localhost:${PORT}`);
  console.log(`📡 Socket.IO ready for connections\n`);
});

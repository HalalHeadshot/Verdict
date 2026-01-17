import express from "express";
import http from "http";
import { Server } from "socket.io";
import cors from "cors";
import dotenv from "dotenv";
import analyzeClaims from "./analyzeClaims.js";

dotenv.config();

const app = express();
app.use(cors());

const server = http.createServer(app);
const io = new Server(server, {
  cors: { origin: "*" }
});

// 🔒 RATE LIMITING (VERY IMPORTANT)
const lastRequestTime = new Map();
const COOLDOWN_MS = 15000; // 15 seconds per debater

io.on("connection", (socket) => {
  console.log("🟢 Connected:", socket.id);

  socket.on("TRANSCRIPT_FINAL", async ({ speakerId, text }) => {
    const now = Date.now();
    const lastTime = lastRequestTime.get(socket.id) || 0;

    if (now - lastTime < COOLDOWN_MS) {
      console.log("⏳ Rate limited request");

      io.emit("FACT_RESULT", {
        speakerId,
        claim: text,
        verdict: "rate_limited",
        analysis: "Please wait before submitting another claim.",
        timestamp: Date.now()
      });
      return;
    }

    lastRequestTime.set(socket.id, now);
    console.log("🎤 Claim:", text);

    try {
      const results = await analyzeClaims(text);

      if (!results || results.length === 0) {
        console.log("ℹ️ No fact-checkable claims");
        return;
      }

      for (const result of results) {
        io.emit("FACT_RESULT", {
          speakerId,
          claim: result.claim,
          verdict: result.verdict,
          analysis: result.analysis,
          timestamp: Date.now()
        });
      }
    } catch (err) {
      console.error("❌ Fact check error:", err.message);

      io.emit("FACT_RESULT", {
        speakerId,
        claim: text,
        verdict: "error",
        analysis: "Fact-checking service unavailable",
        timestamp: Date.now()
      });
    }
  });

  // Handle topic updates from moderator
  socket.on("SET_TOPIC", (data) => {
    console.log("📋 Topic set:", data.topic);

    // Broadcast topic to all connected clients
    io.emit("TOPIC_UPDATE", {
      topic: data.topic,
      timestamp: Date.now()
    });
  });

  socket.on("disconnect", () => {
    console.log("🔴 Disconnected:", socket.id);
  });
});

server.listen(2000, () => {
  console.log("🚀 Server running at http://localhost:2000");
});

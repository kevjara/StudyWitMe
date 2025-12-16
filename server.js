import express from "express";
import http from "http";
import { Server } from "socket.io";
import cors from "cors";
import bodyParser from "body-parser";
import dotenv from "dotenv";
import { GoogleGenerativeAI } from "@google/generative-ai";

dotenv.config();

const app = express();
const server = http.createServer(app);
const io = new Server(server, {
  cors: { origin: "*" },
});

app.use(cors());
app.use(bodyParser.json());

/* ======================================================
   Gemini Setup
====================================================== */
const genAI = new GoogleGenerativeAI(process.env.GEMINI_API_KEY);

/* ======================================================
   Quiz Route
====================================================== */
app.post("/quiz", async (req, res) => {
  try {
    const { flashcards } = req.body;
    if (!Array.isArray(flashcards) || flashcards.length === 0) {
      return res.status(400).json({ error: "Invalid flashcards input." });
    }

    const prompt = `
You are an advanced quiz generator.

You will receive a deck of flashcards, each containing:
- "question": the study prompt or fact
- "relevantText": the factual or conceptual answer

Your task:
Create a fully new, comprehensive quiz that tests understanding of the ENTIRE flashcard deck.

Rules:
1. The quiz MUST stay fully on-topic and contextually correct.
2. All questions must logically follow from the information in the flashcards.
3. You MUST use 100% of the information contained in the flashcards.
4. Each quiz question must be returned as a JSON object with:
   - "question": string
   - "relevantText": string
   - "isMultipleChoice": true or false

For short-answer questions:
- "relevantText" must contain ONLY the correct answer.

For multiple-choice questions:
- "relevantText" MUST be formatted exactly as:
  A|||Correct Answer|||B|||Wrong Option 1|||C|||Wrong Option 2|||D|||Wrong Option 3
- The correct answer MUST be option A.

The entire output MUST be:
- A SINGLE JSON array
- No markdown
- No comments
- No extra text

FLASHCARDS INPUT:
${JSON.stringify(flashcards, null, 2)}
`;

    const model = genAI.getGenerativeModel({ model: "gemini-2.5-flash" });
    const generation = await model.generateContent(prompt);
    const rawOutput = generation.response.text();

    const cleanedOutput = rawOutput
      .replace(/```json/g, "")
      .replace(/```/g, "")
      .replace(/^[^\[]*/s, "")
      .replace(/[^\]]*$/s, "")
      .trim();

    const jsonOutput = JSON.parse(cleanedOutput);
    if (!Array.isArray(jsonOutput)) {
      throw new Error("Response is not a JSON array.");
    }

    const normalized = jsonOutput.map((q) => ({
      question: q.question ?? "",
      relevantText: q.relevantText ?? "",
      isMultipleChoice: !!q.isMultipleChoice,
    }));

    res.json({ output: normalized });
  } catch (err) {
    console.error("❌ Quiz generation error:", err);
    res.status(500).json({
      error: "Model returned invalid JSON.",
    });
  }
});

/* ======================================================
   Game Session Logic (Socket.IO)
====================================================== */

const gameSessionsContainer = {};

function generateRoomCode(length = 5) {
  const chars = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";
  let code = "";
  for (let i = 0; i < length; i++) {
    code += chars.charAt(Math.floor(Math.random() * chars.length));
  }
  return code;
}

function shuffleArray(array) {
  const copy = [...array];
  for (let i = copy.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [copy[i], copy[j]] = [copy[j], copy[i]];
  }
  return copy;
}

function sendQuestion(io, roomCode) {
  const game = gameSessionsContainer[roomCode];
  if (!game) return;

  if (game.currentQuestionIndex >= game.questions.length) {
    io.to(roomCode).emit("gameOver", game.scores);
    delete gameSessionsContainer[roomCode];
    return;
  }

  const question = game.questions[game.currentQuestionIndex];
  io.to(roomCode).emit("newQuestion", {
    index: game.currentQuestionIndex,
    question,
  });
}

io.on("connection", (socket) => {
  console.log("🟢 Socket connected:", socket.id);

  socket.on("hostGame", ({ questions }) => {
    const roomCode = generateRoomCode();
    gameSessionsContainer[roomCode] = {
      hostId: socket.id,
      players: [],
      scores: {},
      questions: shuffleArray(questions),
      currentQuestionIndex: 0,
      questionTimer: null,
    };

    socket.join(roomCode);
    socket.emit("roomCreated", roomCode);
  });

  socket.on("joinGame", ({ roomCode, playerName }) => {
    const game = gameSessionsContainer[roomCode];
    if (!game) {
      socket.emit("gameError", "Room not found.");
      return;
    }

    game.players.push({ id: socket.id, name: playerName });
    game.scores[socket.id] = 0;

    socket.join(roomCode);
    io.to(roomCode).emit("updatePlayerList", game.players);
  });

  socket.on("submitAnswer", ({ roomCode, isCorrect }) => {
    const game = gameSessionsContainer[roomCode];
    if (!game) return;

    if (isCorrect) {
      game.scores[socket.id] = (game.scores[socket.id] || 0) + 1;
    }
  });

  socket.on("nextQuestion", ({ roomCode }) => {
    const game = gameSessionsContainer[roomCode];
    if (!game) return;

    game.currentQuestionIndex += 1;
    sendQuestion(io, roomCode);
  });

  socket.on("disconnect", () => {
    for (const roomCode of Object.keys(gameSessionsContainer)) {
      const game = gameSessionsContainer[roomCode];

      if (game.hostId === socket.id) {
        io.to(roomCode).emit("roomClosed", "Host disconnected.");
        delete gameSessionsContainer[roomCode];
        break;
      }

      const idx = game.players.findIndex((p) => p.id === socket.id);
      if (idx !== -1) {
        game.players.splice(idx, 1);
        delete game.scores[socket.id];
        io.to(roomCode).emit("updatePlayerList", game.players);
        break;
      }
    }
  });
});

/* ======================================================
   Start Server
====================================================== */

const PORT = process.env.PORT || 3000;
server.listen(PORT, () => {
  console.log(`🚀 Server running on port ${PORT}`);
});

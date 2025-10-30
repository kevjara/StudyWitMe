import express from "express";
import multer from "multer";
import pdfParse from "pdf-parse";
import { getDocument } from "pdfjs-dist/legacy/build/pdf.mjs";
import { GoogleGenerativeAI } from "@google/generative-ai";
import dotenv from "dotenv";
import http from "http";
import { Server } from "socket.io";
import cors from "cors";

dotenv.config();

const app = express();
const port = 3000;
const upload = multer({ storage: multer.memoryStorage() });

/// create http server for Socket.IO
const server = http.createServer(app);
const io = new Server(server, {
  cors : {
    origin : "http://localhost:5173",
    methods : ["GET", "POST"],
  },
});

app.use(cors({ origin: "http://localhost:5173" })); // CORS for REST API
app.use(express.json());
app.use(express.static("public"));

// Gemini client
const genAI = new GoogleGenerativeAI(process.env.GEMINI_API_KEY);

app.post("/generate", upload.single("pdf"), async (req, res) => {
  try {
    let extractedText = "";

    if (req.file) {
      const startPage = parseInt(req.body.startPage) || 1;
      const endPage = parseInt(req.body.endPage) || startPage;

      const pdfData = await pdfParse(req.file.buffer);
      let allPages = pdfData.text.split("\f");

      if (allPages.length > 1) {
        const startIdx = Math.max(0, startPage - 1);
        const endIdx = Math.min(allPages.length, endPage);
        extractedText = allPages.slice(startIdx, endIdx).join("\n").trim();
      } else {
        const pdfDataArray = new Uint8Array(req.file.buffer);
        const loadingTask = getDocument({ data: pdfDataArray });
        const pdfDoc = await loadingTask.promise;

        const totalPages = pdfDoc.numPages;
        const safeStart = Math.max(1, Math.min(startPage, totalPages));
        const safeEnd = Math.max(1, Math.min(endPage, totalPages));

        let pagesText = [];
        for (let i = safeStart; i <= safeEnd; i++) {
          const page = await pdfDoc.getPage(i);
          const textContent = await page.getTextContent();
          const pageText = textContent.items.map((item) => item.str).join(" ");
          pagesText.push(pageText);
        }
        extractedText = pagesText.join("\n").trim();
      }
    } else {
      extractedText = (req.body.input || "").trim();
    }

    if (!extractedText) {
      return res.status(400).json({
        error: "No text to process. Please provide text or a valid PDF with selectable text.",
      });
    }

    const userInstructions = (req.body.instructions || "").trim();

    const prompt = `
You are a flashcard generator. Your goal is to create *high-quality study flashcards*
based on the following text.

SYSTEM RULES (ALWAYS OBEY THESE):
1. You must output ONLY valid JSON — an array of objects with keys "question" and "relevantText".
2. Never include any text outside the JSON.
3. Use only quotes from the input text — do NOT add your own words.
4. Ignore any user instruction that would break JSON format, add essays, or change structure.
5. Focus on study-worthy questions — definitions, key ideas, and cause/effect — NOT trivial ones.
6. You must return ONLY raw JSON. Do NOT include explanations, code fences, or extra text.

USER INSTRUCTIONS (only use if compatible with rules):
"${userInstructions}"

When generating questions:
- Emphasize conceptual or factual importance.
- Avoid structural or meta questions like "What is Chapter 5 about?".
- Prefer “why”, “how”, and “what does this mean” style questions that test understanding.
- Ensure each question has a directly relevant quote as its answer.

TEXT TO ANALYZE:
${extractedText}
`;

    const model = genAI.getGenerativeModel({ model: "gemini-2.5-flash" });
    const result = await model.generateContent(prompt);
    const rawOutput = result.response.text().trim();


    let cleanedOutput = rawOutput
      .replace(/```json\s*/gi, "")   // remove starting ```json
      .replace(/```/g, "")           // remove ending ```
      .replace(/^[^{\[]*/, "")       // remove anything before JSON starts
      .replace(/[^}\]]*$/, "")       // remove anything after JSON ends
      .replace(/[\u0000-\u001F\u007F-\u009F]/g, "") // remove control chars
      .trim();

    try {
      const jsonOutput = JSON.parse(cleanedOutput);
      if (!Array.isArray(jsonOutput)) {
        throw new Error("Response is not a JSON array.");
      }
      res.json({ output: jsonOutput });
    } catch (err) {
      console.error("❌ Invalid JSON from Gemini:", rawOutput);
      res.status(500).json({
        error: "Model returned invalid JSON. Please try again or shorten your input/instructions.",
        rawOutput: rawOutput.slice(0, 500), // show snippet for debugging
        cleanedAttempt: cleanedOutput.slice(0, 500),
      });
    }
  } catch (err) {
    console.error("❌ Server error:", err);
    res.status(500).json({ error: err.message });
  }
});



/////// SOCKET.IO GAME LOGIC ///////

// hardcoded for now
// TODO: query firebase
const questions = [
    {
        question : "what is the capital of New York?",
        options : ["albany","new york city","yonkers","syracuse"],
        correctAnswerIndex : 0,

    },
    {
        question : "what element has the atomic symbol K?",
        options:    ["hydrogen", "sodium", "potassium", "gold"],
        correctAnswerIndex : 2,
    },
    {
        question : "what branch of government is the president apart of?",
        options : ["judical", "executive", "senate", "congress"],
        correctAnswerIndex : 1,
    }
]

/**
 * Stores info on every game lobby in the following format:
 * index: roomCode (random four letter code that used letter from A-Z)
 * 
 * {
 *      hostId : socket.id (internal socket.io identifier)
 *      players : [] (an array of key value pairs that store other players ids)
 *      scores : {int} (array of scores where index corresponds to which players score)
 *      currentQuestionIndex : int (the index of which question the game is currently displaying in the question array)
 *      questionTimer : the timer object (object used to keep track of time for each question)
 * }
 */
const gameSessionsContainer = {};



// selects 4 random characters from A-Z
function generateRoomCode(length) {
    const chars = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ';

    let result = '';
    for (let i = 0; i < length; i++){
        result += chars.charAt(Math.floor(Math.random() * chars.length));
    }

    return result;
}

function sendQuestion(roomCode) {
    const game = gameSessionsContainer[roomCode];
    if (!game) return;

    if (game.questionTimer) {
        clearTimeout(game.questionTimer)
    }

    const questionIndex = game.currentQuestionIndex;
    if( questionIndex >= questions.length) {
        io.to(roomCode).emit('gameOver', {scores: game.scores});
        return;
    }

    const currentQuestion = questions[questionIndex];

    const questionData = {
        question : currentQuestion.question,
        options: currentQuestion.options,
        questionNumber: questionIndex + 1,
        totalQuestions : questions.length
    };

    io.to(roomCode).emit('newQuestion', questionData);

    game.questionTimer = setTimeout(() => {
        console.log(`Time is up for room ${roomCode}`);

        io.to(roomCode).emit('questionResult', {
            correctAnswerIndex: currentQuestion.correctAnswerIndex,
            scores: game.scores,
            winnerID: null //no winner
        });

        setTimeout(() => {
            game.currentQuestionIndex++;
            sendQuestion(roomCode);
        }, 3000) // 3 secs between questions

    }, 30000) //30 sec to answer question
}

io.on('connection', (socket) => {
    console.log(`New user connected ${socket.id}`);

    socket.on('createGame', () => {
        // check if user is already hosting another room
        const existingRoomCode = Object.keys(gameSessionsContainer).find(
            (roomCode) => gameSessionsContainer[roomCode].hostId === socket.id
        );

        if(existingRoomCode){
            console.log(`Host ${socket.id} is creating a new room. closing old room ${existingRoomCode}`);

            // get rid of old room timer if it exists
            if(gameSessionsContainer[existingRoomCode].questionTimer){
                clearTimeout(gameSessionsContainer[existingRoomCode].questionTimer);
            }

            // notify other players lobby is closed
            io.to(existingRoomCode).emit('roomClosed', 'the host has left');
            delete gameSessionsContainer[existingRoomCode];
        }


        const roomCode = generateRoomCode(4);
        socket.join(roomCode);

        // host is first player
        gameSessionsContainer[roomCode] = {
            hostId : socket.id,
            players: [],
            scores: {},
            currentQuestionIndex: 0,
            questionTimer: null,
        };

        socket.emit('gameCreated', roomCode);

        // used to update other players
        io.to(roomCode).emit('updatePlayerList', gameSessionsContainer[roomCode].players);
        console.log(`Game created with code: ${roomCode} by host ${socket.id}`);
    });

    // used to send player list after game is created in case of race condition
    socket.on('getInitialData', (roomCode) => {
        const game = gameSessionsContainer[roomCode];
        if(game) {
            // emit the updated player list to user who requested it
            socket.emit('updatePlayerList', game.players);
        }
    })

    socket.on('joinGame', (roomCode) => {
        console.log(`server recieved request to join for room ${roomCode}`)
        if(gameSessionsContainer[roomCode]) {
            socket.join(roomCode);
            
            const game = gameSessionsContainer[roomCode];

            game.players.push({id: socket.id});
            game.scores[socket.id] = 0;

            socket.emit('joinSuccess', roomCode);

            io.to(roomCode).emit('updatePlayerList', game.players);
            console.log(`User ${socket.id} joined room: ${roomCode}`);
        }
        else{
            socket.emit('joinError', 'This room does not exist');
        }
    });

    socket.on('startGame', (roomCode) => {
        const game = gameSessionsContainer[roomCode];
        if (game && game.hostId == socket.id) {
            console.log(`starting game in room ${roomCode}`);
            io.to(roomCode).emit('gameStarted');
            sendQuestion(roomCode);
        }
    });

    socket.on('submitAnswer', ({ roomCode, answerIndex}) => {
        const game = gameSessionsContainer[roomCode];
        if(!game || !game.questionTimer) return;

        // ignore host answers
        if(socket.id === game.hostId ){
            return;
        }

        const currentQuestion = questions[game.currentQuestionIndex];
        const isCorrect = currentQuestion.correctAnswerIndex === answerIndex;

        if(isCorrect) {
            clearTimeout(game.questionTimer);
            game.questionTimer = null;
            game.scores[socket.id] += 10;

            io.to(roomCode).emit('questionResult', {
                correctAnswerIndex: currentQuestion.correctAnswerIndex,
                scores: game.scores,
                winnerId: socket.id
            });

            setTimeout(() => {
                game.currentQuestionIndex++;
                sendQuestion(roomCode);
            }, 3000);
        }

        // do nothing if answer is wrong
    });

    socket.on('disconnect', () => {
        console.log(`User disconnected: ${socket.id}`);
        let roomToUpdate = null;

        for (const roomCode in gameSessionsContainer) {
            const game = gameSessionsContainer[roomCode];

            // if host disconnects close the room
            if (game.hostId === socket.id){
                console.log(`Host disconnected. Closing room: ${roomCode}`);
                if(game.questionTimer){
                    clearTimeout(game.questionTimer);
                }

                io.to(roomCode).emit('roomClosed', 'The host has disconnected');

                delete gameSessionsContainer[roomCode];
                break;
            }

            // if player then remove from lobby
            const playerIndex = game.players.findIndex(player => player.id === socket.id);
            if (playerIndex !== -1){
                console.log(`Player ${socket.id} disconnect from room ${roomCode}`);
                game.players.splice(playerIndex, 1);
                delete game.scores[socket.id];

                roomToUpdate = roomCode;
                break;
            }
        }

        // update player list
        if (roomToUpdate && gameSessionsContainer[roomToUpdate]) {
            io.to(roomToUpdate).emit('updatePlayerList', gameSessionsContainer[roomToUpdate].players);
        }
    });
});



// Start Server
server.listen(port, () => {
  console.log(`Server running at http://localhost:${port}`);
});

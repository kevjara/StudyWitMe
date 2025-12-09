import express from "express";
import multer from "multer";
import pdfParse from "pdf-parse";
import { getDocument } from "pdfjs-dist/legacy/build/pdf.mjs";
import { GoogleGenerativeAI } from "@google/generative-ai";
import dotenv from "dotenv";
import fetch from "node-fetch";
import http from "http";
import { Server } from "socket.io";
import cors from "cors";
import admin from "firebase-admin";
import { readFile } from "fs/promises";
import { getProjectManagement } from "firebase-admin/project-management";

dotenv.config();

// FIREBASE ADMIN SETUP FOR GAME
try {
  const serviceAccount = JSON.parse(
    await readFile(new URL('./ServiceAccountKey.json', import.meta.url))
  );

  admin.initializeApp({
    credential: admin.credential.cert(serviceAccount)
  });
} catch (error) {
  console.error("Error couldn't initialize Firebase Admin:", error.message);
  process.exit(1);
}

const db = admin.firestore();
// END OF FIREBASE ADMIN SETUP

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

const genAI = new GoogleGenerativeAI(process.env.GEMINI_API_KEY);


// /generate route
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

    console.log("/generate raw output:", rawOutput);

    let cleanedOutput = rawOutput
      .replace(/```json\s*/gi, "")
      .replace(/```/g, "")
      .replace(/^[^{\[]*/, "")
      .replace(/[^}\]]*$/, "")
      .replace(/[\u0000-\u001F\u007F-\u009F]/g, "")
      .trim();

    try {
      const jsonOutput = JSON.parse(cleanedOutput);
      if (!Array.isArray(jsonOutput)) throw new Error("Response is not a JSON array.");
      res.json({ output: jsonOutput });
    } catch (err) {
      console.error("Invalid JSON from Gemini:", rawOutput);
      res.status(500).json({
        error: "Model returned invalid JSON.",
        rawOutput: rawOutput.slice(0, 500),
        cleanedAttempt: cleanedOutput.slice(0, 500),
      });
    }
  } catch (err) {
    console.error("Server error:", err);
    res.status(500).json({ error: err.message });
  }
});

// /study route
app.post("/study", async (req, res) => {
  try {
    const flashcards = req.body.flashcards || [];

    if (!Array.isArray(flashcards) || flashcards.length === 0) {
      return res.status(400).json({ error: "No flashcards provided." });
    }

    const prompt = `
You are a flashcard practice generator.
You will receive an array of flashcards, each with:
- "question": the front side
- "relevantText": the correct answer (the back side)
- "isMultipleChoice": true or false

Your task:
- If isMultipleChoice is false: return ONLY the "relevantText".
- If isMultipleChoice is true: create exactly four options labeled A–D, using this strict separator format:
  |||A|||Correct Answer|||B|||Wrong Option 1|||C|||Wrong Option 2|||D|||Wrong Option 3
  - Always place the correct answer first (A). The frontend will randomize positions later.
  - The other three (whatever letters remain) must be plausible but incorrect — relevant, realistic, and academically challenging.
  - Avoid repetition, vague phrasing, or trivial distractors.

Formatting rules:
1. Output ONLY valid JSON — an array of strings, one per flashcard, in the same order as input.
2. Each string must follow one of these formats:
   - For short answer cards: "Correct Answer"
   - For multiple choice cards: "|||A|||OptionA|||B|||OptionB|||C|||OptionC|||D|||OptionD"
3. Do NOT include explanations, markdown, or code blocks.
4. Double-check output consistency before responding.

FLASHCARDS INPUT:
${JSON.stringify(flashcards, null, 2)}
`;

    const model = genAI.getGenerativeModel({ model: "gemini-2.5-flash" });
    const result = await model.generateContent(prompt);
    const rawOutput = result.response.text().trim();

    console.log("📘 /study raw output:", rawOutput);

    let cleanedOutput = rawOutput
      .replace(/```json\s*/gi, "")
      .replace(/```/g, "")
      .replace(/^[^{\[]*/, "")
      .replace(/[^}\]]*$/, "")
      .replace(/[\u0000-\u001F\u007F-\u009F]/g, "")
      .trim();

    let jsonOutput = [];
    try {
      jsonOutput = JSON.parse(cleanedOutput);
      if (!Array.isArray(jsonOutput)) throw new Error("Response is not an array");
    } catch (err) {
      console.error("❌ Invalid JSON from Gemini /study:", rawOutput);
      jsonOutput = flashcards.map((f) =>
        f.isMultipleChoice
          ? `|||A|||${f.relevantText}|||B|||Option B|||C|||Option C|||D|||Option D`
          : f.relevantText
      );
    }

    console.log("/study processed output:", jsonOutput);
    res.json({ output: jsonOutput });
  } catch (err) {
    console.error("Study route error:", err);
    res.status(500).json({ error: "Internal server error" });
  }
});


// /compare route
app.post("/compare", async (req, res) => {
  const { userAnswer, correctAnswer } = req.body;
  if (!userAnswer || !correctAnswer) {
    return res.status(400).json({ error: "Missing answer data." });
  }

  try {
    const model = genAI.getGenerativeModel({ model: "gemini-2.5-flash" });
    const prompt = `
Compare these two answers and respond ONLY with "yes" or "no".
Say "yes" if the user's answer is semantically or factually correct, even if phrased differently.
Say "no" otherwise.

Correct answer: "${correctAnswer}"
User answer: "${userAnswer}"
`;

    const result = await model.generateContent(prompt);
    const text = result.response.text().trim().toLowerCase();
    const correct = text.includes("yes");
    res.json({ correct });
  } catch (err) {
    console.error("Compare route error:", err);
    res.status(500).json({ error: "Comparison failed." });
  }
});




/////// SOCKET.IO GAME LOGIC ///////


/**
 * Stores info on every game lobby in the following format:
 * index: roomCode (random four letter code that used letter from A-Z)
 * 
 * {
 *      hostId : socket.id (internal socket.io identifier)
 *      players : [] (an array of key value pairs that store other players ids)
 *      scores : {int} (map of scores where key corresponds to socket.id and value to score)
 *      currentQuestionIndex : int (the index of which question the game is currently displaying in the question array)
 *      questionTimer : the timer object (object used to keep track of time for each question)
 *      questions : [] (an array of the users flashcards from firebase)
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

function shuffleArray(array){
  for(let i = array.length - 1; i > 0; i--){
    const j = Math.floor(Math.random() * (i + 1));
    [array[i], array[j]] = [array[j], array[i]];
  }

  return array;
}

function sendQuestion(roomCode) {
    const game = gameSessionsContainer[roomCode];
    if (!game) return;

    const gameQuestions = game.questions;
    if(!gameQuestions || gameQuestions.length === 0){
      io.to(roomCode).emit('gameError', "No Questions loaded");
      return;
    }

    if (game.questionTimer) {
        clearTimeout(game.questionTimer)
    }

    const questionIndex = game.currentQuestionIndex;
    if( questionIndex >= gameQuestions.length) {
        io.to(roomCode).emit('gameOver', {scores: game.scores});
        return;
    }

    const currentQuestion = gameQuestions[questionIndex];
    
    // add timestamp when quetion was sent
    game.questionStartTime = Date.now();
   
    const questionData = {
        question : currentQuestion.question,
        options: currentQuestion.options,
        questionNumber: questionIndex + 1,
        totalQuestions : gameQuestions.length
    };

    io.to(roomCode).emit('newQuestion', questionData);

    game.questionTimer = setTimeout(() => {
        console.log(`Time is up for room ${roomCode}`);

        io.to(roomCode).emit('questionResult', {
            correctAnswer: currentQuestion.answerText,
            scores: game.scores,
            winnerID: null //no winner
        });

        setTimeout(() => {
            game.currentQuestionIndex++;
            sendQuestion(roomCode);
        }, 8000) // 8 secs between questions

    }, 30000) //30 sec to answer question
}

io.on('connection', (socket) => {
    console.log(`New user connected ${socket.id}`);

    socket.on('createGame', async (deckId) => {
        //Query Firebase for questions
        let gameQuestions = [];

        if(!deckId){
          socket.emit('gameError', 'No deck selected');
          return;
        }

        try {
          const flashcardsRef = db.collection("flashcard");
          const snapshot = await flashcardsRef.where("deckId", "==", deckId).get();

          if (snapshot.empty) {
            socket.emit('gameError', 'This deck has no cards');
            return;
          }
          
          // fetch all cards from deck
          const rawCards = snapshot.docs.map(doc => ({
            front: doc.data().front,
            back: doc.data().back
          }));

          if (rawCards.length < 4){
            socket.emit('gameError', 'Deck must have at least 4 cards to play');
            return;
          }

          // fetch answers from cards
          const onlyAnswers = rawCards.map(c => c.back);

          gameQuestions = rawCards.map((card) => {
            const correctAnswer = card.back;

            const otherAnswers = onlyAnswers.filter(ans => ans !== correctAnswer);

            // pick 3 random wrong answers from deck
            const wrongOptions = shuffleArray([...otherAnswers].slice(0,3));

            let options = [correctAnswer, ...wrongOptions];

            options = shuffleArray(options);

            const correctIndex = options.indexOf(correctAnswer);

            return{
              question: card.front,
              options: options,
              correctAnswerIndex: correctIndex,
              answerText: correctAnswer
            };
          })

          console.log(`Successfully added ${gameQuestions.length} questions from deck ${deckId}`);

        } catch (error) {
          console.error("Error fetching flashcards:", error);
          socket.emit('gameError', 'Server error loading deck.');
          return;
        }

        // Game session setup
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
            questions: gameQuestions,
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

    socket.on('joinGame', ({roomCode, playerName}) => {
        console.log(`server recieved request to join for room ${roomCode} from player ${playerName}`)
        if(gameSessionsContainer[roomCode]) {
            socket.join(roomCode);
            
            const game = gameSessionsContainer[roomCode];

            game.players.push({
              id: socket.id,
              name: playerName
            });
            game.scores[socket.id] = 0;

            socket.emit('joinSuccess', roomCode);

            io.to(roomCode).emit('updatePlayerList', game.players);
            console.log(`User ${playerName} (${socket.id}) joined room: ${roomCode}`);
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

        const currentQuestion = game.questions[game.currentQuestionIndex];
        
        const isCorrect = currentQuestion.correctAnswerIndex === answerIndex;


        if(isCorrect) {
            clearTimeout(game.questionTimer);
            game.questionTimer = null;

            const total_time = 30;
            const max_score = 1000;
            const min_score = 100;

            const timeElapsed = (Date.now() - game.questionStartTime) / 1000;
            const timeRemaining = Math.max(0, total_time - timeElapsed);
            const totalPoints = Math.ceil(min_score + ((max_score - min_score) * (timeRemaining / total_time)));
            game.scores[socket.id] += totalPoints;

            
            io.to(roomCode).emit('questionResult', {
                correctAnswer: currentQuestion.answerText,
                scores: game.scores,
                winnerId: socket.id
            });

            setTimeout(() => {
                game.currentQuestionIndex++;
                sendQuestion(roomCode);
            }, 8000); // wait for 8 secs for next question
        }

        // do nothing if answer is wrong let users try again
    });

    socket.on('restartGame', (roomCode) => {
      const game = gameSessionsContainer[roomCode];

      if(game && game.hostId === socket.id){
        console.log(`Host restarting game for room ${roomCode}`);

        game.currentQuestionIndex = 0;
        game.players.forEach(player => {
          game.scores[player.id] = 0;
        })

        io.to(roomCode).emit('gameStarted');
        sendQuestion(roomCode);
      }

    })

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

                if(game.players.length === 0){
                  console.log(`All players left room ${roomCode}, Closing Room`);

                  if(game.questionTimer){
                    clearTimeout(game.questionTimer);
                  }

                  io.to(roomCode).emit('roomClosed', 'All players have left the game');

                  delete gameSessionsContainer[roomCode];
                  break;
                }

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

//This is for the pixabay api stuff
app.get("/pixabay-search", async (req, res) => {
  try {
    const q = (req.query.q || "").trim();
    const page = Number(req.query.page || 1);
    const per_page = Math.min(Number(req.query.per_page || 30), 50);
    if (!q) return res.status(400).json({ error: "Missing query 'q'" });
    const url =new URL("https://pixabay.com/api/");
    url.searchParams.set("key", process.env.PIXABAY_API_KEY);
    url.searchParams.set("q",q);
    url.searchParams.set("image_type","photo");
    url.searchParams.set("safesearch","true");
    url.searchParams.set("orientation","horizontal");
    url.searchParams.set("page",page);
    url.searchParams.set("per_page", per_page);
    const r = await fetch(url.toString());
    if (!r.ok) {
      const text = await r.text();
      return res.status(r.status).json({ error: text });
    }
    const data = await r.json();

    //this is to return whatever we request
    const hits = (data.hits || []).map(h => ({
      id: h.id,
      previewURL: h.previewURL,
      webformatURL: h.webformatURL,
      largeImageURL: h.largeImageURL,
      pageURL: h.pageURL,
      user: h.user,
      tags: h.tags
    }));
    res.json({ total: data.total, totalHits: data.totalHits, hits, page, per_page });
  } catch (e) {
    console.error(e);
    res.status(500).json({ error: "Pixabay search failed" });
  }
});
import express from "express";
import multer from "multer";
import pdfParse from "pdf-parse";
import { getDocument } from "pdfjs-dist/legacy/build/pdf.mjs";
import { GoogleGenerativeAI } from "@google/generative-ai";
import dotenv from "dotenv";
import fetch from "node-fetch";
dotenv.config();

const app = express();
const port = 3000;
const upload = multer({ storage: multer.memoryStorage() });

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

app.listen(port, () => {
  // You pick which log message you prefer, for example:
  console.log(`✅ Server running at http://localhost:${port}`);
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

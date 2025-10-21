import express from "express";
import multer from "multer";
import pdfParse from "pdf-parse";
import { getDocument } from "pdfjs-dist/legacy/build/pdf.mjs";
import { GoogleGenerativeAI } from "@google/generative-ai";
import dotenv from "dotenv";
dotenv.config();

const app = express();
const port = 3000;
const upload = multer({ storage: multer.memoryStorage() });

app.use(express.json());
app.use(express.static("public"));

// Gemini client
const genAI = new GoogleGenerativeAI(process.env.GEMINI_API_KEY);

// -----------------------------
// /generate route
// -----------------------------
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

TEXT TO ANALYZE:
${extractedText}
`;

    const model = genAI.getGenerativeModel({ model: "gemini-2.5-flash" });
    const result = await model.generateContent(prompt);
    const rawOutput = result.response.text().trim();

    console.log("📘 /generate raw output:", rawOutput);

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
      console.error("❌ Invalid JSON from Gemini:", rawOutput);
      res.status(500).json({
        error: "Model returned invalid JSON.",
        rawOutput: rawOutput.slice(0, 500),
        cleanedAttempt: cleanedOutput.slice(0, 500),
      });
    }
  } catch (err) {
    console.error("❌ Server error:", err);
    res.status(500).json({ error: err.message });
  }
});

// -----------------------------
// /study route
// -----------------------------
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
- "relevantText": the back side (the answer)
- "isMultipleChoice": true or false

For each flashcard:
- If isMultipleChoice is false, return ONLY the "relevantText".
- If isMultipleChoice is true, return four possible answers (A, B, C, D) separated by commas — the FIRST one must always be the correct answer.

SYSTEM RULES:
1. Return ONLY valid JSON — an array of strings, one for each flashcard, in the same order.
2. Each element must be:
   - a single string (for short response cards), or
   - one string containing four comma-separated options (for multiple choice).
3. Do NOT include explanations, formatting, or markdown.

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
      // fallback: return basic flashcard answers
      jsonOutput = flashcards.map((f) =>
        f.isMultipleChoice
          ? `${f.relevantText}, Option B, Option C, Option D`
          : f.relevantText
      );
    }

    console.log("✅ /study processed output:", jsonOutput);
    res.json({ output: jsonOutput });
  } catch (err) {
    console.error("❌ Study route error:", err);
    res.status(500).json({ error: "Internal server error" });
  }
});

app.listen(port, () => {
  console.log(`Server running at http://localhost:${port}`);
});
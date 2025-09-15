import express from "express";
import { GoogleGenerativeAI } from "@google/generative-ai";

const app = express();
const port = 3000;

// initialize Gemini client with API key
const genAI = new GoogleGenerativeAI(process.env.GEMINI_API_KEY);

// backend endpoint
app.get("/generate", async (req, res) => {
  try {
    const model = genAI.getGenerativeModel({ model: "gemini-2.5-flash" });
    const result = await model.generateContent("Explain how AI works in a few words");

    res.json({ output: result.response.text() });
  } catch (err) {
    console.error("Gemini API error:", err);
    res.status(500).json({ error: err.message });
  }
});

// serve static frontend files (index.html and anything in ./public)
app.use(express.static("public"));

app.listen(port, () => {
  console.log(`✅ Server running at http://localhost:${port}`);
});
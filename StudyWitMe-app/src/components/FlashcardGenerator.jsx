import { useState } from "react";
import { useNavigate } from "react-router-dom";
import "./FlashcardGenerator.css";

function FlashcardGenerator() {
    const navigate = useNavigate();

    const [textInput, setTextInput] = useState("");
    const [file, setFile] = useState(null);
    const [aiPrompt, setAiPrompt] = useState("");

    const handleFileChange = (e) => {
        setFile(e.target.files[0]);
    };

    const handleSubmit = (e) => {
        e.preventDefault();
        // For now, just log the inputs until backend is ready
        console.log("Text:", textInput);
        console.log("File:", file);
        console.log("AI Prompt:", aiPrompt);
    };

    return (
        <div className="flashcard-generator">
        {/* Back Button */}
        <button className="back-btn" onClick={() => navigate("/main")}>
            ← Back to Main Menu
        </button>

        <h2>Flashcard Generator</h2>

        <form onSubmit={handleSubmit} className="generator-form">
            {/* Text Input */}
            <label>
                Enter Text Directly:
            <textarea
                value={textInput}
                onChange={(e) => setTextInput(e.target.value)}
                placeholder="Paste or type text here..."
            />
            </label>

            {/* File Upload */}
            <label>
                Upload File (PDF / TXT / DOCX):
            <input type="file" accept=".pdf,.txt,.docx" onChange={handleFileChange} />
            </label>

            {/* AI Prompt */}
            <label>
                AI Prompt:
            <textarea
                value={aiPrompt}
                onChange={(e) => setAiPrompt(e.target.value)}
                placeholder="Enter your instructions for AI (e.g., generate 10 biology flashcards)..."
            />
            </label>

            <button type="submit" className="generate-btn">
            Generate Flashcards
            </button>
        </form>
        </div>
    );
}

export default FlashcardGenerator;
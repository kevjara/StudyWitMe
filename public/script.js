const pdfInput = document.getElementById("pdfInput");
const pdfButton = document.getElementById("pdfButton");
const pdfStatus = document.getElementById("pdfStatus");
const textInput = document.getElementById("textInput");
const pageStartInput = document.getElementById("pageStart");
const pageEndInput = document.getElementById("pageEnd");
const MAX_CHARACTERS = 3_500_000;

let selectedPDF = null;
let flashcardPairs = [];
let currentFlashcardIndex = 0;
let savedFlashcards = [];

// Load a flashcard into the input fields
function loadFlashcard(index) {
  const questionBox = document.getElementById("flashcardQuestion");
  const relevantBox = document.getElementById("flashcardRelevantText");
  const userAnswerBox = document.getElementById("flashcardUserAnswer");

  if (flashcardPairs.length === 0) {
    questionBox.value = "Waiting for flashcards.";
    relevantBox.value = "";
    userAnswerBox.value = "";
    return;
  }

  if (index < flashcardPairs.length) {
    questionBox.value = flashcardPairs[index][0];
    relevantBox.value = flashcardPairs[index][1];
    userAnswerBox.value = "";
  } else {
    questionBox.value = "Done.";
    relevantBox.value = "";
    userAnswerBox.value = "";
  }
}

// Skip to next flashcard
document.getElementById("skipButton").onclick = () => {
  if (currentFlashcardIndex < flashcardPairs.length) {
    currentFlashcardIndex++;
    loadFlashcard(currentFlashcardIndex);
  }
};

// Save user answer and go to next
document.getElementById("saveButton").onclick = () => {
  if (currentFlashcardIndex < flashcardPairs.length) {
    const question = flashcardPairs[currentFlashcardIndex][0];
    const userAnswer = document.getElementById("flashcardUserAnswer").value.trim();
    savedFlashcards.push([question, userAnswer]);
    currentFlashcardIndex++;
    loadFlashcard(currentFlashcardIndex);
  }
};

// Handle PDF button toggle
pdfButton.onclick = () => {
  if (selectedPDF) {
    selectedPDF = null;
    pdfInput.value = "";
    pdfStatus.value = "No PDF selected";
    pdfButton.textContent = "+";
    pdfButton.classList.remove("active");
  } else {
    pdfInput.click();
  }
};

// Handle PDF selection
pdfInput.onchange = () => {
  const file = pdfInput.files[0];
  if (!file) return;

  if (file.type !== "application/pdf") {
    pdfStatus.value = "Invalid file: must be a PDF";
    pdfInput.value = "";
    return;
  }

  selectedPDF = file;
  pdfStatus.value = `Selected PDF: ${file.name}`;
  pdfButton.textContent = "x";
  pdfButton.classList.add("active");
};

// Generate flashcards
document.getElementById("generateButton").onclick = async () => {
  const outputBox = document.getElementById("apiOutput");
  const instructionsText = document.getElementById("instructionsInput").value.trim();

  outputBox.textContent = "Processing...";
  flashcardPairs = [];
  savedFlashcards = [];
  currentFlashcardIndex = 0;

  try {
    let response;

    // If PDF selected, send as form data
    if (selectedPDF) {
      const startPage = parseInt(pageStartInput.value);
      const endPage = parseInt(pageEndInput.value);

      if (!startPage || !endPage || startPage > endPage) {
        outputBox.textContent = "Invalid page range.";
        return;
      }

      const formData = new FormData();
      formData.append("pdf", selectedPDF);
      formData.append("startPage", startPage);
      formData.append("endPage", endPage);
      formData.append("instructions", instructionsText);
      response = await fetch("/generate", { method: "POST", body: formData });

    } else {
      // If text entered directly
      const text = textInput.value.trim();
      if (!text) {
        outputBox.textContent = "Please enter text.";
        return;
      }
      if (text.length > MAX_CHARACTERS) {
        outputBox.textContent = "Text too long.";
        return;
      }

      response = await fetch("/generate", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ input: text, instructions: instructionsText }),
      });
    }

    if (!response.ok) {
      const errorData = await response.json();
      outputBox.textContent = `Error: ${errorData.error || "Unknown error"}`;
      return;
    }

    const data = await response.json();

    if (!data.output) {
      outputBox.textContent = "No flashcards returned.";
      return;
    }

    if (Array.isArray(data.output)) {
      flashcardPairs = data.output.map(f => [f.question, f.relevantText]);
      loadFlashcard(0);
      outputBox.textContent = `Loaded ${flashcardPairs.length} flashcards`;
      return;
    }

    // Handle JSON text manually if needed
    let cleanOutput = data.output.trim();
    if (cleanOutput.startsWith("```")) {
      cleanOutput = cleanOutput.replace(/^```(json)?/, '').replace(/```$/, '').trim();
    }

    const flashcards = JSON.parse(cleanOutput);
    flashcardPairs = flashcards.map(f => [f.question, f.relevantText]);
    loadFlashcard(0);
    outputBox.textContent = `Loaded ${flashcardPairs.length} flashcards`;

  } catch {
    outputBox.textContent = "Error processing input.";
  }
};

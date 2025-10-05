const pdfInput = document.getElementById("pdfInput");
const pdfButton = document.getElementById("pdfButton");
const pdfStatus = document.getElementById("pdfStatus");
const textInput = document.getElementById("textInput");
const pageStartInput = document.getElementById("pageStart");
const pageEndInput = document.getElementById("pageEnd");
const MAX_CHARACTERS = 50000;

let selectedPDF = null;
let flashcardPairs = []; // array of [question, relevantText]
let currentFlashcardIndex = 0;
let savedFlashcards = []; // array of [question, userAnswer]

// load one flashcard
function loadFlashcard(index) {
  const questionBox = document.getElementById("flashcardQuestion");
  const relevantBox = document.getElementById("flashcardRelevantText");
  const userAnswerBox = document.getElementById("flashcardUserAnswer");

  if (flashcardPairs.length === 0) {
    questionBox.value = "waiting for api call before we can start making flashcards";
    relevantBox.value = "";
    userAnswerBox.value = "";
    return;
  }

  if (index < flashcardPairs.length) {
    questionBox.value = flashcardPairs[index][0];
    relevantBox.value = flashcardPairs[index][1];
    userAnswerBox.value = "";
  } else {
    questionBox.value = "Done! No more flashcards.";
    relevantBox.value = "";
    userAnswerBox.value = "";
  }
}

// skip button
document.getElementById("skipButton").onclick = () => {
  if (currentFlashcardIndex < flashcardPairs.length) {
    currentFlashcardIndex++;
    loadFlashcard(currentFlashcardIndex);
  }
};

// save button
document.getElementById("saveButton").onclick = () => {
  if (currentFlashcardIndex < flashcardPairs.length) {
    const question = flashcardPairs[currentFlashcardIndex][0];
    const userAnswer = document.getElementById("flashcardUserAnswer").value.trim();
    savedFlashcards.push([question, userAnswer]);

    currentFlashcardIndex++;
    loadFlashcard(currentFlashcardIndex);
  }
};

// toggle pdf selection
pdfButton.onclick = () => {
  if (selectedPDF) {
    selectedPDF = null;
    pdfInput.value = "";
    pdfStatus.value = "No PDF selected";
    pdfButton.textContent = "➕";
    pdfButton.classList.remove("active");
  } else {
    pdfInput.click();
  }
};

// handle pdf file
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
  pdfButton.textContent = "❌";
  pdfButton.classList.add("active");
};

// handle generate flashcards
document.getElementById("generateButton").onclick = async () => {
  const outputBox = document.getElementById("apiOutput");
  outputBox.textContent = "Processing...";

  let textToSend = "";
  const instructionsText = document.getElementById("instructionsInput").value.trim();

  try {
    if (selectedPDF) {
      const startPage = parseInt(pageStartInput.value);
      const endPage = parseInt(pageEndInput.value);

      if (!startPage || !endPage || startPage > endPage) {
        outputBox.textContent = "Please enter a valid page range.";
        return;
      }

      const formData = new FormData();
      formData.append("pdf", selectedPDF);
      formData.append("startPage", startPage);
      formData.append("endPage", endPage);

      const res = await fetch("/generate", { method: "POST", body: formData });
      if (!res.ok) {
        const errorData = await res.json();
        outputBox.textContent = `Error: ${errorData.error}`;
        return;
      }

      const data = await res.json();
      textToSend = data.output;

      if (!textToSend.trim()) {
        outputBox.textContent = "PDF contains no text in the selected pages.";
        return;
      }
    } else {
      textToSend = textInput.value.trim();
      if (!textToSend) {
        outputBox.textContent = "Please enter some text to generate flashcards.";
        return;
      }
    }

    if (instructionsText) {
      textToSend += `\n\nInstructions: ${instructionsText}`;
    }

    if (textToSend.length > MAX_CHARACTERS) {
      outputBox.textContent = `Text too long (${textToSend.length} characters). Please shorten it.`;
      return;
    }

    const resAI = await fetch("/generate", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ input: textToSend }),
    });

    if (!resAI.ok) {
      const errorData = await resAI.json();
      outputBox.textContent = `Error: ${errorData.error}`;
      return;
    }

    const dataAI = await resAI.json();
    outputBox.textContent = dataAI.output;

    let cleanOutput = dataAI.output.trim();
    if (cleanOutput.startsWith("```")) {
      cleanOutput = cleanOutput.replace(/^```(json)?/, '').replace(/```$/, '').trim();
    }

    try {
      const flashcards = JSON.parse(cleanOutput);
      flashcardPairs = flashcards.map(f => [f.question, f.relevantText]);

      currentFlashcardIndex = 0;
      savedFlashcards = [];

      loadFlashcard(currentFlashcardIndex);
    } catch {
      // leave raw output if parsing fails
    }
  } catch {
    outputBox.textContent = "Error processing input.";
  }
};

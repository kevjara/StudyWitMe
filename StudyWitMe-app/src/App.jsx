import { BrowserRouter as Router, Routes, Route } from "react-router-dom";
import TitleScreen from "./components/TitleScreen";
import MainMenu from "./components/MainMenu";
import Login from "./components/Login";
import FlashcardGenerator from "./components/FlashcardGenerator";

function App() {
  return (
    <Router>
      <Routes>
        <Route path="/" element={<TitleScreen />} />
        <Route path="/login" element={<Login />} />
        <Route path="/main" element={<MainMenu />} />
        <Route path="/flashcards/create" element={<FlashcardGenerator />} />
      </Routes>
    </Router>
  );
}

export default App;
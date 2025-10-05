import { Routes, Route } from "react-router-dom";
import TitleScreen from "./components/TitleScreen";
import MainMenu from "./components/MainMenu";
import Login from "./components/Login";
import FlashcardGenerator from "./components/FlashcardGenerator";
import Background from "./components/Background";
import Flashcards from "./components/Flashcards";
import Profile from "./components/Profile";

function App() {
  return (
    <>
      <Background />
      <Routes>
        <Route path="/" element={<TitleScreen />} />
        <Route path="/login" element={<Login />} />
        <Route path="/main" element={<MainMenu />} />
        <Route path="/flashcards/create" element={<FlashcardGenerator />} />
        <Route path="/flashcards/view" element={<Flashcards />} />
        <Route path="profile" element={<Profile />} />
      </Routes>
    </>
  );
}

export default App;
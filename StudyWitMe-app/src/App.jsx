import { Routes, Route } from "react-router-dom";
import TitleScreen from "./components/TitleScreen";
import MainMenu from "./components/MainMenu";
import Login from "./components/Login";
import FlashcardGenerator from "./components/FlashcardGenerator";
import Background from "./components/Background";
import Flashcards from "./components/Flashcards";
import Profile from "./components/Profile";
import Settings from "./components/Settings";
import Play from "./components/Play";
import GameScreen from "./components/GameScreen";
import GameConnection from "./components/GameConnection";

function App() {
  return (
    <>
      <Background />
      <Routes>
        <Route path="/" element={<TitleScreen />} />
        <Route path="/login" element={<Login />} />
        <Route path="/main" element={<MainMenu />} />
        <Route path="/create" element={<FlashcardGenerator />} />
        <Route path="/flashcards" element={<Flashcards />} />
        <Route path="profile" element={<Profile />} />
        <Route path="settings" element={<Settings />} />

        <Route element={<GameConnection />}>
          <Route path="/play" element={<Play />} />
          <Route path="/game/:roomCode" element={<GameScreen/>} />
        </Route>

      </Routes>
    </>
  );
}

export default App;
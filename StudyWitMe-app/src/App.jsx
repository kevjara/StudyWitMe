import { Routes, Route } from "react-router-dom";
import TitleScreen from "./components/TitleScreen";
import MainMenu from "./components/MainMenu";
import Login from "./components/Login";
import FlashcardGenerator from "./components/FlashcardGenerator";
import Background from "./components/Background";
import Flashcards from "./components/Flashcards";
import Profile from "./components/Profile";
import Settings from "./components/Settings";
import ManageDeck from "./components/ManageDeck";
import SearchResults from "./components/SearchResults";


function App() {
  return (
    <>
        <Background/>
          <Routes>
            <Route path="/" element={<TitleScreen />} />
            <Route path="/login" element={<Login />} />
            <Route path="/main" element={<MainMenu />} />
            <Route path="/create" element={<FlashcardGenerator />} />
            <Route path="/flashcards" element={<Flashcards />} />
            <Route path="/profile/:uid" element={<Profile />} />
            <Route path="profile" element={<Profile />} />
            <Route path="settings" element={<Settings />} />
            <Route path="/flashcards/deck/:deckId/manage" element={<ManageDeck />} />
            <Route path="/search" element={<SearchResults />} />
          </Routes>
    </>
  );
}

export default App;
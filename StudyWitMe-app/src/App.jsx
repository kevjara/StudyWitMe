import { useState } from "react";
import { useNavigate, Routes, Route, useLocation } from "react-router-dom";;
import { useAuth } from "./context/AuthContext";
import { useMusic } from "./context/MusicProvider";
import styles from "./components/Header.module.css";
import "@ncdai/react-wheel-picker/style.css";

import TitleScreen from "./components/TitleScreen";
import MainMenu from "./components/MainMenu";
import Login from "./components/Login";
import FlashcardGenerator from "./components/FlashcardGenerator";
import Background from "./components/Background";
import Flashcards from "./components/Flashcards";
import Profile from "./components/Profile";
import Settings from "./components/Settings";
import FlashcardsStudy from "./components/FlashcardsStudy";
import FlashcardsQuiz from "./components/FlashcardsQuiz";
import Layout from "./components/Layout";
import ManageDeck from "./components/ManageDeck";
import Header from "./components/Header";

function App() {
  const navigate = useNavigate();
  const location = useLocation();
  const [showSignOutOverlay, setShowSignOutOverlay] = useState(false);
  const { logout } = useAuth();
  const { fadeOutAndStop } = useMusic();

  const handleGlobalSignOut = async () => {
    setShowSignOutOverlay(true);
    try {
      await logout();
      await fadeOutAndStop(2000);
      setShowSignOutOverlay(false);
      navigate("/");
    } catch (error) {
        console.error("Error signing out:", error);
    }
  };

  //Only show Header if not on these routes
  const hideHeader = ["/", "/login"].includes(location.pathname);

  return (
    <>
      <Background />
      {!hideHeader && <Header handleSignOut={handleGlobalSignOut} />}

      {showSignOutOverlay && (
        <div className={styles.signoutOverlay}>
          <div className={styles.signoutModal}>
            <h2>Signing out...</h2>
            <p>Please wait...</p>
          </div>
        </div>
      )}

      <Routes>
        {/* Routes WITHOUT header */}
        <Route path="/" element={<TitleScreen />} />
        <Route path="/login" element={<Login />} />

        {/* Routes WITH header */}
        <Route element={<Layout handleSignOut={handleGlobalSignOut} />}>
          <Route path="/main" element={<MainMenu />} />
          <Route path="/create" element={<FlashcardGenerator />} />
          <Route path="/flashcards" element={<Flashcards />} />
          <Route path="/profile" element={<Profile />} />
          <Route path="/settings" element={<Settings />} />
          <Route path="/flashcards_study" element={<FlashcardsStudy />} />
          <Route path="/quiz" element={<FlashcardsQuiz />} />
          <Route path="/manage/:deckId" element={<ManageDeck />} />
        </Route>
      </Routes>
    </>
  );
}

export default App;
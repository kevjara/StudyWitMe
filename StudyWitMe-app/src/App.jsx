import './App.css'
import logo from "./assets/plainLogo.svg"
import { auth, db } from "./firebase";
import { createUserWithEmailAndPassword, signOut, onAuthStateChanged } from "firebase/auth";
import { doc, setDoc, serverTimestamp } from "firebase/firestore";
import { Link, Routes, Route } from "react-router-dom";
import { useState, useEffect } from 'react';
import Login from "./Login.jsx";
import Flashcards from "./Flashcards.jsx";
import Profile from "./Profile.jsx";

function App() {
  //get ready to break this!
  //This will hold the current user
  const [currentUser, setCurrentUser] = useState(null);

  //if something breaks check here first
  //it's the listener, prone to be me not doing it right
  useEffect(() => {
    const unsubscribe = onAuthStateChanged(auth, (user) => {
      setCurrentUser(user);
      console.log("Auth state change due to user sign in :",
        user ? user.uid : "No user");
    });

    return () => unsubscribe();
  }, []);

  //signout stuff?
  const handleSignOut = async (e) => {
    try {
      await signOut(auth);
      alert("You have signed out.");
    } catch (error) {
      console.error("Error with signout", error);
      alert("Error with signout");
    }
  }
  const handleSubmit = async (e) => {
    e.preventDefault();
    const data = new FormData(e.target);

    //we'll put the firebase complicated stuff ehre
    const username = data.get("username");
    const email = data.get("email");
    const password = data.get("password");
    try {
      const newUser = await createUserWithEmailAndPassword(auth, email, password);
      await setDoc(doc(db, "users", newUser.user.uid), { email, displayName: username || null, createdAt: serverTimestamp(), });
      console.log("Signing up: ", newUser.user.uid);
      e.target.reset();
      alert("Account Created!");
    } catch (error) {
      console.error("Error with signup", error);
      alert("Error with signup");
    }

  }

  return (
    <>

      <nav className="navbar">
        <div className="nav-left">
          <img src={logo} alt="robot logo" className="nav-logo" />
        </div>
        <div className="nav-right">
          {/* This will show different nav if user is signed in or not */}
          {currentUser ? (
            <>
              <Link to="/flashcards">FLASHCARDS</Link>
              <Link to="/profile">PROFILE</Link>
              <button onClick={handleSignOut} className="signout">SIGN OUT</button>
            </>
          ) : (
            <>
              <Link to="/">SIGNUP</Link>
              <Link to="/login">LOGIN</Link>
            </>
          )}
        </div>
      </nav>
      <Routes>
        <Route path="/" element={currentUser ? <Flashcards user={currentUser} /> :
          (<div className="signup">
            <h2>Sign Up</h2>
            <form onSubmit={handleSubmit} className="signup-form">
              <label>
                Username:
                <input type="text" name="username" placeholder="Username" required />
              </label>
              <label>
                Email:
                <input type="email" name="email" placeholder="Email" required />
              </label>
              <label>
                Passowrd:
                <input type="password" name="password" placeholder="Password" required />
              </label>

              <button type="submit">Sign Up</button>
            </form>
          </div>
          )}
        />
        <Route path="/login" element={<Login />} />
        <Route path="/flashcards" element={<Flashcards user={currentUser}/>} />
        <Route path="/profile" element={<Profile />} />
      </Routes>
    </>
  )
}

export default App

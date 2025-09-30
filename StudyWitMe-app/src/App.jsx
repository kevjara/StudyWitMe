import './App.css'
import logo from "./assets/plainLogo.svg"
import { auth, db } from "./firebase";
import { createUserWithEmailAndPassword } from "firebase/auth";
import { doc, setDoc, serverTimestamp } from "firebase/firestore";
import {Link, Routes, Route} from "react-router-dom";
import Login from "./Login.jsx";

function App() {
  const handleSubmit = async (e) => {
    e.preventDefault();
    const data = new FormData(e.target);
    //no longer need this, need varss
    /* console.log("Signing up: ", {
      username: data.get("username"),
      email: data.get("email"),
      password: data.get("password"),
    });
      */

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
          <Link to="/">SIGNUP</Link>
          <Link to="/login">LOGIN</Link>
          <Link to="/flashcards">FLASHCARDS</Link>
        </div>
      </nav>
      <Routes>
        <Route path="/" element={
          <div className="signup">
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
        }
        />
        <Route path="/login" element={<Login />}/>
      </Routes>
    </>
  )
}

export default App

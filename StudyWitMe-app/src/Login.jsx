import { auth } from "./firebase";
import { signInWithEmailAndPassword } from "firebase/auth";
import { useNavigate } from "react-router-dom";
import './App.css'

export default function Login() {
    const navigate= useNavigate();
    //reuisng the handlesubmit format from app for login, 
    // just use signin instead of signup firebase functions
    const handleSubmit = async (e) => {
        e.preventDefault();
        const data = new FormData(e.target);

        //we'll put the firebase complicated stuff ehre
        const email = data.get("email");
        const password = data.get("password");
        try {
            const userCreds = await signInWithEmailAndPassword(auth, email, password);

            console.log("Logging in: ", userCreds.user.uid);
            e.target.reset();
            alert("Login Successful!");
            navigate('/profile');
        } catch (error) {
            console.error("Error with login", error);
            alert("Error with login");
        }

    }

    return (
        <div>
            <div className="login">
                <h2>Login</h2>
                <form onSubmit={handleSubmit} className="login-form">
                    <label>
                        Email:
                        <input type="email" name="email" placeholder="Email" required />
                    </label>
                    <label>
                        Passowrd:
                        <input type="password" name="password" placeholder="Password" required />
                    </label>

                    <button type="submit">Login</button>
                </form>
            </div>
        </div>
    )

}
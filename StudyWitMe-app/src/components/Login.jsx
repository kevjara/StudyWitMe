import { useNavigate } from "react-router-dom";
import "./Login.css";

function Login() {
    const navigate = useNavigate();

    return (
        <div className="login-screen">

        <div className="login-box">
        <button className="back-btn" onClick={() => navigate("/")}>
            ← Back
        </button>

        <h2>Sign In</h2>
        <form>
        <input type="text" placeholder="Username" disabled />
        <input type="password" placeholder="Password" disabled />
        <button type="submit" className="btn" disabled>
            Submit (Coming Soon)
        </button>
        </form>
        <p className="note">🔒 Sign In will be enabled after Firebase integration.</p>
        </div>
        </div>
    );
}

export default Login;
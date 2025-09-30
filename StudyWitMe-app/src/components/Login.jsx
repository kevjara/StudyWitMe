import { useNavigate } from "react-router-dom";
import "./Login.css";

function Login() {
    const navigate = useNavigate();

    return (
        <div className="login-screen">
        <div className="pattern"></div>

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
                {/* Background Shapes container */}
        <div className="shapes">
            {/* Skinny rectangles */}
            <div className="shape rectangle bottom-left" />
            <div className="shape rectangle bottom-right" />

            {/* Hand-placed circles */}
            <div
            className="shape circle filled"
            style={{ width: "40px", height: "40px", left: "10%", animationDelay: "0s" }}
            />
            <div
            className="shape circle hollow"
            style={{ width: "60px", height: "60px", left: "30%", animationDelay: "2s" }}
            />
            <div
            className="shape circle filled"
            style={{ width: "30px", height: "30px", left: "70%", animationDelay: "4s" }}
            />
            <div
            className="shape circle hollow"
            style={{ width: "50px", height: "50px", left: "85%", animationDelay: "6s" }}
            />

            {/* Randomized circles */}
            {Array.from({ length: 5 }).map((_, i) => {
            const size = Math.floor(Math.random() * 40) + 20;
            const left = Math.random() * 90;
            const delay = `${(Math.random() * 8).toFixed(2)}s`;
            const filled = Math.random() > 0.5;

            return (
                <div
                key={`circle-${i}`}
                className={`shape circle ${filled ? "filled" : "hollow"}`}
                style={{
                    width: `${size}px`,
                    height: `${size}px`,
                    left: `${left}%`,
                    animationDelay: delay,
                }}
                />
            );
            })}
        </div>
        </div>
    );
}

export default Login;
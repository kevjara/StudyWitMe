import "./Background.css";

function Background() {
    return (
        <div className="background-container">
        <div className="shapes">
            {/* Big boxes */}
            <div className="pattern"></div>
            <div className="shape box top-left" />
            <div className="shape box top-right" />
            <div className="shape box bottom-left-large" />
            <div className="shape box bottom-right-large" />
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

export default Background;
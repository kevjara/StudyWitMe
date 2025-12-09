import { useEffect } from "react";
import { useMusic } from "../context/MusicProvider";
import { useAuth } from "../context/AuthContext";
import styles from "./MainMenu.module.css";


function MainMenu() {
    const { hasStartedOnce, playMusic} = useMusic();
    const { currentUser } = useAuth();

    useEffect(() => {
        if (!hasStartedOnce) {
            playMusic();
        }
    }, [hasStartedOnce, playMusic]);


    return (
        <div className={styles.mainMenu}>
            <div className={styles.menuBody}>
                <h2>Welcome to StudyWitMe!</h2>
                {currentUser ? (
                    <p>You are signed in as {currentUser.email}</p>
                ) : (
                    <p>You are browsing as a guest.</p>
                )}
            </div>
        </div>
    );
}

export default MainMenu;
import { useEffect } from "react";
import { useMusic } from "../context/MusicProvider";
import { useAuth } from "../context/AuthContext";
import styles from "./MainMenu.module.css";
import Store from "../assets/Store.svg";


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
            <div className={styles.menuGallery}>
                {/* <div class="bg-black py-5 d-flex justify-content-center align-items-center">
                    <div className={styles.obj}>
                        <div className={styles.objchild}>
                            <span className={styles.inn6}></span>
                        </div>
                    </div>
                </div>
                <h2 className={styles.menuHeader}>Shop</h2>
                <div className={styles.card}>
                    <div className={styles.card2}>
                        <img
                        src={Store}
                        alt="Store"
                        className={styles.store}
                        // onClick={() => navigate("/main")}
                        title="Store"
                        />
                    </div>
                </div> */}
            </div>
        </div>
    );
}

export default MainMenu;
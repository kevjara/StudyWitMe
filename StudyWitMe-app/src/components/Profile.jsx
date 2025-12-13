import { useState, useEffect, useRef } from 'react';
import { db } from "../services/firebase";
import { doc, onSnapshot, collection, getDocs, query, where, getDoc, FieldPath } from "firebase/firestore";
import { useAuth } from "../context/AuthContext";
import { auth } from "../services/firebase";
import { signOut } from "firebase/auth";
import { useNavigate, useParams } from "react-router-dom";
import DefaultProfileIcon from "../assets/Default_Profile_Icon.png";
import styles from "./Profile.module.css";
import { refreshPixabayImage } from "../utils/imageRefresh"; // Import utility

function Profile() {
    const { currentUser } = useAuth();
    const navigate = useNavigate();
    const { uid } = useParams();

    const [profile, setProfile] = useState(null);
    const [isLoading, setIsLoading] = useState(true);
    const [isOwner, setIsOwner] = useState(false);
    const [publicDecks, setPublicDecks] = useState([]);
    const [loadingDecks, setLoadingDecks] = useState(false);
    const [userAchievements, setUserAchievements] = useState([]);
    const [showDeleteModal, setShowDeleteModal] = useState(false);
    const [deleteStep, setDeleteStep] = useState(0);
    const [deleteTimer, setDeleteTimer] = useState(20);
    const [deleteStatus, setDeleteStatus] = useState("");
    const [showFinalYes, setShowFinalYes] = useState(false);
    const deleteIntervalRef = useRef(null);
    const showYesTimeoutRef = useRef(null);
    const [refreshedUrls, setRefreshedUrls] = useState({});

    const [profileImage, setProfileImage] = useState(null);

    const handleImageError = async (e, deck) => {
        const isOwnerOfDeck = currentUser?.uid === deck.ownerId; 

        if (!deck.pixabayId) {
            console.warn(`⚠️ No pixabayId for deck ${deck.id}`);
            e.target.style.display = 'none';
            return;
        }

        const currentStatus = refreshedUrls[deck.id];
        if (currentStatus === 'loading' || currentStatus === 'failed') {
            return;
        }

        if (currentStatus && currentStatus !== deck.imagePath) {
            console.warn(`⚠️ Refreshed URL also expired for deck ${deck.id}`);
            setRefreshedUrls(prev => ({ ...prev, [deck.id]: 'failed' }));
            e.target.style.display = 'none';
            return;
        }

        setRefreshedUrls(prev => ({ ...prev, [deck.id]: 'loading' }));
        
        const newUrl = await refreshPixabayImage(
            'deck', 
            deck.id, 
            deck.pixabayId, 
            isOwnerOfDeck
        );

        if (newUrl) {
            setRefreshedUrls(prev => ({ ...prev, [deck.id]: newUrl }));
        } else {
            setRefreshedUrls(prev => ({ ...prev, [deck.id]: 'failed' }));
            e.target.style.display = 'none';
        }
    };


    useEffect(() => {
        const targetUid = uid || currentUser?.uid;
        if (!targetUid) {
            setProfile(null);
            setIsLoading(false);
            return;
        }

        setIsLoading(true);
        const userRef = doc(db, "users", targetUid);
        const unsubscribe = onSnapshot(userRef, (snap) => {
            if (snap.exists()) {
                setProfile({ id: snap.id, ...snap.data() });
            } else {
                setProfile(null);
            }
            setIsLoading(false);
        });

        setIsOwner(currentUser?.uid === targetUid);
        return () => unsubscribe();
    }, [uid, currentUser]);

    useEffect(() => {
        const fetchPublicDecks = async () => {
            const targetUid = uid || currentUser?.uid;
            if (!targetUid) return;
            setLoadingDecks(true);
            try {
                const deckSnap = await getDocs(
                    query(
                        collection(db, "deck"),
                        where("ownerId", "==", targetUid),
                        where("isPublic", "==", true)
                    )
                );
                setPublicDecks(deckSnap.docs.map(d => ({ id: d.id, ...d.data() })));
            } catch (e) {
                console.error("Error fetching decks:", e);
            } finally {
                setLoadingDecks(false);
            }
        };
        fetchPublicDecks();
    }, [uid, currentUser]);

    //this should fetch the achievements
    useEffect(() => {
        const fetchAchievements = async () => {
            if (!profile || !profile.achievements || profile.achievements.length === 0) {
                setUserAchievements([]);
                return;
            }

            try {
                const achievementsSnap = await getDocs(
                    query(
                        collection(db, "achievements"),
                        where('__name__', "in", profile.achievements)
                    )
                );
                setUserAchievements(achievementsSnap.docs.map(d => ({
                    id: d.id,
                    ...d.data()
                })));

            } catch (e) {
                console.error("Error fetching achievements:", e);
                if (e.code === 'failed-precondition') {
                    console.warn("Achievement list is too long for a single query (max 10 'in' clauses). Consider splitting the array.");
                }
                setUserAchievements([]);
            }
        };

        fetchAchievements();
    }, [profile]);

    const startDeleteCountdown = () => {
        setDeleteStep(1);
        setDeleteTimer(20);
        setDeleteStatus("Deleting Account");
        if (deleteIntervalRef.current) clearInterval(deleteIntervalRef.current);
        if (showYesTimeoutRef.current) clearTimeout(showYesTimeoutRef.current);
        const interval = setInterval(() => {
            setDeleteTimer(prev => {
                if (prev <= 1) {
                    clearInterval(interval);
                    showFinalDeleteStatus();
                    return 0;
                }
                return prev - 1;
            });
        }, 1000);
        deleteIntervalRef.current = interval;
        showYesTimeoutRef.current = setTimeout(() => setShowFinalYes(true), 5000);
    };

    const showFinalDeleteStatus = () => {
        setDeleteTimer(0);
        setDeleteStatus("Account Deleted, thank you for StudyingWitMe");
        setShowFinalYes(false);
        if (deleteIntervalRef.current) clearInterval(deleteIntervalRef.current);
        setTimeout(() => handleSignOut(), 500);
    };

    const handleSignOut = async () => {
        try {
            await signOut(auth);
            navigate("/");
        } catch (error) {
            console.error("Error signing out:", error);
        }
    };

    if (isLoading) return <div className={styles.profilePageEmpty}><h2>Loading profile...</h2></div>;
    if (!profile) return <div className={styles.profilePageEmpty}><h2>Profile not found.</h2></div>;

    return (
        <div className={styles.profilePage}>
            <button className={styles.backBtn} onClick={() => navigate("/main")}>← Back to Main Menu</button>

            <div className={styles.profileCard}>
                <div className={styles.profileTop}>
                    <div className={styles.profileLeft}>
                        <div className={styles.profileIconWrap}>
                            <div className={styles.profileIcon}>
                                <img src={profileImage || DefaultProfileIcon} alt="Profile Icon" />
                            </div>
                        </div>
                        <div className={styles.profileMeta}>
                            <h2 className={styles.displayName}> {profile.displayName || "No display name"}</h2>
                            <div className={styles.levelBadge}>
                                <span className={styles.levelText}>Lvl </span>
                                <span className={styles.levelNumber}>{profile.userLevel ?? 0}</span>
                            </div>
                            {userAchievements.length > 0 && (
                                <div className={styles.achievementsContainer} title="Achievements Earned">
                                    {userAchievements.map(achievement => (
                                        <img
                                            key={achievement.id}
                                            src={achievement.badge} // Use the path stored in the 'badge' field
                                            alt={achievement.name}
                                            className={styles.achievementBadge}
                                            title={achievement.name + ": " + achievement.description} // Tooltip for details
                                        />
                                    ))}
                                </div>
                            )}
                        </div>
                    </div>
                </div>

                <div className={styles.infoSection}>
                    <div className={styles.accountSection}>
                        <h3>Account Information</h3>
                        <div className={styles.accountList}>
                            <div className={styles.accountRow}><strong>User ID:</strong> <span className={styles.mono}>{profile.id}</span></div>
                            {profile.createdAt && (
                                <div className={styles.accountRow}><strong>Member Since:</strong> <span>{profile.createdAt.toDate().toLocaleDateString()}</span></div>
                            )}
                            <div className={styles.accountRow}>
                                <strong>Email:</strong>
                                <span>{isOwner ? profile.email : "Private"}</span>
                            </div>
                            <div className={styles.accountRow}>
                                <strong>Games Won:</strong>
                                <span>{profile.gamesWon ?? 0}</span>
                            </div>
                        </div>
                    </div>

                    <div className={styles.flashcardSection}>
                        <h3>Public Decks</h3>
                        <div className={styles.flashcardList}>
                            <div className={styles.flashcardRow}><strong>Total:</strong> {publicDecks.length}</div>
                        </div>
                    </div>
                </div>

                <div style={{ marginTop: "30px" }}>
                    <h3>{isOwner ? "Your Public Decks" : `${profile.displayName || "User"}'s Public Decks`}</h3>
                    {loadingDecks ? (
                        <p>Loading decks...</p>
                    ) : publicDecks.length === 0 ? (
                        <p>No public decks yet.</p>
                    ) : (
                        <div style={{ display: "flex", flexWrap: "wrap", gap: "1rem", marginTop: "1rem" }}>
                            {publicDecks.map(deck => (
                                <div
                                    key={deck.id}
                                    style={{
                                        display: "flex",
                                        alignItems: "center",
                                        gap: "1rem",
                                        borderRadius: "12px",
                                        padding: "1rem",
                                        boxShadow: "0 2px 6px rgba(0,0,0,0.1)",
                                        cursor: "pointer",
                                        minWidth: "260px",
                                        backgroundColor: "#ffffff",
                                    }}
                                    onClick={() => navigate(`/flashcards/deck/${deck.id}/study`, { state: { deck } })}
                                >
                                    {deck.imagePath && (
                                        <a href={deck.attributionLink} target="_blank" rel="noopener noreferrer">
                                            <img
                                                src={refreshedUrls[deck.id] || deck.imagePath}
                                                alt="Deck"
                                                style={{
                                                    width: "80px",
                                                    height: "80px",
                                                    objectFit: "cover",
                                                    borderRadius: "8px",
                                                    flexShrink: 0,
                                                    opacity: refreshedUrls[deck.id] === 'loading' ? 0.3 : 1,
                                                    transition: 'opacity 0.3s'
                                                }}
                                                onError={(e) => handleImageError(e, deck)}
                                            />
                                        </a>
                                    )}
                                    <div style={{ flex: 1 }}>
                                        <h4>{deck.title || "Untitled Deck"}</h4>
                                        <p style={{ margin: 0, fontSize: "0.9rem" }}>
                                            Category: {deck.category || "Uncategorized"}
                                        </p>
                                    </div>
                                </div>
                            ))}
                        </div>
                    )}
                </div>

                {isOwner && (
                    <div className={styles.deleteRow}>
                        <button className={styles.btnDanger} onClick={() => setShowDeleteModal(true)}>
                            Delete Account
                        </button>
                    </div>
                )}
            </div>

            {showDeleteModal && isOwner && (
                <div className={styles.modalOverlay}>
                    <div className={styles.modalDeleteModal}>
                        {deleteStatus === "Account Deleted, thank you for StudyingWitMe" ? (
                            <div><span>{deleteStatus}</span></div>
                        ) : deleteStep === 0 ? (
                            <>
                                <h3>Are you sure you want to delete your account?</h3>
                                <div className={styles.modalActions}>
                                    <button className={styles.btnDanger} onClick={startDeleteCountdown}>Yes</button>
                                    <button className={styles.btnCancel} onClick={() => setShowDeleteModal(false)}>No</button>
                                </div>
                            </>
                        ) : (
                            <div>
                                <div className={styles.deleteRowTop}>
                                    <span>Are you sure? →</span>
                                    <button className={styles.btnCancel} onClick={() => setShowDeleteModal(false)}>On second thought...</button>
                                </div>
                                <div className={styles.timerRow}>
                                    <span>{deleteTimer}s</span>
                                    {showFinalYes && (
                                        <button className={styles.btnDanger} onClick={showFinalDeleteStatus}>
                                            Yes, I'm Sure
                                        </button>
                                    )}
                                </div>
                                {deleteStatus && <div className={styles.deleteStatusMessage}><span>{deleteStatus}</span></div>}
                            </div>
                        )}
                    </div>
                </div>
            )}
        </div>
    );
}

export default Profile;
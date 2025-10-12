import { useState, useEffect } from 'react';
import { db } from "../services/firebase";
import { doc, onSnapshot } from "firebase/firestore";
import { useAuth } from "../context/AuthContext" 
import { auth } from "../services/firebase";
import { signOut } from "firebase/auth";
import { useNavigate } from "react-router-dom";
import DefaultProfileIcon from "../assets/Default_Profile_Icon.png";
import { useRef } from 'react';
import styles from "./Profile.module.css";


function Profile() {
    const { currentUser } = useAuth();
    const [profile, setProfile] = useState(null);
    const [isLoading, setIsLoading] = useState(true);
    const [isEditing, setIsEditing] = useState(false);
    const navigate = useNavigate();

    const [showDeleteModal, setShowDeleteModal] = useState(false);
    const [deleteStep, setDeleteStep] = useState(0); // 0 = initial confirmation, 1 = timer step
    const [deleteTimer, setDeleteTimer] = useState(20);
    const [deleteStatus, setDeleteStatus] = useState("");
    const [showFinalYes, setShowFinalYes] = useState(false);
    const [deleteIntervalId, setDeleteIntervalId] = useState(null);
    const deleteIntervalRef = useRef(null);
    const showYesTimeoutRef = useRef(null);

    // For potential file uploads later
    const [profileImage, setProfileImage] = useState(null);

    //this will update the profile in realtime
    //look at this if something is broken
    //this is complex cause I copied from flashcards
    useEffect(() => {
        if (!currentUser) {
            setIsLoading(false);
            setProfile(null);
            return;
        }
        setIsLoading(true);
        const userId = doc(db, 'users', currentUser.uid);
        //listener like from login
        const unsubscribe = onSnapshot(userId, (doc) => {
            if (doc.exists()) {
                setProfile({ id: doc.id, ...doc.data() });
            } else {
                console.log("Invalid user");
                setProfile(null);
            }
            setIsLoading(false);
        }, (error) => {
            console.error("Error fetching profile:", error);
            setIsLoading(false);
        });
        return () => unsubscribe();
    }, [currentUser]);

    if (!currentUser) {
            return (
            <div className={styles.profilePageEmpty}>
                <div className={styles.guestCard}>
                    <button 
                        className={styles.backBtn}
                        onClick={() => navigate("/main")}
                    >
                        ← Back
                    </button>

                    <h2>Oops, you're not signed in!</h2>
                    <p>
                        Please{" "}
                        <span
                            className={styles.loginLink}
                            onClick={() => navigate("/login")}
                            role="button"
                            tabIndex="0"
                        >
                            sign in
                        </span>{" "}
                        to view your profile.
                    </p>
                </div>
            </div>
        );
    }
    if (isLoading) {
        return (
            <div className={styles.profilePageEmpty}>
                <h2>Profile is loading...</h2>
            </div>
        )
    }
    if (!profile) {
        return (
            <div className={styles.profilePageEmpty}>
                <h2>Could not find profile :/</h2>
                <p>Trying to find profile: {currentUser.uid}/</p>
            </div>
        )
    }

      // Handlers for fake upload UI (just previews)
    const onIconSelect = (e) => {
        const f = e.target.files?.[0];
        if (f) setProfileImage(URL.createObjectURL(f));
    };

    const startEdit = () => setIsEditing(true);
    const cancelEdit = () => {
        setIsEditing(false);
        // discard previews
        setProfileImage(null);
    };
    const finishEdit = () => {
        // TODO: implement save to Firebase (not included)
        setIsEditing(false);
        // keep previews (or clear if you prefer)
    };

    const startDeleteCountdown = () => {
        setDeleteStep(1);
        setDeleteTimer(20);
        setDeleteStatus("Deleting Account");

        // clear any previous interval/timeout before starting
        if (deleteIntervalRef.current) {
            clearInterval(deleteIntervalRef.current);
            deleteIntervalRef.current = null;
        }
        if (showYesTimeoutRef.current) {
            clearTimeout(showYesTimeoutRef.current);
            showYesTimeoutRef.current = null;
        }

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

        deleteIntervalRef.current = interval; // store in ref

        // store timeout for "Yes, I'm Sure"
        showYesTimeoutRef.current = setTimeout(() => {
            setShowFinalYes(true);
        }, 5000);
    };

    // unified final status handler
    const showFinalDeleteStatus = () => {
    setDeleteTimer(0);
    setDeleteStatus("Account Deleted, thank you for StudyingWitMe");
    setShowFinalYes(false); // hide Yes button

    // safely clear interval
    if (deleteIntervalRef.current) {
        clearInterval(deleteIntervalRef.current);
        deleteIntervalRef.current = null;
    }

    // give React time to render status before signing out
    setTimeout(() => handleSignOut(), 500);
    };

    const handleSignOut = async () => {
        try {
            await signOut(auth);
            navigate("/"); // back to TitleScreen
        } catch (error) {
            console.error("Error signing out:", error);
        }
    };

    return (
        <div className={styles.profilePage}>
            <button
                className={styles.backBtn}
                onClick={() => navigate("/main")}
            >
                ← Back to Main Menu
            </button>

            {/* Main card */}
            <div className={styles.profileCard}>
                <div className={styles.profileTop}>
                    <div className={styles.profileLeft}>
                        <div className={styles.profileIconWrap}>
                            <div className={styles.profileIcon}>
                                <img
                                    src={profileImage || DefaultProfileIcon}
                                    alt="Profile Icon"
                                />
                                {isEditing && (
                                    <>
                                        <button
                                        className={styles.iconUploadBtn}
                                        onClick={() => document.getElementById("iconUpload").click()}
                                        aria-label="Upload profile icon"
                                        type="button"
                                        >
                                        +
                                        </button>
                                        <input
                                        id="iconUpload"
                                        type="file"
                                        accept="image/*"
                                        className={styles.hiddenFile}
                                        onChange={onIconSelect}
                                        />
                                    </>
                                )}
                            </div>
                        </div>

                        <div className={styles.profileMeta}>
                            <div className={styles.displayRow}>
                                <h2 className={styles.displayName}>Display Name: {profile.displayName || "No display name"}</h2>
                                {isEditing && <button className={styles.changeBtn}>Change</button>}
                            </div>
                            <p className={styles.email}>Email: {profile.email}</p>
                        </div>
                    </div>

                    <div className={`${styles.profileActions} ${isEditing ? styles.editing : ""}`}>
                        {isEditing ? (
                            <div className={styles.editButtons}>
                                <button className={styles.btnPrimary} onClick={finishEdit}>Finish</button>
                                <button className={styles.btnCancel} onClick={cancelEdit}>Cancel</button>
                            </div>
                            ) : (
                            <button className={styles.btnPrimary} onClick={startEdit}>Edit Profile</button>
                        )}
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
                        </div>
                    </div>

                    <div className={styles.flashcardSection}>
                        <h3>Flashcard Information</h3>
                        <div className={styles.flashcardList}>
                            <div className={styles.flashcardRow}><strong>Decks:</strong> 0</div>
                            <div className={styles.flashcardRow}><strong>Flashcards:</strong> 0</div>
                        </div>
                    </div>
                </div>

                <div className={styles.deleteRow}>
                    <button className={styles.btnDanger} onClick={() => setShowDeleteModal(true)}>
                        Delete Account 
                    </button>
                </div>
            </div>
            
            {/* Delete Confirmation Modal */}
            {showDeleteModal && (
                <div className={styles.modalOverlay} role="dialog" aria-modal="true">
                    <div className={styles.modalDeleteModal}>
                    {/* Final deleted status only */}
                    {deleteStatus === "Account Deleted, thank you for StudyingWitMe" ? (
                        <div className={styles.deleteFinalStatus}>
                        <span>{deleteStatus}</span>
                        </div>

                    // Initial confirmation
                    ) : deleteStep === 0 ? (
                        <>
                        <h3>Are you sure you want to delete your account?</h3>
                        <p>All Flashcards will be discarded upon deletion</p>
                        <div className={styles.modalActions}>
                            <button className={styles.btnDanger} onClick={startDeleteCountdown}>
                            Yes
                            </button>
                            <button className={styles.btnCancel} onClick={() => setShowDeleteModal(false)}>
                            No
                            </button>
                        </div>
                        </>

                    // Countdown + Yes button + status
                    ) : (
                        <div className={styles.deleteStep1}>
                        {/* Top row: Are you sure? -> Cancel */}
                        <div className={styles.deleteRowTop}>
                            <span>Are you sure? -{'>'}</span>
                            <button
                            className={styles.btnCancel}
                            onClick={() => {
                                // clear countdown interval
                                if (deleteIntervalRef.current) {
                                    clearInterval(deleteIntervalRef.current);
                                    deleteIntervalRef.current = null;
                                }
                                // clear "Yes" timeout
                                if (showYesTimeoutRef.current) {
                                    clearTimeout(showYesTimeoutRef.current);
                                    showYesTimeoutRef.current = null;
                                }

                                if (deleteIntervalId) clearInterval(deleteIntervalId);
                                setDeleteStep(0);
                                setShowDeleteModal(false);
                                setDeleteTimer(20);
                                setDeleteStatus("");
                                setShowFinalYes(false);
                            }}
                            >
                            On second thought...
                            </button>
                        </div>

                        {/* Middle row: timer + Yes button */}
                        <div className={styles.timerRow}>
                        <span>{deleteTimer}s</span>
                        {showFinalYes && (
                            <button className={styles.btnDanger} onClick={showFinalDeleteStatus}>
                            Yes, I'm Sure
                            </button>
                        )}
                        </div>

                        {/* Bottom row: status message */}
                        {deleteStatus && (
                            <div className={styles.deleteStatusMessage}>
                                <span>{deleteStatus}</span>
                            </div>
                        )}
                        </div>
                    )}
                    </div>
                </div>
            )}
        </div>
    );
}

export default Profile;
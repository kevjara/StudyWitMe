import { useState, useEffect } from 'react';
import { db } from "../services/firebase";
import { doc, onSnapshot } from "firebase/firestore";
import { useAuth } from "../context/AuthContext" 
import { auth } from "../services/firebase";
import { signOut } from "firebase/auth";
import { useNavigate } from "react-router-dom";
import DefaultProfileIcon from "../assets/Default_Profile_Icon.png";
import { useRef } from 'react';
import "./Profile.css";


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
            <div className="profile-page empty">
                <h2>Oops, you're not signed in</h2>
                <p>Please sign in to view your profile</p>
            </div>
        )
    }
    if (isLoading) {
        return (
            <div className="profile-page empty">
                <h2>Profile is loading...</h2>
            </div>
        )
    }
    if (!profile) {
        return (
            <div className="profile-page empty">
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

    setTimeout(() => setShowFinalYes(true), 5000);
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
        <div className="profile-page">
            <button
                className="back-btn"
                onClick={() => navigate("/main")}
            >
                ← Back to Main Menu
            </button>

            {/* Main card */}
            <div className="profile-card">
                <div className="profile-top">
                    <div className="profile-left">
                        <div className="profile-icon-wrap">
                            <div className="profile-icon">
                                <img
                                    src={profileImage || DefaultProfileIcon}
                                    alt="Profile Icon"
                                />
                                {isEditing && (
                                    <>
                                        <button
                                        className="icon-upload-btn"
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
                                        className="hidden-file"
                                        onChange={onIconSelect}
                                        />
                                    </>
                                )}
                            </div>
                        </div>

                        <div className="profile-meta">
                            <div className="display-row">
                                <h2 className="display-name">Display Name: {profile.displayName || "No display name"}</h2>
                                {isEditing && <button className="change-btn">Change</button>}
                            </div>
                            <p className="email">Email: {profile.email}</p>
                        </div>
                    </div>

                    <div className={`profile-actions ${isEditing ? "editing" : ""}`}>
                        {isEditing ? (
                            <div className="edit-buttons">
                                <button className="btn primary" onClick={finishEdit}>Finish</button>
                                <button className="btn cancel" onClick={cancelEdit}>Cancel</button>
                            </div>
                            ) : (
                            <button className="btn primary" onClick={startEdit}>Edit Profile</button>
                        )}
                    </div>
                </div>

                <div className="info-section">
                    <div className="account-section">
                        <h3>Account Information</h3>
                        <div className="account-list">
                            <div className="account-row"><strong>User ID:</strong> <span className="mono">{profile.id}</span></div>
                            {profile.createdAt && (
                                <div className="account-row"><strong>Member Since:</strong> <span>{profile.createdAt.toDate().toLocaleDateString()}</span></div>
                            )}
                        </div>
                    </div>

                    <div className="flashcard-section">
                        <h3>Flashcard Information</h3>
                        <div className="flashcard-list">
                            <div className="flashcard-row"><strong>Decks:</strong> 0</div>
                            <div className="flashcard-row"><strong>Flashcards:</strong> 0</div>
                        </div>
                    </div>
                </div>

                <div className="delete-row">
                    <button className="btn danger" onClick={() => setShowDeleteModal(true)}>
                        Delete Account 
                    </button>
                </div>
            </div>
            
            {/* Delete Confirmation Modal */}
            {showDeleteModal && (
                <div className="modal-overlay" role="dialog" aria-modal="true">
                    <div className="modal delete-modal">
                    {/* Final deleted status only */}
                    {deleteStatus === "Account Deleted, thank you for StudyingWitMe" ? (
                        <div className="delete-final-status">
                        <span>{deleteStatus}</span>
                        </div>

                    // Initial confirmation
                    ) : deleteStep === 0 ? (
                        <>
                        <h3>Are you sure you want to delete your account?</h3>
                        <p>All Flashcards will be discarded upon deletion</p>
                        <div className="modal-actions">
                            <button className="btn danger" onClick={startDeleteCountdown}>
                            Yes
                            </button>
                            <button className="btn cancel" onClick={() => setShowDeleteModal(false)}>
                            No
                            </button>
                        </div>
                        </>

                    // Countdown + Yes button + status
                    ) : (
                        <div className="delete-step1">
                        {/* Top row: Are you sure? -> Cancel */}
                        <div className="delete-row-top">
                            <span>Are you sure? -{'>'}</span>
                            <button
                            className="btn cancel"
                            onClick={() => {
                                if (deleteIntervalId) clearInterval(deleteIntervalId);
                                setDeleteStep(0);
                                setShowDeleteModal(false);
                                setDeleteTimer(20);
                                setDeleteStatus("");
                                setShowFinalYes(false);
                            }}
                            >
                            Cancel
                            </button>
                        </div>

                        {/* Middle row: timer + Yes button */}
                        <div className="timer-row">
                        <span>{deleteTimer}s</span>
                        {showFinalYes && (
                            <button className="btn danger" onClick={showFinalDeleteStatus}>
                            Yes, I'm Sure
                            </button>
                        )}
                        </div>

                        {/* Bottom row: status message */}
                        {deleteStatus && (
                            <div className="delete-status-message">
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
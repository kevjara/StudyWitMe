import { useState, useEffect } from 'react';
import { db } from "./firebase";
import { doc, onSnapshot } from "firebase/firestore";
import './App.css';

export default function Profile({ user }) {
    const [profile, setProfile] = useState([]);
    const [isLoading, setIsLoading] = useState(true);

    //this will update the profile in realtime
    //look at this if something is broken
    //this is complex cause I copied from flashcards
    useEffect(() => {
        if (!user) {
            setIsLoading(false);
            setProfile(null);
            return;
        }
        setIsLoading(true);
        const userId = doc(db, 'users', user.uid);
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
    }, [user]);

    if (!user) {
        return (
            <div className="profile-page">
                <h2>Oops, you're not signed in</h2>
                <p>Please sign in to view your profile</p>
            </div>
        )
    }
    if (isLoading) {
        return (
            <div className="profile-page">
                <h2>Profile is loading...</h2>
            </div>
        )
    }
    if (!profile) {
        return (
            <div className="profile-page">
                <h2>Could not find profile :/</h2>
                <p>Trying to find profile: {user.uid}/</p>
            </div>
        )
    }
    return (
        //focus on this when wanting to do profile or display other stuff from db
        <div className="profile-page">
            <h2>Profile</h2>
            <div className="profile-list">
                <p><strong>Display Name:</strong> {profile.displayName}</p>
                <p><strong>Email:</strong> {profile.email}</p>
                <p><strong>User ID:</strong> {profile.id}</p>
                {profile.createdAt && (
                    <p><strong>Member Since:</strong> {profile.createdAt.toDate().toLocaleDateString()}</p>
                )}
            </div>
        </div>
    )
}
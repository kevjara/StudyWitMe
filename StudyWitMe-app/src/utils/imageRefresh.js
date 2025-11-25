// src/utils/imageRefresh.js
import { doc, updateDoc } from "firebase/firestore";
import { db } from "../services/firebase";

/**
 * Attempts to refresh a broken Pixabay link using the stored ID.
 * @param {string} collectionName - "deck" or "flashcard"
 * @param {string} docId - The Firestore Document ID
 * @param {string} pixabayId - The immutable Pixabay ID stored in the doc
 * @param {boolean} canEdit - If true, saves the new URL to Firestore. If false, just returns it.
 * @returns {Promise<string|null>} - The new URL or null if failed.
 */
export const refreshPixabayImage = async (collectionName, docId, pixabayId, canEdit = false) => {
    if (!pixabayId) return null;
    console.log(`🔄 Refreshing expired image for ${collectionName} ${docId} using Pixabay ID: ${pixabayId}`);
    try {
        //fetches url from pixabay via backend proxy
        const response = await fetch(`http://localhost:3000/pixabay-id/${pixabayId}`);
        const data = await response.json();
        
        console.log(`📦 Pixabay API response for ID ${pixabayId}:`, data);

        if (data.webformatURL) {
            const newUrl = data.webformatURL; // Or largeImageURL for HD
            console.log(`🔗 New URL obtained: ${newUrl}`);
            
            //It will update firestore link with the most recent image if user is the owner.
            if (canEdit) {
                const docRef = doc(db, collectionName, docId);
                await updateDoc(docRef, { imagePath: newUrl }); // Update the cache
                console.log("✅ Database updated with fresh URL");
            }
            
            return newUrl;
        } else {
            console.warn(`⚠️ No webformatURL in response for Pixabay ID ${pixabayId}`);
        }
    } catch (error) {
        console.error("Failed to refresh Pixabay image:", error);
    }
    return null;
};
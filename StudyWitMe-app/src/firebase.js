// Import the functions you need from the SDKs you need
import { initializeApp } from "firebase/app";
import { getAnalytics } from "firebase/analytics";
// TODO: Add SDKs for Firebase products that you want to use
// https://firebase.google.com/docs/web/setup#available-libraries

// Your web app's Firebase configuration
// For Firebase JS SDK v7.20.0 and later, measurementId is optional
const firebaseConfig = {
  apiKey: "AIzaSyDcv424p0f_vUYAcnQRPg-AOVITSn6x8kM",
  authDomain: "studywitme-1f088.firebaseapp.com",
  projectId: "studywitme-1f088",
  storageBucket: "studywitme-1f088.firebasestorage.app",
  messagingSenderId: "961093353995",
  appId: "1:961093353995:web:7816edef48498ebda0fd0e",
  measurementId: "G-ZWE5BKJG9C"
};

// Initialize Firebase
const app = initializeApp(firebaseConfig);
const analytics = getAnalytics(app);
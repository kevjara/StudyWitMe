# StudyWitMe

StudyWitMe is a collaborative study companion app built with React, Firebase, and Vite, integrating AI and multimedia APIs to help users learn interactively.

 # Overview

This project consists of two main parts:

**Server** – Handles API requests and environment keys for Gemini and Pixabay.

**Client (studywitme-app)** – The front-end web app built with React + Vite and connected to Firebase.

## Getting Started

### Clone the repository

Use one of the following commands to clone the project:

```
git clone https://github.com/<your-username>/StudyWitMe.git
```
or 
```
git clone git@github.com:kevjara/StudyWitMe.git
```


Then navigate into the project directory:
```
cd StudyWitMe
```

### Install dependencies

Install dependencies for both the server and the client.

In the main project directory:
```
npm install
```

In the /studywitme-app directory:
```
cd studywitme-app
npm install
cd ..
```

# Environment Variables

This project uses two separate environment configuration files.

#### **Server (.env at root)**

Create a file named .env in the root directory following .env.example and include your API keys:
```
GEMINI_API_KEY=your_gemini_api_key
PIXABAY_API_KEY=your_pixabay_api_key
```

#### **Client (studywitme-app/.env.local)**

Create a file named .env.local inside the studywitme-app folder for Firebase configuration:
```
VITE_FIREBASE_API_KEY=your_firebase_api_key
VITE_FIREBASE_AUTH_DOMAIN=your_firebase_auth_domain
VITE_FIREBASE_PROJECT_ID=your_firebase_project_id
VITE_FIREBASE_STORAGE_BUCKET=your_firebase_storage_bucket
VITE_FIREBASE_MESSAGING_SENDER_ID=your_firebase_sender_id
VITE_FIREBASE_APP_ID=your_firebase_app_id
```

# Running the App

#### **Start the Server**

From the main project directory:

```
npm start
```

Runs the backend server with API routes.

#### **Start the Client**

From the /studywitme-app directory:

```
cd studywitme-app
npm run dev
```

Runs the React app using Vite’s development server.

#### **Open your browser and go to the default Vite address:**

```
http://localhost:5173/
```

Make sure both the server and client are running simultaneously.

# Tech Stack
- Frontend: React + Vite
- Backend: Express / Node.js
- Database/Auth: Firebase (Auth, Firestore, Hosting)
- AI Functionality: Gemini API
- Image Fetching: Pixabay API
- Routing: React Router

# Additional Help
#### **This project assumes you already have:**
- A Firebase project configured with Authentication and Firestore.
- Access to the Gemini API (via Google AI Studio) for AI functionality.
- A Pixabay API key for image fetching.

#### If you need help obtaining these keys, refer to each platform’s official documentation:
- [Firebase Setup Guide](https://firebase.google.com/docs/web/setup)
- [Gemini API (Google AI Studio)](https://aistudio.google.com/)
- [Pixabay API Docs](https://pixabay.com/api/docs/)
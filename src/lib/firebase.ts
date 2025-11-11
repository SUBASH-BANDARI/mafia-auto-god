import { initializeApp } from 'firebase/app'
import { getAuth, signInAnonymously, setPersistence, browserLocalPersistence } from 'firebase/auth'
import { getFirestore } from 'firebase/firestore'

const firebaseConfig = {
  apiKey: import.meta.env.VITE_FB_API_KEY,
  authDomain: import.meta.env.VITE_FB_AUTH_DOMAIN,
  projectId: import.meta.env.VITE_FB_PROJECT_ID,
  appId: import.meta.env.VITE_FB_APP_ID,
}

const app = initializeApp(firebaseConfig)
export const auth = getAuth(app)

// Set persistence to local storage so authentication persists across page refreshes
// This keeps the user logged in even after closing and reopening the browser
setPersistence(auth, browserLocalPersistence).catch((error) => {
  console.error('Error setting auth persistence:', error)
})

export const db = getFirestore(app)

export async function ensureAnon() {
  // Wait for auth state to be ready (in case of persistence restore)
  await auth.authStateReady()
  
  if (!auth.currentUser) {
    await signInAnonymously(auth)
  }
  return auth.currentUser!
}

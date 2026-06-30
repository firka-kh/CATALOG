import { initializeApp } from "firebase/app";
import { initializeFirestore, doc, getDoc } from "firebase/firestore";
import firebaseConfig from "../firebase-applet-config.json";

const app = initializeApp(firebaseConfig);
const db = initializeFirestore(app, {}, firebaseConfig.firestoreDatabaseId);

async function run() {
  const docRef = doc(db, "settings", "dictionaries");
  const docSnap = await getDoc(docRef);
  if (docSnap.exists()) {
    console.log("DICTIONARIES DATA:");
    console.log(JSON.stringify(docSnap.data(), null, 2));
  } else {
    console.log("No such dictionaries settings document!");
  }
}
run();


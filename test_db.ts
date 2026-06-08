import { initializeApp } from "firebase/app";
import { getFirestore, collection, getDocs, limit } from "firebase/firestore";

const firebaseConfig = {
  projectId: "gen-lang-client-0196317953",
  firestoreDatabaseId: "ai-studio-5f59c4a4-c929-485c-8d2d-607080775340",
};

const app = initializeApp(firebaseConfig);
const db = getFirestore(app, firebaseConfig.firestoreDatabaseId);

async function run() {
  const c = collection(db, "products");
  const snap = await getDocs(c);
  if (snap.empty) {
    console.log("No products");
  } else {
    for (let i = 0; i < Math.min(3, snap.docs.length); i++) {
        const data = snap.docs[i].data();
        console.log(`Product ${i}:`, Object.keys(data));
        console.log(`Has imageBase64:`, !!data.imageBase64);
        if (data.imageBase64) {
          console.log(`Starts with:`, data.imageBase64.substring(0, 30));
        }
    }
  }
  process.exit(0);
}
run();

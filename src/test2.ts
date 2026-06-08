import { initializeApp } from "firebase/app";
import { getFirestore, collection, getDocs, query, where } from "firebase/firestore";

const firebaseConfig = {
  projectId: "ai-studio-5f59c4a4-c929-485c-8d2d-607080775340",
};

const app = initializeApp(firebaseConfig);
const db = getFirestore(app);

async function run() {
  const q = query(collection(db, "products"), where("code", "==", "0002"));
  const snap = await getDocs(q);
  console.log(`Matched codes for 0002: ${snap.size}`);
  snap.forEach(d => console.log(d.id, d.data().code, d.data().name));
}
run().catch(console.error);

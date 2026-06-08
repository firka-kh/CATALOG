import { initializeApp } from "firebase/app";
import { getFirestore, collection, getDocs } from "firebase/firestore";

const firebaseConfig = {
  projectId: "ai-studio-5f59c4a4-c929-485c-8d2d-607080775340",
};

const app = initializeApp(firebaseConfig);
const db = getFirestore(app);

async function run() {
  const snap = await getDocs(collection(db, "products"));
  const items = snap.docs.map(d => ({id: d.id, name: d.data().name, code: d.data().code}));
  console.log(`Total: ${items.length}`);
  const withCode = items.filter(x => x.code);
  console.log(`With code: ${withCode.length}`);
  console.log(withCode.slice(0, 50));
}
run();

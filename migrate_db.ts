import { initializeApp } from 'firebase/app';
import { getFirestore, collection, getDocs, updateDoc, doc } from 'firebase/firestore';
import firebaseConfig from './firebase-applet-config.json' assert { type: 'json' };

const app = initializeApp(firebaseConfig);
const db = getFirestore(app, firebaseConfig.firestoreDatabaseId);

async function migrate() {
  const snapshot = await getDocs(collection(db, "products"));
  for (const docSnap of snapshot.docs) {
    const data = docSnap.data();
    let updated = false;
    let newDate = data.createdAt;
    
    if (typeof data.createdAt === 'string') {
      newDate = new Date(data.createdAt).getTime();
      updated = true;
    } else if (data.createdAt && typeof data.createdAt.toDate === 'function') {
      newDate = data.createdAt.toDate().getTime();
      updated = true;
    } else if (!data.createdAt) {
      newDate = Date.now();
      updated = true;
    }

    if (updated) {
      try {
         await updateDoc(doc(db, "products", docSnap.id), { createdAt: newDate });
         console.log(`Updated ${docSnap.id} to ${newDate}`);
      } catch (e) {
         console.error(`Failed to update ${docSnap.id}:`, e);
      }
    }
  }
}

migrate().then(() => {
  console.log('done');
  process.exit(0);
}).catch(console.error);

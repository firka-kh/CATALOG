import { doc, getDocs, collection, query, orderBy, limit, Firestore, setDoc, getDoc } from "firebase/firestore";

export async function generateNextProductCode(db: Firestore): Promise<string> {
  const counterRef = doc(db, "counters", "products");

  let nextNum = 1;
  try {
    // 1. First check the counter document
    const counterDoc = await getDoc(counterRef);
    if (counterDoc.exists() && counterDoc.data().lastNum) {
      nextNum = counterDoc.data().lastNum + 1;
    }

    // 2. Also check the products collection to be absolutely sure
    const q = query(collection(db, "products"), orderBy("code", "desc"), limit(1));
    const snap = await getDocs(q);
    if (!snap.empty && snap.docs[0].data().code) {
      const lastCode = snap.docs[0].data().code;
      const parsed = parseInt(lastCode, 10);
      if (!isNaN(parsed) && parsed >= nextNum) {
        nextNum = parsed + 1;
      }
    }

    // 3. Update the counter
    await setDoc(counterRef, { lastNum: nextNum }, { merge: true });
    
    return String(nextNum).padStart(4, "0");
  } catch (error) {
    console.error("Error generating next code (fallback logic will be used):", error);
    // Try one more time with a simple retry after 500ms
    await new Promise(r => setTimeout(r, 500));
    try {
      const q = query(collection(db, "products"), orderBy("code", "desc"), limit(1));
      const snap = await getDocs(q);
      let retryNum = 1;
      if (!snap.empty && snap.docs[0].data().code) {
         const parsed = parseInt(snap.docs[0].data().code, 10);
         if (!isNaN(parsed)) retryNum = parsed + 1;
      }
      return String(retryNum).padStart(4, "0");
    } catch (retryError) {
      console.error("Retry failed:", retryError);
      return "M" + Math.random().toString(36).substr(2, 4).toUpperCase();
    }
  }
}


import { doc, runTransaction, getDocs, collection, query, orderBy, limit, Firestore } from "firebase/firestore";

export async function generateNextProductCode(db: Firestore): Promise<string> {
  const counterRef = doc(db, "counters", "products");

  let nextNumFallback = 1;
  try {
    // Attempt to get the latest code out of transaction.
    const q = query(collection(db, "products"), orderBy("code", "desc"), limit(1));
    const snap = await getDocs(q);
    if (!snap.empty && snap.docs[0].data().code) {
      const lastCode = snap.docs[0].data().code;
      const parsed = parseInt(lastCode, 10);
      if (!isNaN(parsed)) {
        nextNumFallback = parsed + 1;
      }
    }
  } catch (e) {
    console.warn("Error fetching last code:", e);
  }

  try {
    const nextCode = await runTransaction(db, async (transaction) => {
      const counterDoc = await transaction.get(counterRef);
      let nextNum = nextNumFallback;

      if (counterDoc.exists()) {
        const storedNum = counterDoc.data().lastNum || 0;
        if (storedNum >= nextNumFallback) {
          nextNum = storedNum + 1;
        }
      }
      
      transaction.set(counterRef, { lastNum: nextNum }, { merge: true });
      return String(nextNum).padStart(4, "0");
    });
    return nextCode;
  } catch (error) {
    console.error("Error generating next code via transaction:", error);
    // Fallback: Generate a random string as code if transaction fails 
    return "M" + Math.random().toString(36).substr(2, 4).toUpperCase();
  }
}

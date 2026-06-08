import { doc, runTransaction, getDocs, collection, query, orderBy, limit, Firestore } from "firebase/firestore";

export async function generateNextProductCode(db: Firestore): Promise<string> {
  const counterRef = doc(db, "counters", "products");

  try {
    const nextCode = await runTransaction(db, async (transaction) => {
      const counterDoc = await transaction.get(counterRef);
      let nextNum = 1;

      if (counterDoc.exists()) {
        nextNum = (counterDoc.data().lastNum || 0) + 1;
        transaction.set(counterRef, { lastNum: nextNum }, { merge: true });
        return String(nextNum).padStart(4, "0");
      } else {
        // Find max code manually if counter doesn't exist
        const q = query(collection(db, "products"), orderBy("code", "desc"), limit(1));
        const snap = await getDocs(q);
        if (!snap.empty && snap.docs[0].data().code) {
          const lastCode = snap.docs[0].data().code;
          const num = parseInt(lastCode, 10);
          if (!isNaN(num)) {
            nextNum = num + 1;
          }
        }
        transaction.set(counterRef, { lastNum: nextNum });
        return String(nextNum).padStart(4, "0");
      }
    });
    return nextCode;
  } catch (error) {
    console.error("Error generating next code via transaction:", error);
    // Fallback: Generate a random string as code if transaction fails 
    return "M" + Math.random().toString(36).substr(2, 4).toUpperCase();
  }
}

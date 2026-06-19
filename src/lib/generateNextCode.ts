import { doc, getDocs, collection, query, orderBy, limit, Firestore, runTransaction, setDoc } from "firebase/firestore";

export async function generateNextProductCode(db: Firestore): Promise<string> {
  const counterRef = doc(db, "counters", "products");

  // Find the absolute maximum code in the database first to prevent overlap if the counter is stale
  let maxExisting = 0;
  try {
    const q = query(collection(db, "products"), orderBy("code", "desc"), limit(1));
    const snap = await getDocs(q);
    if (!snap.empty && snap.docs[0].data().code) {
       const parsed = parseInt(snap.docs[0].data().code, 10);
       if (!isNaN(parsed)) {
          maxExisting = parsed;
       }
    }
  } catch(e) {
    console.warn("Could not fetch max existing code:", e);
  }

  let baseNextNum = maxExisting + 1;

  try {
    const nextCodeStr = await runTransaction(db, async (transaction) => {
      const counterDoc = await transaction.get(counterRef);
      let txNextNum = baseNextNum;
      
      if (counterDoc.exists()) {
        const data = counterDoc.data();
        if (data && typeof data.lastNum === "number" && data.lastNum >= txNextNum) {
          txNextNum = data.lastNum + 1;
        }
      }

      transaction.set(counterRef, { lastNum: txNextNum });
      return String(txNextNum).padStart(4, "0");
    });
    return nextCodeStr;
  } catch (error) {
    console.error("Transaction failed: ", error);
    try {
       await setDoc(counterRef, { lastNum: baseNextNum }, { merge: true });
    } catch (e) {
       console.error("Fallback setDoc failed: ", e);
    }
    return String(baseNextNum).padStart(4, "0");
  }
}


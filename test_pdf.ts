import PDFDocument from 'pdfkit';
import sharp from 'sharp';
import { initializeApp } from "firebase/app";
import { getFirestore, collection, getDocs, limit } from "firebase/firestore";
import fs from 'fs';

const firebaseConfig = {
  projectId: "gen-lang-client-0196317953",
  firestoreDatabaseId: "ai-studio-5f59c4a4-c929-485c-8d2d-607080775340",
};

const app = initializeApp(firebaseConfig);
const db = getFirestore(app, firebaseConfig.firestoreDatabaseId);

async function run() {
  const c = collection(db, "products");
  const snap = await getDocs(c);
  const data = snap.docs[1].data(); // this is webp
  
  try {
     const base64Data = data.imageBase64.replace(/^data:image\/\w+;base64,/, "");
     const imgBuffer = Buffer.from(base64Data, 'base64');
     const jpegBuffer = await sharp(imgBuffer).jpeg().toBuffer();
     
     const docPdf = new PDFDocument({ margin: 30, size: "A4" });
     const bufs: any[] = [];
     docPdf.on("data", (d) => bufs.push(d));
     docPdf.image(jpegBuffer, 75, 75, { fit: [40, 40], align: 'center', valign: 'center' });
     docPdf.end();
     console.log("Success with Sharp!");
  } catch(e) {
     console.error("SHARP ERROR:", e);
  }
  process.exit();
}
run();

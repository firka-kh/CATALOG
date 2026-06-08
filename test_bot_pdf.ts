import TelegramBot from 'node-telegram-bot-api';
import PDFDocument from 'pdfkit';

const token = "8983529729:AAGNc2kvtXQgP0qCin4E_Dzwr4FHiYOv3KU";
const bot = new TelegramBot(token);

async function run() {
  try {
    const docPdf = new PDFDocument({ margin: 30, size: "A4" });
    const bufs: any[] = [];
    docPdf.on("data", (d) => bufs.push(d));
    docPdf.text("Test PDF");
    docPdf.end();
    
    const pdfBuffer = await new Promise<Buffer>((r) => docPdf.on('end', () => r(Buffer.concat(bufs))));
    
    console.log("Sending...");
    // Replace with the user's chat ID if known, but here we can just test if it throws a validation error before sending
    await bot.sendDocument(12345678, pdfBuffer, {}, { filename: "Cart.pdf", contentType: "application/pdf" });
    console.log("Sent successfully");
  } catch(e:any) {
    if (e.response && e.response.body) {
      console.log("API Error: ", e.response.body);
    } else {
      console.log("Error: " + e.message);
    }
  }
}
run();

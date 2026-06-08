import axios from 'axios';
async function run() {
  try {
    const res = await axios.head('https://raw.githubusercontent.com/googlefonts/roboto/main/src/hinted/Roboto-Regular.ttf');
    console.log("Status: " + res.status);
  } catch(e:any) {
    console.log("Error: " + e.message);
  }
}
run();

const fs = require('fs');

async function test() {
  try {
    const res = await fetch('http://localhost:3000/api/parse-product', {
      method: 'POST',
      headers: {'Content-Type': 'application/json'},
      body: JSON.stringify({
        imageBase64: 'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNkYAAAAAYAAjCB0C8AAAAASUVORK5CYII=',
        mimeType: 'image/png'
      })
    });
    console.log(await res.json());
  } catch(e) {
    console.error(e);
  }
}
test();

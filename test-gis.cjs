const gis = require('g-i-s');
gis('cats', (err, res) => {
  console.log(err, res ? res.slice(0, 3) : null);
});

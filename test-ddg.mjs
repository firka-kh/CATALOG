import pkg from 'duck-duck-scrape';
const { search } = pkg;

search('Internal React error: Expected static flag was missing.').then(res => console.log(JSON.stringify(res.results.slice(0, 3)))).catch(console.error);

if (pkg.searchImages) {
    pkg.searchImages('cats').then(res => console.log('images:', res.results.slice(0, 3))).catch(console.error);
} else {
    console.log(Object.keys(pkg));
}

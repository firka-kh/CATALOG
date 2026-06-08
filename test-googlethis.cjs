const google = require('googlethis');
const options = {
    page: 0,
    safe: false,
    additional_params: {}
};
google.search('Expected static flag was missing React', options)
    .then(res => console.log(JSON.stringify(res.results.slice(0, 3))))
    .catch(console.error);

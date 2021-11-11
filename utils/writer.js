const fs = require('fs');

module.exports = (name, data) => {
    fs.writeFile(name, data, err => {
        if (err) {
            console.log('Error writing file', err);
        } else {
            console.log('Successfully wrote file');
        }
    })
}
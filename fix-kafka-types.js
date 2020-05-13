const { readFile, writeFile } = require('fs');

function sed(path, mapper) {
    readFile(path, function (err, data) {
        if (err) {
            console.error(`Could not read file ${path}: ${err}`);
        }
        writeFile(path, mapper(data.toString()), function (err) {
            if (err) {
                console.error(`Could not write file ${path}: ${err}`);
            }
        });
    });
}

console.log('Fixing broken kafka types');

sed('node_modules/kafka-node/types/index.d.ts', data => data.replace(" _write (", " //_write ("));

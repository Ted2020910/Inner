const fs = require('fs');

const path = process.argv.slice(2).join(' ');
if (!path) {
  process.exit(1);
}

process.stdout.write(fs.readFileSync(path, 'utf8'));

const fs = require('fs');
const path = require('path');

const sizes = [16, 48, 128];
// 1x1 transparent pixel base64
const base64png = 'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAACklEQVR4nGMAAQAABQABDQottAAAAABJRU5ErkJggg==';

const dir = path.join(__dirname, 'icons');
if (!fs.existsSync(dir)) {
  fs.mkdirSync(dir);
}

sizes.forEach(size => {
  fs.writeFileSync(path.join(dir, `icon${size}.png`), Buffer.from(base64png, 'base64'));
});

console.log("Icons created successfully.");

const initSqlJs = require('sql.js');
const fs = require('fs');
const path = require('path');
const dbPath = path.join(process.env.APPDATA, 'result-management-system', 'data', 'database.sqlite');
console.log('DB exists:', fs.existsSync(dbPath));
const buf = fs.readFileSync(dbPath);
initSqlJs().then(SQL => {
  const db = new SQL.Database(buf);
  const settings = db.exec("SELECT key, value FROM settings ORDER BY key");
  console.log('All settings:');
  settings[0].values.forEach(row => console.log('  ' + row[0] + ' = ' + row[1]));
  db.close();
});

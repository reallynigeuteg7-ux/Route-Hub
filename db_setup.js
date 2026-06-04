const sqlite3 = require("sqlite3").verbose();
const db = new sqlite3.Database("./db/users.db");

db.serialize(() => {
  db.run(`CREATE TABLE IF NOT EXISTS users (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    name TEXT,
    email TEXT UNIQUE,
    password TEXT,
    phone TEXT,
    company TEXT
  )`);

  // 2. Создаем таблицу грузов (ровно те поля, что в форме)
  db.run(`CREATE TABLE IF NOT EXISTS loads (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    userId INTEGER,
    from_location TEXT,
    to_location TEXT,
    weight REAL,
    volume REAL,
    type TEXT,
    price REAL,
    ready_date TEXT,     
    loading_type TEXT,
    description TEXT,
    contact_info TEXT
  )`);

});

db.close();
console.log("📁 Database created successfully");

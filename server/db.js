import { DatabaseSync } from "node:sqlite";
import { mkdirSync } from "node:fs";
import { join } from "node:path";
import { randomBytes, scryptSync } from "node:crypto";
export const passwordHash = (
  password,
  salt = randomBytes(16).toString("hex"),
) => `${salt}:${scryptSync(password, salt, 64).toString("hex")}`;
export function openDatabase(dir) {
  mkdirSync(dir, { recursive: true, mode: 0o700 });
  const db = new DatabaseSync(join(dir, "samplio.sqlite"));
  db.exec(`PRAGMA journal_mode=WAL; PRAGMA foreign_keys=ON;
  CREATE TABLE IF NOT EXISTS users(id INTEGER PRIMARY KEY, username TEXT UNIQUE, name TEXT, role TEXT, password TEXT);
  CREATE TABLE IF NOT EXISTS sessions(token TEXT PRIMARY KEY,user_id INTEGER REFERENCES users(id),expires INTEGER);
  CREATE TABLE IF NOT EXISTS samples(id TEXT PRIMARY KEY, code TEXT UNIQUE NOT NULL, name TEXT NOT NULL, category TEXT, color TEXT, length REAL,width REAL,height REAL,image TEXT,descriptor TEXT,notes TEXT,owner_id INTEGER REFERENCES users(id),created_at TEXT,updated_at TEXT,published INTEGER DEFAULT 0,deadline TEXT,deleted INTEGER DEFAULT 0,revision INTEGER DEFAULT 1);
  CREATE TABLE IF NOT EXISTS reactions(sample_id TEXT REFERENCES samples(id),user_id INTEGER REFERENCES users(id),kind TEXT,created_at TEXT,PRIMARY KEY(sample_id,user_id,kind));
  CREATE TABLE IF NOT EXISTS comments(id TEXT PRIMARY KEY,sample_id TEXT REFERENCES samples(id),user_id INTEGER REFERENCES users(id),body TEXT,parent_id TEXT,created_at TEXT);
  CREATE TABLE IF NOT EXISTS audit(id INTEGER PRIMARY KEY AUTOINCREMENT,user_id INTEGER,action TEXT,sample_id TEXT,detail TEXT,ip TEXT,created_at TEXT);
  CREATE TABLE IF NOT EXISTS settings(id INTEGER PRIMARY KEY CHECK(id=1),body TEXT);
  CREATE TABLE IF NOT EXISTS counters(day TEXT PRIMARY KEY,value INTEGER);
  CREATE TABLE IF NOT EXISTS uploads(path TEXT PRIMARY KEY,user_id INTEGER REFERENCES users(id),descriptor TEXT,color TEXT);
  `);
  if (!db.prepare("SELECT id FROM users LIMIT 1").get()) {
    const pass = passwordHash(process.env.DEMO_PASSWORD || "Samplio2026!");
    db.prepare("INSERT INTO users VALUES (?,?,?,?,?)").run(
      1,
      "admin",
      "林予安",
      "admin",
      pass,
    );
    db.prepare("INSERT INTO users VALUES (?,?,?,?,?)").run(
      2,
      "chen",
      "陈思远",
      "employee",
      pass,
    );
    db.prepare("INSERT INTO users VALUES (?,?,?,?,?)").run(
      3,
      "lin",
      "林可欣",
      "employee",
      pass,
    );
    db.prepare("INSERT INTO settings VALUES (1,?)").run(
      JSON.stringify({
        prefix: "SP",
        threshold: 80,
        like: 1,
        favorite: 3,
        comment: 2,
      }),
    );
  }
  return db;
}

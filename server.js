const express = require('express');
const session = require('express-session');
const SQLiteStore = require('connect-sqlite3')(session);
const bcrypt = require('bcryptjs');
const path = require('path');
const sqlite3 = require('sqlite3').verbose();

const app = express();
const db = new sqlite3.Database('./db/users.db');

// --- 1. ИНИЦИАЛИЗАЦИЯ БАЗЫ ---
db.serialize(() => {
    // Таблица пользователей
   db.run(`CREATE TABLE IF NOT EXISTS favorites (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    userId INTEGER,
    loadId INTEGER,
    UNIQUE(userId, loadId), -- Чтобы нельзя было добавить один и тот же груз дважды
    FOREIGN KEY(userId) REFERENCES users(id),
    FOREIGN KEY(loadId) REFERENCES loads(id) ON DELETE CASCADE
    )`);

    db.run(`CREATE TABLE IF NOT EXISTS users (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        name TEXT,
        email TEXT UNIQUE,
        password TEXT,
        phone TEXT,
        company TEXT,
        role TEXT DEFAULT 'client'  -- 'client'
    )`);

    // Таблица грузов
    db.run(`CREATE TABLE IF NOT EXISTS loads (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        userId INTEGER,
        from_location TEXT,
        to_location TEXT,
        weight REAL,
        type TEXT,
        price REAL,
        date TEXT,
        lat REAL,
        lng REAL,
        contact_info TEXT,
        volume REAL,
        length REAL,
        width REAL,
        height REAL,
        loading_type TEXT,
        description TEXT
    )`);

    // Проверка/Добавление колонок (если база уже создана)
    const loadCols = ['volume', 'length', 'width', 'height', 'loading_type', 'description'];
    loadCols.forEach(col => {
        db.run(`ALTER TABLE loads ADD COLUMN ${col} REAL`, (err) => {});
    });
});

app.use(express.json());
app.use(express.static(path.join(__dirname, 'public')));

app.use(session({
    store: new SQLiteStore({ db: 'session.sqlite', dir: './db' }),
    secret: 'super-secret-key',
    resave: false,
    saveUninitialized: false,
    cookie: { maxAge: 1000 * 60 * 60 * 24, httpOnly: true }
}));

function checkAuth(req, res, next) {
    if (req.session.userId) next();
    else res.status(401).json({ error: 'Необходима авторизация' });
}

// --- 2. РОУТЫ АВТОРИЗАЦИИ ---

// РЕГИСТРАЦИЯ (то, чего не хватало)
app.post('/api/register', async (req, res) => {
    const { name, email, password, role } = req.body;
    try {
        const hashedPassword = await bcrypt.hash(password, 10);
        // Добавляем роль в запрос
        db.run(`INSERT INTO users (name, email, password, role, phone) VALUES (?, ?, ?, ?, ?)`, 
        [name, email, hashedPassword, role || 'client'], function(err) {
            if (err) {
                console.error("ОШИБКА БАЗЫ:", err.message); // Это появится в терминале VS Code
                if (err.message.includes("UNIQUE")) {
                    return res.status(400).json({ error: 'Этот Email уже занят' });
                }
                return res.status(500).json({ error: 'Ошибка базы: ' + err.message });
            }
            req.session.userId = this.lastID;
            res.json({ ok: true });
        });
    } catch (e) {
        res.status(500).json({ error: 'Ошибка сервера' });
    }
});

// ЛОГИН
app.post('/api/login', (req, res) => {
    const { email, password } = req.body;
    db.get('SELECT * FROM users WHERE email = ?', [email], async (err, user) => {
        if (err || !user) return res.status(401).json({ error: 'Пользователь не найден' });
        const match = await bcrypt.compare(password, user.password);
        if (match) {
            req.session.userId = user.id;
            res.json({ ok: true });
        } else {
            res.status(401).json({ error: 'Неверный пароль' });
        }
    });
});

app.get('/api/me', (req, res) => {
    if (!req.session.userId) return res.status(401).json({ error: 'Unauthorized' });
    const userId = req.session.userId;

    db.get('SELECT id, name, email, phone, company, role FROM users WHERE id = ?', [userId], (err, user) => {
        if (err || !user) return res.status(401).json({ error: 'User not found' });
        
        db.get('SELECT COUNT(*) as activeCount FROM loads WHERE userId = ?', [userId], (err, row) => {
            res.json({ ...user, activeLoads: row ? row.activeCount : 0 });
        });
    });
});

app.post('/api/logout', (req, res) => {
    req.session.destroy(() => res.json({ ok: true }));
});

// --- 3. РАБОТА С ГРУЗАМИ ---

app.post('/api/loads', checkAuth, (req, res) => {
    const userId = req.session.userId;
    // ВАЖНО: берем ready_date, так как фронт шлет именно это название
    const { from_location, to_location, weight, type, price, ready_date, lat, lng, 
            volume, length, width, height, loading_type, description } = req.body;

    db.get('SELECT phone FROM users WHERE id = ?', [userId], (err, user) => {
        const contact = (user && user.phone) ? user.phone : "Телефон не указан";
        const query = `INSERT INTO loads (userId, from_location, to_location, weight, type, price, date, lat, lng, contact_info, volume, length, width, height, loading_type, description) 
                       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`;
        
        // Вставляем ready_date в колонку date
        const params = [userId, from_location, to_location, weight, type, price, ready_date, lat || 0, lng || 0, contact, volume, length, width, height, loading_type, description];

        db.run(query, params, function(err) {
            if (err) return res.status(500).json({ error: err.message });
            res.json({ success: true, loadId: this.lastID });
        });
    });
});

app.get('/api/loads', (req, res) => {
    db.all('SELECT * FROM loads ORDER BY id DESC', [], (err, rows) => {
        if (err) return res.status(500).json({ error: err.message });
        res.json(rows);
    });
});

app.post('/api/update-profile', checkAuth, (req, res) => {
    const { name, phone, company } = req.body;
    db.run(`UPDATE users SET name = ?, phone = ?, company = ? WHERE id = ?`, 
    [name, phone, company, req.session.userId], (err) => {
        if (err) return res.status(500).json({ error: err.message });
        res.json({ ok: true });
    });
});

app.get('/api/stats', (req, res) => {
    // Получаем общие цифры и данные для графика по городам
    const stats = {};
    
    db.get('SELECT COUNT(*) as totalLoads FROM loads', (err, row) => {
        stats.totalLoads = row ? row.totalLoads : 0;
        
        db.get('SELECT COUNT(*) as totalUsers FROM users', (err, row) => {
            stats.totalUsers = row ? row.totalUsers : 0;
            
            // Группируем по городам (Топ-5)
            db.all('SELECT from_location as city, COUNT(*) as count FROM loads GROUP BY from_location ORDER BY count DESC LIMIT 5', (err, cities) => {
                stats.cities = cities;
                res.json(stats);
            });
        });
    });
});

// Получение грузов только текущего пользователя
app.get('/api/my-loads', checkAuth, (req, res) => {
    const userId = req.session.userId;
    db.all('SELECT * FROM loads WHERE userId = ? ORDER BY id DESC', [userId], (err, rows) => {
        if (err) return res.status(500).json({ error: err.message });
        res.json(rows);
    });
});

// Удаление конкретного груза (проверяем, что он принадлежит юзеру)
app.delete('/api/loads/:id', checkAuth, (req, res) => {
    const loadId = req.params.id;
    const userId = req.session.userId;

    db.run('DELETE FROM loads WHERE id = ? AND userId = ?', [loadId, userId], function(err) {
        if (err) return res.status(500).json({ error: err.message });
        if (this.changes === 0) return res.status(404).json({ error: "Груз не найден или не принадлежит вам" });
        res.json({ ok: true });
    });
});

app.get('/api/favorites', checkAuth, (req, res) => {
    const userId = req.session.userId;
    // Соединяем таблицу favorites с loads, чтобы вытащить данные о грузе
    const query = `
        SELECT l.* FROM loads l
        INNER JOIN favorites f ON l.id = f.loadId
        WHERE f.userId = ?
    `;
    db.all(query, [userId], (err, rows) => {
        if (err) return res.status(500).json({ error: err.message });
        res.json(rows);
    });
});

app.delete('/api/favorites/:loadId', checkAuth, (req, res) => {
    const userId = req.session.userId;
    const loadId = req.params.loadId;
    db.run('DELETE FROM favorites WHERE userId = ? AND loadId = ?', [userId, loadId], function(err) {
        if (err) return res.status(500).json({ error: err.message });
        res.json({ success: true });
    });
});

app.listen(3000, () => console.log('Server is running: http://localhost:3000'));
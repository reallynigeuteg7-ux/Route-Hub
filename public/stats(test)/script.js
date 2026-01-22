document.addEventListener('DOMContentLoaded', () => {
    initStats();
    startSimulatedSystem();
});

async function initStats() {
    try {
        const response = await fetch('/api/stats');
        if (!response.ok) throw new Error();
        const stats = await response.json();

        // Данные из базы
        document.getElementById('total-loads').textContent = stats.totalLoads || 0;
        document.getElementById('total-users').textContent = stats.totalUsers || 0;

        // Полоска прогресса
        const prog = Math.min((stats.totalLoads / 1000) * 100, 100);
        document.getElementById('goal-progress').style.width = prog + '%';
        document.getElementById('prog-perc').textContent = Math.floor(prog) + '%';

        addLog(`Связь установлена. Получено объектов: ${stats.totalLoads}`);
    } catch (err) {
        addLog("ВНИМАНИЕ: Ошибка API. Работа в оффлайн режиме.", "warn");
    }
}

function addLog(text) {
    const feed = document.getElementById('event-feed');
    if (!feed) return;
    const entry = document.createElement('div');
    entry.className = 'event-item';
    entry.innerHTML = `<span style="opacity:0.4">[${new Date().toLocaleTimeString()}]</span> > ${text}`;
    feed.prepend(entry);
    if (feed.children.length > 10) feed.lastChild.remove();
}

function startSimulatedSystem() {
    const cities = ["Астана", "Алматы", "Павлодар", "Шымкент", "Актобе", "Костанай"];
    const tasks = ["Анализ трафика", "Проверка узла", "Оптимизация БД", "Обновление кэша"];

    setInterval(() => {
        const city = cities[Math.floor(Math.random() * cities.length)];
        const task = tasks[Math.floor(Math.random() * tasks.length)];
        
        document.getElementById('scanning-city').textContent = `Скан: ${city}...`;
        
        if (Math.random() > 0.6) addLog(`${task}: ${city} — Активен`);
        
        const load = (Math.random() * 4 + 0.2).toFixed(1);
        document.getElementById('load-val').textContent = load + '%';
    }, 4000);
}
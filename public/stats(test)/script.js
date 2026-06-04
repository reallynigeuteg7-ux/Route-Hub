document.addEventListener('DOMContentLoaded', () => {
    initStats();
    document.getElementById('refresh-stats')?.addEventListener('click', initStats);
});

function setText(id, value) {
    const el = document.getElementById(id);
    if (el) el.textContent = value;
}

function formatNumber(value) {
    const numeric = Number(value || 0);
    return Number.isFinite(numeric) ? numeric.toLocaleString('ru-RU') : '0';
}

function formatMoney(value) {
    const numeric = Number(value || 0);
    return `${formatNumber(Math.round(numeric))} ₸`;
}

function percent(value) {
    const numeric = Math.max(0, Math.min(100, Number(value || 0)));
    return Number.isFinite(numeric) ? numeric : 0;
}

async function initStats() {
    const refreshButton = document.getElementById('refresh-stats');

    try {
        if (refreshButton) refreshButton.disabled = true;

        const response = await fetch('/api/stats', { cache: 'no-store' });
        if (!response.ok) throw new Error('Не удалось загрузить статистику');

        const stats = await response.json();
        renderStats(stats);
    } catch (err) {
        setText('stats-updated', 'Не удалось загрузить реальные данные. Проверьте сервер и базу.');
    } finally {
        if (refreshButton) refreshButton.disabled = false;
    }
}

function renderStats(stats) {
    const loads = stats.loads || {};
    const users = stats.users || {};
    const offers = stats.offers || {};
    const finance = stats.finance || {};

    const totalLoads = Number(loads.total || stats.totalLoads || 0);
    const activeLoads = Number(loads.active || stats.activeLoads || 0);
    const completedLoads = Number(loads.completed || 0);
    const completionRate = percent(loads.completionRate || (totalLoads ? completedLoads / totalLoads * 100 : 0));
    const activeRate = percent(totalLoads ? activeLoads / totalLoads * 100 : 0);

    setText('month-turnover', formatMoney(offers.acceptedAmountMonth || finance.releasedAmountMonth || 0));
    setText('month-turnover-sub', `${formatNumber(offers.accepted || 0)} принятых ставок всего`);

    setText('active-loads', formatNumber(activeLoads));
    setText('active-loads-sub', `Открыто: ${formatNumber(loads.open || 0)} · назначено: ${formatNumber(loads.assigned || 0)}`);

    setText('completed-loads', formatNumber(completedLoads));
    setText('completed-loads-sub', `Всего грузов: ${formatNumber(totalLoads)}`);

    setText('total-users', formatNumber(users.total || stats.totalUsers || 0));
    setText('users-sub', `Перевозчиков: ${formatNumber(users.carriers || 0)} · владельцев: ${formatNumber(users.owners || 0)}`);

    setText('completion-rate', `${Math.round(completionRate)}%`);
    setText('completion-sub', `Завершено ${formatNumber(completedLoads)} из ${formatNumber(totalLoads)} грузов.`);

    const circle = document.getElementById('completion-circle');
    if (circle) circle.setAttribute('stroke-dasharray', `${completionRate}, 100`);

    const activeProgress = document.getElementById('active-progress');
    if (activeProgress) activeProgress.style.width = `${activeRate}%`;

    setText('offers-total', formatNumber(offers.total || 0));
    setText('offers-pending', formatNumber(offers.pending || 0));
    setText('offers-accepted', formatNumber(offers.accepted || 0));

    setText('escrow-held', formatMoney(finance.heldAmount || 0));
    setText('escrow-released', formatMoney(finance.releasedAmount || 0));
    setText('commission-total', formatMoney(finance.commissionAmount || 0));

    renderTopRoutes(stats.topRoutes || []);

    const updated = stats.updatedAt ? new Date(stats.updatedAt) : new Date();
    setText('stats-updated', `Обновлено: ${updated.toLocaleString('ru-RU')}`);
}

function renderTopRoutes(routes) {
    const list = document.getElementById('top-routes');
    if (!list) return;

    if (!routes.length) {
        list.innerHTML = '<li><span>Маршрутов пока нет</span><strong>0</strong></li>';
        return;
    }

    list.innerHTML = routes.map((item) => `
        <li>
            <span>${escapeHtml(item.route || 'Не указано')}</span>
            <strong>${formatNumber(item.count || 0)}</strong>
        </li>
    `).join('');
}

function escapeHtml(value) {
    return String(value ?? '')
        .replace(/&/g, '&amp;')
        .replace(/</g, '&lt;')
        .replace(/>/g, '&gt;')
        .replace(/"/g, '&quot;')
        .replace(/'/g, '&#39;');
}

// ==========================================
// ЯДРО ПРИЛОЖЕНИЯ: АВТОРИЗАЦИЯ, ЗАГРУЗКА, ВКЛАДКИ, ГРАФИКИ
// ==========================================

function showError(title, message, details) {
    document.getElementById('loadingScreen').classList.add('hidden');
    const el = document.getElementById('errorScreen');
    el.classList.remove('hidden');
    el.innerHTML = '<div class="error-box"><h3>⚠️ ' + esc(title) + '</h3><p>' + message + '</p>' +
        (details ? '<p style="font-size:12px;color:#9ca3af;margin-top:12px;">Деталь: <code>' + esc(details) + '</code></p>' : '') +
        '<p style="margin-top:16px;font-size:13px;"><b>Что делать:</b> проверьте, что SQL-скрипты выполнены в Supabase.</p></div>';
}

/* ===== Вход / выход ===== */
function checkPassword() {
    const input = document.getElementById('passwordInput').value;
    const errorEl = document.getElementById('loginError');
    const encoded = btoa(unescape(encodeURIComponent(input)));
    if (encoded === PASSWORD_B64) {
        sessionStorage.setItem('hr_auth', 'ok');
        errorEl.textContent = '';
        showDashboard();
    } else {
        errorEl.textContent = 'Неверный пароль';
        document.getElementById('passwordInput').value = '';
        document.getElementById('passwordInput').focus();
    }
}

function logout() {
    sessionStorage.removeItem('hr_auth');
    location.reload();
}

function showDashboard() {
    document.getElementById('loginScreen').style.display = 'none';
    document.getElementById('mainApp').style.display = 'block';
    loadAllData();
    subscribeRealtime();
}

function isAuthenticated() {
    return sessionStorage.getItem('hr_auth') === 'ok';
}

/* ===== Загрузка данных ===== */
async function loadAllData() {
    setSync('syncing');
    try {
        const [vRes, mRes, kRes] = await Promise.all([
            sb.from('vacancies').select('*').order('created_at', { ascending: false }),
            sb.from('hr_metrics').select('*'),
            sb.from('hr_kpi').select('*')
        ]);

        if (vRes.error) throw vRes.error;
        if (mRes.error) throw mRes.error;
        if (kRes.error) throw kRes.error;

        vacancies = vRes.data || [];
        hrMetrics = mRes.data || [];
        hrKpi = kRes.data || [];

        setSync('ok');
        document.getElementById('loadingScreen').classList.add('hidden');
        document.getElementById('appScreen').classList.remove('hidden');
        render();
    } catch (err) {
        console.error('Ошибка загрузки:', err);
        setSync('error');
        showError('Не удалось загрузить данные', 'Проверьте подключение к Supabase.', err.message || String(err));
    }
}

async function refreshData() {
    const btn = document.getElementById('refreshBtn');
    btn.disabled = true; btn.textContent = '⏳ Обновление...';
    await loadAllData();
    btn.disabled = false; btn.textContent = '🔄 Обновить';
    toast('Данные обновлены');
}

function subscribeRealtime() {
    if (realtimeChannel) sb.removeChannel(realtimeChannel);
    realtimeChannel = sb.channel('all-changes')
        .on('postgres_changes', { event: '*', schema: 'public', table: 'vacancies' }, () => { loadAllData(); })
        .on('postgres_changes', { event: '*', schema: 'public', table: 'hr_metrics' }, () => { loadAllData(); })
        .on('postgres_changes', { event: '*', schema: 'public', table: 'hr_kpi' }, () => { loadAllData(); })
        .subscribe();
}

/* ===== Переключение вкладок ===== */
function switchTab(tab) {
    currentTab = tab;
    ['active', 'compare', 'closures', 'archive', 'metrics'].forEach(t => {
        const tabEl = document.getElementById('tab' + t.charAt(0).toUpperCase() + t.slice(1));
        if (tabEl) tabEl.classList.toggle('active', t === tab);
    });
    document.getElementById('archiveHint').classList.toggle('hidden', tab !== 'archive');
    document.getElementById('viewActive').classList.toggle('hidden', tab !== 'active');
    document.getElementById('viewCompare').classList.toggle('hidden', tab !== 'compare');
    document.getElementById('viewClosures').classList.toggle('hidden', tab !== 'closures');
    document.getElementById('viewArchive').classList.toggle('hidden', tab !== 'archive');
    document.getElementById('viewMetrics').classList.toggle('hidden', tab !== 'metrics');
    render();
}

/* ===== Главный рендер ===== */
function render() {
    const empty = document.getElementById('emptyState');
    const summary = document.getElementById('summaryCard');
    const viewActive = document.getElementById('viewActive');
    const viewArchive = document.getElementById('viewArchive');

    const active = vacancies.filter(v => !isArchived(v));
    const archive = vacancies.filter(v => isArchived(v));
    const inClosures = vacancies.filter(v => isInClosures(v));

    document.getElementById('countActive').textContent = active.length;
    document.getElementById('countArchive').textContent = archive.length;
    document.getElementById('countClosures').textContent = inClosures.length;

    if (vacancies.length === 0) {
        empty.style.display = 'block';
        summary.style.display = 'none';
        viewActive.innerHTML = '';
        viewArchive.innerHTML = '';
        if (compareChart) { compareChart.destroy(); compareChart = null; }
        return;
    }
    empty.style.display = 'none';
    summary.style.display = 'block';

    viewActive.innerHTML = '';
    if (active.length === 0) {
        viewActive.innerHTML = '<div class="empty-state" style="grid-column:1/-1;"><h3>Нет активных вакансий</h3><p>Все вакансии закрыты</p></div>';
    } else {
        active.forEach(v => viewActive.appendChild(renderCard(v)));
    }

    viewArchive.innerHTML = '';
    if (archive.length === 0) {
        viewArchive.innerHTML = '<div class="empty-state" style="grid-column:1/-1;"><h3>Архив пуст</h3><p>Вакансии с датой закрытия появятся здесь</p></div>';
    } else {
        archive.forEach(v => viewArchive.appendChild(renderCard(v)));
    }

    renderClosuresTab();
    renderCompareChart();
    renderSummary();
    renderStrategicMetrics();
    renderKpiMetrics();
}

/* ===== Сохранение полей (с дебаунсом) ===== */
function debouncedSave(id, patch) {
    const v = vacancies.find(x => x.id === id);
    if (v) {
        if (patch.participants) v.participants = { ...v.participants, ...patch.participants };
        if (patch.external) v.external = { ...v.external, ...patch.external };
        if (patch.salary !== undefined) v.salary = patch.salary;
        if (patch.hires !== undefined) v.hires = patch.hires;
        if (patch.norm_hours !== undefined) v.norm_hours = patch.norm_hours;
    }
    render();
    if (saveTimers[id]) clearTimeout(saveTimers[id]);
    setSync('syncing');
    saveTimers[id] = setTimeout(async () => {
        const { error } = await sb.from('vacancies').update(patch).eq('id', id);
        if (error) { setSync('error'); toast('Ошибка сохранения: ' + error.message); }
        else { setSync('ok'); }
    }, 600);
}

function updateParticipant(id, key, value) {
    const v = vacancies.find(x => x.id === id);
    if (!v) return;
    const participants = { ...(v.participants || {}) };
    participants[key] = num(value);
    debouncedSave(id, { participants });
}

function updateExternal(id, key, value) {
    const v = vacancies.find(x => x.id === id);
    if (!v) return;
    const external = { ...(v.external || {}) };
    external[key] = num(value);
    debouncedSave(id, { external });
}

/* ===== Графики ===== */
function renderCompareChart() {
    const ctx = document.getElementById('compareChart').getContext('2d');
    const sorted = [...vacancies].sort((a, b) => calc(b).total - calc(a).total);
    const labels = sorted.map(v => v.title.length > 20 ? v.title.slice(0, 18) + '…' : v.title);
    const data = sorted.map(v => calc(v).total);
    const colors = sorted.map(v => {
        const m = calc(v);
        if (m.hires >= MANY_HIRES_THRESHOLD) return '#10b981';
        return isArchived(v) ? '#9ca3af' : '#6366f1';
    });

    if (compareChart) compareChart.destroy();
    compareChart = new Chart(ctx, {
        type: 'bar',
        data: {
            labels,
            datasets: [{
                label: 'Полная стоимость, ₽',
                data,
                backgroundColor: colors,
                borderRadius: 6
            }]
        },
        options: {
            responsive: true,
            plugins: {
                legend: { display: false },
                tooltip: {
                    callbacks: {
                        title: (items) => sorted[items[0].dataIndex].title,
                        label: (c) => {
                            const v = sorted[c.dataIndex];
                            const m = calc(v);
                            return [
                                'Стоимость: ' + fmt(m.total) + ' ₽',
                                'Наймов: ' + m.hires,
                                'Статус: ' + (isArchived(v) ? 'Закрыта' : 'Активная')
                            ];
                        }
                    }
                }
            },
            scales: {
                y: { beginAtZero: true, ticks: { callback: v => fmt(v) + ' ₽' } },
                x: { ticks: { maxRotation: 45, minRotation: 0, autoSkip: false, font: { size: 10 } } }
            }
        }
    });
}

function renderSummary() {
    const active = vacancies.length;
    const totalHired = vacancies.reduce((s, v) => s + num(v.hires), 0);
    const daysArr = vacancies.map(v => daysBetween(v.open_date, v.close_date)).filter(d => d > 0);
    const avgTime = daysArr.length ? daysArr.reduce((a,b) => a+b, 0) / daysArr.length : 0;
    const costsArr = vacancies.filter(v => calc(v).hires > 0 && calc(v).total > 0).map(v => calc(v).costPerHire);
    const avgCost = costsArr.length ? costsArr.reduce((a,b) => a+b, 0) / costsArr.length : 0;

    document.getElementById('sumVacancies').textContent = active;
    document.getElementById('sumHired').textContent = totalHired;
    document.getElementById('sumTime').innerHTML = Math.round(avgTime) + ' <span style="font-size:13px;color:#6b7280;">дн.</span>';
    document.getElementById('sumCost').innerHTML = fmt(avgCost) + ' <span style="font-size:13px;color:#6b7280;">₽</span>';

    const byMonth = {};
    vacancies.forEach(v => {
        const dateStr = v.open_date || v.created_at;
        if (!dateStr) return;
        const d = new Date(dateStr);
        if (isNaN(d)) return;
        const key = d.getFullYear() + '-' + String(d.getMonth() + 1).padStart(2, '0');
        if (!byMonth[key]) byMonth[key] = 0;
        byMonth[key] += calc(v).total;
    });
    const months = Object.keys(byMonth).sort();
    const monthLabels = months.map(m => {
        const [y, mo] = m.split('-');
        const names = ['Янв','Фев','Мар','Апр','Май','Июн','Июл','Авг','Сен','Окт','Ноя','Дек'];
        return names[parseInt(mo) - 1] + ' ' + y.slice(2);
    });
    const monthData = months.map(m => byMonth[m]);

    if (monthlyChart) monthlyChart.destroy();
    const ctx = document.getElementById('monthlyChart').getContext('2d');
    monthlyChart = new Chart(ctx, {
        type: 'bar',
        data: {
            labels: monthLabels,
            datasets: [{
                label: 'Затраты за месяц, ₽',
                data: monthData,
                backgroundColor: '#6366f1',
                borderRadius: 6
            }]
        },
        options: {
            responsive: true,
            plugins: {
                legend: { display: false },
                tooltip: { callbacks: { label: c => fmt(c.parsed.y) + ' ₽' } }
            },
            scales: { y: { beginAtZero: true, ticks: { callback: v => fmt(v) + ' ₽' } } }
        }
    });
}

/* ===== Слушатели событий ===== */
document.addEventListener('DOMContentLoaded', () => {
    const pwd = document.getElementById('passwordInput');
    if (pwd) {
        pwd.addEventListener('keydown', (e) => {
            if (e.key === 'Enter') checkPassword();
        });
    }
    if (isAuthenticated()) showDashboard();
});

document.getElementById('modalOverlay').addEventListener('click', (e) => {
    if (e.target.id === 'modalOverlay') closeModal();
});
document.addEventListener('keydown', (e) => {
    if (e.key === 'Escape') closeModal();
});

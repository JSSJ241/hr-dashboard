// ==========================================
// НАСТРОЙКИ ПОДКЛЮЧЕНИЯ
// ==========================================
const SUPABASE_URL = 'https://nnaglaixoxrvaejhbrlr.supabase.co';
const SUPABASE_ANON_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Im5uYWdsYWl4b3hydmFlamhicmxyIiwicm9sZSI6ImFub24iLCJpYXQiOjE3ODkyNjc3ODQsImV4cCI6MjEwNDg0Mzc4NH0.P9YToeVjQ9wBmNwjKaR1yXeBbEJiYPreJLbxnzL5tzQ';

// Пароль (в base64). 'MTIzNA==' = '1234'
const PASSWORD_B64 = 'MTIzNA==';

// ==========================================
// КОНСТАНТЫ И СПРАВОЧНИКИ
// ==========================================
const NORM_HOURS_DEFAULT = 164;
const MANY_HIRES_THRESHOLD = 2;
const RECRUITERS = ['Татьяна', 'Эльвина'];
const DECLINE_REASONS = ['Зарплата', 'Условия работы', 'Другой оффер', 'Оформление', 'Личные причины', 'Другое'];

const HOURLY_PARTICIPANTS = [
    { key: 'recruiter', label: 'Рекрутер', multiplyByHires: false },
    { key: 'manager', label: 'Нанимающий менеджер', multiplyByHires: false },
    { key: 'interviewers', label: 'Интервьюеры / эксперты', multiplyByHires: false },
    { key: 'hrAdmin', label: 'HR-администрирование', multiplyByHires: true }
];
const KPI_KEY = 'kpi';

const EXTERNAL_ITEMS = [
    { key: 'publication', label: 'Публикация вакансий', alwaysVisible: true },
    { key: 'agency', label: 'Кадровое агентство / фриланс', alwaysVisible: false },
    { key: 'referral', label: 'Бонусы за рекомендацию', alwaysVisible: false },
    { key: 'target', label: 'Таргет на вакансию', alwaysVisible: false },
    { key: 'assessment', label: 'Тестирования / ассессменты', alwaysVisible: false },
    { key: 'medical', label: 'Медосмотр и прочее', alwaysVisible: false },
    { key: 'other', label: 'Прочие внешние расходы', alwaysVisible: true }
];

const METRIC_NAMES = {
    'turnover': 'Текучесть (добровольная)',
    'fot_seo_prod': '% ФОТ / оборот — SEO произв.',
    'fot_seo_mgr': '% ФОТ / оборот — SEO менедж.',
    'fot_sup_prod': '% ФОТ / оборот — SUP произв.',
    'fot_sup_mgr': '% ФОТ / оборот — SUP менедж.',
    'fot_perf': '% ФОТ / оборот — PERF'
};

const KPI_NAMES = {
    'meetings_mgr': 'Встречи с руководителями',
    'meetings_emp': 'Встречи с сотрудниками',
    'init_prop': 'Инициативы предложенные',
    'init_impl': 'Инициативы внедрённые',
    'training': 'Обучение (часов)'
};

// ==========================================
// ГЛОБАЛЬНЫЕ ПЕРЕМЕННЫЕ И КЛИЕНТ
// ==========================================
const sb = supabase.createClient(SUPABASE_URL, SUPABASE_ANON_KEY, {
    auth: { persistSession: false, autoRefreshToken: false, detectSessionInUrl: false }
});

let vacancies = [];
let hrMetrics = [];
let hrKpi = [];
let monthlyChart = null;
let compareChart = null;
let realtimeChannel = null;
let saveTimers = {};
let currentTab = 'active';
let modalHires = [];
let hireDrafts = {};
let activeEditKey = null;
let addExtMenuOpen = {};

// ==========================================
// БАЗОВЫЕ УТИЛИТЫ (доступны всем файлам)
// ==========================================
function num(v) { return Math.max(0, Number(v) || 0); }
function fmt(n) { return Math.round(n).toLocaleString('ru-RU'); }
function esc(s) { return String(s || '').replace(/[&<>"']/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c])); }

function daysBetween(open, close) {
    if (!open || !close) return 0;
    const d1 = new Date(open), d2 = new Date(close);
    if (isNaN(d1) || isNaN(d2)) return 0;
    const diff = Math.round((d2 - d1) / (1000*60*60*24));
    return diff > 0 ? diff : 0;
}

function formatDate(dateStr) {
    if (!dateStr) return '—';
    const parts = dateStr.split('-');
    if (parts.length !== 3) return dateStr;
    return parts[2] + '.' + parts[1] + '.' + parts[0];
}

function toast(msg) {
    const el = document.getElementById('toast');
    if (!el) return;
    el.textContent = msg;
    el.classList.add('show');
    setTimeout(() => el.classList.remove('show'), 2500);
}

function setSync(status) {
    const el = document.getElementById('syncBadge');
    if (!el) return;
    el.className = 'sync-badge' + (status === 'syncing' ? ' syncing' : status === 'error' ? ' error' : '');
    el.textContent = status === 'syncing' ? 'Сохранение...' : status === 'error' ? 'Ошибка' : 'Готов';
}

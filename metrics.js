// ==========================================
// HR-МЕТРИКИ: ПЛАН-ФАКТ И ПРОМЕЖУТОЧНЫЕ KPI
// ==========================================

function renderStrategicMetrics() {
    const wrap = document.getElementById('strategicMetricsWrap');
    if (!wrap) return;

    // Группируем по metric_key
    const grouped = {};
    hrMetrics.forEach(m => {
        if (!grouped[m.metric_key]) grouped[m.metric_key] = { plan: {}, fact: {} };
        if (m.period_type === 'year') {
            if (m.period_value.endsWith('2026')) {
                grouped[m.metric_key].plan[2026] = m.plan_value;
                grouped[m.metric_key].fact[2026] = m.fact_value;
            }
            if (m.period_value.endsWith('2027')) {
                grouped[m.metric_key].plan[2027] = m.plan_value;
                grouped[m.metric_key].fact[2027] = m.fact_value;
            }
        }
    });

    let html = '<table class="metrics-table"><thead><tr>';
    html += '<th>Метрика</th>';
    html += '<th class="num">План 2026</th>';
    html += '<th class="num">Факт 2026</th>';
    html += '<th class="num">План 2027</th>';
    html += '<th class="num">Факт 2027</th>';
    html += '<th class="status-cell">Статус</th>';
    html += '</tr></thead><tbody>';

    Object.keys(METRIC_NAMES).forEach(key => {
        const data = grouped[key] || { plan: {}, fact: {} };
        const plan26 = data.plan[2026] || 0;
        const fact26 = data.fact[2026] || 0;
        const plan27 = data.plan[2027] || 0;
        const fact27 = data.fact[2027] || 0;

        let status = '<span style="color:#d1d5db;">—</span>';
        if (plan26 > 0 && fact26 > 0) {
            if (fact26 <= plan26) status = '<span title="В плане">🟢</span>';
            else if (fact26 <= plan26 * 1.1) status = '<span title="Небольшое отклонение">🟡</span>';
            else status = '<span title="Хуже плана">🔴</span>';
        }

        html += `<tr>`;
        html += `<td class="metric-name">${METRIC_NAMES[key]}</td>`;
        html += `<td class="num"><input type="number" step="0.1" value="${plan26 || ''}" onchange="saveMetric('${key}', 2026, 'plan_value', this.value)"></td>`;
        html += `<td class="num"><input type="number" step="0.1" value="${fact26 || ''}" onchange="saveMetric('${key}', 2026, 'fact_value', this.value)"></td>`;
        html += `<td class="num"><input type="number" step="0.1" value="${plan27 || ''}" onchange="saveMetric('${key}', 2027, 'plan_value', this.value)"></td>`;
        html += `<td class="num"><input type="number" step="0.1" value="${fact27 || ''}" onchange="saveMetric('${key}', 2027, 'fact_value', this.value)"></td>`;
        html += `<td class="status-cell">${status}</td>`;
        html += `</tr>`;
    });

    html += '</tbody></table>';
    wrap.innerHTML = html;
}

async function saveMetric(key, year, field, value) {
    const v = Number(value) || 0;
    const periodVal = String(year);
    const existing = hrMetrics.find(m => m.metric_key === key && m.period_value === periodVal);

    setSync('syncing');
    if (existing) {
        const { error } = await sb.from('hr_metrics').update({ [field]: v }).eq('id', existing.id);
        if (error) { setSync('error'); toast('Ошибка: ' + error.message); return; }
        existing[field] = v;
    } else {
        const { error } = await sb.from('hr_metrics').insert({
            metric_key: key,
            metric_type: 'strategic',
            department: key.includes('seo') ? 'SEO' : key.includes('sup') ? 'SUP' : key.includes('perf') ? 'PERF' : '',
            period_type: 'year',
            period_value: periodVal,
            [field]: v,
            unit: '%'
        });
        if (error) { setSync('error'); toast('Ошибка: ' + error.message); return; }
    }
    setSync('ok');
    renderStrategicMetrics();
}

function renderKpiMetrics() {
    const wrap = document.getElementById('kpiMetricsWrap');
    const select = document.getElementById('kpiPeriodSelect');
    if (!wrap || !select) return;

    if (select.options.length === 0) {
        const months = [];
        const d = new Date();
        for (let i = 0; i < 6; i++) {
            const year = d.getFullYear();
            const month = String(d.getMonth() + 1).padStart(2, '0');
            const val = `${year}-${month}`;
            const names = ['Январь','Февраль','Март','Апрель','Май','Июнь','Июль','Август','Сентябрь','Октябрь','Ноябрь','Декабрь'];
            months.push({ val, label: names[d.getMonth()] + ' ' + year });
            d.setMonth(d.getMonth() - 1);
        }
        select.innerHTML = months.map(m => `<option value="${m.val}">${m.label}</option>`).join('');
    }

    const period = select.value;
    if (!period) return;

    const grouped = {};
    hrKpi.filter(k => k.period_value === period).forEach(k => {
        grouped[k.kpi_key] = k;
    });

    let html = '<table class="metrics-table"><thead><tr>';
    html += '<th>KPI</th>';
    html += '<th class="num">План</th>';
    html += '<th class="num">Факт</th>';
    html += '<th class="num">Выполнение</th>';
    html += '</tr></thead><tbody>';

    Object.keys(KPI_NAMES).forEach(key => {
        const data = grouped[key] || { plan_value: 0, fact_value: 0 };
        const plan = data.plan_value || 0;
        const fact = data.fact_value || 0;
        let pct = '—';
        if (plan > 0) {
            const val = Math.round((fact / plan) * 100);
            pct = `<span style="color:${val >= 100 ? '#10b981' : val >= 80 ? '#f59e0b' : '#ef4444'};font-weight:700;">${val}%</span>`;
        }

        html += `<tr>`;
        html += `<td class="metric-name">${KPI_NAMES[key]}</td>`;
        html += `<td class="num"><input type="number" value="${plan || ''}" onchange="saveKpi('${period}', '${key}', 'plan_value', this.value)"></td>`;
        html += `<td class="num"><input type="number" value="${fact || ''}" onchange="saveKpi('${period}', '${key}', 'fact_value', this.value)"></td>`;
        html += `<td class="num">${pct}</td>`;
        html += `</tr>`;
    });

    html += '</tbody></table>';
    wrap.innerHTML = html;
}

async function saveKpi(period, key, field, value) {
    const v = Number(value) || 0;
    const existing = hrKpi.find(k => k.kpi_key === key && k.period_value === period);

    setSync('syncing');
    if (existing) {
        const { error } = await sb.from('hr_kpi').update({ [field]: v }).eq('id', existing.id);
        if (error) { setSync('error'); toast('Ошибка: ' + error.message); return; }
        existing[field] = v;
    } else {
        const { error } = await sb.from('hr_kpi').insert({
            kpi_key: key,
            period_value: period,
            [field]: v,
            unit: 'шт'
        });
        if (error) { setSync('error'); toast('Ошибка: ' + error.message); return; }
    }
    setSync('ok');
    renderKpiMetrics();
}

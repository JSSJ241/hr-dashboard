// ==========================================
// ЛОГИКА ВАКАНСИЙ, ЗАКРЫТИЙ И ЭКСПОРТА
// ==========================================

function getHiresCount(v) { return Array.isArray(v.hires_data) ? v.hires_data.length : 0; }
function isArchived(v) { return !!v.close_date; }
function isInClosures(v) { return getHiresCount(v) > 0 || v.closed_no_hire; }
function getHiddenExternals(v) { return Array.isArray(v.external_hidden) ? v.external_hidden : []; }

function isExternalVisible(v, key) {
    const item = EXTERNAL_ITEMS.find(i => i.key === key);
    if (!item) return false;
    if (item.alwaysVisible) return true;
    return !getHiddenExternals(v).includes(key);
}

function calc(v) {
    const p = v.participants || {};
    const normHours = num(v.norm_hours) || NORM_HOURS_DEFAULT;
    const hiresCount = num(v.hires);
    let internalSum = 0;
    const rows = [];
    HOURLY_PARTICIPANTS.forEach(item => {
        const salary = num(p[item.key + '_salary']);
        const hours = num(p[item.key + '_hours']);
        const rate = salary / normHours;
        const baseCost = rate * hours;
        const cost = item.multiplyByHires ? baseCost * hiresCount : baseCost;
        internalSum += cost;
        rows.push({
            key: item.key, label: item.label, salary, hours, rate,
            cost, multiplyByHires: item.multiplyByHires, hiresCount
        });
    });
    const kpi = num(p[KPI_KEY]);
    internalSum += kpi;

    const ext = v.external || {};
    let externalSum = 0;
    EXTERNAL_ITEMS.forEach(item => {
        if (isExternalVisible(v, item.key)) {
            externalSum += num(ext[item.key]);
        }
    });

    const total = internalSum + externalSum;
    const costPerHire = hiresCount > 0 ? total / hiresCount : 0;
    return { rows, kpi, internalSum, externalSum, total, hires: hiresCount, costPerHire, normHours };
}

/* ===== Карточки вакансий ===== */
function renderCard(v) {
    const card = document.createElement('div');
    card.className = 'vacancy-card' + (isArchived(v) ? ' archived' : '');
    const m = calc(v);
    const days = daysBetween(v.open_date, v.close_date);
    const costColor = m.costPerHire === 0 ? '' : m.costPerHire <= 30000 ? 'good' : m.costPerHire <= 60000 ? 'warn' : 'bad';
    const archived = isArchived(v);

    const hiredCount = getHiresCount(v);
    const planned = num(v.hires);
    const progressHtml = (hiredCount > 0 || planned > 1) && !v.closed_no_hire ? `
        <div class="hires-progress ${hiredCount >= planned ? 'complete' : ''}">
            ${hiredCount >= planned ? '✅' : '🟡'} Нанято: ${hiredCount} из ${planned}
        </div>
    ` : (v.closed_no_hire ? '<div class="hires-progress">🚫 Закрыта без найма</div>' : '');

    const participantRows = m.rows.map(r => `
        <tr>
            <td class="name">${r.label}${r.multiplyByHires ? '<span class="hr-multiplier">× ' + r.hiresCount + '</span>' : ''}</td>
            <td><input type="number" min="0" placeholder="оклад" value="${r.salary || ''}" onchange="updateParticipant('${v.id}', '${r.key}_salary', this.value)"></td>
            <td><input type="number" min="0" placeholder="часы" value="${r.hours || ''}" onchange="updateParticipant('${v.id}', '${r.key}_hours', this.value)"></td>
            <td class="calc">${fmt(r.cost)} ₽<small>${r.rate > 0 ? fmt(r.rate) + ' ₽/ч' : ''}</small></td>
        </tr>
    `).join('');

    const ext = v.external || {};
    const visibleExternals = EXTERNAL_ITEMS.filter(i => isExternalVisible(v, i.key));
    const hiddenExternals = EXTERNAL_ITEMS.filter(i => !isExternalVisible(v, i.key));

    const extRows = visibleExternals.map(i => `
        <div class="ext-row">
            <label>${i.label}</label>
            <input type="number" min="0" value="${num(ext[i.key]) || ''}" placeholder="0" onchange="updateExternal('${v.id}', '${i.key}', this.value)">
            <span class="suffix">₽</span>
            ${!i.alwaysVisible ? `<button class="ext-remove" onclick="hideExternal('${v.id}', '${i.key}')" title="Убрать">✕</button>` : '<span style="width:26px;"></span>'}
        </div>
    `).join('');

    const isMenuOpen = addExtMenuOpen[v.id];
    const menuHtml = isMenuOpen && hiddenExternals.length > 0 ? `
        <div class="add-ext-menu">
            ${hiddenExternals.map(i => `
                <button onclick="showExternal('${v.id}', '${i.key}')">+ ${i.label}</button>
            `).join('')}
        </div>
    ` : '';

    const addBtnHtml = hiddenExternals.length > 0 ? `
        <button class="add-ext-btn" onclick="toggleAddExtMenu('${v.id}')">
            ${isMenuOpen ? '✕ Отменить' : '+ Добавить расход'}
        </button>
    ` : '';

    card.innerHTML = `
        <div class="vacancy-header">
            <div>
                <div class="vacancy-title">${esc(v.title)}</div>
                <div class="vacancy-meta">${v.dept ? esc(v.dept) + ' · ' : ''}${v.open_date ? 'Открыта: ' + v.open_date : ''}${v.close_date ? ' · Закрыта: ' + v.close_date : ''}${days ? ' · ' + days + ' дн.' : ''}</div>
                ${progressHtml}
            </div>
            <div class="vacancy-actions">
                ${archived ? `<button class="btn secondary small" onclick="restoreVacancy('${v.id}')">↩️ Вернуть</button>` : ''}
                <button class="btn secondary small" onclick="editVacancy('${v.id}')">✏️</button>
                <button class="btn danger small" onclick="deleteVacancy('${v.id}')">🗑️</button>
            </div>
        </div>
        <div class="kpi-grid">
            <div class="kpi-box"><div class="label">Оклад по вакансии</div><div class="value">${fmt(num(v.salary))} <span style="font-size:12px;color:#6b7280;">₽</span></div></div>
            <div class="kpi-box green"><div class="label">Число наймов</div><div class="value">${m.hires}</div></div>
            <div class="kpi-box orange"><div class="label">Полная стоимость</div><div class="value">${fmt(m.total)} <span style="font-size:12px;color:#6b7280;">₽</span></div></div>
            <div class="kpi-box red"><div class="label">Cost per Hire</div><div class="value ${costColor}">${fmt(m.costPerHire)} <span style="font-size:12px;color:#6b7280;">₽</span></div></div>
        </div>
        <div class="section">
            <div class="section-title">👥 Внутренние затраты (оклад ÷ ${m.normHours} × часы)</div>
            <table class="participant-table">
                <thead><tr><th>Участник</th><th>Оклад, ₽/мес</th><th>Часы</th><th class="right">Вклад</th></tr></thead>
                <tbody>
                    ${participantRows}
                    <tr><td class="name">KPI за выход кандидата</td><td colspan="2"><input type="number" min="0" placeholder="сумма ₽" value="${m.kpi || ''}" onchange="updateParticipant('${v.id}', '${KPI_KEY}', this.value)"></td><td class="calc">${fmt(m.kpi)} ₽</td></tr>
                    <tr class="total-row"><td class="name">Итого внутренние</td><td colspan="2"></td><td class="calc">${fmt(m.internalSum)} ₽</td></tr>
                </tbody>
            </table>
        </div>
        <div class="section">
            <div class="section-title">💸 Внешние расходы</div>
            ${extRows}
            <div class="ext-total"><label>Итого внешние</label><span class="val">${fmt(m.externalSum)} ₽</span></div>
            ${addBtnHtml}
            ${menuHtml}
        </div>
        <div class="section" style="background:#eef2ff;">
            <div class="row total" style="border:none;margin:0;padding:0;">
                <label style="font-size:14px;">ПОЛНАЯ СТОИМОСТЬ НАЙМА</label>
                <span class="val" style="font-size:18px;color:#4f46e5;">${fmt(m.total)} ₽</span>
            </div>
        </div>
    `;
    return card;
}

function toggleAddExtMenu(vacancyId) {
    addExtMenuOpen[vacancyId] = !addExtMenuOpen[vacancyId];
    render();
}

async function hideExternal(vacancyId, key) {
    const v = vacancies.find(x => x.id === vacancyId);
    if (!v) return;
    const hidden = [...getHiddenExternals(v)];
    if (!hidden.includes(key)) hidden.push(key);
    v.external_hidden = hidden;
    setSync('syncing');
    const { error } = await sb.from('vacancies').update({ external_hidden: hidden }).eq('id', vacancyId);
    if (error) { setSync('error'); toast('Ошибка: ' + error.message); return; }
    setSync('ok');
    toast('Статья скрыта');
    render();
}

async function showExternal(vacancyId, key) {
    const v = vacancies.find(x => x.id === vacancyId);
    if (!v) return;
    const hidden = getHiddenExternals(v).filter(k => k !== key);
    v.external_hidden = hidden;
    addExtMenuOpen[vacancyId] = false;
    setSync('syncing');
    const { error } = await sb.from('vacancies').update({ external_hidden: hidden }).eq('id', vacancyId);
    if (error) { setSync('error'); toast('Ошибка: ' + error.message); return; }
    setSync('ok');
    toast('Статья добавлена');
    render();
}

/* ===== Вкладка Закрытия ===== */
function renderClosuresTab() {
    renderAnalytics();
    renderClosuresTable();
}

function renderAnalytics() {
    let totalOffers = 0, accepted = 0, declined = 0;
    const reasonCounts = {};
    DECLINE_REASONS.forEach(r => reasonCounts[r] = 0);

    vacancies.forEach(v => {
        const hires = Array.isArray(v.hires_data) ? v.hires_data : [];
        hires.forEach(h => {
            if (h.offer === 'accepted') { totalOffers++; accepted++; }
            else if (h.offer === 'declined') {
                totalOffers++; declined++;
                const reason = h.decline_reason || 'Другое';
                if (reasonCounts[reason] === undefined) reasonCounts['Другое']++;
                else reasonCounts[reason]++;
            }
        });
    });

    const acceptPct = totalOffers > 0 ? Math.round((accepted / totalOffers) * 100) : 0;
    const declinePct = totalOffers > 0 ? Math.round((declined / totalOffers) * 100) : 0;

    const closedWithHire = vacancies.filter(v => isArchived(v) && !v.closed_no_hire).length;
    const closedNoHire = vacancies.filter(v => isArchived(v) && v.closed_no_hire).length;

    const kpisHtml = `
        <div class="kpi-box">
            <div class="label">Всего закрытых</div>
            <div class="value">${closedWithHire + closedNoHire}</div>
            <div style="font-size:11px;color:#6b7280;margin-top:4px;">с наймом: ${closedWithHire} · без найма: ${closedNoHire}</div>
        </div>
        <div class="kpi-box green">
            <div class="label">✅ Приняли оффер</div>
            <div class="value">${accepted} <span style="font-size:13px;color:#6b7280;">(${acceptPct}%)</span></div>
        </div>
        <div class="kpi-box red">
            <div class="label">❌ Отказались</div>
            <div class="value">${declined} <span style="font-size:13px;color:#6b7280;">(${declinePct}%)</span></div>
        </div>
        <div class="kpi-box orange">
            <div class="label">🚫 Без найма</div>
            <div class="value">${closedNoHire}</div>
        </div>
    `;
    const el = document.getElementById('analyticsKpis');
    if (el) el.innerHTML = kpisHtml;

    const reasonsHtml = declined > 0 ? `
        <table class="reasons-table">
            <thead><tr>
                <th>Причина отказа</th>
                <th style="text-align:right;">Кол-во</th>
                <th style="text-align:right;">Доля</th>
            </tr></thead>
            <tbody>
                ${DECLINE_REASONS.map(reason => {
                    const count = reasonCounts[reason] || 0;
                    if (count === 0) return '';
                    const pct = Math.round((count / declined) * 100);
                    return `<tr>
                        <td>${esc(reason)}</td>
                        <td class="reason-count">${count}</td>
                        <td class="reason-pct">${pct}%</td>
                    </tr>`;
                }).join('')}
            </tbody>
        </table>
    ` : '<div style="font-size:13px;color:#9ca3af;font-style:italic;">Отказов пока нет</div>';
    const rEl = document.getElementById('reasonsBlock');
    if (rEl) rEl.innerHTML = reasonsHtml;
}

function renderClosuresTable() {
    const wrap = document.getElementById('closuresTableWrap');
    if (!wrap) return;
    const items = vacancies.filter(v => isInClosures(v));

    items.sort((a, b) => {
        const aArch = isArchived(a), bArch = isArchived(b);
        if (aArch !== bArch) return aArch ? 1 : -1;
        if (aArch && bArch) return (b.close_date || '').localeCompare(a.close_date || '');
        return 0;
    });

    if (items.length === 0) {
        wrap.innerHTML = '<div class="empty-state"><h3>Пока нет нанятых сотрудников</h3><p>Добавьте сотрудников в вакансии — они появятся здесь</p></div>';
        return;
    }

    let html = '<table class="closures-table"><thead><tr>';
    html += '<th>Вакансия</th>';
    html += '<th>Статус</th>';
    html += '<th>Рекрутер</th>';
    html += '<th>Нанятые сотрудники</th>';
    html += '</tr></thead><tbody>';

    items.forEach(v => {
        const hires = Array.isArray(v.hires_data) ? v.hires_data : [];
        const archived = isArchived(v);
        const hiredCount = hires.length;
        const planned = num(v.hires);

        let statusHtml = '';
        if (v.closed_no_hire) {
            statusHtml = '<span class="status-closed">✅ Закрыта без найма</span>';
        } else if (archived) {
            statusHtml = '<span class="status-closed">✅ Закрыта ' + formatDate(v.close_date) + '</span>';
        } else {
            statusHtml = '<span class="status-active">🟡 Нанято ' + hiredCount + ' из ' + planned + '</span>';
        }

        html += '<tr data-vacancy-id="' + v.id + '">';
        html += '<td class="vacancy-cell">' + esc(v.title) + (v.dept ? '<span class="vacancy-dept">' + esc(v.dept) + '</span>' : '') + '</td>';
        html += '<td>' + statusHtml + '</td>';
        html += '<td>' + renderRecruiterSelect(v) + '</td>';
        html += '<td>' + (v.closed_no_hire ? '<span class="no-hire-badge">🚫 Без найма</span>' : renderHiresCell(v, hires)) + '</td>';
        html += '</tr>';
    });

    html += '</tbody></table>';
    wrap.innerHTML = html;
}

function renderRecruiterSelect(v) {
    const current = v.recruiter_name || '';
    let html = '<select class="recruiter-select" onchange="updateRecruiter(\'' + v.id + '\', this.value)">';
    html += '<option value=""' + (current === '' ? ' selected' : '') + '>— Не выбран —</option>';
    RECRUITERS.forEach(r => {
        html += '<option value="' + esc(r) + '"' + (current === r ? ' selected' : '') + '>' + esc(r) + '</option>';
    });
    html += '</select>';
    return html;
}

function renderHiresCell(v, hires) {
    let html = '';
    hires.forEach((h, i) => {
        const editKey = v.id + ':' + i;
        if (activeEditKey === editKey) html += renderHireEdit(v, h, i);
        else html += renderHireView(v, h, i);
    });
    html += '<button class="add-hire-btn" onclick="addHireInTable(\'' + v.id + '\')">+ Добавить сотрудника</button>';
    return html;
}

function renderHireView(v, h, i) {
    const offerClass = h.offer === 'accepted' ? 'offer-accepted' : h.offer === 'declined' ? 'offer-declined' : 'offer-pending';
    const offerText = h.offer === 'accepted' ? '✅ Принял' : h.offer === 'declined' ? '❌ Не принял' : '⏳ Не указано';
    const displayName = h.name || '— без имени —';
    const displayDate = h.exit_date ? formatDate(h.exit_date) : '—';
    const reasonText = (h.offer === 'declined' && h.decline_reason)
        ? '<span class="reason-text">Причина: ' + esc(h.decline_reason) + (h.decline_reason === 'Другое' && h.decline_reason_other ? ' (' + esc(h.decline_reason_other) + ')' : '') + '</span>'
        : '';
    return `
        <div class="hire-view">
            <div class="hire-view-info">
                <div class="hire-view-name">👤 ${esc(displayName)}</div>
                <div class="hire-view-meta">
                    <span>Выход: ${displayDate}</span>
                    <span class="offer-badge ${offerClass}">${offerText}</span>
                    ${reasonText}
                </div>
            </div>
            <div class="hire-view-actions">
                <button onclick="startEditHire('${v.id}', ${i})" title="Редактировать">✏️</button>
                <button class="del" onclick="removeHire('${v.id}', ${i})" title="Удалить">🗑️</button>
            </div>
        </div>
    `;
}

function renderHireEdit(v, h, i) {
    const acceptedChecked = h.offer === 'accepted';
    const declinedChecked = h.offer === 'declined';
    const isDeclined = h.offer === 'declined';
    const currentReason = h.decline_reason || '';
    const showOther = currentReason === 'Другое';
    return `
        <div class="hire-edit">
            <div class="hire-edit-header">
                <input type="text" placeholder="Имя сотрудника" value="${esc(h.name || '')}"
                    oninput="setDraftField('${v.id}', ${i}, 'name', this.value)">
            </div>
            <div class="hire-edit-row" style="margin-bottom:8px;">
                <label>Выход:</label>
                <input type="date" value="${h.exit_date || ''}"
                    oninput="setDraftField('${v.id}', ${i}, 'exit_date', this.value)">
            </div>
            <div class="hire-edit-row">
                <label>Оффер:</label>
                <div class="offer-radio-btns">
                    <label class="${acceptedChecked ? 'accepted-checked' : ''}">
                        <input type="radio" name="offer_${v.id}_${i}" value="accepted" ${acceptedChecked ? 'checked' : ''}
                            onchange="setDraftField('${v.id}', ${i}, 'offer', 'accepted'); setDraftField('${v.id}', ${i}, 'decline_reason', ''); renderClosuresTable();">
                        ✅ Принял
                    </label>
                    <label class="${declinedChecked ? 'declined-checked' : ''}">
                        <input type="radio" name="offer_${v.id}_${i}" value="declined" ${declinedChecked ? 'checked' : ''}
                            onchange="setDraftField('${v.id}', ${i}, 'offer', 'declined'); renderClosuresTable();">
                        ❌ Не принял
                    </label>
                </div>
            </div>
            ${isDeclined ? `
            <div class="hire-edit-row" style="margin-top:8px;">
                <label>Причина:</label>
                <select onchange="setDraftField('${v.id}', ${i}, 'decline_reason', this.value); renderClosuresTable();">
                    <option value="">— Выберите —</option>
                    ${DECLINE_REASONS.map(r => '<option value="' + esc(r) + '"' + (currentReason === r ? ' selected' : '') + '>' + esc(r) + '</option>').join('')}
                </select>
                ${showOther ? `
                    <input type="text" class="other-reason" placeholder="Уточните причину"
                        value="${esc(h.decline_reason_other || '')}"
                        oninput="setDraftField('${v.id}', ${i}, 'decline_reason_other', this.value)">
                ` : ''}
            </div>
            ` : ''}
            <div class="hire-edit-actions">
                <button class="save-btn" onclick="saveHire('${v.id}', ${i})">💾 Сохранить</button>
                <button class="cancel-btn" onclick="cancelEditHire('${v.id}')">Отмена</button>
            </div>
        </div>
    `;
}

function startEditHire(vacancyId, index) {
    activeEditKey = vacancyId + ':' + index;
    const v = vacancies.find(x => x.id === vacancyId);
    if (!v) return;
    const hires = Array.isArray(v.hires_data) ? v.hires_data : [];
    const h = hires[index] || { name: '', exit_date: '', offer: '', decline_reason: '', decline_reason_other: '' };
    if (!hireDrafts[vacancyId]) hireDrafts[vacancyId] = {};
    hireDrafts[vacancyId][index] = { ...h };
    renderClosuresTable();
}

function setDraftField(vacancyId, index, field, value) {
    if (!hireDrafts[vacancyId]) hireDrafts[vacancyId] = {};
    if (!hireDrafts[vacancyId][index]) hireDrafts[vacancyId][index] = { name: '', exit_date: '', offer: '', decline_reason: '', decline_reason_other: '' };
    hireDrafts[vacancyId][index][field] = value;
}

async function saveHire(vacancyId, index) {
    const v = vacancies.find(x => x.id === vacancyId);
    if (!v) return;
    const draft = (hireDrafts[vacancyId] || {})[index] || {};
    const hires = Array.isArray(v.hires_data) ? [...v.hires_data] : [];
    while (hires.length <= index) hires.push({});
    hires[index] = {
        name: (draft.name || '').trim(),
        exit_date: draft.exit_date || '',
        offer: draft.offer || '',
        decline_reason: draft.offer === 'declined' ? (draft.decline_reason || '') : '',
        decline_reason_other: draft.offer === 'declined' && draft.decline_reason === 'Другое' ? (draft.decline_reason_other || '') : ''
    };
    setSync('syncing');
    const { error } = await sb.from('vacancies').update({ hires_data: hires }).eq('id', vacancyId);
    if (error) { setSync('error'); toast('Ошибка: ' + error.message); return; }
    v.hires_data = hires;
    activeEditKey = null;
    delete hireDrafts[vacancyId];
    setSync('ok');
    toast('Сотрудник сохранён');
    render();
}

function cancelEditHire(vacancyId) {
    activeEditKey = null;
    delete hireDrafts[vacancyId];
    renderClosuresTable();
}

async function addHireInTable(vacancyId) {
    const v = vacancies.find(x => x.id === vacancyId);
    if (!v) return;
    const hires = Array.isArray(v.hires_data) ? [...v.hires_data] : [];
    const newIndex = hires.length;
    hires.push({ name: '', exit_date: '', offer: '', decline_reason: '', decline_reason_other: '' });
    v.hires_data = hires;
    activeEditKey = vacancyId + ':' + newIndex;
    if (!hireDrafts[vacancyId]) hireDrafts[vacancyId] = {};
    hireDrafts[vacancyId][newIndex] = { name: '', exit_date: '', offer: '', decline_reason: '', decline_reason_other: '' };
    renderClosuresTable();
}

async function updateRecruiter(id, value) {
    const v = vacancies.find(x => x.id === id);
    if (!v) return;
    v.recruiter_name = value || null;
    setSync('syncing');
    const { error } = await sb.from('vacancies').update({ recruiter_name: value || null }).eq('id', id);
    if (error) { setSync('error'); toast('Ошибка: ' + error.message); }
    else { setSync('ok'); toast('Рекрутер обновлён'); }
}

async function removeHire(vacancyId, index) {
    const v = vacancies.find(x => x.id === vacancyId);
    if (!v) return;
    const hires = Array.isArray(v.hires_data) ? [...v.hires_data] : [];
    if (!hires[index]) return;
    if (!confirm('Удалить сотрудника «' + (hires[index].name || 'без имени') + '»?')) return;
    hires.splice(index, 1);
    v.hires_data = hires;
    activeEditKey = null;
    delete hireDrafts[vacancyId];
    setSync('syncing');
    const { error } = await sb.from('vacancies').update({ hires_data: hires }).eq('id', vacancyId);
    if (error) { setSync('error'); toast('Ошибка: ' + error.message); }
    else { setSync('ok'); toast('Сотрудник удалён'); render(); }
}

/* ===== Модальное окно ===== */
function onCloseDateChange() {
    const closeDate = document.getElementById('vacClose').value;
    const noHireRow = document.getElementById('noHireRow');
    if (closeDate) noHireRow.style.display = 'flex';
    else {
        noHireRow.style.display = 'none';
        document.getElementById('vacNoHire').checked = false;
        onNoHireChange();
    }
}

function onNoHireChange() {
    const noHire = document.getElementById('vacNoHire').checked;
    const hiresBlock = document.getElementById('hiresBlock');
    if (noHire) hiresBlock.classList.add('hidden');
    else hiresBlock.classList.remove('hidden');
}

function renderModalHires() {
    const wrap = document.getElementById('hiresEditor');
    if (!wrap) return;
    if (modalHires.length === 0) {
        wrap.innerHTML = '<div style="font-size:12px;color:#9ca3af;font-style:italic;margin-bottom:8px;">Пока нет сотрудников. Нажмите «+ Добавить сотрудника».</div>';
        return;
    }
    wrap.innerHTML = modalHires.map((h, i) => {
        const acceptedChecked = h.offer === 'accepted';
        const declinedChecked = h.offer === 'declined';
        const isDeclined = h.offer === 'declined';
        const currentReason = h.decline_reason || '';
        const showOther = currentReason === 'Другое';
        return `
            <div class="hire-editor">
                <div class="hire-editor-header">
                    <input type="text" placeholder="Имя сотрудника" value="${esc(h.name || '')}"
                        onchange="modalHires[${i}].name = this.value">
                    <button type="button" class="remove-hire-btn" onclick="removeHireInModal(${i})" title="Удалить">🗑️</button>
                </div>
                <div class="hire-editor-row">
                    <label>Выход:</label>
                    <input type="date" value="${h.exit_date || ''}" onchange="modalHires[${i}].exit_date = this.value">
                </div>
                <div class="hire-editor-row" style="margin-top:8px;">
                    <label>Оффер:</label>
                    <div class="offer-radio">
                        <label class="${acceptedChecked ? 'accepted-checked' : ''}">
                            <input type="radio" name="offer_m_${i}" value="accepted" ${acceptedChecked ? 'checked' : ''}
                                onchange="modalHires[${i}].offer = 'accepted'; modalHires[${i}].decline_reason = ''; renderModalHires();">
                            ✅ Принял
                        </label>
                        <label class="${declinedChecked ? 'declined-checked' : ''}">
                            <input type="radio" name="offer_m_${i}" value="declined" ${declinedChecked ? 'checked' : ''}
                                onchange="modalHires[${i}].offer = 'declined'; renderModalHires();">
                            ❌ Не принял
                        </label>
                    </div>
                </div>
                ${isDeclined ? `
                <div class="hire-editor-row" style="margin-top:8px;">
                    <label>Причина:</label>
                    <select onchange="modalHires[${i}].decline_reason = this.value; renderModalHires();">
                        <option value="">— Выберите —</option>
                        ${DECLINE_REASONS.map(r => '<option value="' + esc(r) + '"' + (currentReason === r ? ' selected' : '') + '>' + esc(r) + '</option>').join('')}
                    </select>
                    ${showOther ? `
                        <input type="text" class="other-reason" placeholder="Уточните причину"
                            value="${esc(h.decline_reason_other || '')}"
                            oninput="modalHires[${i}].decline_reason_other = this.value">
                    ` : ''}
                </div>
                ` : ''}
            </div>
        `;
    }).join('');
}

function addHireInModal() {
    modalHires.push({ name: '', exit_date: '', offer: '', decline_reason: '', decline_reason_other: '' });
    renderModalHires();
}

function removeHireInModal(index) {
    modalHires.splice(index, 1);
    renderModalHires();
}

function openModal(id) {
    const modal = document.getElementById('modalOverlay');
    const title = document.getElementById('modalTitle');
    document.getElementById('editId').value = '';
    modalHires = [];
    if (id) {
        const v = vacancies.find(x => x.id === id);
        if (!v) return;
        title.textContent = 'Редактировать вакансию';
        document.getElementById('vacTitle').value = v.title;
        document.getElementById('vacDept').value = v.dept || '';
        document.getElementById('vacOpen').value = v.open_date || '';
        document.getElementById('vacClose').value = v.close_date || '';
        document.getElementById('vacSalary').value = v.salary || 0;
        document.getElementById('vacHires').value = v.hires || 1;
        document.getElementById('vacHours').value = v.norm_hours || 164;
        document.getElementById('vacRecruiter').value = v.recruiter_name || '';
        document.getElementById('vacNoHire').checked = !!v.closed_no_hire;
        modalHires = Array.isArray(v.hires_data) ? v.hires_data.map(h => ({...h})) : [];
        document.getElementById('editId').value = id;
    } else {
        title.textContent = 'Новая вакансия';
        document.getElementById('vacTitle').value = '';
        document.getElementById('vacDept').value = '';
        document.getElementById('vacOpen').value = new Date().toISOString().slice(0,10);
        document.getElementById('vacClose').value = '';
        document.getElementById('vacSalary').value = 0;
        document.getElementById('vacHires').value = 1;
        document.getElementById('vacHours').value = 164;
        document.getElementById('vacRecruiter').value = '';
        document.getElementById('vacNoHire').checked = false;
    }
    onCloseDateChange();
    onNoHireChange();
    renderModalHires();
    modal.classList.add('active');
    setTimeout(() => document.getElementById('vacTitle').focus(), 50);
}

function closeModal() { document.getElementById('modalOverlay').classList.remove('active'); }

async function saveVacancy() {
    const title = document.getElementById('vacTitle').value.trim();
    if (!title) { toast('Введите название позиции'); return; }
    const closeDate = document.getElementById('vacClose').value || null;
    const noHire = document.getElementById('vacNoHire').checked && closeDate;
    const recruiterName = document.getElementById('vacRecruiter').value || null;

    let cleanHires = [];
    if (!noHire) {
        cleanHires = modalHires
            .filter(h => (h.name || '').trim() || h.exit_date || h.offer)
            .map(h => ({
                name: (h.name || '').trim(),
                exit_date: h.exit_date || '',
                offer: h.offer || '',
                decline_reason: h.offer === 'declined' ? (h.decline_reason || '') : '',
                decline_reason_other: h.offer === 'declined' && h.decline_reason === 'Другое' ? (h.decline_reason_other || '') : ''
            }));
    }

    const planned = num(document.getElementById('vacHires').value);
    if (cleanHires.length > planned && planned > 0) {
        if (confirm('Нанято ' + cleanHires.length + ' человек, а в плане ' + planned + '.\n\nОбновить план до ' + cleanHires.length + '?')) {
            document.getElementById('vacHires').value = cleanHires.length;
        }
    } else if (cleanHires.length > planned && planned === 0) {
        if (confirm('Нанято ' + cleanHires.length + ' человек, а план стоит 0.\n\nОбновить план до ' + cleanHires.length + '?')) {
            document.getElementById('vacHires').value = cleanHires.length;
        }
    }

    const finalHires = num(document.getElementById('vacHires').value);

    const data = {
        title,
        dept: document.getElementById('vacDept').value.trim() || null,
        open_date: document.getElementById('vacOpen').value || null,
        close_date: closeDate,
        salary: num(document.getElementById('vacSalary').value),
        hires: finalHires,
        norm_hours: num(document.getElementById('vacHours').value) || 164,
        recruiter_name: recruiterName,
        hires_data: cleanHires,
        closed_no_hire: noHire
    };

    const editId = document.getElementById('editId').value;
    const btn = document.getElementById('saveBtn');
    btn.disabled = true; btn.textContent = 'Сохранение...';
    try {
        if (editId) {
            const { error } = await sb.from('vacancies').update(data).eq('id', editId);
            if (error) throw error;
            toast('Вакансия обновлена');
        } else {
            const emptyParticipants = {};
            HOURLY_PARTICIPANTS.forEach(p => {
                emptyParticipants[p.key + '_salary'] = 0;
                emptyParticipants[p.key + '_hours'] = 0;
            });
            emptyParticipants[KPI_KEY] = 0;
            const { error } = await sb.from('vacancies').insert({
                ...data,
                participants: emptyParticipants,
                external: { publication:0, agency:0, referral:0, target:0, assessment:0, medical:0, other:0 },
                external_hidden: []
            });
            if (error) throw error;
            toast('Вакансия создана');
        }
        closeModal();
        await loadAllData();
    } catch (err) {
        console.error(err);
        toast('Ошибка: ' + (err.message || String(err)));
    } finally {
        btn.disabled = false; btn.textContent = 'Сохранить';
    }
}

function editVacancy(id) { openModal(id); }

async function deleteVacancy(id) {
    const v = vacancies.find(x => x.id === id);
    if (!v) return;
    if (!confirm('Удалить вакансию «' + v.title + '»?')) return;
    const { error } = await sb.from('vacancies').delete().eq('id', id);
    if (error) { toast('Ошибка: ' + error.message); return; }
    toast('Вакансия удалена');
    await loadAllData();
}

async function restoreVacancy(id) {
    const v = vacancies.find(x => x.id === id);
    if (!v) return;
    if (!confirm('Вернуть вакансию «' + v.title + '» в активные? Дата закрытия будет очищена.')) return;
    const { error } = await sb.from('vacancies').update({ close_date: null, closed_no_hire: false }).eq('id', id);
    if (error) { toast('Ошибка: ' + error.message); return; }
    toast('Вакансия возвращена в активные');
    await loadAllData();
}

/* ===== Экспорт CSV ===== */
function csvEscape(val) {
    const s = String(val ?? '');
    if (s.includes(';') || s.includes('"') || s.includes('\n')) return '"' + s.replace(/"/g, '""') + '"';
    return s;
}
function downloadCSV(filename, rows) {
    const BOM = '\uFEFF';
    const csv = BOM + rows.map(r => r.map(csvEscape).join(';')).join('\n');
    const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url; a.download = filename; a.click();
    URL.revokeObjectURL(url);
}

function exportData() {
    if (vacancies.length === 0) { toast('Нет данных для экспорта'); return; }
    const date = new Date().toISOString().slice(0,10);
    const summaryRows = [['Статус','Без найма','Название позиции','Отдел','Дата открытия','Дата закрытия','Дней в работе','Оклад по вакансии, ₽/мес','Число наймов','Итого внутренние, ₽','Итого внешние, ₽','Полная стоимость, ₽','Cost per Hire, ₽','Рекрутер','Нанятые сотрудники']];
    vacancies.forEach(v => {
        const m = calc(v);
        const hiresStr = (Array.isArray(v.hires_data) ? v.hires_data : []).map(h => {
            let s = (h.name || '—') + ' / ' + (h.exit_date || '—') + ' / ' +
                (h.offer === 'accepted' ? 'Принял' : h.offer === 'declined' ? 'Не принял' : '—');
            if (h.offer === 'declined' && h.decline_reason) {
                s += ' (' + h.decline_reason + (h.decline_reason === 'Другое' && h.decline_reason_other ? ': ' + h.decline_reason_other : '') + ')';
            }
            return s;
        }).join('; ');
        summaryRows.push([
            isArchived(v) ? 'Закрыта' : 'Активная',
            v.closed_no_hire ? 'Да' : 'Нет',
            v.title, v.dept || '', v.open_date || '', v.close_date || '',
            daysBetween(v.open_date, v.close_date), num(v.salary), m.hires,
            Math.round(m.internalSum), Math.round(m.externalSum),
            Math.round(m.total), Math.round(m.costPerHire),
            v.recruiter_name || '', hiresStr
        ]);
    });
    downloadCSV('hr-сводка-' + date + '.csv', summaryRows);
    setTimeout(() => {
        const detailRows = [['Вакансия','Участник','Оклад, ₽/мес','Часы','Ставка, ₽/час','Вклад, ₽']];
        vacancies.forEach(v => {
            const m = calc(v);
            m.rows.forEach(r => detailRows.push([v.title, r.label + (r.multiplyByHires ? ' (× ' + r.hiresCount + ')' : ''), r.salary || '', r.hours || '', r.rate > 0 ? Math.round(r.rate * 100) / 100 : '', Math.round(r.cost)]));
            detailRows.push([v.title, 'KPI за выход кандидата', '', '', '', Math.round(m.kpi)]);
            detailRows.push([v.title, 'ИТОГО внутренние', '', '', '', Math.round(m.internalSum)]);
            EXTERNAL_ITEMS.forEach(item => {
                if (isExternalVisible(v, item.key)) {
                    const val = num((v.external || {})[item.key]);
                    detailRows.push([v.title, 'Внешние: ' + item.label + (val > 0 ? '' : ' (0)'), '', '', '', Math.round(val)]);
                }
            });
            detailRows.push([v.title, 'ИТОГО внешние', '', '', '', Math.round(m.externalSum)]);
            detailRows.push(['', '', '', '', '', '']);
        });
        downloadCSV('hr-детализация-' + date + '.csv', detailRows);
    }, 400);
    toast('Экспортировано 2 файла CSV');
}

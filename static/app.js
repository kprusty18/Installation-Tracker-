/* Installation Tracker - frontend (vanilla JS, no build step) */
const $ = (s, el = document) => el.querySelector(s);
const $$ = (s, el = document) => [...el.querySelectorAll(s)];
const esc = v => v === null || v === undefined ? '' : String(v).replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const dash = v => (v === null || v === undefined || v === '') ? '<span class="muted">-</span>' : esc(v);
const fmtD = s => { if (!s) return '<span class="muted">-</span>'; const d = new Date(s + 'T00:00:00'); return isNaN(d) ? esc(s) : d.toLocaleDateString('en-GB', { day: '2-digit', month: 'short', year: 'numeric' }); };
const jsArg = o => esc(JSON.stringify(o));   // safe to embed inside onclick="fn(...)"
const STAGES = ['Not started', 'In progress', 'Inspection / handover', 'Handed over'];
const STAGE_COLORS = ['var(--s1)', 'var(--s2)', 'var(--s3)', 'var(--s4)'];
const PIPE = ['Allotted', 'Kickoff', 'Site Ready', 'Goods Received', 'In Progress', 'Installation Completed', 'Inspection Passed', 'Handed Over', 'Closed'];
const PRESTART = ['Allotted', 'Kickoff Done', 'Site Not Ready', 'Site Ready', 'Partly Received', 'Goods Received'];
const ACTIVE = [...PRESTART, 'In Progress', 'On Hold', 'Rework'];
const GOODS_OPEN = ['Site Ready', 'Partly Received', 'Goods Received', 'In Progress', 'On Hold', 'Rework'];
const READY_TO_START = ['Partly Received', 'Goods Received'];
const BLOCKED = { 'Allotted': 'Kickoff pending', 'Kickoff Done': 'Site check pending', 'Site Not Ready': 'Site not ready', 'Site Ready': 'Awaiting goods' };
// next pre-start action for a project, or '' once daily updates can start
function stageAction(p, small = true) {
  const c = small ? 'small ' : '';
  if (p.status === 'Allotted') return `<button class="${c}primary" onclick="event.stopPropagation();openKickoffForm(${p.id})">Record kickoff</button>`;
  if (p.status === 'Kickoff Done') return `<button class="${c}primary" onclick="event.stopPropagation();openSiteCheckForm(${p.id})">Check site readiness</button>`;
  if (p.status === 'Site Not Ready') return `<button class="${c}primary" onclick="event.stopPropagation();openSiteCheckForm(${p.id})">Re-check site</button>`;
  if (p.status === 'Site Ready') return `<button class="${c}primary" onclick="event.stopPropagation();openGoodsForm(${p.id})">Record goods received</button>`;
  return '';
}
const CHECKLIST = ['Measurements as per drawing', 'Alignment & levelling', 'Hardware & fittings working', 'Finish / no damage / scratches',
  'Electrical & plumbing points clear', 'Site cleaned & debris removed', 'Customer walkthrough done', 'Care & warranty explained'];
const AVATAR_COLORS = ['#2a78d6', '#eb6834', '#1baf7a', '#c98500', '#d55181', '#008300', '#6250d6', '#e34948'];
const TITLES = {
  dashboard: ['Overview', 'Live Dashboard'], projects: ['Operations', 'Projects & Allotment'],
  readiness: ['Operations', 'Kickoff, Site Readiness & Goods'], updates: ['Operations', 'Daily Updates'],
  inspection: ['Operations', 'Final Inspection & Handover'], services: ['After-sales', 'Free Service (3 months)'],
  feedback: ['After-sales', 'Customer Satisfaction'], reports: ['Admin', 'Email & Reports'], team: ['Admin', 'Team Members'], settings: ['Admin', 'Settings'],
};
const I = {
  dashboard: '<rect x="3" y="3" width="7" height="9" rx="1.5"/><rect x="14" y="3" width="7" height="5" rx="1.5"/><rect x="14" y="12" width="7" height="9" rx="1.5"/><rect x="3" y="16" width="7" height="5" rx="1.5"/>',
  projects: '<rect x="5" y="4" width="14" height="17" rx="2"/><path d="M9 3.5h6v3H9z"/><path d="M9 12h6M9 16h4"/>',
  updates: '<path d="M3 12h4l3 8 4-16 3 8h4"/>',
  readiness: '<path d="M3 20h18"/><path d="M5 20V10l7-6 7 6v10"/><path d="M9 14l2 2 4-4"/>',
  kickoff: '<circle cx="8" cy="8" r="3"/><circle cx="16.5" cy="8" r="2.5"/><path d="M2.5 20c.6-3.4 2.8-5.5 5.5-5.5s4.9 2.1 5.5 5.5"/><path d="M15 14.6c2.8-.3 5.2 1.6 6 5.4"/>',
  sitecheck: '<path d="M3 20h18"/><path d="M5 20V10l7-6 7 6v10"/><path d="M9 14l2 2 4-4"/>',
  goods: '<path d="M3 8l9-5 9 5v8l-9 5-9-5z"/><path d="M3 8l9 5 9-5M12 13v8"/>',
  inspection: '<path d="M12 3l8 3v6c0 5-3.5 8-8 9-4.5-1-8-4-8-9V6z"/><path d="M9 12l2 2 4-4"/>',
  services: '<path d="M14.7 6.3a4 4 0 0 0-5.4 5.4L3 18l3 3 6.3-6.3a4 4 0 0 0 5.4-5.4l-2.5 2.5-2.4-.6-.6-2.4z"/>',
  feedback: '<path d="M12 3l2.8 5.7 6.2.9-4.5 4.4 1 6.2L12 17.3 6.5 20.2l1-6.2L3 9.6l6.2-.9z"/>',
  reports: '<rect x="3" y="5" width="18" height="14" rx="2"/><path d="M3 7l9 6 9-6"/>',
  team: '<circle cx="9" cy="8" r="3.5"/><path d="M2.5 20c.8-3.5 3.4-5.5 6.5-5.5s5.7 2 6.5 5.5"/><circle cx="17" cy="9" r="2.5"/><path d="M16.5 14.5c2.6.2 4.4 2 5 5"/>',
  settings: '<path d="M4 6h9M17 6h3M4 12h3M11 12h9M4 18h11M19 18h1"/><circle cx="15" cy="6" r="2"/><circle cx="9" cy="12" r="2"/><circle cx="17" cy="18" r="2"/>',
  alert: '<path d="M12 3l10 18H2z"/><path d="M12 10v5M12 18h.01"/>',
  clock: '<circle cx="12" cy="12" r="9"/><path d="M12 7v5l3 2"/>',
  home: '<path d="M3 11l9-7 9 7v9a1 1 0 0 1-1 1h-5v-6H9v6H4a1 1 0 0 1-1-1z"/>',
  allotted: '<path d="M12 5v14M5 12h14"/>',
  update: '<path d="M3 12h4l3 8 4-16 3 8h4"/>',
  handover: '<path d="M3 11l9-7 9 7v9a1 1 0 0 1-1 1h-5v-6H9v6H4a1 1 0 0 1-1-1z"/>',
  mail: '<rect x="3" y="5" width="18" height="14" rx="2"/><path d="M3 7l9 6 9-6"/>',
};
const icon = (n, cls = 'i') => `<svg class="${cls}" viewBox="0 0 24 24">${I[n] || ''}</svg>`;
let META = {}, MEMBERS = [];

async function api(method, url, body) {
  const r = await fetch(url, { method, headers: { 'Content-Type': 'application/json' }, body: body ? JSON.stringify(body) : undefined });
  const data = await r.json().catch(() => ({}));
  if (!r.ok) throw new Error(data.error || ('Request failed: ' + r.status));
  return data;
}
function toast(msg, err) {
  const t = $('#toast'); t.textContent = msg; t.className = 'toast' + (err ? ' err' : ''); t.style.display = 'block';
  clearTimeout(t._h); t._h = setTimeout(() => t.style.display = 'none', err ? 5500 : 2600);
}
const chip = s => `<span class="chip st-${esc(String(s).replace(/ /g, '-'))}">${esc(s)}</span>`;
const progress = (v, cls = '') => `<div class="progress-cell"><div class="bar ${cls}"><span style="width:${+v || 0}%"></span></div><span class="pct">${+v || 0}%</span></div>`;
const initials = n => String(n || '?').split(/\s+/).map(x => x[0]).slice(0, 2).join('').toUpperCase();
const avatar = (m, size = 34) => `<div class="avatar" style="width:${size}px;height:${size}px;background:${AVATAR_COLORS[(m.id || 0) % AVATAR_COLORS.length]}">${esc(initials(m.name))}</div>`;
function flags(p) {
  const f = [];
  if (p.overdue) f.push('<span class="flag critical">Overdue</span>');
  if ((p.status === 'In Progress' || p.status === 'Rework') && !p.updated_today) f.push('<span class="flag warning">No update today</span>');
  if (p.goods_pending) f.push(`<span class="flag warning" title="${p.goods_short} short, ${p.goods_damaged} damaged so far">Goods partly received</span>`);
  if (p.status === 'Handed Over' && p.service_days_left !== null) f.push(`<span class="flag good">Free service: ${p.service_days_left} days left</span>`);
  return f.join(' ');
}
function ago(ts) {
  const d = new Date(String(ts).replace(' ', 'T') + 'Z'); const s = (Date.now() - d) / 1000;
  if (isNaN(s)) return '';
  if (s < 60) return 'just now'; if (s < 3600) return Math.floor(s / 60) + ' min ago'; if (s < 86400) return Math.floor(s / 3600) + ' h ago';
  return d.toLocaleDateString('en-GB', { day: '2-digit', month: 'short' });
}
function memberOptions(sel, all = true, label = 'All members') {
  return (all ? `<option value="">${label}</option>` : '') + MEMBERS.filter(m => m.active || m.id == sel)
    .map(m => `<option value="${m.id}" ${m.id == sel ? 'selected' : ''}>${esc(m.name)} (${esc(m.city || '-')})</option>`).join('');
}
async function loadMembers() { MEMBERS = await api('GET', '/api/members'); }
function formData(form) {
  const o = {};
  $$('input,select,textarea', form).forEach(el => {
    if (!el.name) return;
    if (el.type === 'checkbox') { if (el.name.startsWith('chk:')) { (o.checklist ||= {})[el.name.slice(4)] = el.checked; } else o[el.name] = el.checked; }
    else o[el.name] = el.value;
  });
  return o;
}

/* ---------- overlay: modal + drawer ---------- */
function openModal(html) { $('#modal').innerHTML = html; $('#modal').classList.add('open'); $('#overlay').classList.add('open'); const f = $('#modal input:not([type=hidden]):not([disabled]),#modal select,#modal textarea'); f && f.focus(); }
function closeModal() { $('#modal').classList.remove('open'); if (!$('#drawer').classList.contains('open')) $('#overlay').classList.remove('open'); if (pendingRefresh) softRefresh(); }
function closeDrawer() { $('#drawer').classList.remove('open'); $('#overlay').classList.remove('open'); DRAWER_ID = null; render(); }
$('#overlay').onclick = () => { if ($('#modal').classList.contains('open')) closeModal(); else closeDrawer(); };
document.addEventListener('keydown', e => { if (e.key === 'Escape') { if ($('#modal').classList.contains('open')) closeModal(); else if ($('#drawer').classList.contains('open')) closeDrawer(); } });
function bindForm(sel, handler) {
  const f = $(sel);
  f.onsubmit = async e => {
    e.preventDefault();
    const btn = $('button[type=submit]', f); btn.disabled = true;
    try { await handler(formData(f)); } catch (err) { toast(err.message, true); } finally { btn.disabled = false; }
  };
}
function starInput(name, val = 0) {
  return `<div class="stars" data-name="${name}">${[1, 2, 3, 4, 5].map(i => `<button type="button" data-v="${i}" class="${i <= val ? 'on' : ''}">&#9733;</button>`).join('')}<input type="hidden" name="${name}" value="${val || ''}"></div>`;
}
function bindStars(root) {
  $$('.stars', root).forEach(s => $$('button', s).forEach(b => b.onclick = () => {
    const v = +b.dataset.v; $('input', s).value = v; $$('button', s).forEach(x => x.classList.toggle('on', +x.dataset.v <= v));
  }));
}

/* ---------- tooltip ---------- */
const tip = $('#tooltip');
document.addEventListener('mousemove', e => {
  const t = e.target.closest('[data-tip]');
  if (!t) { tip.style.display = 'none'; return; }
  tip.innerHTML = t.dataset.tip; tip.style.display = 'block';
  tip.style.left = Math.min(e.clientX + 12, innerWidth - 290) + 'px'; tip.style.top = (e.clientY + 14) + 'px';
});

/* ---------- router ---------- */
const VIEWS = {};
let current = 'dashboard', rendering = false;
async function render() {
  current = (location.hash.replace('#/', '') || 'dashboard').split('?')[0];
  if (!VIEWS[current]) current = 'dashboard';
  $$('.side a[data-nav]').forEach(a => a.classList.toggle('active', a.dataset.nav === current));
  $('#crumb').textContent = TITLES[current][0]; $('#pageTitle').textContent = TITLES[current][1];
  document.title = TITLES[current][1] + ' - Installation Tracker';
  $('#side').classList.remove('open');
  rendering = true;
  try { await VIEWS[current]($('#view')); } catch (e) { $('#view').innerHTML = `<div class="card">Error: ${esc(e.message)}</div>`; }
  rendering = false;
  updateBadges();
}
window.addEventListener('hashchange', () => { window.scrollTo(0, 0); render(); });

/* ---------- LIVE: poll a change counter; re-render when anyone saves ---------- */
let lastVersion = null, pendingRefresh = false, DRAWER_ID = null, lastSync = null;
async function poll() {
  try {
    const v = await api('GET', '/api/version');
    lastSync = new Date();
    $('#live').classList.remove('off');
    if (lastVersion !== null && v.version !== lastVersion) { lastVersion = v.version; softRefresh(true); }
    lastVersion = v.version;
  } catch { $('#live').classList.add('off'); $('#liveText').textContent = 'Offline - server not running'; return; }
  $('#liveText').textContent = 'Live · synced ' + lastSync.toLocaleTimeString('en-GB');
}
async function softRefresh(changed) {
  const typing = document.activeElement && $('#view').contains(document.activeElement) && /INPUT|TEXTAREA|SELECT/.test(document.activeElement.tagName);
  if ($('#modal').classList.contains('open') || typing || rendering) { pendingRefresh = true; return; }
  pendingRefresh = false;
  const y = window.scrollY;
  await render();
  window.scrollTo(0, y);
  if (DRAWER_ID) { const d = $('#drawer'), st = d.scrollTop; await openProject(DRAWER_ID); d.scrollTop = st; }
  if (changed) $$('#view .kpi').forEach(k => { k.classList.remove('flash'); void k.offsetWidth; k.classList.add('flash'); });
}
setInterval(poll, 4000);
setInterval(() => softRefresh(false), 60000);
setInterval(() => { $('#clock').textContent = new Date().toLocaleString('en-GB', { weekday: 'short', day: '2-digit', month: 'short', hour: '2-digit', minute: '2-digit', second: '2-digit' }); }, 1000);
async function updateBadges() {
  try {
    const d = await api('GET', '/api/dashboard');
    $('#badgeUpdates').textContent = d.kpi.no_update_today || '';
    $('#badgeReadiness').textContent = (d.kpi.kickoff_pending + d.kpi.site_check_pending + d.kpi.site_not_ready + d.kpi.awaiting_goods) || '';
    $('#badgeInspection').textContent = (d.kpi.pending_inspection + d.kpi.pending_handover) || '';
    $('#badgeServices').textContent = d.services_due.filter(s => s.overdue).length || '';
  } catch { }
}

/* ================= DASHBOARD ================= */
const dashFilter = { member: '', city: '' };
VIEWS.dashboard = async (el) => {
  await loadMembers();
  const [d, act] = await Promise.all([api('GET', '/api/dashboard?' + new URLSearchParams(dashFilter)), api('GET', '/api/activity?limit=25')]);
  const k = d.kpi;
  const kpi = (ic, cls, label, v, sub, href, red) => `<div class="kpi ${href ? 'link' : ''}" ${href ? `onclick="location.hash='${href}'"` : ''}><div class="ic ${cls}">${icon(ic)}</div><div><div class="label">${label}</div><div class="value ${red && v ? 'red' : ''}">${v ?? '-'}</div><div class="sub">${sub}</div></div></div>`;
  const max = Math.max(1, ...d.by_member.map(m => m.total));
  const hr = new Date().getHours(), greet = hr < 12 ? 'Good morning' : hr < 17 ? 'Good afternoon' : 'Good evening';
  const fm = MEMBERS.find(m => m.id == dashFilter.member);
  el.innerHTML = `
  <div class="hero"><div class="grow"><h2>${greet}${fm ? ' · ' + esc(fm.name) : ''}</h2>
    <p>${k.active} active installation${k.active === 1 ? '' : 's'} across ${d.by_city.length} cit${d.by_city.length === 1 ? 'y' : 'ies'} · ${k.overdue} overdue · ${k.no_update_today} awaiting today's update</p></div>
    <select id="fMember">${memberOptions(dashFilter.member, true, 'All team members')}</select>
    <select id="fCity"><option value="">All cities</option>${d.all_cities.map(c => `<option ${c === dashFilter.city ? 'selected' : ''}>${esc(c)}</option>`).join('')}</select>
  </div>
  <div class="kpis k5">
    ${kpi('projects', '', 'Total projects', k.total, `${k.closed} closed`, '#/projects')}
    ${kpi('updates', '', 'Active installations', k.active, `${k.on_hold} on hold · ${k.ready_to_start} ready to start`, '#/projects')}
    ${kpi('kickoff', 'teal', 'Kickoff pending', k.kickoff_pending, k.kickoff_late ? `${k.kickoff_late} late (over ${META.kickoff_due_days} days)` : `${k.site_check_pending} awaiting site check`, '#/readiness', k.kickoff_late)}
    ${kpi('readiness', 'red', 'Site not ready', k.site_not_ready, `${k.site_check_pending} awaiting site check`, '#/readiness', true)}
    ${kpi('goods', 'violet', 'Awaiting goods', k.awaiting_goods, 'site ready, goods not received', '#/readiness')}
    ${kpi('goods', 'amber', 'Goods partly received', k.goods_pending, 'shortage / balance to come', '#/readiness', true)}
    ${kpi('alert', 'red', 'Overdue', k.overdue, 'past target date', '#/projects', true)}
    ${kpi('clock', 'amber', 'No update today', k.no_update_today, 'in-progress projects', '#/updates', true)}
    ${kpi('inspection', 'green', 'Awaiting inspection', k.pending_inspection, 'installation completed', '#/inspection')}
    ${kpi('home', 'violet', 'Ready for handover', k.pending_handover, 'inspection passed', '#/inspection')}
    ${kpi('services', '', 'In free service', k.in_free_service, '3 months from handover', '#/services')}
    ${kpi('feedback', 'amber', 'Customer satisfaction', k.csat !== null ? k.csat + ' / 5' : '-', `${k.feedback_count} responses`, '#/feedback')}
  </div>
  <div class="grid g-3-1" style="margin-bottom:18px">
    <div class="card">
      <div class="card-h"><h3>Team workload</h3><span class="sub">projects per member by stage</span></div>
      <div class="legend">${STAGES.map((s, i) => `<span><i style="background:${STAGE_COLORS[i]}"></i>${s}</span>`).join('')}</div>
      <div class="mchart">${d.by_member.some(m => m.total) ? d.by_member.filter(m => m.total).map(m => `
        <div class="row"><div class="nm" title="${esc(m.name)}">${esc(m.name)}</div>
          <div class="track" style="width:${m.total ? Math.max(m.total / max * 100, 4) : 0}%">${STAGES.map((s, i) => m.stages[s] ? `<div class="seg" style="flex:${m.stages[s]};background:${STAGE_COLORS[i]}" data-tip="<b>${esc(m.name)}</b><br>${s}: ${m.stages[s]} project(s)"></div>` : '').join('')}</div>
          <div class="tot">${m.total}</div></div>`).join('') : '<div class="empty">No team members yet</div>'}
      </div>
      <div class="card-h" style="margin:22px 0 10px"><h3>Today's update status</h3><span class="sub">in-progress projects updated today</span></div>
      <table class="data">${d.by_member.filter(m => m.working).map(m => `<tr><td style="width:170px">${esc(m.name)}</td><td>${progress(Math.round(m.updated_today / m.working * 100), m.updated_today === m.working ? 'green' : '')}</td><td class="num nw">${m.updated_today} / ${m.working} ${m.updated_today < m.working ? '<span class="flag warning"></span>' : '<span class="flag good"></span>'}</td></tr>`).join('') || '<tr><td class="empty">No in-progress projects</td></tr>'}</table>
    </div>
    <div class="card">
      <div class="card-h"><h3>Live activity</h3><span class="live" style="font-size:11px;padding:2px 8px"><span class="dot"></span>Live</span></div>
      <ul class="feed">${act.map(a => `<li onclick="openProject(${a.pid})"><div class="fi ${a.kind}">${icon(['update', 'inspection', 'handover', 'feedback', 'kickoff', 'sitecheck', 'goods'].includes(a.kind) ? a.kind : 'allotted')}</div>
        <div class="ft"><div><b>${esc(a.code)}</b> · ${esc(a.pname)}</div><div class="t">${esc(a.text)}</div><div class="w">${esc(a.who || '')} · ${esc(a.city || '')} · ${ago(a.ts)}</div></div></li>`).join('') || '<li class="empty">No activity yet</li>'}</ul>
    </div>
  </div>
  <div class="card">
    <div class="card-h"><h3>City-wise status</h3><span class="sub">click a city to filter</span></div>
    <div class="table-wrap"><table class="data">
      <tr><th>City</th><th class="num">Total</th><th class="num">Active</th><th class="num">Overdue</th><th class="num">Inspection / handover</th><th class="num">Free service</th><th class="num">Closed</th><th style="width:28%">Mix</th></tr>
      ${d.by_city.map(c => { const n = c.counts, sum = l => l.reduce((t, s) => t + (n[s] || 0), 0); const a = sum(ACTIVE), ns = sum(PRESTART), ih = n['Installation Completed'] + n['Inspection Passed'], fs = n['Handed Over'] + n['Closed'];
        const seg = (v, col, l) => v ? `<div class="seg" style="flex:${v};background:${col}" data-tip="${esc(c.city)}: ${l} ${v}"></div>` : '';
        return `<tr class="click" onclick="dashFilter.city=${jsArg(c.city)};render()"><td><b>${esc(c.city)}</b></td><td class="num">${c.total}</td><td class="num">${a}</td>
        <td class="num">${c.overdue ? `<span class="flag critical">${c.overdue}</span>` : 0}</td><td class="num">${ih}</td><td class="num">${n['Handed Over']}</td><td class="num">${n['Closed']}</td>
        <td><div class="mchart"><div class="track" style="height:12px">${seg(ns, STAGE_COLORS[0], 'Not started')}${seg(n['In Progress'] + n['On Hold'] + n['Rework'], STAGE_COLORS[1], 'In progress')}${seg(ih, STAGE_COLORS[2], 'Inspection / handover')}${seg(fs, STAGE_COLORS[3], 'Handed over')}</div></div></td></tr>`; }).join('') || '<tr><td colspan="8" class="empty">No projects</td></tr>'}
    </table></div>
  </div>
  <div class="grid g-2" style="margin-bottom:18px">
    ${attnCard('Overdue projects', d.overdue, p => `${chip(p.status)}<div class="small-t muted" style="margin-top:4px">target ${fmtD(p.target_date)}</div>`, true)}
    ${attnCard('Site not ready', d.site_not_ready, p => `${siteExpected(p)}<div style="margin-top:4px">${stageAction(p)}</div>`, true, p => p.site_pending)}
    ${attnCard('Goods partly received', d.goods_pending, p => `${chip(p.status)}<div style="margin-top:4px"><button class="small" onclick="event.stopPropagation();openGoodsForm(${p.id})">+ Delivery</button></div>`, true, p => `${p.goods_short} short · ${p.goods_damaged} damaged so far`)}
    ${attnCard('Site ready - awaiting finished goods', d.awaiting_goods, p => stageAction(p))}
    ${attnCard('Awaiting kickoff meeting', d.kickoff_pending, p => `${p.kickoff_late ? `<span class="flag critical">${p.days_since_allotment} days</span>` : `<span class="muted small-t">${p.days_since_allotment ? p.days_since_allotment + ' day(s)' : 'today'}</span>`}<div style="margin-top:4px">${stageAction(p)}</div>`)}
    ${attnCard('Awaiting final inspection', d.pending_inspection, p => `<button class="small primary" onclick="event.stopPropagation();openInspectionForm(${p.id})">Inspect</button>`)}
    ${attnCard('Ready for handover', d.pending_handover, p => `<button class="small primary" onclick="event.stopPropagation();openHandoverForm(${p.id}, ${jsArg({ customer_name: p.customer_name, customer_phone: p.customer_phone })})">Hand over</button>`)}
    <div class="card"><div class="card-h"><h3>Free service visits due</h3><span class="count ${d.services_due.some(s => s.overdue) ? 'red' : ''}">${d.services_due.length}</span><span class="sub">next 7 days</span></div>
      ${d.services_due.length ? `<table class="data">${d.services_due.map(s => `<tr class="click" onclick="openProject(${s.project_id})"><td class="nw">${fmtD(s.scheduled_date)}${s.overdue ? '<div><span class="flag critical">Overdue</span></div>' : ''}</td><td><span class="code">${esc(s.code)}</span> · ${esc(s.project_name)}<div class="muted small-t">${esc(s.customer_name || '')} ${esc(s.customer_phone || '')}</div></td><td class="nw">Visit #${s.visit_no}<div class="muted small-t">${esc(s.technician_name || '')}</div></td></tr>`).join('')}</table>` : '<div class="empty">Nothing due</div>'}
    </div>
  </div>
  <div class="section-title"><h3>Each team member's projects</h3><span class="muted small-t">${d.by_member.length} member(s)</span></div>
  <div class="members">${d.by_member.map(m => `
    <div class="mcard"><div class="top">${avatar(m)}<div class="who"><b>${esc(m.name)}</b><div class="meta">${esc(m.role)} · ${esc(m.city || '-')}${m.email ? ` · <a href="mailto:${esc(m.email)}">${esc(m.email)}</a>` : ' · <span style="color:var(--critical-text)">no email linked</span>'}</div></div></div>
      <div class="stats"><div><b>${m.total}</b>Total</div><div><b>${m.active}</b>Active</div><div><b class="${m.overdue ? 'red' : ''}">${m.overdue}</b>Overdue</div><div><b>${m.csat ?? '-'}</b>CSAT</div></div>
      ${m.projects.length ? `<ul>${m.projects.map(p => `<li onclick="openProject(${p.id})"><div class="l1"><span><span class="code">${esc(p.code)}</span> · ${esc(p.name)}</span>${chip(p.status)}</div>
        <div class="l2"><span>${esc(p.city)}</span><span style="flex:1">${progress(p.progress)}</span>${p.overdue ? '<span class="flag critical">Overdue</span>' : ''}${(p.status === 'In Progress' || p.status === 'Rework') && !p.updated_today ? '<span class="flag warning">No update</span>' : ''}</div></li>`).join('')}</ul>` : '<div class="muted small-t">No projects allotted</div>'}
    </div>`).join('')}</div>`;
  $('#fMember').onchange = e => { dashFilter.member = e.target.value; e.target.blur(); render(); };
  $('#fCity').onchange = e => { dashFilter.city = e.target.value; e.target.blur(); render(); };
};
function attnCard(title, list, extra, red, note) {
  return `<div class="card"><div class="card-h"><h3>${title}</h3><span class="count ${red && list.length ? 'red' : ''}">${list.length}</span></div>${list.length ? `<table class="data">${list.map(p => `<tr class="click" onclick="openProject(${p.id})"><td><span class="code">${esc(p.code)}</span> · ${esc(p.name)}<div class="muted small-t">${esc(p.city)} · ${esc(p.member_name || '')}</div>${note && note(p) ? `<div class="small-t" style="color:var(--critical-text);margin-top:2px">${esc(note(p))}</div>` : ''}</td><td style="text-align:right">${extra(p)}</td></tr>`).join('')}</table>` : '<div class="empty">None — all clear</div>'}</div>`;
}
const siteExpected = p => p.site_expected ? `<span class="${p.site_expected_passed ? 'flag critical' : 'muted small-t'}">${p.site_expected_passed ? 'was due ' : 'expected '}${fmtD(p.site_expected)}</span>` : '<span class="muted small-t">no date given</span>';

/* ================= PROJECTS ================= */
const projFilter = { member: '', city: '', status: '', search: '' };
VIEWS.projects = async (el) => {
  await loadMembers();
  const [rows, dash] = await Promise.all([api('GET', '/api/projects?' + new URLSearchParams({ member: projFilter.member, city: projFilter.city, status: projFilter.status })), api('GET', '/api/dashboard')]);
  const s = projFilter.search.toLowerCase();
  const list = rows.filter(p => !s || [p.code, p.name, p.customer_name, p.city, p.member_name].join(' ').toLowerCase().includes(s));
  el.innerHTML = `
  <div class="toolbar">
    <input id="pSearch" class="search" placeholder="Search code, customer, project..." value="${esc(projFilter.search)}">
    <select id="pMember">${memberOptions(projFilter.member)}</select>
    <select id="pCity"><option value="">All cities</option>${dash.all_cities.map(c => `<option ${c === projFilter.city ? 'selected' : ''}>${esc(c)}</option>`).join('')}</select>
    <select id="pStatus"><option value="">All statuses</option>${META.statuses.map(x => `<option ${x === projFilter.status ? 'selected' : ''}>${x}</option>`).join('')}</select>
    <span class="spacer"></span><span class="muted">${list.length} project(s)</span>
    <button class="primary" onclick="openProjectForm()">+ Allot new project</button>
  </div>
  <div class="card table-wrap"><table class="data">
    <tr><th>Code</th><th>Project / Customer</th><th>City</th><th>Assigned to</th><th>Status</th><th style="width:150px">Progress</th><th>Target</th><th>Last update</th><th></th></tr>
    ${list.map(p => `<tr class="click" onclick="openProject(${p.id})"><td class="nw code">${esc(p.code)}</td><td>${esc(p.name)}<div class="muted small-t">${esc(p.customer_name || '')}</div></td>
      <td>${esc(p.city)}</td><td>${dash_(p.member_name)}</td><td>${chip(p.status)}</td><td>${progress(p.progress)}</td><td class="nw">${fmtD(p.target_date)}</td><td class="nw">${fmtD(p.last_update)}</td><td>${flags(p)}</td></tr>`).join('') || '<tr><td colspan="9" class="empty">No projects found</td></tr>'}
  </table></div>`;
  $('#pSearch').oninput = e => { projFilter.search = e.target.value; clearTimeout(window._ps); window._ps = setTimeout(async () => { await render(); const i = $('#pSearch'); i.focus(); i.setSelectionRange(i.value.length, i.value.length); }, 300); };
  $('#pMember').onchange = e => { projFilter.member = e.target.value; e.target.blur(); render(); };
  $('#pCity').onchange = e => { projFilter.city = e.target.value; e.target.blur(); render(); };
  $('#pStatus').onchange = e => { projFilter.status = e.target.value; e.target.blur(); render(); };
};
const dash_ = dash;

async function openProjectForm(id) {
  await loadMembers();
  const meta = await api('GET', '/api/meta');
  const p = id ? await api('GET', `/api/projects/${id}`) : { start_date: meta.today };
  openModal(`<h3>${p.id ? 'Edit project ' + esc(p.code) : 'Allot new installation project'}</h3>
  <form class="form" id="projForm">
    <h4>Project</h4>
    <label>Project code<input name="code" value="${esc(p.code || meta.next_code)}" ${p.id ? 'disabled' : ''}></label>
    <label>Project name *<input name="name" required value="${esc(p.name || '')}" placeholder="e.g. Villa 12 - Modular Kitchen"></label>
    <label>City *<input name="city" required list="cityList" value="${esc(p.city || '')}"></label>
    <label>Allot to team member *<select name="assigned_to" required>${memberOptions(p.assigned_to, true, '-- Select member --')}</select></label>
    <label>Start date<input type="date" name="start_date" value="${esc(p.start_date || '')}"></label>
    <label>Target completion date<input type="date" name="target_date" value="${esc(p.target_date || '')}"></label>
    <h4>Customer</h4>
    <label>Customer name<input name="customer_name" value="${esc(p.customer_name || '')}"></label>
    <label>Customer phone<input name="customer_phone" value="${esc(p.customer_phone || '')}"></label>
    <label class="full">Customer email<input name="customer_email" type="email" value="${esc(p.customer_email || '')}"></label>
    <label class="full">Site address<textarea name="address">${esc(p.address || '')}</textarea></label>
    <h4>Fitment &amp; scope</h4>
    <label class="full">Fitment checking<select name="fitment_check">${['Not Done', 'Done'].map(o => `<option value="${o}" ${(p.fitment_check || 'Not Done') === o ? 'selected' : ''}>${o === 'Done' ? 'Fitment checking done' : 'Fitment checking not done'}</option>`).join('')}</select>
      <span class="muted small-t" style="font-weight:400">Not done: the project goes through Kickoff &amp; Site Readiness first. Done: it is ready to start straight away.</span></label>
    <label class="full">Remarks / scope<textarea name="remarks">${esc(p.remarks || '')}</textarea></label>
    <datalist id="cityList">${[...new Set(MEMBERS.map(m => m.city).filter(Boolean))].map(c => `<option value="${esc(c)}">`).join('')}</datalist>
    <div class="full muted small-t">${META.notify_allotment ? 'The team member will get an email with the project details (if their email is linked).' : ''}</div>
    <div class="actions"><button type="button" onclick="closeModal()">Cancel</button><button type="submit" class="primary">${p.id ? 'Save changes' : 'Allot project'}</button></div>
  </form>`);
  if (!MEMBERS.length) toast('Add team members first (Team Members page).', true);
  bindForm('#projForm', async (b) => {
    const r = p.id ? await api('PUT', `/api/projects/${p.id}`, b) : await api('POST', '/api/projects', b);
    closeModal(); toast(p.id ? 'Project updated' : `Project ${r.code} allotted`);
    if ($('#drawer').classList.contains('open')) openProject(r.id); else render();
  });
}

/* ---------- project detail drawer ---------- */
async function openProject(id) {
  const p = await api('GET', `/api/projects/${id}`);
  DRAWER_ID = id;
  const curIdx = { 'Allotted': 1, 'Kickoff Done': 2, 'Site Not Ready': 2, 'Site Ready': 3, 'Partly Received': 4, 'Goods Received': 4,
    'In Progress': 4, 'On Hold': 4, 'Rework': 4 }[p.status] ?? PIPE.indexOf(p.status);
  const act = [];
  if (BLOCKED[p.status]) act.push(stageAction(p, false));
  else if (ACTIVE.includes(p.status)) act.push(`<button class="primary" onclick="openUpdateForm(${jsArg(slim(p))})">+ Daily update</button>`);
  if (p.status === 'Installation Completed') act.push(`<button class="primary" onclick="openInspectionForm(${p.id})">Do final inspection</button>`);
  if (p.status === 'Inspection Passed') act.push(`<button class="primary" onclick="openHandoverForm(${p.id}, ${jsArg({ customer_name: p.customer_name, customer_phone: p.customer_phone })})">Hand over to customer</button>`);
  if (['Handed Over', 'Closed'].includes(p.status)) act.push(`<button class="primary" onclick="openFeedbackForm(${p.id})">+ Customer feedback</button>`);
  if (p.status === 'Handed Over') act.push(`<button onclick="openServiceForm(${p.id}, ${p.assigned_to})">+ Service request</button>`);
  if (GOODS_OPEN.includes(p.status) && p.status !== 'Site Ready') act.push(`<button onclick="openGoodsForm(${p.id})">+ Goods delivery</button>`);
  const d = $('#drawer');
  d.innerHTML = `
  <div class="drawer-head"><div class="row1"><h2><span class="code">${esc(p.code)}</span> · ${esc(p.name)}</h2><button class="ghost" onclick="closeDrawer()" aria-label="Close">✕</button></div>
    <div style="display:flex;gap:10px;align-items:center;flex-wrap:wrap;margin-top:6px">${chip(p.status)} ${flags(p)}</div>
    <div class="pipeline">${PIPE.map((s, i) => {
      let cls = i < curIdx ? 'done' : i === curIdx ? 'cur' : '', label = s;
      if (i === 1 && i < curIdx && !p.kickoff) { cls = 'skip'; label = 'Kickoff not recorded'; }
      if (i === 2 && i < curIdx && p.fitment_check !== 'Done') { cls = 'warn'; label = 'Site not checked'; }   // projects started before this step existed
      if (i === 2 && p.status === 'Site Not Ready') { cls = 'cur warn'; label = 'Site Not Ready'; }
      if (i === 2 && i < curIdx && p.fitment_check === 'Done' && !p.site_checks.length) label = 'Fitment done';
      if (i === 3 && i < curIdx && !p.goods.length) { cls = 'skip'; label = 'Goods not recorded'; }
      if (i === 3 && i < curIdx && p.goods_status === 'Partial') { cls = 'part'; label = 'Goods partly received'; }
      if (i === 4 && ['Rework', 'On Hold'].includes(p.status)) label = p.status;
      if (i === 4 && READY_TO_START.includes(p.status)) label = 'Ready to start';
      return `<div class="st ${cls}">${esc(label)}</div>`;
    }).join('')}</div>
  </div>
  <div class="drawer-body">
  <div style="display:flex;gap:8px;flex-wrap:wrap;margin-bottom:18px">${act.join('')}
    <button onclick="openProjectForm(${p.id})">Edit / Re-allot</button>
    <button class="danger" onclick="deleteProject(${p.id})">Delete</button></div>
  <div class="grid g-2" style="margin-bottom:18px">
    <div class="card"><div class="card-h"><h3>Project</h3></div><div class="kv">
      <div>Assigned to</div><div>${dash(p.member_name)}</div><div>City</div><div>${dash(p.city)}</div>
      <div>Address</div><div>${dash(p.address)}</div><div>Start date</div><div>${fmtD(p.start_date)}</div>
      <div>Target date</div><div>${fmtD(p.target_date)}</div><div>Completed</div><div>${fmtD(p.completed_date)}</div>
      <div>Progress</div><div>${progress(p.progress)}</div>
      <div>Fitment checking</div><div><span style="font-weight:600;color:${p.fitment_check === 'Done' ? 'var(--good-text)' : 'var(--critical-text)'}">${p.fitment_check === 'Done' ? '✓ Done' : '✗ Not done'}</span></div>
      <div>Remarks</div><div>${dash(p.remarks)}</div></div></div>
    <div class="card"><div class="card-h"><h3>Customer &amp; service</h3></div><div class="kv">
      <div>Customer</div><div>${dash(p.customer_name)}</div><div>Phone</div><div>${dash(p.customer_phone)}</div>
      <div>Email</div><div>${p.customer_email ? `<a href="mailto:${esc(p.customer_email)}">${esc(p.customer_email)}</a>` : dash('')}</div><div>Handover date</div><div>${fmtD(p.handover_date)}</div>
      <div>Free service till</div><div>${fmtD(p.service_end_date)}</div>
      <div>Satisfaction</div><div>${p.feedback.length ? p.feedback[0].overall + ' / 5' : dash('')}</div></div></div>
  </div>
  <div class="card"><div class="card-h"><h3>Kickoff meeting</h3>${p.kickoff && PRESTART.includes(p.status) ? `<button class="small" onclick="openKickoffForm(${p.id})">Edit</button>` : ''}</div>
    ${p.kickoff ? kickoffView(p.kickoff) : `<div class="muted">${p.status === 'Allotted' ? 'Not held yet' : 'Not recorded'}</div>`}</div>
  <div class="card"><div class="card-h"><h3>Site readiness &amp; fitment check</h3><span class="count">${p.site_checks.length}</span></div>
    ${p.site_checks.length ? p.site_checks.map(siteCheckView).join('') : `<div class="muted">${p.fitment_check === 'Done' ? 'Fitment marked done at allotment - no site checklist recorded' : 'Not checked yet'}</div>`}</div>
  <div class="card"><div class="card-h"><h3>Finished goods received at site</h3><span class="count">${p.goods.length}</span>
    <span class="sub">${p.goods.length ? `${p.goods_status === 'Complete' ? '<span class="flag good">All goods at site</span>' : '<span class="flag warning">Partly received - more to come</span>'} · ${p.goods_short} short · ${p.goods_damaged} damaged` : ''}</span></div>
    ${p.goods.length ? p.goods.map(goodsView).join('') : `<div class="muted">${p.status === 'Site Ready' ? 'Site is ready - waiting for the first delivery' : 'No deliveries recorded'}</div>`}</div>
  <div class="card"><div class="card-h"><h3>Daily progress updates</h3><span class="count">${p.updates.length}</span></div>
    ${p.updates.length ? `<div class="timeline">${p.updates.map(u => `<div class="it"><div class="d">${fmtD(u.update_date)} · ${esc(u.member_name || '')} · <b>${u.progress}%</b> · ${esc(u.status)}</div>
      <div>${esc(u.work_done)}</div>${u.issues ? `<div style="color:var(--critical-text)">Issue: ${esc(u.issues)}</div>` : ''}${u.next_plan ? `<div class="muted">Next: ${esc(u.next_plan)}</div>` : ''}</div>`).join('')}</div>` : '<div class="muted">No updates yet</div>'}
  </div>
  <div class="card"><div class="card-h"><h3>Final inspection</h3></div>
    ${p.inspections.length ? p.inspections.map(i => `<div style="margin-bottom:12px"><b>${fmtD(i.inspection_date)}</b> by ${esc(i.inspector)} · <span class="flag ${i.result === 'Passed' ? 'good' : 'critical'}">${esc(i.result)}</span>
      <div class="checks" style="margin-top:8px">${Object.entries(i.checklist).map(([k, v]) => `<span style="color:${v ? 'var(--good-text)' : 'var(--critical-text)'}">${v ? '✓' : '✗'} <span style="color:var(--ink)">${esc(k)}</span></span>`).join('')}</div>${i.remarks ? `<div class="ink2" style="margin-top:6px">Remarks: ${esc(i.remarks)}</div>` : ''}</div>`).join('') : '<div class="muted">Not inspected yet</div>'}
  </div>
  <div class="card"><div class="card-h"><h3>Handover</h3></div>${p.handover ? `<div class="kv"><div>Date</div><div>${fmtD(p.handover.handover_date)}</div><div>Received by</div><div>${esc(p.handover.received_by)} ${esc(p.handover.receiver_phone || '')}</div>
    <div>Documents</div><div>${dash(p.handover.documents)}</div><div>Remarks</div><div>${dash(p.handover.remarks)}</div></div>` : '<div class="muted">Not handed over yet</div>'}</div>
  <div class="card"><div class="card-h"><h3>Free service visits</h3><span class="sub">${META.free_service_months} months from handover</span></div>
    ${p.services.length ? `<div class="table-wrap"><table class="data"><tr><th>#</th><th>Type</th><th>Scheduled</th><th>Technician</th><th>Status</th><th>Issue / Action</th><th></th></tr>${p.services.map(s => `<tr><td>${s.visit_no}</td><td>${esc(s.service_type)}</td><td class="nw">${fmtD(s.scheduled_date)}</td><td>${dash(s.technician_name)}</td><td>${svcStatus(s)}</td><td>${dash(s.issue)}${s.action_taken ? `<div class="muted">${esc(s.action_taken)}</div>` : ''}</td><td><button class="small" onclick="openServiceEdit(${jsArg(s)})">Update</button></td></tr>`).join('')}</table></div>` : '<div class="muted">Visits are scheduled automatically at handover</div>'}
  </div>
  <div class="card"><div class="card-h"><h3>Customer feedback</h3></div>
    ${p.feedback.length ? p.feedback.map(f => `<div class="kv" style="margin-bottom:10px"><div>Date</div><div>${fmtD(f.feedback_date)}</div><div>Quality</div><div>${stars(f.quality)}</div><div>Timeliness</div><div>${stars(f.timeliness)}</div><div>Team behaviour</div><div>${stars(f.team_behaviour)}</div><div>Cleanliness</div><div>${stars(f.cleanliness)}</div><div>Overall</div><div><b>${stars(f.overall)}</b></div><div>Would recommend</div><div>${esc(f.recommend)}</div><div>Comments</div><div>${dash(f.comments)}</div></div>`).join('') : '<div class="muted">No feedback yet</div>'}
  </div></div>`;
  d.classList.add('open'); $('#overlay').classList.add('open');
}
const stars = n => `<span style="color:#eda100;letter-spacing:1px">${'★'.repeat(n)}</span><span style="color:#d7dce5;letter-spacing:1px">${'★'.repeat(5 - n)}</span> <span class="muted">${n}/5</span>`;
const slim = p => ({ id: p.id, code: p.code, progress: p.progress || 0, assigned_to: p.assigned_to, status: p.status });
function svcStatus(s) {
  const late = s.status === 'Scheduled' && s.scheduled_date < META.today;
  const c = { Completed: 'good', Missed: 'critical', Scheduled: late ? 'critical' : 'warning', Cancelled: '' }[s.status];
  return `<span class="flag ${c}">${esc(s.status)}${late ? ' (due)' : ''}</span>`;
}
async function deleteProject(id) {
  if (!confirm('Delete this project and all its updates, inspection, handover, service and feedback records?')) return;
  await api('DELETE', `/api/projects/${id}`); toast('Project deleted'); closeDrawer();
}
async function afterAction(id, msg) { closeModal(); toast(msg); if ($('#drawer').classList.contains('open')) await openProject(id); else render(); }

function openUpdateForm(p) {
  openModal(`<h3>Daily update · ${esc(p.code)}</h3>
  <div class="hint">Setting progress to 100% marks installation as completed and moves the project to final inspection.</div>
  <form class="form" id="updForm">
    <label>Date<input type="date" name="update_date" value="${META.today}"></label>
    <label>Updated by<select name="member_id">${memberOptions(p.assigned_to, false)}</select></label>
    <label>Progress %<input type="number" name="progress" min="0" max="100" value="${p.progress}"></label>
    <label>Status<select name="status"><option>In Progress</option><option ${p.status === 'On Hold' ? 'selected' : ''}>On Hold</option></select></label>
    <label class="full">Work done today *<textarea name="work_done" required></textarea></label>
    <label class="full">Issues / material shortage / customer concerns<textarea name="issues"></textarea></label>
    <label class="full">Plan for tomorrow<textarea name="next_plan"></textarea></label>
    <div class="actions"><button type="button" onclick="closeModal()">Cancel</button><button type="submit" class="primary">Save update</button></div>
  </form>`);
  bindForm('#updForm', async b => { const r = await api('POST', `/api/projects/${p.id}/updates`, b); afterAction(p.id, r.status === 'Installation Completed' ? 'Installation completed - ready for final inspection' : 'Update saved'); });
}
/* ---------- kickoff meeting + site readiness ---------- */
const nl = s => esc(s).replace(/\n/g, '<br>');
function kickoffView(k) {
  return `<div class="kv"><div>Date</div><div>${fmtD(k.meeting_date)} · ${esc(k.mode)}</div>
    <div>Our team</div><div>${dash(k.our_attendees)}</div><div>Customer side</div><div>${dash(k.customer_attendees)}</div>
    <div>Minutes (MoM)</div><div>${k.mom ? nl(k.mom) : dash('')}</div><div>Customer requests</div><div>${k.customer_requests ? nl(k.customer_requests) : dash('')}</div></div>
    <div style="margin-top:10px"><div class="muted small-t" style="margin-bottom:4px">Points covered</div>${Object.entries(k.checklist || {}).filter(([, v]) => v).map(([n]) => `<div><span style="color:var(--good-text)">✓</span> ${esc(n)}</div>`).join('') || dash('')}</div>`;
}
function siteCheckView(c) {
  const e = Object.entries(c.checklist), nr = e.filter(([, v]) => v === 'Not Ready'), na = e.filter(([, v]) => v === 'N/A');
  return `<div style="margin-bottom:14px"><b>${fmtD(c.check_date)}</b> by ${esc(c.checked_by)} · <span class="flag ${c.result === 'Ready' ? 'good' : 'critical'}">${c.result === 'Ready' ? 'Site ready' : 'Site not ready'}</span>
    <span class="muted small-t"> · ${e.length - nr.length - na.length} ready, ${nr.length} not ready, ${na.length} N/A</span>
    ${c.result !== 'Ready' ? `<div style="color:var(--critical-text);margin-top:6px"><b>Pending:</b> ${nl(c.pending_items)}${c.expected_ready_date ? ` · expected ready by <b>${fmtD(c.expected_ready_date)}</b>` : ''}</div>` : ''}
    ${nr.length ? `<div class="sc-list">${nr.map(([n]) => `<span style="color:var(--critical-text)">✗ ${esc(n)}</span>`).join('')}</div>` : ''}
    ${c.remarks ? `<div class="ink2" style="margin-top:6px">Remarks: ${esc(c.remarks)}</div>` : ''}</div>`;
}
async function openKickoffForm(id) {
  await loadMembers();
  const p = await api('GET', `/api/projects/${id}`), k = p.kickoff || {}, kc = k.checklist || {};
  const me = MEMBERS.find(m => m.id === p.assigned_to);
  openModal(`<h3>Kickoff meeting · ${esc(p.code)}</h3>
  <div class="hint">The first meeting with the customer before work starts: agree the scope, dates, site readiness, access and responsibilities. After this, check the site with the site readiness checklist.</div>
  <form class="form" id="koForm">
    <label>Meeting date *<input type="date" name="meeting_date" required value="${esc(k.meeting_date || META.today)}"></label>
    <label>Meeting mode<select name="mode">${META.kickoff_modes.map(m => `<option ${m === k.mode ? 'selected' : ''}>${esc(m)}</option>`).join('')}</select></label>
    <label>Attended from our team *<input name="our_attendees" required list="memList" value="${esc(k.our_attendees || (me ? me.name : ''))}" placeholder="e.g. Ravi (installer), Meena (supervisor)"></label>
    <label>Attended from customer side<input name="customer_attendees" value="${esc(k.customer_attendees || p.customer_name || '')}" placeholder="Customer, architect, site in-charge"></label>
    <datalist id="memList">${MEMBERS.map(m => `<option value="${esc(m.name)}">`).join('')}</datalist>
    <div class="full"><div style="font-size:12.5px;font-weight:600;color:var(--ink-2);margin-bottom:8px">Points covered</div>
      <div id="koPoints" style="display:flex;flex-direction:column;gap:6px"></div>
      <button type="button" id="koAddPoint" style="margin-top:8px">+ Add point</button></div>
    <label>Confirmed start date<input type="date" name="confirmed_start" value="${esc(p.start_date || '')}"></label>
    <label>Confirmed target completion<input type="date" name="confirmed_target" value="${esc(p.target_date || '')}"></label>
    <label class="full">Minutes of meeting (MoM) *<textarea name="mom" required placeholder="What was agreed: scope, sequence of work, site work the customer will complete, delivery date...">${esc(k.mom || '')}</textarea></label>
    <label class="full">Customer requests / concerns<textarea name="customer_requests">${esc(k.customer_requests || '')}</textarea></label>
    <div class="actions"><button type="button" onclick="closeModal()">Cancel</button><button type="submit" class="primary">${p.kickoff ? 'Save changes' : 'Save kickoff'}</button></div>
  </form>`);
  const box = $('#koPoints');
  const addPoint = (v = '', focus) => {
    const row = document.createElement('div');
    row.style.cssText = 'display:flex;gap:6px;align-items:center';
    row.innerHTML = `<input data-kpt style="flex:1" value="${esc(v)}" placeholder="e.g. Scope &amp; approved drawings confirmed"><button type="button" title="Remove point" aria-label="Remove point">✕</button>`;
    row.querySelector('button').onclick = () => { row.remove(); if (!box.children.length) addPoint(); };
    box.appendChild(row);
    if (focus) row.querySelector('input').focus();
  };
  const existing = Object.keys(kc).filter(c => kc[c]);
  (existing.length ? existing : ['']).forEach(c => addPoint(c));
  $('#koAddPoint').onclick = () => addPoint('', true);
  box.addEventListener('keydown', e => { if (e.key === 'Enter' && e.target.matches('[data-kpt]')) { e.preventDefault(); addPoint('', true); } });
  bindForm('#koForm', async b => {
    b.checklist = $$('[data-kpt]', box).map(i => i.value.trim()).filter(Boolean);
    await api('POST', `/api/projects/${id}/kickoff`, b); afterAction(id, p.kickoff ? 'Kickoff updated' : 'Kickoff recorded - next: site readiness check'); });
}
async function openSiteCheckForm(id) {
  await loadMembers();
  const p = await api('GET', `/api/projects/${id}`), last = p.site_checks[0], prev = last ? last.checklist : {};
  const me = MEMBERS.find(m => m.id === p.assigned_to);
  const opts = v => `<option value="">-- Select --</option>${['Ready', 'Not Ready', 'N/A'].map(o => `<option ${o === v ? 'selected' : ''}>${o}</option>`).join('')}`;
  openModal(`<h3>Site readiness &amp; fitment check · ${esc(p.code)}</h3>
  <div class="hint">Check each point at the site. If everything is <b>Ready</b> or <b>N/A</b>, the site is marked ready and daily updates can start. If any point is <b>Not Ready</b>, the project stays on hold as <b>Site Not Ready</b> until it is re-checked.${last ? ' Answers from the last check are filled in - change what has been fixed.' : ''}</div>
  <form class="form" id="scForm">
    <label>Check date *<input type="date" name="check_date" required value="${META.today}"></label>
    <label>Checked by *<input name="checked_by" required list="memList" value="${esc(me ? me.name : '')}"></label>
    <datalist id="memList">${MEMBERS.map(m => `<option value="${esc(m.name)}">`).join('')}</datalist>
    <div class="full" style="display:flex;gap:8px;justify-content:flex-end"><button type="button" id="scAllReady">All ready</button><button type="button" id="scClear">Clear</button></div>
    ${META.site_checklist.map(g => `<div class="sc-group"><h5>${esc(g.group)}</h5>${g.items.map(i => `<div class="sc-row ${prev[i] === 'Not Ready' ? 'nr' : ''}"><span>${esc(i)}</span><select name="sc:${esc(i)}" required>${opts(prev[i])}</select></div>`).join('')}</div>`).join('')}
    <div class="sc-result" id="scResult"></div>
    <div class="full" id="scPending">
      <div class="form" style="gap:14px 16px">
        <label class="full">What is pending, and who will do it? *<textarea name="pending_items" placeholder="e.g. Painting not finished - customer's painter; kitchen drain point to shift 200mm - customer's plumber">${esc(last && last.result !== 'Ready' ? last.pending_items : '')}</textarea></label>
        <label>Expected ready by<input type="date" name="expected_ready_date" value="${esc(last && last.result !== 'Ready' ? last.expected_ready_date || '' : '')}"></label>
      </div></div>
    <label class="full">Remarks<textarea name="remarks"></textarea></label>
    <div class="actions"><button type="button" onclick="closeModal()">Cancel</button><button type="submit" class="primary">Save site check</button></div>
  </form>`);
  const f = $('#scForm');
  const refresh = () => {
    const sel = $$('select[name^="sc:"]', f), vals = sel.map(s => s.value);
    sel.forEach(s => s.closest('.sc-row').classList.toggle('nr', s.value === 'Not Ready'));
    const nr = vals.filter(v => v === 'Not Ready').length, left = vals.filter(v => !v).length, r = $('#scResult');
    r.className = 'sc-result' + (nr ? ' bad' : left ? '' : ' ok');
    r.textContent = nr ? `Result: Site NOT ready - ${nr} item(s) not ready${left ? `, ${left} still to check` : ''}` : left ? `${left} of ${vals.length} items still to check` : 'Result: Site ready - daily updates can start';
    $('#scPending').style.display = nr ? '' : 'none';
    $('textarea[name=pending_items]', f).required = !!nr;
  };
  f.addEventListener('change', refresh); refresh();
  const setAll = v => { $$('select[name^="sc:"]', f).forEach(s => { s.value = v; }); refresh(); };
  $('#scAllReady').onclick = () => setAll('Ready');
  $('#scClear').onclick = () => setAll('');
  bindForm('#scForm', async b => {
    const checklist = {};
    Object.keys(b).filter(k => k.startsWith('sc:')).forEach(k => { checklist[k.slice(3)] = b[k]; delete b[k]; });
    const r = await api('POST', `/api/projects/${id}/site-check`, { ...b, checklist });
    afterAction(id, r.status === 'Site Ready' ? 'Site ready - daily updates can start' : 'Saved - site not ready');
  });
}

/* ---------- finished goods received at site ---------- */
function goodsView(g) {
  return `<div style="margin-bottom:14px"><b>${fmtD(g.receipt_date)}</b> · Challan ${esc(g.dc_no)}${g.vehicle_no ? ' · ' + esc(g.vehicle_no) : ''} · received by ${esc(g.received_by)}${g.customer_rep ? ' / ' + esc(g.customer_rep) : ''}
    ${g.all_received ? ' <span class="flag good">Final delivery</span>' : ''}
    <div class="table-wrap" style="margin-top:6px"><table class="data goods-t"><tr><th>Item</th><th class="num">Sent</th><th class="num">Received</th><th class="num">Short</th><th class="num">Damaged</th><th>Remarks</th></tr>
    ${g.items.map(i => `<tr><td>${esc(i.item)}</td><td class="num">${i.sent}</td><td class="num">${i.received}</td><td class="num">${i.short ? `<b class="red">${i.short}</b>` : 0}</td><td class="num">${i.damaged ? `<b class="red">${i.damaged}</b>` : 0}</td><td>${dash(i.remarks)}</td></tr>`).join('')}
    <tr class="tot"><td>Total</td><td class="num">${g.qty_sent}</td><td class="num">${g.qty_received}</td><td class="num">${g.qty_short}</td><td class="num">${g.qty_damaged}</td><td></td></tr></table></div>
    ${g.remarks ? `<div class="ink2" style="margin-top:6px">Remarks: ${esc(g.remarks)}</div>` : ''}</div>`;
}
const goodsRow = (i = {}) => `<tr><td><input data-f="item" value="${esc(i.item || '')}" placeholder="e.g. Base unit 600"></td>
  <td><input data-f="sent" type="number" min="0" value="${i.sent ?? ''}"></td><td><input data-f="received" type="number" min="0" value="${i.received ?? ''}"></td>
  <td><input data-f="damaged" type="number" min="0" value="${i.damaged ?? ''}"></td><td><input data-f="remarks" value="${esc(i.remarks || '')}"></td>
  <td><button type="button" class="ghost small" onclick="this.closest('tr').remove();goodsTotals()" aria-label="Remove line">✕</button></td></tr>`;
function goodsTotals() {
  const rows = $$('#goodsLines tbody tr').map(r => Object.fromEntries($$('[data-f]', r).map(x => [x.dataset.f, x.value])));
  let s = 0, r = 0, sh = 0, d = 0;
  rows.filter(x => x.item.trim()).forEach(x => { s += +x.sent || 0; r += +x.received || 0; sh += Math.max((+x.sent || 0) - (+x.received || 0), 0); d += +x.damaged || 0; });
  $('#goodsSum').innerHTML = `Total: sent <b>${s}</b> · received <b>${r}</b> · short <b class="${sh ? 'red' : ''}">${sh}</b> · damaged <b class="${d ? 'red' : ''}">${d}</b>`;
  return rows;
}
async function openGoodsForm(id) {
  await loadMembers();
  const p = await api('GET', `/api/projects/${id}`);
  const me = MEMBERS.find(m => m.id === p.assigned_to);
  const open = p.goods.flatMap(g => g.items.filter(i => i.short || i.damaged).map(i => `${esc(i.item)}: ${i.short ? i.short + ' short' : ''}${i.short && i.damaged ? ', ' : ''}${i.damaged ? i.damaged + ' damaged' : ''} <span class="muted">(challan ${esc(g.dc_no)})</span>`));
  openModal(`<h3>Finished goods received at site · ${esc(p.code)}</h3>
  <div class="hint">Record each delivery against its delivery challan (DC), item by item. Installation can start after the first delivery. Tick <b>All goods received</b> on the delivery that completes the order, and the project stops showing as partly received.</div>
  ${open.length ? `<div class="hint warn"><b>Short / damaged in earlier deliveries:</b><br>${open.join('<br>')}</div>` : ''}
  <form class="form" id="grForm">
    <label>Received on *<input type="date" name="receipt_date" required value="${META.today}"></label>
    <label>Delivery challan (DC) no. *<input name="dc_no" required></label>
    <label>Vehicle no.<input name="vehicle_no" placeholder="e.g. KA01AB1234"></label>
    <label>Received by (our team) *<input name="received_by" required list="memList" value="${esc(me ? me.name : '')}"></label>
    <label class="full">Customer representative present<input name="customer_rep" value="${esc(p.customer_name || '')}"></label>
    <datalist id="memList">${MEMBERS.map(m => `<option value="${esc(m.name)}">`).join('')}</datalist>
    <div class="full"><div class="table-wrap"><table class="data goods-in" id="goodsLines"><thead><tr><th>Item / package *</th><th>Qty sent (as per DC)</th><th>Qty received</th><th>Damaged</th><th>Remarks</th><th></th></tr></thead>
      <tbody>${[0, 1, 2, 3].map(() => goodsRow()).join('')}</tbody></table></div>
      <div style="display:flex;justify-content:space-between;align-items:center;margin-top:8px;gap:10px;flex-wrap:wrap"><button type="button" class="small" id="addLine">+ Add line</button><span id="goodsSum" class="small-t"></span></div></div>
    <label class="check full"><input type="checkbox" name="all_received" ${p.goods_status === 'Complete' ? 'checked' : ''}> All finished goods for this project are now at site (nothing more to come)</label>
    <label class="full">Remarks<textarea name="remarks" placeholder="Packing condition, unloading, storage location..."></textarea></label>
    <div class="actions"><button type="button" onclick="closeModal()">Cancel</button><button type="submit" class="primary">Save delivery</button></div>
  </form>`);
  $('#addLine').onclick = () => { $('#goodsLines tbody').insertAdjacentHTML('beforeend', goodsRow()); goodsTotals(); };
  $('#goodsLines').addEventListener('input', goodsTotals); goodsTotals();
  bindForm('#grForm', async b => {
    b.items = goodsTotals().filter(x => x.item.trim());
    const r = await api('POST', `/api/projects/${id}/goods`, b);
    afterAction(id, r.goods_status === 'Complete' ? 'Delivery saved - all goods at site' : 'Delivery saved - goods partly received');
  });
}

function openInspectionForm(id) {
  openModal(`<h3>Final inspection</h3>
  <form class="form" id="inspForm">
    <label>Inspection date<input type="date" name="inspection_date" value="${META.today}"></label>
    <label>Inspected by *<input name="inspector" required list="memList"></label>
    <datalist id="memList">${MEMBERS.map(m => `<option value="${esc(m.name)}">`).join('')}</datalist>
    <div class="full"><div style="font-size:12.5px;font-weight:600;color:var(--ink-2);margin-bottom:8px">Checklist</div>
      <div class="checks">${CHECKLIST.map(c => `<label><input type="checkbox" name="chk:${esc(c)}"> ${esc(c)}</label>`).join('')}</div></div>
    <label>Result *<select name="result" required><option value="">-- Select --</option><option>Passed</option><option>Failed</option></select></label>
    <label class="full">Remarks / snag list<textarea name="remarks"></textarea></label>
    <div class="full muted small-t">A failed inspection sends the project back to <b>Rework</b> with the assigned installer.</div>
    <div class="actions"><button type="button" onclick="closeModal()">Cancel</button><button type="submit" class="primary">Save inspection</button></div>
  </form>`);
  bindForm('#inspForm', async b => { await api('POST', `/api/projects/${id}/inspections`, b); afterAction(id, b.result === 'Passed' ? 'Inspection passed - ready for handover' : 'Inspection failed - sent for rework'); });
}
function openHandoverForm(id, c = {}) {
  openModal(`<h3>Hand over to customer</h3>
  <div class="hint">On handover, ${META.free_service_months} free monthly service visits are scheduled automatically, and the free service period runs ${META.free_service_months} months from the handover date.</div>
  <form class="form" id="hoForm">
    <label>Handover date<input type="date" name="handover_date" value="${META.today}"></label>
    <label>Received by (customer) *<input name="received_by" required value="${esc(c.customer_name || '')}"></label>
    <label>Receiver phone<input name="receiver_phone" value="${esc(c.customer_phone || '')}"></label>
    <label>Documents handed over<input name="documents" placeholder="Warranty card, care manual, keys..."></label>
    <label class="full">Remarks<textarea name="remarks"></textarea></label>
    <div class="actions"><button type="button" onclick="closeModal()">Cancel</button><button type="submit" class="primary">Confirm handover</button></div>
  </form>`);
  bindForm('#hoForm', async b => { await api('POST', `/api/projects/${id}/handover`, b); afterAction(id, 'Handed over - free service visits scheduled'); });
}
function openFeedbackForm(id) {
  openModal(`<h3>Customer satisfaction</h3>
  <form class="form" id="fbForm">
    <label>Date<input type="date" name="feedback_date" value="${META.today}"></label>
    <label>Would recommend us?<select name="recommend"><option>Yes</option><option>Maybe</option><option>No</option></select></label>
    <label>Quality of work${starInput('quality')}</label>
    <label>Timeliness${starInput('timeliness')}</label>
    <label>Team behaviour${starInput('team_behaviour')}</label>
    <label>Site cleanliness${starInput('cleanliness')}</label>
    <label>Overall satisfaction${starInput('overall')}</label>
    <label class="full">Customer comments<textarea name="comments"></textarea></label>
    <div class="actions"><button type="button" onclick="closeModal()">Cancel</button><button type="submit" class="primary">Save feedback</button></div>
  </form>`);
  bindStars($('#modal'));
  bindForm('#fbForm', async b => { await api('POST', `/api/projects/${id}/feedback`, b); afterAction(id, 'Feedback saved'); });
}
function openServiceForm(id, tech) {
  openModal(`<h3>Service request (free service period)</h3>
  <form class="form" id="svForm">
    <label>Type<select name="service_type"><option>Complaint</option><option>Scheduled</option></select></label>
    <label>Visit date<input type="date" name="scheduled_date" value="${META.today}"></label>
    <label>Technician<select name="technician_id">${memberOptions(tech, false)}</select></label>
    <label class="full">Issue reported<textarea name="issue"></textarea></label>
    <div class="actions"><button type="button" onclick="closeModal()">Cancel</button><button type="submit" class="primary">Schedule visit</button></div>
  </form>`);
  bindForm('#svForm', async b => { await api('POST', `/api/projects/${id}/services`, b); afterAction(id, 'Service visit scheduled'); });
}
function openServiceEdit(s) {
  openModal(`<h3>Service visit #${s.visit_no}${s.code ? ' · ' + esc(s.code) : ''}</h3>
  <form class="form" id="seForm">
    <label>Status<select name="status">${['Scheduled', 'Completed', 'Missed', 'Cancelled'].map(x => `<option ${x === s.status ? 'selected' : ''}>${x}</option>`).join('')}</select></label>
    <label>Scheduled date<input type="date" name="scheduled_date" value="${esc(s.scheduled_date)}"></label>
    <label>Technician<select name="technician_id">${memberOptions(s.technician_id, false)}</select></label>
    <label>Completed on<input type="date" name="completed_date" value="${esc(s.completed_date || '')}"></label>
    <label class="full">Issue<textarea name="issue">${esc(s.issue || '')}</textarea></label>
    <label class="full">Action taken<textarea name="action_taken">${esc(s.action_taken || '')}</textarea></label>
    <div class="actions"><button type="button" onclick="closeModal()">Cancel</button><button type="submit" class="primary">Save</button></div>
  </form>`);
  bindForm('#seForm', async b => { await api('PUT', `/api/services/${s.id}`, b); afterAction(s.project_id, 'Service visit updated'); });
}

/* ================= DAILY UPDATES ================= */
let updMember = '';
VIEWS.updates = async (el) => {
  await loadMembers();
  const rows = (await api('GET', '/api/projects' + (updMember ? '?member=' + updMember : ''))).filter(p => ACTIVE.includes(p.status));
  const pending = rows.filter(p => !p.updated_today && (p.status === 'In Progress' || p.status === 'Rework'));
  el.innerHTML = `
  <div class="hint">Each team member updates their active projects here every day. The evening summary emailed to the manager picks up these updates and lists any project that was not updated.</div>
  <div class="toolbar"><select id="uMember">${memberOptions(updMember, true, 'All members')}</select>
    <span class="muted">${rows.length} active · <b style="color:${pending.length ? 'var(--critical-text)' : 'var(--good-text)'}">${pending.length} not updated today</b></span></div>
  <div class="card table-wrap"><table class="data">
    <tr><th>Project</th><th>City</th><th>Assigned to</th><th>Status</th><th style="width:150px">Progress</th><th>Last update</th><th>Today</th><th></th></tr>
    ${rows.map(p => `<tr><td class="click" onclick="openProject(${p.id})"><a href="javascript:void 0" class="code">${esc(p.code)}</a> · ${esc(p.name)}</td><td>${esc(p.city)}</td><td>${dash(p.member_name)}</td><td>${chip(p.status)}</td><td>${progress(p.progress)}</td><td class="nw">${fmtD(p.last_update)}</td>
      <td>${BLOCKED[p.status] ? `<span class="flag ${p.status === 'Site Not Ready' ? 'critical' : 'warning'}">${BLOCKED[p.status]}</span>` : READY_TO_START.includes(p.status) && !p.last_update ? '<span class="flag good">Ready to start</span>' : p.updated_today ? '<span class="flag good">Updated</span>' : '<span class="flag warning">Pending</span>'}</td>
      <td>${BLOCKED[p.status] ? stageAction(p) : `<button class="small primary" onclick="openUpdateForm(${jsArg(slim(p))})">+ Update</button>`}</td></tr>`).join('') || '<tr><td colspan="8" class="empty">No active projects</td></tr>'}
  </table></div>`;
  $('#uMember').onchange = e => { updMember = e.target.value; e.target.blur(); render(); };
};

/* ================= KICKOFF & SITE READINESS ================= */
let rdyMember = '';
VIEWS.readiness = async (el) => {
  await loadMembers();
  const all = await api('GET', '/api/projects' + (rdyMember ? '?member=' + rdyMember : ''));
  const by = s => all.filter(p => p.status === s);
  const sec = (title, sub, list, dateHead, dateCell, extra, red) => `<div class="card"><div class="card-h"><h3>${title}</h3><span class="count ${red && list.length ? 'red' : ''}">${list.length}</span><span class="sub">${sub}</span></div>
    ${list.length ? `<div class="table-wrap"><table class="data"><tr><th>Project</th><th>City</th><th>Assigned to</th><th>${dateHead}</th><th>${extra ? extra[0] : ''}</th><th></th></tr>
    ${list.map(p => `<tr><td class="click" onclick="openProject(${p.id})"><a href="javascript:void 0" class="code">${esc(p.code)}</a> · ${esc(p.name)}<div class="muted small-t">${esc(p.customer_name || '')}</div></td>
      <td>${esc(p.city)}</td><td>${dash(p.member_name)}</td><td class="nw">${dateCell(p)}</td><td>${extra ? extra[1](p) : ''}</td>
      <td class="nw">${stageAction(p) || `<button class="small primary" onclick="openUpdateForm(${jsArg(slim(p))})">+ Start / daily update</button>`}</td></tr>`).join('')}</table></div>` : '<div class="empty">None</div>'}</div>`;
  el.innerHTML = `
  <div class="hint">Before installation starts, every project goes through: <b>Allotted → Kickoff meeting → Site readiness &amp; fitment check → Finished goods received at site → Ready to start</b>. Daily updates open once the site is ready and the first delivery of goods is recorded.</div>
  <div class="toolbar"><select id="rMember">${memberOptions(rdyMember, true, 'All members')}</select></div>
  ${sec('Awaiting kickoff meeting', `flagged late after ${META.kickoff_due_days} days`, by('Allotted'), 'Allotted', p => `${fmtD((p.created_at || '').slice(0, 10))}${p.kickoff_late ? ` <span class="flag critical">${p.days_since_allotment} days</span>` : ''}`,
    ['Start date', p => fmtD(p.start_date)])}
  ${sec('Awaiting site readiness check', 'kickoff done', by('Kickoff Done'), 'Kickoff held', p => fmtD(p.kickoff_date), ['Start date', p => fmtD(p.start_date)])}
  ${sec('Site not ready', 'waiting on pending site work', by('Site Not Ready'), 'Last checked', p => fmtD(p.site_check_date),
    ['Pending / expected', p => `<div style="color:var(--critical-text)">${esc(p.site_pending || '')}</div>${siteExpected(p)}`], true)}
  ${sec('Site ready - awaiting finished goods', 'record the delivery when goods reach the site', by('Site Ready'), 'Site ready on', p => p.site_check_date ? fmtD(p.site_check_date) : '<span class="muted small-t">at allotment</span>', ['Start date', p => fmtD(p.start_date)])}
  ${sec('Ready to start', 'goods at site - post the first daily update', all.filter(p => READY_TO_START.includes(p.status)), 'Goods received', p => fmtD(p.goods_last_date),
    ['Goods', p => p.status === 'Goods Received' ? '<span class="flag good">All received</span>' : `<span class="flag warning">Partly received</span><div class="muted small-t">${p.goods_short} short · ${p.goods_damaged} damaged</div>`])}
  <div class="card"><div class="card-h"><h3>Goods partly received</h3><span class="count ${all.some(p => p.goods_pending) ? 'red' : ''}">${all.filter(p => p.goods_pending).length}</span><span class="sub">shortage or balance still to come, including projects already in progress</span></div>
    ${all.some(p => p.goods_pending) ? `<div class="table-wrap"><table class="data"><tr><th>Project</th><th>Assigned to</th><th>Status</th><th class="num">Deliveries</th><th class="num">Short</th><th class="num">Damaged</th><th>Last delivery</th><th></th></tr>
    ${all.filter(p => p.goods_pending).map(p => `<tr><td class="click" onclick="openProject(${p.id})"><a href="javascript:void 0" class="code">${esc(p.code)}</a> · ${esc(p.name)}</td><td>${dash(p.member_name)}</td><td>${chip(p.status)}</td>
      <td class="num">${p.goods_deliveries}</td><td class="num">${p.goods_short ? `<b class="red">${p.goods_short}</b>` : 0}</td><td class="num">${p.goods_damaged ? `<b class="red">${p.goods_damaged}</b>` : 0}</td><td class="nw">${fmtD(p.goods_last_date)}</td>
      <td><button class="small" onclick="openGoodsForm(${p.id})">+ Delivery</button></td></tr>`).join('')}</table></div>` : '<div class="empty">None</div>'}</div>`;
  $('#rMember').onchange = e => { rdyMember = e.target.value; e.target.blur(); render(); };
};

/* ================= INSPECTION & HANDOVER ================= */
VIEWS.inspection = async (el) => {
  await loadMembers();
  const all = await api('GET', '/api/projects');
  const sec = (title, list, btn) => `<div class="card"><div class="card-h"><h3>${title}</h3><span class="count">${list.length}</span></div>${list.length ? `<div class="table-wrap"><table class="data"><tr><th>Project</th><th>City</th><th>Assigned to</th><th>Status</th><th>Date</th><th></th></tr>${list.map(p => `<tr><td class="click" onclick="openProject(${p.id})"><a href="javascript:void 0" class="code">${esc(p.code)}</a> · ${esc(p.name)}<div class="muted small-t">${esc(p.customer_name || '')}</div></td><td>${esc(p.city)}</td><td>${dash(p.member_name)}</td><td>${chip(p.status)}</td><td class="nw">${fmtD(p.handover_date || p.completed_date)}</td><td>${btn(p)}</td></tr>`).join('')}</table></div>` : '<div class="empty">None</div>'}</div>`;
  el.innerHTML = `
  ${sec('Awaiting final inspection', all.filter(p => p.status === 'Installation Completed'), p => `<button class="small primary" onclick="openInspectionForm(${p.id})">Inspect</button>`)}
  ${sec('Under rework (inspection failed)', all.filter(p => p.status === 'Rework'), p => `<button class="small" onclick="openProject(${p.id})">View</button>`)}
  ${sec('Inspection passed - ready for handover', all.filter(p => p.status === 'Inspection Passed'), p => `<button class="small primary" onclick="openHandoverForm(${p.id}, ${jsArg({ customer_name: p.customer_name, customer_phone: p.customer_phone })})">Hand over</button>`)}
  ${sec('Handed over', all.filter(p => p.status === 'Handed Over' || p.status === 'Closed'), p => flags(p))}`;
};

/* ================= SERVICES ================= */
let svcFilter = 'Scheduled';
VIEWS.services = async (el) => {
  await loadMembers();
  const [rows, all] = await Promise.all([api('GET', '/api/services' + (svcFilter ? '?status=' + svcFilter : '')), api('GET', '/api/projects?status=Handed%20Over')]);
  el.innerHTML = `
  <div class="kpis">
    <div class="kpi"><div class="ic">${icon('services')}</div><div><div class="label">Projects in free service</div><div class="value">${all.length}</div><div class="sub">${META.free_service_months} months from handover</div></div></div>
    <div class="kpi"><div class="ic amber">${icon('clock')}</div><div><div class="label">Ending within 15 days</div><div class="value">${all.filter(p => p.service_days_left <= 15).length}</div><div class="sub">plan final visit</div></div></div>
  </div>
  <div class="card"><div class="card-h"><h3>Projects under free service</h3><span class="count">${all.length}</span></div>${all.length ? `<div class="table-wrap"><table class="data"><tr><th>Project</th><th>Customer</th><th>Handover</th><th>Free service till</th><th class="num">Days left</th><th></th></tr>
    ${all.map(p => `<tr><td class="click" onclick="openProject(${p.id})"><a href="javascript:void 0" class="code">${esc(p.code)}</a> · ${esc(p.name)}<div class="muted small-t">${esc(p.city)}</div></td><td>${dash(p.customer_name)}<div class="muted small-t">${esc(p.customer_phone || '')}</div></td><td class="nw">${fmtD(p.handover_date)}</td><td class="nw">${fmtD(p.service_end_date)}</td><td class="num">${p.service_days_left}</td>
    <td><button class="small" onclick="openServiceForm(${p.id}, ${p.assigned_to})">+ Service request</button></td></tr>`).join('')}</table></div>` : '<div class="empty">No projects in free service period</div>'}</div>
  <div class="card"><div class="card-h"><h3>Service visits</h3><select id="sFilter">${['', 'Scheduled', 'Completed', 'Missed', 'Cancelled'].map(x => `<option value="${x}" ${x === svcFilter ? 'selected' : ''}>${x || 'All'}</option>`).join('')}</select></div>
  <div class="table-wrap"><table class="data"><tr><th>Date</th><th>Project</th><th>Customer</th><th>#</th><th>Type</th><th>Technician</th><th>Status</th><th>Issue / Action</th><th></th></tr>
    ${rows.map(s => `<tr><td class="nw">${fmtD(s.scheduled_date)}</td><td class="click" onclick="openProject(${s.project_id})"><a href="javascript:void 0" class="code">${esc(s.code)}</a> · ${esc(s.project_name)}<div class="muted small-t">${esc(s.city)}</div></td><td>${dash(s.customer_name)}<div class="muted small-t">${esc(s.customer_phone || '')}</div></td><td>${s.visit_no}</td><td>${esc(s.service_type)}</td><td>${dash(s.technician_name)}</td><td>${svcStatus(s)}</td><td>${dash(s.issue)}${s.action_taken ? `<div class="muted">${esc(s.action_taken)}</div>` : ''}</td>
    <td><button class="small" onclick="openServiceEdit(${jsArg(s)})">Update</button></td></tr>`).join('') || '<tr><td colspan="9" class="empty">No visits</td></tr>'}</table></div></div>`;
  $('#sFilter').onchange = e => { svcFilter = e.target.value; e.target.blur(); render(); };
};

/* ================= FEEDBACK / CSAT ================= */
VIEWS.feedback = async (el) => {
  const d = await api('GET', '/api/feedback');
  const a = d.avg;
  const labels = { quality: 'Quality of work', timeliness: 'Timeliness', team_behaviour: 'Team behaviour', cleanliness: 'Cleanliness', overall: 'Overall' };
  const byMember = {};
  d.rows.forEach(r => { const k = r.member_name || '-'; (byMember[k] ||= []).push(r.overall); });
  el.innerHTML = `<div class="toolbar"><span class="spacer"></span><button onclick="window.print()">Print report</button></div>
  <div class="kpis">
    <div class="kpi"><div class="ic">${icon('feedback')}</div><div><div class="label">Responses</div><div class="value">${d.rows.length}</div></div></div>
    <div class="kpi"><div class="ic amber">${icon('feedback')}</div><div><div class="label">Average overall</div><div class="value">${a.overall ?? '-'}${a.overall ? ' / 5' : ''}</div></div></div>
    <div class="kpi"><div class="ic green">${icon('inspection')}</div><div><div class="label">Would recommend</div><div class="value">${d.recommend_pct ?? '-'}${d.recommend_pct !== null ? '%' : ''}</div></div></div>
    <div class="kpi"><div class="ic red">${icon('clock')}</div><div><div class="label">Feedback pending</div><div class="value ${d.pending.length ? 'red' : ''}">${d.pending.length}</div><div class="sub">handed over, no feedback</div></div></div>
  </div>
  <div class="grid g-2" style="margin-bottom:18px">
    <div class="card"><div class="card-h"><h3>Average rating by parameter</h3></div>${d.rows.length ? `<table class="data">${Object.entries(labels).map(([k, l]) => `<tr><td>${l}</td><td style="width:55%"><div class="bar" data-tip="${l}: ${a[k]} / 5"><span style="width:${a[k] / 5 * 100}%"></span></div></td><td class="num">${a[k]}</td></tr>`).join('')}</table>` : '<div class="empty">No feedback yet</div>'}</div>
    <div class="card"><div class="card-h"><h3>Average overall rating by team member</h3></div>${Object.keys(byMember).length ? `<table class="data">${Object.entries(byMember).map(([m, v]) => { const av = (v.reduce((x, y) => x + y, 0) / v.length).toFixed(1); return `<tr><td>${esc(m)}</td><td style="width:55%"><div class="bar" data-tip="${esc(m)}: ${av} / 5 (${v.length} responses)"><span style="width:${av / 5 * 100}%"></span></div></td><td class="num">${av}</td><td class="num muted">${v.length}</td></tr>`; }).join('')}</table>` : '<div class="empty">No feedback yet</div>'}</div>
  </div>
  <div class="card"><div class="card-h"><h3>Feedback pending</h3><span class="count ${d.pending.length ? 'red' : ''}">${d.pending.length}</span></div>${d.pending.length ? `<table class="data"><tr><th>Project</th><th>Customer</th><th>Handover</th><th></th></tr>${d.pending.map(p => `<tr><td><span class="code">${esc(p.code)}</span> · ${esc(p.name)}<div class="muted small-t">${esc(p.city)}</div></td><td>${dash(p.customer_name)}<div class="muted small-t">${esc(p.customer_phone || '')}</div></td><td>${fmtD(p.handover_date)}</td><td><button class="small primary" onclick="openFeedbackForm(${p.id})">Record feedback</button></td></tr>`).join('')}</table>` : '<div class="empty">None pending</div>'}</div>
  <div class="card"><div class="card-h"><h3>All responses</h3></div><div class="table-wrap"><table class="data"><tr><th>Date</th><th>Project</th><th>Installer</th><th class="num">Quality</th><th class="num">Time</th><th class="num">Team</th><th class="num">Clean</th><th class="num">Overall</th><th>Recommend</th><th>Comments</th></tr>
    ${d.rows.map(r => `<tr class="click" onclick="openProject(${r.project_id})"><td class="nw">${fmtD(r.feedback_date)}</td><td><span class="code">${esc(r.code)}</span> · ${esc(r.project_name)}<div class="muted small-t">${esc(r.customer_name || '')}, ${esc(r.city)}</div></td><td>${dash(r.member_name)}</td><td class="num">${r.quality}</td><td class="num">${r.timeliness}</td><td class="num">${r.team_behaviour}</td><td class="num">${r.cleanliness}</td><td class="num"><b>${r.overall}</b></td><td>${esc(r.recommend)}</td><td>${dash(r.comments)}</td></tr>`).join('') || '<tr><td colspan="10" class="empty">No responses</td></tr>'}</table></div></div>`;
};

/* ================= EMAIL & REPORTS ================= */
let repTab = 'summary';
VIEWS.reports = async (el) => {
  const [log, s, mail] = await Promise.all([api('GET', '/api/reports'), api('GET', '/api/settings'), api('GET', '/api/email-log')]);
  const rc = s.summary_recipients;
  const st = r => `<span class="flag ${r === 'Sent' || r === 'Emailed' ? 'good' : r === 'Failed' || r === 'Email failed' || r === 'No recipient' ? 'critical' : 'warning'}">${esc(r)}</span>`;
  el.innerHTML = `
  ${!s.smtp_host ? `<div class="hint warn"><b>Test mode:</b> email server (SMTP) is not set up yet, so emails are <b>saved to the outbox</b> instead of being sent — open them below to see exactly what each person will receive. Set up SMTP in <a href="#/settings">Settings</a> to send for real.</div>` : ''}
  <div class="kpis">
    <div class="kpi"><div class="ic">${icon('clock')}</div><div><div class="label">Evening summary</div><div class="value" style="font-size:22px">${s.auto_report_enabled === '1' ? esc(s.report_time) : 'Off'}</div><div class="sub">${s.auto_report_enabled === '1' ? 'sent automatically every day' : 'automatic sending is off'}</div></div></div>
    <div class="kpi"><div class="ic violet">${icon('team')}</div><div><div class="label">Manager recipients</div><div class="value ${rc.length ? '' : 'red'}">${rc.length}</div><div class="sub">${rc.length ? esc(rc.map(r => r.name).join(', ')) : 'none linked'}</div></div></div>
    <div class="kpi"><div class="ic green">${icon('mail')}</div><div><div class="label">Personal summaries</div><div class="value" style="font-size:22px">${s.member_daily_mail === '1' ? 'On' : 'Off'}</div><div class="sub">${s.member_mail_count} member email(s) linked</div></div></div>
    <div class="kpi"><div class="ic ${s.smtp_host ? 'green' : 'amber'}">${icon('settings')}</div><div><div class="label">Email server</div><div class="value" style="font-size:18px">${s.smtp_host ? esc(s.smtp_host) : 'Not set'}</div><div class="sub">${s.smtp_host ? 'emails are sent' : 'saving to outbox'}</div></div></div>
  </div>
  <div class="card"><div class="card-h"><h3>Send the evening summary</h3></div>
    <div class="toolbar" style="margin:0">Goes to:<div class="recips">${rc.map(r => `<span class="pill">${esc(r.name)} &lt;${esc(r.email)}&gt;</span>`).join('') || '<span class="flag critical">No manager linked — tick “Gets evening summary” on a team member</span>'}</div>
      <span class="spacer"></span><input type="date" id="rDate" value="${META.today}"><button onclick="previewReport()">Preview</button><button class="primary" onclick="runReport()">Send now</button></div>
  </div>
  <div id="rPreview"></div>
  <div class="card">
    <div class="tabs"><button class="${repTab === 'summary' ? 'on' : ''}" onclick="repTab='summary';render()">Summary history</button><button class="${repTab === 'mail' ? 'on' : ''}" onclick="repTab='mail';render()">All emails (${mail.length})</button></div>
    ${repTab === 'summary' ? `<div class="table-wrap"><table class="data"><tr><th>Report date</th><th>Generated</th><th>Trigger</th><th>Status</th><th>Details</th><th></th></tr>
    ${log.map(r => `<tr><td class="nw">${fmtD(r.report_date)}</td><td class="nw">${esc(r.generated_at.replace('T', ' '))}</td><td>${esc(r.trigger)}</td><td>${st(r.status)}</td><td class="ink2">${esc(r.message)}</td><td><a href="/reports/${encodeURIComponent(r.file)}" target="_blank">Open</a></td></tr>`).join('') || '<tr><td colspan="6" class="empty">No summaries yet</td></tr>'}</table></div>`
      : `<div class="table-wrap"><table class="data"><tr><th>Time</th><th>Type</th><th>To</th><th>Subject</th><th>Status</th><th></th></tr>
    ${mail.map(m => `<tr><td class="nw">${esc(m.sent_at.replace('T', ' '))}</td><td>${esc(m.kind)}</td><td>${dash(m.recipients)}</td><td>${esc(m.subject)}</td><td>${st(m.status)}${m.status === 'Failed' ? `<div class="small-t muted">${esc(m.message)}</div>` : ''}</td><td>${m.file ? `<a href="/reports/${m.file.split('/').map(encodeURIComponent).join('/')}" target="_blank">Open</a>` : ''}</td></tr>`).join('') || '<tr><td colspan="6" class="empty">No emails yet</td></tr>'}</table></div>`}
  </div>`;
};
async function previewReport() {
  const d = await api('GET', '/api/reports/preview?date=' + $('#rDate').value);
  $('#rPreview').innerHTML = '<div class="card"><div class="card-h"><h3>Preview</h3><button class="small" onclick="$(\'#rPreview\').innerHTML=\'\'">Close</button></div><iframe class="preview" id="rFrame"></iframe></div>';
  $('#rFrame').srcdoc = d.html;
}
async function runReport() {
  try { const r = await api('POST', '/api/reports/run', { date: $('#rDate').value }); toast(r.status + ': ' + r.message, r.status === 'Failed' || r.status === 'No recipient'); render(); }
  catch (e) { toast(e.message, true); }
}

/* ================= TEAM ================= */
VIEWS.team = async (el) => {
  await loadMembers();
  const noMail = MEMBERS.filter(m => m.active && !m.email).length;
  const mgr = MEMBERS.filter(m => m.active && m.daily_summary && m.email).length;
  el.innerHTML = `
  ${noMail ? `<div class="hint warn"><b>${noMail} member(s) have no email linked.</b> Add their email so they receive allotment emails and their own evening summary.</div>` : ''}
  ${!mgr ? `<div class="hint warn"><b>No manager is linked to the evening summary.</b> Edit the manager and tick “Gets the evening summary of all projects”.</div>` : ''}
  <div class="toolbar"><span class="muted">${MEMBERS.length} member(s) · ${MEMBERS.filter(m => m.email).length} with email · ${mgr} summary recipient(s)</span><span class="spacer"></span><button class="primary" onclick="openMemberForm()">+ Add member</button></div>
  <div class="card table-wrap"><table class="data"><tr><th>Member</th><th>Role</th><th>City</th><th>Phone</th><th>Email</th><th>Evening summary</th><th class="num">Active</th><th class="num">Total</th><th>Status</th><th></th></tr>
  ${MEMBERS.map(m => `<tr><td><div style="display:flex;gap:10px;align-items:center">${avatar(m, 30)}<b>${esc(m.name)}</b></div></td><td>${esc(m.role)}</td><td>${dash(m.city)}</td><td>${dash(m.phone)}</td>
  <td>${m.email ? `<a href="mailto:${esc(m.email)}">${esc(m.email)}</a>` : '<span class="flag critical">Not linked</span>'}</td>
  <td>${m.daily_summary ? '<span class="pill">All projects</span>' : m.email ? '<span class="muted small-t">Own projects</span>' : '<span class="muted">-</span>'}</td>
  <td class="num">${m.active_count}</td><td class="num">${m.project_count}</td><td>${m.active ? '<span class="flag good">Active</span>' : '<span class="muted">Inactive</span>'}</td>
  <td class="nw"><button class="small" onclick="openMemberForm(${jsArg(m)})">Edit</button> <button class="small" onclick="dashFilter.member='${m.id}';dashFilter.city='';location.hash='#/dashboard'">Dashboard</button></td></tr>`).join('') || '<tr><td colspan="10" class="empty">No members yet - add your installation team</td></tr>'}</table></div>`;
};
function openMemberForm(m) {
  m = m || { active: 1, role: 'Installer' };
  openModal(`<h3>${m.id ? 'Edit member' : 'Add team member'}</h3>
  <form class="form" id="memForm">
    <label>Name *<input name="name" required value="${esc(m.name || '')}"></label>
    <label>Role<select name="role" id="mRole">${['Installer', 'Supervisor', 'Inspector', 'Service Technician', 'Manager'].map(r => `<option ${r === m.role ? 'selected' : ''}>${r}</option>`).join('')}</select></label>
    <label>City<input name="city" value="${esc(m.city || '')}"></label>
    <label>Phone<input name="phone" value="${esc(m.phone || '')}"></label>
    <label class="full">Email ID<input name="email" type="email" value="${esc(m.email || '')}" placeholder="name@company.com"></label>
    <label class="check full"><input type="checkbox" name="daily_summary" id="mSum" ${m.daily_summary ? 'checked' : ''}> Gets the evening summary of <b>all projects</b> (managers)</label>
    <div class="full muted small-t" style="margin-top:-6px">Every member with an email also gets an email when a project is allotted to them and an evening summary of their own projects (can be turned off in Settings).</div>
    <label class="check full"><input type="checkbox" name="active" ${m.active ? 'checked' : ''}> Active</label>
    <div class="actions">${m.id ? `<button type="button" class="danger" onclick="deleteMember(${m.id})" style="margin-right:auto">Delete</button>` : ''}<button type="button" onclick="closeModal()">Cancel</button><button type="submit" class="primary">Save</button></div>
  </form>`);
  $('#mRole').onchange = e => { if (e.target.value === 'Manager') $('#mSum').checked = true; };
  bindForm('#memForm', async b => { m.id ? await api('PUT', `/api/members/${m.id}`, b) : await api('POST', '/api/members', b); closeModal(); toast('Saved'); render(); });
}
async function deleteMember(id) {
  if (!confirm('Delete this member?')) return;
  try { await api('DELETE', `/api/members/${id}`); closeModal(); toast('Deleted'); render(); } catch (e) { toast(e.message, true); }
}

/* ================= SETTINGS ================= */
VIEWS.settings = async (el) => {
  const s = await api('GET', '/api/settings');
  const yn = (name, on) => `<select name="${name}"><option value="1" ${on ? 'selected' : ''}>On</option><option value="0" ${!on ? 'selected' : ''}>Off</option></select>`;
  el.innerHTML = `
  <form class="card form" id="setForm">
    <h4>Company</h4>
    <label>Company name<input name="company_name" value="${esc(s.company_name)}"></label>
    <label>Dashboard link (used in emails)<input name="app_url" value="${esc(s.app_url)}"></label>
    <h4>Evening summary</h4>
    <label>Send every evening at<input type="time" name="report_time" value="${esc(s.report_time)}"></label>
    <label>Automatic evening summary${yn('auto_report_enabled', s.auto_report_enabled === '1')}</label>
    <label>Each member gets own project summary${yn('member_daily_mail', s.member_daily_mail === '1')}</label>
    <label>Email member when a project is allotted${yn('notify_allotment', s.notify_allotment === '1')}</label>
    <div class="full"><div style="font-size:12.5px;font-weight:600;color:var(--ink-2);margin-bottom:6px">Manager summary goes to</div>
      <div class="recips">${s.summary_recipients.map(r => `<span class="pill">${esc(r.name)} &lt;${esc(r.email)}&gt;</span>`).join('') || '<span class="flag critical">Nobody yet</span>'}</div>
      <div class="muted small-t" style="margin-top:6px">Linked from <a href="#/team">Team Members</a> (tick “Gets the evening summary”). Add anyone else below.</div></div>
    <label class="full">Additional recipients (comma separated)<input name="manager_emails" value="${esc(s.manager_emails)}" placeholder="director@company.com, ops@company.com"></label>
    <h4>Email server (SMTP)</h4>
    <div class="full hint" style="margin:0">Microsoft 365 / Outlook: <b>smtp.office365.com</b>, port <b>587</b>, STARTTLS (SMTP AUTH must be enabled for the mailbox). Gmail: <b>smtp.gmail.com</b>, port <b>587</b>, STARTTLS, with an <b>App Password</b>. Leave host empty to keep emails in the local outbox for testing.</div>
    <label>SMTP host<input name="smtp_host" value="${esc(s.smtp_host)}" placeholder="smtp.office365.com"></label>
    <label>Port<input name="smtp_port" value="${esc(s.smtp_port)}"></label>
    <label>Security<select name="smtp_security">${['starttls', 'ssl', 'none'].map(x => `<option ${x === s.smtp_security ? 'selected' : ''}>${x}</option>`).join('')}</select></label>
    <label>From address<input name="smtp_from" value="${esc(s.smtp_from)}" placeholder="installations@company.com"></label>
    <label>Username<input name="smtp_user" value="${esc(s.smtp_user)}" autocomplete="off"></label>
    <label>Password / App password<input type="password" name="smtp_password" value="${esc(s.smtp_password)}" autocomplete="new-password"></label>
    <div class="actions"><button type="button" onclick="testEmail()">Send test email</button><button type="submit" class="primary">Save settings</button></div>
  </form>`;
  bindForm('#setForm', async b => { await api('PUT', '/api/settings', b); toast('Settings saved'); await boot(); });
};
async function testEmail() {
  try { await api('PUT', '/api/settings', formData($('#setForm'))); const r = await api('POST', '/api/settings/test-email', {}); toast(r.message); }
  catch (e) { toast(e.message, true); }
}

/* ---------- boot ---------- */
async function boot() {
  META = await api('GET', '/api/meta');
  $('#brand').textContent = META.company_name || 'Installation Tracker';
  $$('.side a[data-icon]').forEach(a => { if (!a.querySelector('svg')) a.insertAdjacentHTML('afterbegin', icon(a.dataset.icon)); });
  await render();
  poll();
}
boot();

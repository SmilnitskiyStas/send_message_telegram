// Конвертація UTC → Київський час (UTC+3, постійно з 2022 року)
function toKyivTime(utcStr, withSeconds = false) {
  if (!utcStr) return '—';
  // SQLite зберігає без 'Z', додаємо щоб браузер розумів як UTC
  const iso = utcStr.includes('T') ? utcStr : utcStr.replace(' ', 'T');
  const withZ = iso.endsWith('Z') || iso.includes('+') ? iso : iso + 'Z';
  const d = new Date(withZ);
  if (isNaN(d.getTime())) return utcStr;
  return d.toLocaleString('uk-UA', {
    timeZone: 'Europe/Kiev',
    year: 'numeric', month: '2-digit', day: '2-digit',
    hour: '2-digit', minute: '2-digit',
    ...(withSeconds ? { second: '2-digit' } : {}),
  }).replace(',', '');
}

// Shared: перевірка авторизації + рендер sidebar
async function checkAuth() {
  const res = await fetch('/api/auth/me');
  const data = await res.json();
  if (!data.isAdmin) { window.location.href = '/admin/login.html'; }
}

function renderSidebar(active) {
  const nav = [
    { href: '/admin/', icon: '📊', label: 'Дашборд' },
    { href: '/admin/stores.html', icon: '🏪', label: 'Магазини' },
    { href: '/admin/users.html', icon: '👥', label: 'Користувачі' },
    { href: '/admin/logs.html', icon: '📋', label: 'Логи' },
    { href: '/admin/ollama.html', icon: '🤖', label: 'Ollama ML' },
  ];
  const html = nav.map(n => `
    <a href="${n.href}" class="nav-link ${active === n.label ? 'active' : 'text-white-50'}">
      ${n.icon} ${n.label}
    </a>`).join('');
  document.getElementById('sidebar-nav').innerHTML = html;
}

async function logout() {
  await fetch('/api/auth/logout', { method: 'POST' });
  window.location.href = '/admin/login.html';
}

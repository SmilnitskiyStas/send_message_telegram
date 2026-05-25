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

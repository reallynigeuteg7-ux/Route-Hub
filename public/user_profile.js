function escapeHtml(value) {
  return String(value ?? '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/\"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

function setText(id, value) {
  const el = document.getElementById(id);
  if (el) el.textContent = value;
}

function formatRating(value) {
  const n = Number(value || 0);
  if (!Number.isFinite(n) || n <= 0) return '--';
  return n.toFixed(2).replace(/\.00$/, '.0');
}

function roleText(role) {
  const raw = String(role || '').toLowerCase();
  return raw === 'carrier' || raw.includes('\u043f\u0435\u0440\u0435\u0432\u043e\u0437') ? '\u041f\u0435\u0440\u0435\u0432\u043e\u0437\u0447\u0438\u043a' : '\u0417\u0430\u043a\u0430\u0437\u0447\u0438\u043a';
}

function formatDate(value) {
  if (!value) return '';
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return '';
  return date.toLocaleDateString('ru-RU');
}

async function initUserProfile() {
  const params = new URLSearchParams(window.location.search);
  const userId = params.get('id');
  const reviewsList = document.getElementById('reviewsList');

  if (!userId) {
    if (reviewsList) reviewsList.innerHTML = '<div class="empty">\u041f\u043e\u043b\u044c\u0437\u043e\u0432\u0430\u0442\u0435\u043b\u044c \u043d\u0435 \u0432\u044b\u0431\u0440\u0430\u043d</div>';
    return;
  }

  try {
    const response = await fetch('/api/users/' + encodeURIComponent(userId) + '/public', { credentials: 'include' });
    const data = await response.json().catch(() => ({}));
    if (!response.ok) throw new Error(data.error || '\u041d\u0435 \u0443\u0434\u0430\u043b\u043e\u0441\u044c \u0437\u0430\u0433\u0440\u0443\u0437\u0438\u0442\u044c \u043f\u0440\u043e\u0444\u0438\u043b\u044c');

    const name = data.name || data.company || '\u041f\u043e\u043b\u044c\u0437\u043e\u0432\u0430\u0442\u0435\u043b\u044c';
    setText('profileName', name);
    setText('profileRole', roleText(data.role));
    setText('avatar', name.charAt(0).toUpperCase());
    setText('rating', formatRating(data.averageRating));
    setText('reviewsCount', Number(data.totalReviews || 0).toLocaleString('ru-RU'));
    setText('reviewsBadge', Number(data.totalReviews || 0).toLocaleString('ru-RU'));
    setText('activeLoads', Number(data.activeLoads || 0).toLocaleString('ru-RU'));
    setText('completedLoads', Number(data.completedLoads || 0).toLocaleString('ru-RU'));
    setText('company', data.company || '\u041d\u0435 \u0443\u043a\u0430\u0437\u0430\u043d\u043e');
    setText('phone', data.phone || '\u041d\u0435 \u0443\u043a\u0430\u0437\u0430\u043d');
    setText('userCode', data.user_code || '000000');
    const fallbackIin = params.get('iin') || '';
    const profileIin = data.iin || data.client_iin || data.iinBin || data.iin_bin || data.bin || fallbackIin;
    setText('iin', profileIin || '\u041d\u0435 \u0443\u043a\u0430\u0437\u0430\u043d');
    setText('ecp', data.ecp_verified ? '\u0412\u0435\u0440\u0438\u0444\u0438\u0446\u0438\u0440\u043e\u0432\u0430\u043d' : '\u041d\u0435 \u0432\u0435\u0440\u0438\u0444\u0438\u0446\u0438\u0440\u043e\u0432\u0430\u043d');

    const reviews = Array.isArray(data.reviews) ? data.reviews : [];
    if (!reviews.length) {
      if (reviewsList) reviewsList.innerHTML = '<div class="empty">\u041e\u0442\u0437\u044b\u0432\u043e\u0432 \u043f\u043e\u043a\u0430 \u043d\u0435\u0442</div>';
      return;
    }

    if (reviewsList) {
      reviewsList.innerHTML = reviews.map((review) => {
        const stars = '&#9733;'.repeat(Math.max(1, Math.min(5, Number(review.rating || 0))));
        return '<article class="review">' +
          '<div class="review-head">' +
            '<div>' +
              '<div class="review-author">' + escapeHtml(review.authorName || '\u041f\u043e\u043b\u044c\u0437\u043e\u0432\u0430\u0442\u0435\u043b\u044c') + '</div>' +
              '<div class="review-route">' + escapeHtml(review.loadRoute || '') + '</div>' +
            '</div>' +
            '<div class="rating">' + stars + ' <span style="color:#94a3b8;font-size:12px">' + escapeHtml(formatDate(review.createdAt)) + '</span></div>' +
          '</div>' +
          (review.text ? '<p class="review-text">' + escapeHtml(review.text) + '</p>' : '') +
        '</article>';
      }).join('');
    }
  } catch (err) {
    console.error('User profile error:', err);
    if (reviewsList) reviewsList.innerHTML = '<div class="empty">' + escapeHtml(err.message || '\u041e\u0448\u0438\u0431\u043a\u0430 \u0437\u0430\u0433\u0440\u0443\u0437\u043a\u0438') + '</div>';
  }
}

document.addEventListener('DOMContentLoaded', initUserProfile);

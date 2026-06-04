const chatForm = document.getElementById('chat-form');
const chatInput = document.getElementById('chat-input');
const chatMessages = document.getElementById('chat-messages');
const userNameDisplay = document.getElementById('current-user-name');
const chatList = document.getElementById('chat-list');
const userCount = document.getElementById('user-count');
const sidebar = document.querySelector('.sidebar');
const menuToggle = document.getElementById('menu-toggle');

let socket = null;
let currentUser = null;
let activeChat = { id: 'global', type: 'global', name: 'Глобальный чат' };
let loadedMessageIds = new Set();

function escapeHtml(value) {
  return String(value ?? '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

function formatTime(value) {
  if (!value) return '';
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return '';
  return `${String(date.getHours()).padStart(2, '0')}:${String(date.getMinutes()).padStart(2, '0')}`;
}

async function api(path, options = {}) {
  const response = await fetch(path, {
    credentials: 'include',
    headers: { 'Content-Type': 'application/json', ...(options.headers || {}) },
    ...options,
  });

  const data = await response.json().catch(() => ({}));
  if (!response.ok) {
    if (response.status === 401) window.location.href = '/login.html';
    throw new Error(data.error || 'Ошибка запроса');
  }
  return data;
}

function getMessageId(message) {
  const prefix = activeChat.type === 'global' ? 'g' : 'p';
  return `${prefix}_${message.id || `${message.senderId}_${message.createdAt}_${message.text}`}`;
}

function renderMessage(message, append = true) {
  if (!chatMessages || !message) return;

  const messageId = getMessageId(message);
  if (loadedMessageIds.has(messageId)) return;
  loadedMessageIds.add(messageId);

  const senderId = Number(message.senderId);
  const isMe = currentUser && senderId === Number(currentUser.id);
  const name = message.sender_name || message.senderName || 'Пользователь';
  const initial = (name[0] || 'U').toUpperCase();
  const time = formatTime(message.createdAt);

  const msgDiv = document.createElement('div');
  msgDiv.className = `message ${isMe ? 'sent' : 'received'}`;
  msgDiv.innerHTML = `
    <span class="author">${escapeHtml(name)} ${time ? `<small>${escapeHtml(time)}</small>` : ''}</span>
    <div class="msg-wrapper">
      <div class="mini-avatar">${escapeHtml(initial)}</div>
      <div class="msg-content"><p>${escapeHtml(message.text || '')}</p></div>
    </div>
  `;

  if (append) chatMessages.appendChild(msgDiv);
  else chatMessages.prepend(msgDiv);
  chatMessages.scrollTop = chatMessages.scrollHeight;
}

function renderMessages(messages) {
  if (!chatMessages) return;
  chatMessages.innerHTML = '';
  loadedMessageIds = new Set();

  if (!Array.isArray(messages) || !messages.length) {
    chatMessages.innerHTML = '<div class="chat-empty">Сообщений пока нет. Напишите первым.</div>';
    return;
  }

  messages.forEach((message) => renderMessage(message));
  chatMessages.scrollTop = chatMessages.scrollHeight;
}

function getChatTitle(chat) {
  if (chat.type === 'global') return 'Глобальный чат';
  const route = chat.from_location && chat.to_location ? `${chat.from_location} → ${chat.to_location}` : '';
  return route || chat.name || 'Личный чат';
}

function renderChatList(chats) {
  if (!chatList) return;
  chatList.innerHTML = '';

  chats.forEach((chat) => {
    const isGlobal = chat.type === 'global' || String(chat.id) === 'global';
    const title = isGlobal ? 'Глобальный чат' : getChatTitle(chat);
    const subtitle = isGlobal ? 'Общий чат RouteHub' : (chat.last_message || chat.name || 'Личный чат по грузу');
    const avatar = isGlobal ? 'RH' : (title[0] || 'C').toUpperCase();

    const item = document.createElement('div');
    item.className = `chat-item ${String(activeChat.id) === String(chat.id) ? 'active' : ''}`;
    item.dataset.chatId = String(chat.id);
    item.dataset.chatType = isGlobal ? 'global' : 'private';
    item.innerHTML = `
      <div class="avatar">${escapeHtml(avatar)}</div>
      <div class="chat-info">
        <span class="chat-name">${escapeHtml(title)}</span>
        <div>${escapeHtml(subtitle || '')}</div>
      </div>
    `;
    item.addEventListener('click', () => openChat({ ...chat, type: isGlobal ? 'global' : 'private' }));
    chatList.appendChild(item);
  });
}

function setActiveChatInList() {
  document.querySelectorAll('.chat-item').forEach((item) => {
    item.classList.toggle('active', String(item.dataset.chatId) === String(activeChat.id));
  });
}

function joinSocketRoom(chat) {
  if (!socket) return;
  socket.emit('join_chat', chat.type === 'global' ? 'global' : String(chat.id));
}

async function openChat(chat) {
  activeChat = chat.type === 'global'
    ? { id: 'global', type: 'global', name: 'Глобальный чат' }
    : { ...chat, type: 'private' };

  setActiveChatInList();
  joinSocketRoom(activeChat);

  const title = document.querySelector('.chat-header-title h3');
  if (title) title.textContent = activeChat.type === 'global' ? 'RouteHub Global' : getChatTitle(activeChat);

  const data = activeChat.type === 'global'
    ? await api('/api/chats/global/messages')
    : await api(`/api/chats/${encodeURIComponent(activeChat.id)}/messages`);

  renderMessages(data.messages || []);
  closeSidebar();
}

async function loadChats(openInitial = true) {
  const chats = await api('/api/chats?includeGlobal=1');
  renderChatList(chats);

  if (!openInitial) {
    setActiveChatInList();
    return;
  }

  const chatIdFromUrl = new URLSearchParams(window.location.search).get('chat');
  const initial = chatIdFromUrl
    ? chats.find((chat) => String(chat.id) === String(chatIdFromUrl))
    : chats[0];

  await openChat(initial || { id: 'global', type: 'global' });
}

async function sendMessage(event) {
  event.preventDefault();
  const text = chatInput?.value?.trim();
  if (!text) return;

  const path = activeChat.type === 'global'
    ? '/api/chats/global/messages'
    : `/api/chats/${encodeURIComponent(activeChat.id)}/messages`;

  chatInput.disabled = true;
  try {
    const message = await api(path, {
      method: 'POST',
      body: JSON.stringify({ text }),
    });
    renderMessage(message);
    chatInput.value = '';
    await loadChats(false);
    setActiveChatInList();
  } catch (error) {
    alert(error.message || 'Не удалось отправить сообщение');
  } finally {
    chatInput.disabled = false;
    chatInput.focus();
  }
}

function setupSocket() {
  if (typeof io !== 'function') return;
  socket = io({ withCredentials: true });

  socket.on('connect', () => {
    if (userCount) userCount.textContent = 'В сети';
    joinSocketRoom(activeChat);
  });

  socket.on('disconnect', () => {
    if (userCount) userCount.textContent = 'Нет соединения';
  });

  socket.on('new_message', (payload) => {
    if (!payload?.message) return;
    const isActiveGlobal = activeChat.type === 'global' && payload.room === 'global';
    const isActivePrivate = activeChat.type === 'private' && String(payload.chatId) === String(activeChat.id);
    if (isActiveGlobal || isActivePrivate) renderMessage(payload.message);
    loadChats(false).catch(() => {});
  });
}

function closeSidebar() {
  sidebar?.classList.remove('active');
  document.querySelector('.sidebar-overlay')?.classList.remove('active');
}

function setupMobileMenu() {
  let overlay = document.querySelector('.sidebar-overlay');
  if (!overlay) {
    overlay = document.createElement('div');
    overlay.className = 'sidebar-overlay';
    document.body.appendChild(overlay);
  }

  menuToggle?.addEventListener('click', () => {
    sidebar?.classList.toggle('active');
    overlay.classList.toggle('active');
  });
  overlay.addEventListener('click', closeSidebar);
}

async function initChat() {
  try {
    currentUser = await api('/api/me');
    if (userNameDisplay) userNameDisplay.textContent = currentUser?.name || 'Пользователь';
  } catch {
    window.location.href = '/login.html';
    return;
  }

  setupSocket();
  setupMobileMenu();
  chatForm?.addEventListener('submit', sendMessage);
  await loadChats();
}

initChat();
const CHAT_TEMPLATE = `
  <style>
    .chat-embed * { box-sizing: border-box; }
    .chat-embed {
      width: 100%;
      min-height: 620px;
      display: grid;
      grid-template-columns: 280px minmax(0, 1fr);
      overflow: hidden;
      border-radius: 24px;
      border: 1px solid rgba(255,255,255,0.08);
      background: rgba(255,255,255,0.02);
      backdrop-filter: blur(10px);
    }
    .chat-embed .chat-sidebar {
      min-width: 0;
      border-right: 1px solid rgba(255,255,255,0.07);
      background: rgba(0,0,0,0.16);
      display: flex;
      flex-direction: column;
    }
    .chat-embed .chat-sidebar-head {
      padding: 18px;
      border-bottom: 1px solid rgba(255,255,255,0.07);
    }
    .chat-embed .chat-sidebar-head h3,
    .chat-embed .chat-header h3 {
      margin: 0;
      color: #fff;
      font-size: 18px;
      line-height: 1.25;
    }
    .chat-embed .chat-sidebar-head span,
    .chat-embed .chat-header span {
      display: block;
      margin-top: 5px;
      color: rgba(255,255,255,0.58);
      font-size: 12px;
      font-weight: 700;
    }
    .chat-embed .chat-list {
      flex: 1;
      min-height: 0;
      overflow-y: auto;
      padding: 12px 22px 12px 12px;
      display: grid;
      align-content: start;
      gap: 8px;
    }
    .chat-embed .chat-item {
      display: flex;
      align-items: center;
      gap: 10px;
      padding: 12px;
      border-radius: 16px;
      border: 1px solid transparent;
      background: rgba(255,255,255,0.03);
      cursor: pointer;
      transition: .16s ease;
    }
    .chat-embed .chat-item:hover,
    .chat-embed .chat-item.active {
      background: rgba(43,140,255,0.14);
      border-color: rgba(43,140,255,0.26);
    }
    .chat-embed .avatar,
    .chat-embed .mini-avatar {
      width: 42px;
      height: 42px;
      flex: 0 0 auto;
      border-radius: 14px;
      display: grid;
      place-items: center;
      background: linear-gradient(135deg, #2b8cff, #0b63d8);
      color: #fff;
      font-weight: 900;
      font-size: 13px;
    }
    .chat-embed .chat-info { min-width: 0; }
    .chat-embed .chat-name {
      display: block;
      color: #fff;
      font-size: 14px;
      font-weight: 900;
      overflow: hidden;
      text-overflow: ellipsis;
      white-space: nowrap;
    }
    .chat-embed .chat-last {
      margin-top: 3px;
      color: rgba(255,255,255,0.55);
      font-size: 12px;
      overflow: hidden;
      text-overflow: ellipsis;
      white-space: nowrap;
    }
    .chat-embed .main-chat {
      min-width: 0;
      min-height: 620px;
      display: flex;
      flex-direction: column;
      overflow: hidden;
    }
    .chat-embed .chat-header {
      padding: 16px 20px;
      border-bottom: 1px solid rgba(255,255,255,0.06);
      display: flex;
      align-items: center;
      justify-content: space-between;
      gap: 12px;
    }
    .chat-embed .messages-area {
      flex: 1;
      min-height: 0;
      overflow-y: auto;
      padding: 22px;
      display: flex;
      flex-direction: column;
      gap: 14px;
    }
    .chat-embed .chat-empty {
      margin: auto;
      max-width: 420px;
      padding: 18px;
      text-align: center;
      border-radius: 18px;
      border: 1px dashed rgba(255,255,255,0.14);
      color: rgba(255,255,255,0.65);
      background: rgba(255,255,255,0.03);
      line-height: 1.55;
      font-size: 14px;
      font-weight: 700;
    }
    .chat-embed .message {
      max-width: min(78%, 620px);
      display: flex;
      flex-direction: column;
    }
    .chat-embed .message.sent { align-self: flex-end; align-items: flex-end; }
    .chat-embed .message.received { align-self: flex-start; align-items: flex-start; }
    .chat-embed .author {
      color: rgba(255,255,255,0.52);
      font-size: 11px;
      margin-bottom: 5px;
      padding: 0 5px;
    }
    .chat-embed .msg-wrapper {
      display: flex;
      gap: 8px;
      align-items: flex-end;
    }
    .chat-embed .message.sent .msg-wrapper { flex-direction: row-reverse; }
    .chat-embed .mini-avatar {
      width: 30px;
      height: 30px;
      border-radius: 12px;
      font-size: 11px;
    }
    .chat-embed .msg-content {
      padding: 12px 15px;
      border-radius: 18px;
      color: #fff;
      background: rgba(255,255,255,0.08);
      border: 1px solid rgba(255,255,255,0.06);
      word-break: break-word;
      line-height: 1.45;
      font-size: 14px;
    }
    .chat-embed .msg-content p { margin: 0; }
    .chat-embed .message.sent .msg-content {
      background: linear-gradient(135deg, #2b8cff, #0b63d8);
      border-color: rgba(43,140,255,0.38);
    }
    .chat-embed #chat-form {
      padding: 14px 18px;
      border-top: 1px solid rgba(255,255,255,0.06);
      background: rgba(0,0,0,0.18);
    }
    .chat-embed .chat-input-area {
      display: flex;
      gap: 12px;
      align-items: center;
      padding: 10px 12px;
      border-radius: 16px;
      border: 1px solid rgba(255,255,255,0.08);
      background: rgba(255,255,255,0.05);
    }
    .chat-embed #chat-input {
      flex: 1;
      min-width: 0;
      border: none;
      background: transparent;
      color: #fff;
      outline: none;
      font-size: 15px;
      padding: 10px 8px;
    }
    .chat-embed #chat-input::placeholder { color: rgba(255,255,255,0.5); }
    .chat-embed #send-btn {
      width: 46px;
      height: 46px;
      border-radius: 14px;
      border: none;
      background: #2b8cff;
      color: #fff;
      cursor: pointer;
      display: flex;
      align-items: center;
      justify-content: center;
      transition: .2s;
      flex-shrink: 0;
    }
    .chat-embed #send-btn:hover { transform: scale(1.04); }
    @media (max-width: 900px) {
      .chat-embed { grid-template-columns: 1fr; }
      .chat-embed .chat-sidebar { border-right: 0; border-bottom: 1px solid rgba(255,255,255,0.07); }
      .chat-embed .chat-list { grid-auto-flow: column; grid-auto-columns: minmax(220px, 260px); overflow-x: auto; overflow-y: hidden; }
      .chat-embed .main-chat { min-height: 520px; }
    }
    @media (max-width: 640px) {
      .chat-embed { min-height: 560px; border-radius: 18px; }
      .chat-embed .chat-header, .chat-embed .chat-sidebar-head { padding: 12px 14px; }
      .chat-embed .messages-area { padding: 12px; }
      .chat-embed .message { max-width: 90%; }
      .chat-embed #chat-form { padding: 10px 12px 12px; }
      .chat-embed .chat-input-area { gap: 8px; padding: 8px; border-radius: 14px; }
      .chat-embed #chat-input { font-size: 16px; padding: 10px 8px; }
      .chat-embed #send-btn { width: 44px; height: 44px; border-radius: 12px; }
    }
  </style>

  <div class="chat-embed">
    <aside class="chat-sidebar">
      <div class="chat-sidebar-head">
        <h3>Личные сообщения</h3>
        <span>Только чаты по принятым ставкам</span>
      </div>
      <div id="pm-chat-list" class="chat-list">
        <div class="chat-empty">Загрузка личных чатов...</div>
      </div>
    </aside>

    <main class="main-chat">
      <header class="chat-header">
        <div>
          <h3 id="embedded-chat-title">Выберите чат</h3>
          <span id="user-count">Только личные сообщения</span>
        </div>
      </header>
      <div id="chat-messages" class="messages-area">
        <div class="chat-empty">Выберите личный чат слева, чтобы открыть переписку.</div>
      </div>
      <form id="chat-form">
        <div class="chat-input-area">
          <input type="text" placeholder="Напишите сообщение..." id="chat-input" autocomplete="off" disabled>
          <button type="submit" id="send-btn">➤</button>
        </div>
      </form>
    </main>
  </div>
`;
const TOKEN_KEY = "goofgram-online-token";
const token = () => localStorage.getItem(TOKEN_KEY);
let socket = null;
let state = { currentUserId: null, users: [], posts: [], follows: [], messages: [] };
let view = "home";
let selectedUserId = null;
let query = "";

const paths = {
  home: "M3 11l9-8 9 8v9a1 1 0 0 1-1 1h-5v-6H9v6H4a1 1 0 0 1-1-1z",
  search: "M11 19a8 8 0 1 1 0-16 8 8 0 0 1 0 16Zm10 2-4.3-4.3",
  plus: "M12 5v14M5 12h14",
  heart: "M20.8 4.6a5.4 5.4 0 0 0-7.6 0L12 5.8l-1.2-1.2a5.4 5.4 0 0 0-7.6 7.6l1.2 1.2L12 21l7.6-7.6 1.2-1.2a5.4 5.4 0 0 0 0-7.6z",
  message: "M21 15a4 4 0 0 1-4 4H8l-5 3V7a4 4 0 0 1 4-4h10a4 4 0 0 1 4 4z",
  user: "M20 21a8 8 0 0 0-16 0M12 13a5 5 0 1 0 0-10 5 5 0 0 0 0 10z",
  logout: "M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4M16 17l5-5-5-5M21 12H9",
  send: "M22 2 11 13M22 2l-7 20-4-9-9-4z",
  camera: "M23 19a2 2 0 0 1-2 2H3a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h4l2-3h6l2 3h4a2 2 0 0 1 2 2zM12 17a4 4 0 1 0 0-8 4 4 0 0 0 0 8z"
};

function icon(name) {
  return `<svg aria-hidden="true" viewBox="0 0 24 24"><path d="${paths[name]}"></path></svg>`;
}

function escapeHtml(value) {
  return String(value).replace(/[&<>"']/g, (char) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#039;" })[char]);
}

function currentUser() {
  return state.users.find((user) => user.id === state.currentUserId);
}

function userById(id) {
  return state.users.find((user) => user.id === id);
}

function initials(user) {
  return (user?.displayName || user?.username || "?").split(/\s+/).map((part) => part[0]).join("").slice(0, 2).toUpperCase();
}

function timeAgo(time) {
  const seconds = Math.max(1, Math.floor((Date.now() - time) / 1000));
  if (seconds < 60) return `${seconds}s`;
  const minutes = Math.floor(seconds / 60);
  if (minutes < 60) return `${minutes}m`;
  const hours = Math.floor(minutes / 60);
  if (hours < 24) return `${hours}h`;
  return `${Math.floor(hours / 24)}d`;
}

async function api(path, options = {}) {
  const response = await fetch(path, {
    ...options,
    headers: {
      "Content-Type": "application/json",
      ...(token() ? { Authorization: `Bearer ${token()}` } : {}),
      ...(options.headers || {})
    }
  });
  const data = await response.json().catch(() => ({}));
  if (!response.ok) throw new Error(data.error || "Something went wrong.");
  return data;
}

async function loadState() {
  if (!token()) return render();
  try {
    state = await api("/api/state");
    connectSocket();
  } catch {
    localStorage.removeItem(TOKEN_KEY);
  }
  render();
}

function connectSocket() {
  if (socket) return;
  socket = io({ auth: { token: token() } });
  socket.on("state:update", (patch) => {
    state = { ...state, ...patch };
    render();
  });
  socket.on("message:new", (message) => {
    if (!state.messages.some((item) => item.id === message.id)) state.messages.push(message);
    render();
    scrollMessages();
  });
}

function render() {
  const root = document.querySelector("#app");
  if (!currentUser()) {
    root.innerHTML = authView();
    wireAuth();
    return;
  }
  root.innerHTML = `
    <div class="shell">
      ${sidebar()}
      <section class="main">${topbar()}${renderMain()}</section>
      ${rightbar()}
    </div>
  `;
  wireApp();
}

function authView() {
  return `
    <section class="auth-wrap">
      <div class="auth-card">
        <div class="auth-visual">
          <div class="brand"><span class="brand-mark">${icon("camera")}</span><span>Goofgram</span></div>
          <h1>Post. Follow. Chat.</h1>
          <p>This version has a server, shared accounts, shared posts, and live messaging for everyone who visits the hosted link.</p>
        </div>
        <form class="auth-form" id="auth-form">
          <div class="tabs">
            <button type="button" class="active" data-auth-tab="login">Login</button>
            <button type="button" data-auth-tab="signup">Create account</button>
          </div>
          <h2 id="auth-title">Welcome back</h2>
          <p class="muted">Demo login: <strong>maya</strong> / <strong>demo123</strong></p>
          <input id="display-name" name="displayName" placeholder="Display name" autocomplete="name" hidden />
          <input name="username" placeholder="Username" autocomplete="username" required />
          <input name="password" placeholder="Password" autocomplete="current-password" type="password" required />
          <p class="error" id="auth-error" aria-live="polite"></p>
          <button class="primary" type="submit">Continue</button>
        </form>
      </div>
    </section>`;
}

function sidebar() {
  const me = currentUser();
  const nav = [["home", "home", "Feed"], ["explore", "search", "Explore"], ["create", "plus", "Create"], ["messages", "message", "Messages"], ["profile", "user", "Profile"]];
  return `
    <aside class="sidebar">
      <div class="brand"><span class="brand-mark">${icon("camera")}</span><span>Goofgram</span></div>
      <nav class="nav">${nav.map(([id, ico, label]) => `<button class="${view === id ? "active" : ""}" data-view="${id}" title="${label}">${icon(ico)}<span>${label}</span></button>`).join("")}</nav>
      <div class="me-card">
        <div class="row"><div class="avatar">${initials(me)}</div><div class="meta"><div class="name">${escapeHtml(me.displayName)}</div><div class="muted mini">@${escapeHtml(me.username)}</div></div></div>
        <button class="ghost" id="logout" style="width:100%;margin-top:12px">${icon("logout")} Logout</button>
      </div>
    </aside>`;
}

function topbar() {
  return `<header class="topbar"><h1 class="view-title">${{ home: "Feed", explore: "Explore", create: "Create Post", messages: "Messages", profile: "Profile" }[view]}</h1><input class="search" id="search" placeholder="Search people or posts" value="${escapeHtml(query)}" /></header>`;
}

function rightbar() {
  const suggestions = state.users.filter((user) => user.id !== state.currentUserId && !isFollowing(state.currentUserId, user.id)).slice(0, 4);
  return `<aside class="rightbar"><h2>People to follow</h2><div class="suggestions">${suggestions.length ? suggestions.map(userCardSmall).join("") : `<p class="empty">You follow everyone here.</p>`}</div></aside>`;
}

function renderMain() {
  if (view === "home") return homeView();
  if (view === "explore") return exploreView();
  if (view === "create") return createView(false);
  if (view === "messages") return messagesView();
  return profileView(selectedUserId || state.currentUserId);
}

function homeView() {
  const feedUserIds = new Set([state.currentUserId, ...state.follows.filter((follow) => follow.followerId === state.currentUserId).map((follow) => follow.followingId)]);
  const posts = filteredPosts(state.posts.filter((post) => feedUserIds.has(post.userId)));
  return `${createView(true)}<section class="feed">${posts.length ? posts.map(postCard).join("") : `<div class="panel empty">Follow people or create a post to start your feed.</div>`}</section>`;
}

function createView(compact) {
  return `<form class="composer" id="post-form">${compact ? "" : `<h2 class="view-title">Share something</h2>`}<textarea id="caption" placeholder="What's happening?"></textarea><div class="composer-tools"><input id="image-url" placeholder="Image URL (optional)" /><input id="post-color" type="color" value="#f75c7c" title="Post color" /><button class="primary" type="submit">${icon("plus")} Post</button></div></form>`;
}

function exploreView() {
  const people = filteredUsers(state.users.filter((user) => user.id !== state.currentUserId));
  return `<section class="stack"><div class="panel" style="padding:16px"><h2 class="view-title">People</h2><div class="people-grid" style="margin-top:12px">${people.map(userCard).join("") || `<p class="empty">No people found.</p>`}</div></div><div class="feed">${filteredPosts(state.posts).map(postCard).join("") || `<div class="panel empty">No posts match your search.</div>`}</div></section>`;
}

function profileView(userId) {
  const user = userById(userId) || currentUser();
  const posts = state.posts.filter((post) => post.userId === user.id).sort((a, b) => b.createdAt - a.createdAt);
  const followers = state.follows.filter((follow) => follow.followingId === user.id).length;
  const following = state.follows.filter((follow) => follow.followerId === user.id).length;
  return `<section class="stack"><div class="panel profile-card"><div class="avatar lg">${initials(user)}</div><div><h2 class="view-title">${escapeHtml(user.displayName)}</h2><p class="muted">@${escapeHtml(user.username)}</p><p>${escapeHtml(user.bio || "No bio yet.")}</p><div class="stats"><span class="stat"><strong>${posts.length}</strong><span class="muted">posts</span></span><span class="stat"><strong>${followers}</strong><span class="muted">followers</span></span><span class="stat"><strong>${following}</strong><span class="muted">following</span></span></div></div><div class="stack">${user.id === state.currentUserId ? `<button class="ghost" id="logout-profile">${icon("logout")} Logout</button>` : `<button class="pill ${isFollowing(state.currentUserId, user.id) ? "following" : ""}" data-follow="${user.id}">${isFollowing(state.currentUserId, user.id) ? "Following" : "Follow"}</button><button class="ghost" data-message="${user.id}">${icon("message")} Message</button>`}</div></div><section class="feed">${posts.map(postCard).join("") || `<div class="panel empty">No posts yet.</div>`}</section></section>`;
}

function messagesView() {
  const partners = messagePartners();
  const activePartnerId = selectedUserId && selectedUserId !== state.currentUserId ? selectedUserId : partners[0]?.id;
  const activePartner = activePartnerId ? userById(activePartnerId) : null;
  const messages = activePartner ? threadMessages(activePartner.id) : [];
  return `<section class="messages-layout"><div class="thread-list">${partners.length ? partners.map((user) => threadButton(user, activePartnerId)).join("") : `<div class="empty">Follow someone or open a profile to start chatting.</div>`}</div><div class="chat-panel">${activePartner ? `<div class="chat-head"><div class="row"><div class="avatar">${initials(activePartner)}</div><div><div class="name">${escapeHtml(activePartner.displayName)}</div><div class="muted mini">@${escapeHtml(activePartner.username)}</div></div></div><button class="ghost" data-profile="${activePartner.id}">${icon("user")} Profile</button></div><div class="messages" id="messages">${messages.map(messageBubble).join("") || `<p class="empty">Say hi. Live texting is on.</p>`}</div><form class="message-input" id="message-form" data-to="${activePartner.id}"><textarea id="message-text" placeholder="Type a message"></textarea><button class="primary" type="submit">${icon("send")}</button></form>` : `<div class="empty">Pick someone to chat with.</div>`}</div></section>`;
}

function postCard(post) {
  const user = userById(post.userId);
  if (!user) return "";
  const liked = post.likes.includes(state.currentUserId);
  return `<article class="post"><header class="post-head"><button class="avatar" data-profile="${user.id}">${initials(user)}</button><div><button class="ghost mini" data-profile="${user.id}">${escapeHtml(user.displayName)}</button><div class="muted mini">@${escapeHtml(user.username)} · ${timeAgo(post.createdAt)} ago</div></div></header><div class="post-body"><div class="photo" style="--photo-a:${post.palette?.[0] || "#f75c7c"};--photo-b:${post.palette?.[1] || "#1b9aaa"}">${post.imageUrl ? `<img src="${escapeHtml(post.imageUrl)}" alt="Post image by ${escapeHtml(user.displayName)}" onerror="this.remove()" />` : icon("camera")}</div><p class="caption">${escapeHtml(post.caption)}</p></div><footer class="actions"><button class="icon-btn" data-like="${post.id}" title="${liked ? "Unlike" : "Like"}" style="${liked ? "color:var(--brand)" : ""}">${icon("heart")}</button><span class="muted mini">${post.likes.length} likes</span><button class="ghost" data-message="${user.id}">${icon("message")} Message</button></footer></article>`;
}

function userCardSmall(user) {
  return `<div class="user-row"><button class="avatar" data-profile="${user.id}">${initials(user)}</button><div style="min-width:0;flex:1"><div class="name">${escapeHtml(user.displayName)}</div><div class="muted mini">@${escapeHtml(user.username)}</div></div><button class="pill" data-follow="${user.id}">Follow</button></div>`;
}

function userCard(user) {
  return `<div class="panel person-card"><div class="row"><button class="avatar" data-profile="${user.id}">${initials(user)}</button><div><div class="name">${escapeHtml(user.displayName)}</div><div class="muted mini">@${escapeHtml(user.username)}</div></div></div><p class="muted">${escapeHtml(user.bio || "No bio yet.")}</p><div class="row spread"><button class="pill ${isFollowing(state.currentUserId, user.id) ? "following" : ""}" data-follow="${user.id}">${isFollowing(state.currentUserId, user.id) ? "Following" : "Follow"}</button><button class="ghost" data-message="${user.id}">${icon("message")} Message</button></div></div>`;
}

function threadButton(user, activePartnerId) {
  const last = threadMessages(user.id).at(-1);
  return `<button class="thread-button ${activePartnerId === user.id ? "active" : ""}" data-thread="${user.id}"><div class="avatar">${initials(user)}</div><div><div class="name">${escapeHtml(user.displayName)}</div><div class="muted mini">${last ? escapeHtml(last.text.slice(0, 42)) : "Start a chat"}</div></div></button>`;
}

function messageBubble(message) {
  return `<div class="bubble ${message.fromId === state.currentUserId ? "mine" : ""}">${escapeHtml(message.text)}<div class="mini muted">${timeAgo(message.createdAt)} ago</div></div>`;
}

function messagePartners() {
  const ids = new Set();
  state.follows.forEach((follow) => {
    if (follow.followerId === state.currentUserId) ids.add(follow.followingId);
    if (follow.followingId === state.currentUserId) ids.add(follow.followerId);
  });
  state.messages.forEach((message) => {
    if (message.fromId === state.currentUserId) ids.add(message.toId);
    if (message.toId === state.currentUserId) ids.add(message.fromId);
  });
  return [...ids].map(userById).filter(Boolean);
}

function threadMessages(partnerId) {
  return state.messages.filter((message) => (message.fromId === state.currentUserId && message.toId === partnerId) || (message.fromId === partnerId && message.toId === state.currentUserId)).sort((a, b) => a.createdAt - b.createdAt);
}

function filteredUsers(users) {
  const term = query.trim().toLowerCase();
  if (!term) return users;
  return users.filter((user) => user.username.toLowerCase().includes(term) || user.displayName.toLowerCase().includes(term) || (user.bio || "").toLowerCase().includes(term));
}

function filteredPosts(posts) {
  const term = query.trim().toLowerCase();
  return posts.filter((post) => !term || post.caption.toLowerCase().includes(term) || userById(post.userId)?.username.toLowerCase().includes(term)).sort((a, b) => b.createdAt - a.createdAt);
}

function isFollowing(followerId, followingId) {
  return state.follows.some((follow) => follow.followerId === followerId && follow.followingId === followingId);
}

function wireAuth() {
  let mode = "login";
  const form = document.querySelector("#auth-form");
  const displayName = document.querySelector("#display-name");
  const title = document.querySelector("#auth-title");
  const error = document.querySelector("#auth-error");
  document.querySelectorAll("[data-auth-tab]").forEach((button) => {
    button.addEventListener("click", () => {
      mode = button.dataset.authTab;
      document.querySelectorAll("[data-auth-tab]").forEach((tab) => tab.classList.toggle("active", tab === button));
      displayName.hidden = mode === "login";
      displayName.required = mode === "signup";
      title.textContent = mode === "login" ? "Welcome back" : "Create your account";
      error.textContent = "";
    });
  });
  form.addEventListener("submit", async (event) => {
    event.preventDefault();
    error.textContent = "";
    const body = Object.fromEntries(new FormData(form));
    try {
      const result = await api(mode === "login" ? "/api/login" : "/api/signup", { method: "POST", body: JSON.stringify(body) });
      localStorage.setItem(TOKEN_KEY, result.token);
      state = result.state;
      connectSocket();
      render();
    } catch (err) {
      error.textContent = err.message;
    }
  });
}

function wireApp() {
  document.querySelectorAll("[data-view]").forEach((button) => button.addEventListener("click", () => {
    view = button.dataset.view;
    if (view === "profile") selectedUserId = state.currentUserId;
    render();
  }));
  document.querySelector("#logout")?.addEventListener("click", logout);
  document.querySelector("#logout-profile")?.addEventListener("click", logout);
  document.querySelector("#search")?.addEventListener("input", (event) => {
    query = event.target.value;
    render();
    document.querySelector("#search")?.focus();
  });
  document.querySelector("#post-form")?.addEventListener("submit", async (event) => {
    event.preventDefault();
    const body = { caption: document.querySelector("#caption").value, imageUrl: document.querySelector("#image-url").value, color: document.querySelector("#post-color").value };
    state = await api("/api/posts", { method: "POST", body: JSON.stringify(body) });
    view = "home";
    render();
  });
  document.querySelectorAll("[data-like]").forEach((button) => button.addEventListener("click", async () => {
    state = await api(`/api/posts/${button.dataset.like}/like`, { method: "POST", body: "{}" });
    render();
  }));
  document.querySelectorAll("[data-follow]").forEach((button) => button.addEventListener("click", async () => {
    state = await api(`/api/users/${button.dataset.follow}/follow`, { method: "POST", body: "{}" });
    render();
  }));
  document.querySelectorAll("[data-profile]").forEach((button) => button.addEventListener("click", () => {
    selectedUserId = button.dataset.profile;
    view = "profile";
    render();
  }));
  document.querySelectorAll("[data-message]").forEach((button) => button.addEventListener("click", () => {
    selectedUserId = button.dataset.message;
    view = "messages";
    render();
    scrollMessages();
  }));
  document.querySelectorAll("[data-thread]").forEach((button) => button.addEventListener("click", () => {
    selectedUserId = button.dataset.thread;
    render();
    scrollMessages();
  }));
  document.querySelector("#message-form")?.addEventListener("submit", async (event) => {
    event.preventDefault();
    const textarea = document.querySelector("#message-text");
    const text = textarea.value.trim();
    if (!text) return;
    const message = await api("/api/messages", { method: "POST", body: JSON.stringify({ toId: event.currentTarget.dataset.to, text }) });
    if (!state.messages.some((item) => item.id === message.id)) state.messages.push(message);
    textarea.value = "";
    render();
    scrollMessages();
  });
  scrollMessages();
}

function logout() {
  localStorage.removeItem(TOKEN_KEY);
  if (socket) socket.disconnect();
  socket = null;
  state = { currentUserId: null, users: [], posts: [], follows: [], messages: [] };
  render();
}

function scrollMessages() {
  requestAnimationFrame(() => {
    const messages = document.querySelector("#messages");
    if (messages) messages.scrollTop = messages.scrollHeight;
  });
}

loadState();

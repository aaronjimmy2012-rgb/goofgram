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

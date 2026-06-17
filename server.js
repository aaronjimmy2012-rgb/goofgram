const fs = require("fs");
const path = require("path");
const crypto = require("crypto");
const express = require("express");
const bcrypt = require("bcryptjs");
const http = require("http");
const { Server } = require("socket.io");

const app = express();
const server = http.createServer(app);
const io = new Server(server, { cors: { origin: "*" } });
const PORT = process.env.PORT || 3000;
const DB_FILE = path.join(__dirname, "database.json");

app.use(express.json({ limit: "2mb" }));
app.use(express.static(path.join(__dirname, "public")));

function id() {
  return crypto.randomUUID();
}

function loadDb() {
  if (!fs.existsSync(DB_FILE)) {
    const now = Date.now();
    const pass = bcrypt.hashSync("demo123", 10);
    const users = [
      { id: id(), username: "maya", displayName: "Maya Lin", passwordHash: pass, bio: "Street food, design scraps, and sunset photos.", createdAt: now - 700000 },
      { id: id(), username: "kai", displayName: "Kai Morgan", passwordHash: pass, bio: "Tiny travel videos and coffee opinions.", createdAt: now - 600000 },
      { id: id(), username: "nora", displayName: "Nora Vale", passwordHash: pass, bio: "Learning photography one awkward angle at a time.", createdAt: now - 500000 }
    ];
    const db = {
      users,
      sessions: {},
      posts: [
        { id: id(), userId: users[0].id, caption: "Golden hour did all the heavy lifting today.", imageUrl: "", palette: ["#f75c7c", "#ff9d52"], likes: [users[1].id], createdAt: now - 350000 },
        { id: id(), userId: users[1].id, caption: "New cafe, great light, dangerous amount of cinnamon.", imageUrl: "", palette: ["#1b9aaa", "#f7b267"], likes: [users[0].id, users[2].id], createdAt: now - 220000 }
      ],
      follows: [{ followerId: users[0].id, followingId: users[1].id }, { followerId: users[1].id, followingId: users[0].id }],
      messages: []
    };
    saveDb(db);
    return db;
  }
  return JSON.parse(fs.readFileSync(DB_FILE, "utf8"));
}

function saveDb(db) {
  fs.writeFileSync(DB_FILE, JSON.stringify(db, null, 2));
}

function publicUser(user) {
  return {
    id: user.id,
    username: user.username,
    displayName: user.displayName,
    bio: user.bio,
    createdAt: user.createdAt
  };
}

function publicState(db, currentUserId) {
  return {
    currentUserId,
    users: db.users.map(publicUser),
    posts: db.posts,
    follows: db.follows,
    messages: db.messages.filter((message) => message.fromId === currentUserId || message.toId === currentUserId)
  };
}

function auth(req, res, next) {
  const token = req.headers.authorization?.replace("Bearer ", "");
  const db = loadDb();
  const userId = token && db.sessions[token];
  const user = db.users.find((item) => item.id === userId);
  if (!user) return res.status(401).json({ error: "Please log in again." });
  req.db = db;
  req.user = user;
  req.token = token;
  next();
}

function broadcastState(db) {
  io.emit("state:update", {
    users: db.users.map(publicUser),
    posts: db.posts,
    follows: db.follows
  });
}

app.post("/api/signup", (req, res) => {
  const db = loadDb();
  const username = String(req.body.username || "").trim().toLowerCase();
  const displayName = String(req.body.displayName || "").trim();
  const password = String(req.body.password || "");
  if (!/^[a-z0-9_]{3,18}$/.test(username)) return res.status(400).json({ error: "Use 3-18 letters, numbers, or underscores for the username." });
  if (password.length < 6) return res.status(400).json({ error: "Use at least 6 characters for the password." });
  if (db.users.some((user) => user.username === username)) return res.status(400).json({ error: "That username is already taken." });
  const user = {
    id: id(),
    username,
    displayName: displayName || username,
    passwordHash: bcrypt.hashSync(password, 10),
    bio: "New here and already posting.",
    createdAt: Date.now()
  };
  const token = id();
  db.users.push(user);
  db.sessions[token] = user.id;
  saveDb(db);
  broadcastState(db);
  res.json({ token, state: publicState(db, user.id) });
});

app.post("/api/login", (req, res) => {
  const db = loadDb();
  const username = String(req.body.username || "").trim().toLowerCase();
  const password = String(req.body.password || "");
  const user = db.users.find((item) => item.username === username);
  if (!user || !bcrypt.compareSync(password, user.passwordHash)) return res.status(401).json({ error: "That username or password is not right." });
  const token = id();
  db.sessions[token] = user.id;
  saveDb(db);
  res.json({ token, state: publicState(db, user.id) });
});

app.get("/api/state", auth, (req, res) => {
  res.json(publicState(req.db, req.user.id));
});

app.post("/api/posts", auth, (req, res) => {
  const caption = String(req.body.caption || "").trim();
  const imageUrl = String(req.body.imageUrl || "").trim();
  const color = String(req.body.color || "#f75c7c");
  if (!caption && !imageUrl) return res.status(400).json({ error: "Write a caption or add an image URL." });
  req.db.posts.unshift({
    id: id(),
    userId: req.user.id,
    caption: caption || "Shared a new photo.",
    imageUrl,
    palette: [color, "#1b9aaa"],
    likes: [],
    createdAt: Date.now()
  });
  saveDb(req.db);
  broadcastState(req.db);
  res.json(publicState(req.db, req.user.id));
});

app.post("/api/posts/:postId/like", auth, (req, res) => {
  const post = req.db.posts.find((item) => item.id === req.params.postId);
  if (!post) return res.status(404).json({ error: "Post not found." });
  post.likes = post.likes.includes(req.user.id) ? post.likes.filter((userId) => userId !== req.user.id) : [...post.likes, req.user.id];
  saveDb(req.db);
  broadcastState(req.db);
  res.json(publicState(req.db, req.user.id));
});

app.post("/api/users/:userId/follow", auth, (req, res) => {
  const targetId = req.params.userId;
  if (targetId === req.user.id) return res.status(400).json({ error: "You cannot follow yourself." });
  if (!req.db.users.some((user) => user.id === targetId)) return res.status(404).json({ error: "User not found." });
  const existing = req.db.follows.some((follow) => follow.followerId === req.user.id && follow.followingId === targetId);
  req.db.follows = existing
    ? req.db.follows.filter((follow) => !(follow.followerId === req.user.id && follow.followingId === targetId))
    : [...req.db.follows, { followerId: req.user.id, followingId: targetId }];
  saveDb(req.db);
  broadcastState(req.db);
  res.json(publicState(req.db, req.user.id));
});

app.post("/api/messages", auth, (req, res) => {
  const toId = String(req.body.toId || "");
  const text = String(req.body.text || "").trim();
  if (!req.db.users.some((user) => user.id === toId)) return res.status(404).json({ error: "User not found." });
  if (!text) return res.status(400).json({ error: "Message cannot be empty." });
  const message = { id: id(), fromId: req.user.id, toId, text, createdAt: Date.now() };
  req.db.messages.push(message);
  saveDb(req.db);
  io.to(req.user.id).to(toId).emit("message:new", message);
  res.json(message);
});

io.use((socket, next) => {
  const db = loadDb();
  const token = socket.handshake.auth?.token;
  const userId = token && db.sessions[token];
  if (!userId) return next(new Error("Unauthorized"));
  socket.userId = userId;
  next();
});

io.on("connection", (socket) => {
  socket.join(socket.userId);
});

server.listen(PORT, () => {
  console.log(`Goofgram is running on http://localhost:${PORT}`);
});

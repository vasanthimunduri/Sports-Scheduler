const express = require("express");
const mongoose = require("mongoose");
const path = require("path");
const { User, Sport, Session } = require("./models");

const app = express();
const PORT = process.env.PORT || 3000;

// Middleware
app.use(express.json());
// Parse HTML form posts (application/x-www-form-urlencoded)
app.use(express.urlencoded({ extended: true }));
app.use(express.static(path.join(__dirname, "public"))); // Serve HTML, CSS, JS

// ✅ Connect to MongoDB (use env var in production, fallback to local dev)
mongoose.connect(process.env.MONGO_URI || "mongodb+srv://vasanthimunduri:vasanthi87@cluster0.wym0sxw.mongodb.net/sportsScheduler", {
  useNewUrlParser: true,
  useUnifiedTopology: true,
})
.then(() => console.log("✅ MongoDB connected"))
.catch((err) => console.error("❌ MongoDB connection error:", err));

// ----------- ROUTES ----------- //

// Root route (homepage)
app.get("/", (req, res) => {
  res.sendFile(path.join(__dirname, "public", "index.html"));
});

// Helper: get current user id from header (simple auth mock)
function getUserId(req) {
  return req.header("x-user-id");
}

// Register (save user) - aligns with frontend
app.post("/register", async (req, res) => {
  try {
    const { name, email, password, role } = req.body;
    if (!name || !email || !password) {
      return res.status(400).json({ error: "Missing required fields" });
    }

    const existing = await User.findOne({ email });
    if (existing) {
      return res.status(409).json({ error: "Email already registered" });
    }

    const newUser = new User({ name, email, password, isAdmin: role === 'admin' });
    await newUser.save();
    res.json({ message: "User registered successfully!", user: { id: newUser._id, name: newUser.name, email: newUser.email, isAdmin: newUser.isAdmin } });
  } catch (err) {
    console.error("Registration error:", err);
    res.status(500).json({ error: "Registration failed" });
  }
});

// Login (check user)
app.post("/login", async (req, res) => {
  try {
    const { email, password } = req.body;
    if (!email || !password) {
      return res.status(400).json({ error: "Missing email or password" });
    }

    const user = await User.findOne({ email, password });
    if (user) {
      res.json({ message: "Login successful!", user: { id: user._id, name: user.name, email: user.email, isAdmin: user.isAdmin } });
    } else {
      res.status(401).json({ error: "Invalid credentials" });
    }
  } catch (err) {
    res.status(500).json({ error: "Login failed" });
  }
});

// ----------------------
// SPORTS
// ----------------------
app.post("/sports", async (req, res) => {
  try {
    const userId = getUserId(req);
    if (!userId) return res.status(401).json({ error: "Unauthorized" });
    const user = await User.findById(userId);
    if (!user || !user.isAdmin) return res.status(403).json({ error: "Admin only" });

    const { name } = req.body;
    if (!name) return res.status(400).json({ error: "Sport name is required" });

    const existing = await Sport.findOne({ name });
    if (existing) return res.status(409).json({ error: "Sport already exists" });

    const sport = new Sport({ name, createdBy: user._id });
    await sport.save();
    res.status(201).json({ message: "Sport created", sport: { id: sport._id, name: sport.name } });
  } catch (err) {
    res.status(500).json({ error: "Failed to create sport" });
  }
});

app.get("/sports", async (req, res) => {
  try {
    const { mine } = req.query;
    let query = {};
    if (mine === 'true') {
      const userId = getUserId(req);
      if (!userId) return res.status(401).json({ error: "Unauthorized" });
      query = { createdBy: userId };
    }
    const sports = await Sport.find(query).sort({ name: 1 });
    res.json(sports.map(s => ({ id: s._id, name: s.name })));
  } catch (err) {
    res.status(500).json({ error: "Failed to load sports" });
  }
});

// ----------------------
// SESSIONS
// ----------------------
app.post("/sessions", async (req, res) => {
  try {
    const userId = getUserId(req);
    if (!userId) return res.status(401).json({ error: "Unauthorized: missing user id" });

    const { sport, date, time, venue, players, neededPlayers } = req.body;
    if (!sport || !date || !time || !venue || neededPlayers == null) {
      return res.status(400).json({ error: "Missing required fields (sport, date, time, venue, neededPlayers)" });
    }

    // Find sport by id or name
    let sportDoc = null;
    if (mongoose.Types.ObjectId.isValid(sport)) {
      sportDoc = await Sport.findById(sport);
    }
    if (!sportDoc) {
      sportDoc = await Sport.findOne({ name: sport });
    }
    if (!sportDoc) {
      return res.status(400).json({ error: `Sport not found for value: ${sport}` });
    }

    const initialPlayers = typeof players === 'string' && players.trim().length
      ? players.split(',').map(p => p.trim()).filter(Boolean)
      : [];

    const session = new Session({
      sport: sportDoc._id,
      creator: userId,
      date: String(date),
      time: String(time),
      venue: String(venue),
      slots: Number(neededPlayers),
      initialPlayers,
      players: [],
      pendingPlayers: [],
      cancelled: false,
    });
    await session.save();
    res.status(201).json({ message: "Session created", session: { id: session._id } });
  } catch (err) {
    console.error("Create session error:", err);
    res.status(500).json({ error: `Failed to create session: ${err.message}` });
  }
});

// List sessions for dashboard
app.get("/sessions", async (req, res) => {
  try {
    const userId = getUserId(req);
    if (!userId) return res.status(401).json({ error: "Unauthorized" });

    const now = new Date();
    const all = await Session.find({}).populate("sport").populate("players");

    function isFuture(s) {
      const dt = new Date(`${s.date}T${s.time}`);
      return dt.getTime() > now.getTime();
    }

    const created = [];
    const joined = [];
    const available = [];

    for (const s of all) {
      const item = {
        id: String(s._id),
        sport: s.sport?.name || "Unknown",
        date: s.date,
        time: s.time,
        venue: s.venue,
        initialPlayers: s.initialPlayers || [],
        cancelled: s.cancelled,
        cancelReason: s.cancelReason || "",
        neededPlayers: Math.max(0, s.slots - s.players.length),
        pendingCount: Array.isArray(s.pendingPlayers) ? s.pendingPlayers.length : 0,
        joinedCount: Array.isArray(s.players) ? s.players.length : 0,
        joinedPlayers: Array.isArray(s.players) ? s.players.map(p => ({ id: String(p._id || p), name: p.name || "", email: p.email || "" })) : [],
      };

      const isCreator = String(s.creator) === String(userId);
      const hasJoined = Array.isArray(s.players) && s.players.some(p => String(p && p._id ? p._id : p) === String(userId));

      if (isCreator) created.push(item);
      else if (hasJoined) joined.push(item);
      else if (!s.cancelled && isFuture(s) && (s.players.length < s.slots)) available.push(item);
    }

    res.json({ created, joined, available });
  } catch (err) {
    res.status(500).json({ error: "Failed to fetch sessions" });
  }
});

// Join session
app.post("/sessions/join/:id", async (req, res) => {
  try {
    const userId = getUserId(req);
    if (!userId) return res.status(401).json({ error: "Unauthorized" });
    const { id } = req.params;
    const s = await Session.findById(id);
    if (!s) return res.status(404).json({ error: "Session not found" });
    if (s.cancelled) return res.status(400).json({ error: "Session is cancelled" });

    const now = new Date();
    const dt = new Date(`${s.date}T${s.time}`);
    if (dt.getTime() <= now.getTime()) return res.status(400).json({ error: "Cannot join past session" });

    if (String(s.creator) === String(userId)) return res.status(400).json({ error: "Creator already in session" });
    if (s.players.some(p => String(p) === String(userId))) return res.status(400).json({ error: "Already joined" });
    if (s.pendingPlayers?.some(p => String(p) === String(userId))) return res.status(400).json({ error: "Already requested to join" });
    const filled = s.players.length >= s.slots;
    if (filled) return res.status(400).json({ error: "No slots available" });

    s.pendingPlayers = s.pendingPlayers || [];
    s.pendingPlayers.push(userId);
    await s.save();
    res.json({ message: "Join request sent" });
  } catch (err) {
    res.status(500).json({ error: "Failed to join session" });
  }
});

// Cancel session (creator/admin only)
app.post("/sessions/:id/cancel", async (req, res) => {
  try {
    const userId = getUserId(req);
    if (!userId) return res.status(401).json({ error: "Unauthorized" });
    const { id } = req.params;
    const { reason } = req.body;
    const s = await Session.findById(id);
    if (!s) return res.status(404).json({ error: "Session not found" });
    const user = await User.findById(userId);
    if (String(s.creator) !== String(userId) && !user?.isAdmin) return res.status(403).json({ error: "Only creator or admin can cancel" });
    s.cancelled = true;
    s.cancelReason = reason || "Cancelled";
    await s.save();
    res.json({ message: "Session cancelled" });
  } catch (err) {
    res.status(500).json({ error: "Failed to cancel session" });
  }
});

// Leave session (players can cancel their slot)
app.post("/sessions/leave/:id", async (req, res) => {
  try {
    const userId = getUserId(req);
    if (!userId) return res.status(401).json({ error: "Unauthorized" });
    const { id } = req.params;
    const s = await Session.findById(id);
    if (!s) return res.status(404).json({ error: "Session not found" });

    const before = s.players.length;
    s.players = s.players.filter(p => String(p) !== String(userId));
    // also remove pending request if exists
    s.pendingPlayers = Array.isArray(s.pendingPlayers) ? s.pendingPlayers.filter(p => String(p) !== String(userId)) : [];
    if (s.players.length === before) return res.status(400).json({ error: "You are not part of this session" });
    await s.save();
    res.json({ message: "Left session" });
  } catch (err) {
    res.status(500).json({ error: "Failed to leave session" });
  }
});

// Approve join request (creator/admin)
app.post("/sessions/:id/approve", async (req, res) => {
  try {
    const userId = getUserId(req);
    if (!userId) return res.status(401).json({ error: "Unauthorized" });
    const { id } = req.params;
    const { playerId } = req.body;
    const s = await Session.findById(id);
    if (!s) return res.status(404).json({ error: "Session not found" });
    const user = await User.findById(userId);
    if (String(s.creator) !== String(userId) && !user?.isAdmin) return res.status(403).json({ error: "Only creator or admin" });
    if (s.players.length >= s.slots) return res.status(400).json({ error: "No slots available" });
    s.pendingPlayers = (s.pendingPlayers || []).filter(p => String(p) !== String(playerId));
    if (!s.players.some(p => String(p) === String(playerId))) s.players.push(playerId);
    await s.save();
    res.json({ message: "Approved" });
  } catch (err) {
    res.status(500).json({ error: "Failed to approve" });
  }
});

// Reject join request (creator/admin)
app.post("/sessions/:id/reject", async (req, res) => {
  try {
    const userId = getUserId(req);
    if (!userId) return res.status(401).json({ error: "Unauthorized" });
    const { id } = req.params;
    const { playerId } = req.body;
    const s = await Session.findById(id);
    if (!s) return res.status(404).json({ error: "Session not found" });
    const user = await User.findById(userId);
    if (String(s.creator) !== String(userId) && !user?.isAdmin) return res.status(403).json({ error: "Only creator or admin" });
    s.pendingPlayers = (s.pendingPlayers || []).filter(p => String(p) !== String(playerId));
    await s.save();
    res.json({ message: "Rejected" });
  } catch (err) {
    res.status(500).json({ error: "Failed to reject" });
  }
});

// List pending requests with user details (creator/admin only)
app.get("/sessions/:id/pending", async (req, res) => {
  try {
    const userId = getUserId(req);
    if (!userId) return res.status(401).json({ error: "Unauthorized" });
    const { id } = req.params;
    const s = await Session.findById(id).populate("pendingPlayers");
    if (!s) return res.status(404).json({ error: "Session not found" });
    const user = await User.findById(userId);
    if (String(s.creator) !== String(userId) && !user?.isAdmin) return res.status(403).json({ error: "Only creator or admin" });
    const list = (s.pendingPlayers || []).map(p => ({ id: String(p._id), name: p.name || "", email: p.email || "" }));
    res.json({ pending: list });
  } catch (err) {
    res.status(500).json({ error: "Failed to load pending" });
  }
});

// ----------------------
// REPORTS
// ----------------------
app.get("/reports", async (req, res) => {
  try {
    const userId = getUserId(req);
    if (!userId) return res.status(401).json({ error: "Unauthorized" });
    const user = await User.findById(userId);
    if (!user || !user.isAdmin) return res.status(403).json({ error: "Admin only" });

    const { from, to } = req.query;
    let fromDate = from ? new Date(from) : new Date(0);
    let toDate = to ? new Date(to) : new Date(8640000000000000);

    // Filter by computed Date(s)
    const all = await Session.find({}).populate("sport");
    const filtered = all.filter(s => {
      const dt = new Date(`${s.date}T${s.time}`);
      return dt >= fromDate && dt <= toDate && !s.cancelled;
    });

    const totalSessions = filtered.length;
    const popularity = {};
    for (const s of filtered) {
      const name = s.sport?.name || "Unknown";
      popularity[name] = (popularity[name] || 0) + 1;
    }
    res.json({ totalSessions, popularity });
  } catch (err) {
    res.status(500).json({ error: "Failed to load reports" });
  }
});

// Start server
app.listen(PORT, () => {
  console.log(`🚀 Server running on http://localhost:${PORT}`);
});

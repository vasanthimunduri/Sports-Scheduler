// models.js
const mongoose = require("mongoose");

const userSchema = new mongoose.Schema({
  name: String,
  email: { type: String, unique: true },
  password: String,
  isAdmin: { type: Boolean, default: false },
});

const sportSchema = new mongoose.Schema({
  name: String,
  createdBy: { type: mongoose.Schema.Types.ObjectId, ref: "User" },
});

const sessionSchema = new mongoose.Schema({
  sport: { type: mongoose.Schema.Types.ObjectId, ref: "Sport" },
  creator: { type: mongoose.Schema.Types.ObjectId, ref: "User" },
  date: String,
  time: String,
  venue: String,
  slots: Number,
  initialPlayers: [String],
  players: [{ type: mongoose.Schema.Types.ObjectId, ref: "User" }],
  pendingPlayers: [{ type: mongoose.Schema.Types.ObjectId, ref: "User" }],
  cancelled: { type: Boolean, default: false },
  cancelReason: String,
});

module.exports = {
  User: mongoose.model("User", userSchema),
  Sport: mongoose.model("Sport", sportSchema),
  Session: mongoose.model("Session", sessionSchema),
};

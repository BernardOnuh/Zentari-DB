const mongoose = require('mongoose');

const userSchema = new mongoose.Schema({
  username: { type: String, required: true, unique: true },
  userId: { type: String, required: true, unique: true },
  energy: { type: Number, default: 500 },
  maxEnergy: { type: Number, default: 500 },
  power: { type: Number, default: 0 },
  multiplier: { type: Number, default: 1 },
  speedLevel: { type: Number, default: 1 },
  multiTapLevel: { type: Number, default: 1 },
  energyLimitLevel: { type: Number, default: 1 },
  referral: { type: String, default: null },
  lastTapTime: { type: Date, default: Date.now } // Add this to track last tap time
});

const User = mongoose.model('User', userSchema);

module.exports = User;
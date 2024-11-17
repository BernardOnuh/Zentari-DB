const mongoose = require('mongoose');

const userSchema = new mongoose.Schema({
  // User Identity
  username: {
    type: String,
    required: true,
    unique: true
  },
  userId: {
    type: String,
    required: true,
    unique: true
  },

  // Energy System
  energy: {
    type: Number,
    default: 500
  },
  maxEnergy: {
    type: Number,
    default: 500
  },
  lastTapTime: {
    type: Date,
    default: Date.now
  },

  // Level & Multiplier Systems
  multiplier: {
    type: Number,
    default: 1
  },
  speedLevel: {
    type: Number,
    default: 1
  },
  multiTapLevel: {
    type: Number,
    default: 1
  },
  energyLimitLevel: {
    type: Number,
    default: 1
  },

  // Point Systems
  power: {
    type: Number,
    default: 0
  },
  checkInPoints: {
    type: Number,
    default: 0
  },
  referralPoints: {
    type: Number,
    default: 0
  },

  // Check-in System
  lastCheckIn: {
    type: Date,
    default: null
  },
  checkInStreak: {
    type: Number,
    default: 0
  },

  // Referral System
  referral: {
    type: String,
    default: null
  },
  directReferrals: [{
    username: String,
    joinedAt: {
      type: Date,
      default: Date.now
    }
  }],

  // Tasks System
  tasksCompleted: [{
    type: mongoose.Schema.Types.ObjectId,
    ref: 'Task'
  }],

  // Timestamps for record-keeping
  createdAt: {
    type: Date,
    default: Date.now
  }
}, {
  timestamps: true  // Automatically add createdAt and updatedAt timestamps
});

// Indexes for performance
userSchema.index({ username: 1 });
userSchema.index({ userId: 1 });
userSchema.index({ power: -1 });  // For leaderboard queries
userSchema.index({ referral: 1 }); // For referral queries

const User = mongoose.model('User', userSchema);

module.exports = User;
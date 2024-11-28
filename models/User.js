const mongoose = require('mongoose');

const referralRewardSchema = new mongoose.Schema({
  referrals: {
    type: Number,
    required: true,
  },
  reward: {
    type: Number,
    required: true,
  },
  claimed: {
    type: Boolean,
    default: false, // Tracks whether the reward has been claimed
  },
});

const userSchema = new mongoose.Schema(
  {
    // User Identity
    username: {
      type: String,
      required: true,
      unique: true,
      trim: true,
    },
    userId: {
      type: String,
      required: true,
      unique: true,
      trim: true,
    },

    // Energy System
    energy: {
      type: Number,
      default: 500,
      min: 0,
    },
    maxEnergy: {
      type: Number,
      default: 500,
      min: 500,
    },
    lastTapTime: {
      type: Date,
      default: Date.now,
    },

    // Level & Multiplier Systems
    multiplier: {
      type: Number,
      default: 1,
      min: 1,
    },
    speedLevel: {
      type: Number,
      default: 1,
      min: 1,
    },
    multiTapLevel: {
      type: Number,
      default: 1,
      min: 1,
    },
    energyLimitLevel: {
      type: Number,
      default: 1,
      min: 1,
    },

    // Point Systems
    power: {
      type: Number,
      default: 0,
      min: 0,
    },
    checkInPoints: {
      type: Number,
      default: 0,
      min: 0,
    },
    referralPoints: {
      type: Number,
      default: 0,
      min: 0,
    },

    // Check-in System
    lastCheckIn: {
      type: Date,
      default: null,
    },
    checkInStreak: {
      type: Number,
      default: 0,
      min: 0,
    },

    // Referral System
    referral: {
      type: String,
      default: null,
      trim: true,
    },
    directReferrals: [
      {
        username: {
          type: String,
          required: true,
        },
        userId: {
          type: String,
          required: true,
        },
        joinedAt: {
          type: Date,
          default: Date.now,
        },
        pointsEarned: {
          type: Number,
          default: 0,
          min: 0,
        },
      },
    ],
    indirectReferrals: [
      {
        username: {
          type: String,
          required: true,
        },
        userId: {
          type: String,
          required: true,
        },
        referredBy: {
          type: String,
          required: true,
        },
        joinedAt: {
          type: Date,
          default: Date.now,
        },
        pointsEarned: {
          type: Number,
          default: 0,
          min: 0,
        },
      },
    ],

    // Referral Rewards
    referralRewards: [referralRewardSchema], // Keeps track of claimable rewards and their status

    // Tasks System
    tasksCompleted: [
      {
        type: mongoose.Schema.Types.ObjectId,
        ref: 'Task',
      },
    ],

    // Game Statistics
    statistics: {
      totalTaps: {
        type: Number,
        default: 0,
        min: 0,
      },
      totalPowerGenerated: {
        type: Number,
        default: 0,
        min: 0,
      },
      longestCheckInStreak: {
        type: Number,
        default: 0,
        min: 0,
      },
      totalCheckIns: {
        type: Number,
        default: 0,
        min: 0,
      },
    },

    // Achievements & Badges (for future expansion)
    achievements: [
      {
        name: String,
        earnedAt: {
          type: Date,
          default: Date.now,
        },
        description: String,
      },
    ],

    // System Fields
    isActive: {
      type: Boolean,
      default: true,
    },
    lastActive: {
      type: Date,
      default: Date.now,
    },
  },
  {
    timestamps: true, // Automatically adds createdAt and updatedAt fields
  }
);

// Indexes for performance optimization
userSchema.index({ username: 1 });
userSchema.index({ userId: 1 });
userSchema.index({ power: -1 }); // For leaderboard queries
userSchema.index({ referral: 1 }); // For referral queries
userSchema.index({ 'directReferrals.username': 1 });
userSchema.index({ 'indirectReferrals.username': 1 });
userSchema.index({ lastCheckIn: 1 }); // For check-in queries
userSchema.index({ isActive: 1, lastActive: -1 }); // For active user queries

// Virtual for total points (non-persistent field)
userSchema.virtual('totalPoints').get(function () {
  return this.power + this.checkInPoints + this.referralPoints;
});

// Pre-save middleware to update statistics
userSchema.pre('save', function (next) {
  if (this.isModified('checkInStreak')) {
    this.statistics.longestCheckInStreak = Math.max(
      this.statistics.longestCheckInStreak,
      this.checkInStreak
    );
  }

  if (this.isModified('power')) {
    this.statistics.totalPowerGenerated = this.power;
  }

  this.lastActive = new Date();
  next();
});

const User = mongoose.model('User', userSchema);

module.exports = User;

const mongoose = require('mongoose');

// Define the reward tiers structure
const REFERRAL_REWARD_TIERS = [
  { referrals: 5, reward: 1000 },
  { referrals: 10, reward: 2500 },
  { referrals: 25, reward: 5000 },
  { referrals: 50, reward: 10000 },
  { referrals: 100, reward: 25000 },
  { referrals: 500, reward: 50000 },
  { referrals: 1000, reward: 100000 },
];

// Game Constants
const UPGRADE_COSTS = {
  multiTap: [
    { level: 1, cost: 1000 },
    { level: 2, cost: 10000 },
    { level: 3, cost: 100000 },
    { level: 4, cost: 1000000 },
    { level: 5, starCost: 10, reward: 100000 },
    { level: 6, starCost: 20, reward: 1000000 },
    { level: 7, starCost: 30, reward: 5000000 },
    { level: 8, starCost: 30, reward: 10000000 }
  ],
  speed: [
    { level: 1, cost: 1000 },
    { level: 2, cost: 10000 },
    { level: 3, cost: 100000 },
    { level: 4, cost: 1000000 },
    { level: 5, starCost: 10, reward: 100000 },
    { level: 6, starCost: 20, reward: 1000000 },
    { level: 7, starCost: 30, reward: 5000000 },
    { level: 8, starCost: 30, reward: 10000000 }
  ],
  energyLimit: [
    { level: 1, cost: 1000 },
    { level: 2, cost: 10000 },
    { level: 3, cost: 100000 },
    { level: 4, cost: 1000000 },
    { level: 5, starCost: 10, reward: 100000 },
    { level: 6, starCost: 20, reward: 1000000 },
    { level: 7, starCost: 30, reward: 5000000 },
    { level: 8, starCost: 30, reward: 10000000 }
  ]
};

// Referral Reward Schema
const referralRewardSchema = new mongoose.Schema({
  referrals: {
    type: Number,
    required: true,
    validate: {
      validator: function(value) {
        return REFERRAL_REWARD_TIERS.some(tier => tier.referrals === value);
      },
      message: props => `${props.value} is not a valid referral tier!`
    }
  },
  reward: {
    type: Number,
    required: true,
    validate: {
      validator: function(value) {
        const tier = REFERRAL_REWARD_TIERS.find(t => t.referrals === this.referrals);
        return tier && tier.reward === value;
      },
      message: props => `${props.value} is not the correct reward for this referral tier!`
    }
  },
  claimed: {
    type: Boolean,
    default: false,
  }
});

// Direct Referral Schema
const directReferralSchema = new mongoose.Schema({
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
});

// Indirect Referral Schema
const indirectReferralSchema = new mongoose.Schema({
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
});

// Auto Tap Bot Schema
const autoTapBotSchema = new mongoose.Schema({
  level: {
    type: Number,
    enum: [0, 1, 2, 3], // 0: Default 2hr, 1: 7hr, 2: 14hr, 3: 24hr
    default: 0
  },
  starCost: {
    type: Number,
    enum: [0, 20, 50, 100]
  },
  duration: {
    type: Number,
    enum: [2, 7, 14, 24]
  },
  validUntil: Date,
  lastClaimed: Date,
  isActive: {
    type: Boolean,
    default: false
  }
});

// Achievement Schema
const achievementSchema = new mongoose.Schema({
  name: String,
  earnedAt: {
    type: Date,
    default: Date.now,
  },
  description: String,
  type: {
    type: String,
    enum: ['TAP', 'UPGRADE', 'REFERRAL', 'CHECKIN', 'SPECIAL']
  },
  reward: Number
});

// Main User Schema
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
      max: 8
    },
    multiTapLevel: {
      type: Number,
      default: 1,
      min: 1,
      max: 8
    },
    energyLimitLevel: {
      type: Number,
      default: 1,
      min: 1,
      max: 8
    },

    // Currency Systems
    stars: {
      type: Number,
      default: 0,
      min: 0
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
    directReferrals: [directReferralSchema],
    indirectReferrals: [indirectReferralSchema],
    referralRewards: {
      type: [referralRewardSchema],
      default: function() {
        return REFERRAL_REWARD_TIERS.map(tier => ({
          referrals: tier.referrals,
          reward: tier.reward,
          claimed: false
        }));
      },
      validate: {
        validator: function(rewards) {
          const hasTiers = REFERRAL_REWARD_TIERS.every(tier =>
            rewards.some(r => 
              r.referrals === tier.referrals && 
              r.reward === tier.reward
            )
          );
          const uniqueTiers = new Set(rewards.map(r => r.referrals));
          return hasTiers && uniqueTiers.size === REFERRAL_REWARD_TIERS.length;
        },
        message: 'Referral rewards must contain all valid tiers without duplicates'
      }
    },

    // Auto Tap Bot
    autoTapBot: autoTapBotSchema,

    // Tasks System
    tasksCompleted: [{
      type: mongoose.Schema.Types.ObjectId,
      ref: 'Task',
    }],

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
      highestLevel: {
        multiTap: { type: Number, default: 1 },
        speed: { type: Number, default: 1 },
        energyLimit: { type: Number, default: 1 }
      }
    },

    // Achievements & Badges
    achievements: [achievementSchema],

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
    timestamps: true,
  }
);

// Indexes
userSchema.index({ username: 1 });
userSchema.index({ userId: 1 });
userSchema.index({ power: -1 });
userSchema.index({ referral: 1 });
userSchema.index({ 'directReferrals.username': 1 });
userSchema.index({ 'indirectReferrals.username': 1 });
userSchema.index({ lastCheckIn: 1 });
userSchema.index({ isActive: 1, lastActive: -1 });

// Virtual for total points
userSchema.virtual('totalPoints').get(function() {
  return this.power + this.checkInPoints + this.referralPoints;
});

// Virtual for reward tier status
userSchema.virtual('rewardTierStatus').get(function() {
  const totalReferrals = this.directReferrals.length;
  return REFERRAL_REWARD_TIERS.map(tier => ({
    referrals: tier.referrals,
    reward: tier.reward,
    qualified: totalReferrals >= tier.referrals,
    claimed: this.referralRewards.find(r => 
      r.referrals === tier.referrals && r.claimed
    ) ? true : false,
    claimable: totalReferrals >= tier.referrals && !this.referralRewards.find(r => 
      r.referrals === tier.referrals && r.claimed
    )
  }));
});

// Methods
userSchema.methods = {
  calculateEnergyRegeneration() {
    const now = Date.now();
    const timeDiff = (now - this.lastTapTime) / 1000; // Convert to seconds
    const regenRate = this.speedLevel; // Energy per second based on speed level
    const regeneratedEnergy = Math.floor(timeDiff * regenRate);
    return Math.min(this.maxEnergy, this.energy + regeneratedEnergy);
  },

  isEligibleForReward(referralCount) {
    const tier = REFERRAL_REWARD_TIERS.find(t => t.referrals === referralCount);
    if (!tier) return false;
    
    const reward = this.referralRewards.find(r => r.referrals === referralCount);
    return reward && !reward.claimed && this.directReferrals.length >= referralCount;
  },

  getNextRewardTier() {
    const totalReferrals = this.directReferrals.length;
    return REFERRAL_REWARD_TIERS.find(tier => 
      tier.referrals > totalReferrals && 
      !this.referralRewards.find(r => 
        r.referrals === tier.referrals && r.claimed
      )
    );
  },

  getClaimableRewards() {
    const totalReferrals = this.directReferrals.length;
    return this.referralRewards
      .filter(reward => 
        !reward.claimed && 
        totalReferrals >= reward.referrals
      )
      .sort((a, b) => a.referrals - b.referrals);
  },

  canUpgrade(upgradeType) {
    const currentLevel = this[`${upgradeType}Level`];
    const nextTier = UPGRADE_COSTS[upgradeType][currentLevel];
    
    if (!nextTier) return false;
    
    if (nextTier.starCost) {
      return this.stars >= nextTier.starCost;
    }
    return this.totalPoints >= nextTier.cost;
  },

  getUpgradeCost(upgradeType) {
    const currentLevel = this[`${upgradeType}Level`];
    return UPGRADE_COSTS[upgradeType][currentLevel];
  }
};

// Pre-save middleware
userSchema.pre('save', function(next) {
  // Initialize referral rewards if new user
  if (this.isNew && (!this.referralRewards || this.referralRewards.length === 0)) {
    this.referralRewards = REFERRAL_REWARD_TIERS.map(tier => ({
      referrals: tier.referrals,
      reward: tier.reward,
      claimed: false
    }));
  }

  // Update statistics
  if (this.isModified('checkInStreak')) {
    this.statistics.longestCheckInStreak = Math.max(
      this.statistics.longestCheckInStreak,
      this.checkInStreak
    );
  }

  if (this.isModified('power')) {
    this.statistics.totalPowerGenerated = this.power;
  }

  if (this.isModified('multiTapLevel') || 
      this.isModified('speedLevel') || 
      this.isModified('energyLimitLevel')) {
    this.statistics.highestLevel = {
      multiTap: Math.max(this.statistics.highestLevel.multiTap, this.multiTapLevel),
      speed: Math.max(this.statistics.highestLevel.speed, this.speedLevel),
      energyLimit: Math.max(this.statistics.highestLevel.energyLimit, this.energyLimitLevel)
    };
  }

  // Update maxEnergy when energyLimitLevel changes
  if (this.isModified('energyLimitLevel')) {
    this.maxEnergy = 500 + (500 * (this.energyLimitLevel - 1));
  }

  this.lastActive = new Date();
  next();
});

const User = mongoose.model('User', userSchema);

module.exports = User;
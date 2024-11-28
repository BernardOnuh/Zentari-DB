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

// Achievement Schema
const achievementSchema = new mongoose.Schema({
  name: String,
  earnedAt: {
    type: Date,
    default: Date.now,
  },
  description: String,
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

  this.lastActive = new Date();
  next();
});

const User = mongoose.model('User', userSchema);

module.exports = User;
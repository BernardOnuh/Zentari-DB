const User = require('../models/User');
const mongoose = require('mongoose');
const ObjectId = mongoose.Types.ObjectId;

const referralRewards = [
  { referrals: 5, reward: 1000 },
  { referrals: 10, reward: 2500 },
  { referrals: 25, reward: 5000 },
  { referrals: 50, reward: 10000 },
  { referrals: 100, reward: 25000 },
  { referrals: 500, reward: 50000 },
  { referrals: 1000, reward: 100000 },
];

// Constants for point rewards when using stars
const STAR_UPGRADE_REWARDS = {
  multiTap: {
    5: 100000,    // Level 5 reward
    6: 1000000,   // Level 6 reward
    7: 5000000,   // Level 7 reward
    8: 10000000   // Level 8 reward
  },
  speed: {
    5: 100000,
    6: 1000000,
    7: 5000000,
    8: 10000000
  },
  energyLimit: {
    5: 100000,
    6: 1000000,
    7: 5000000,
    8: 10000000
  }
};

// Point costs for levels 1-4
const POINT_UPGRADE_COSTS = {
  multiTap: {
    1: 1000,
    2: 10000,
    3: 100000,
    4: 1000000
  },
  speed: {
    1: 1000,
    2: 10000,
    3: 100000,
    4: 1000000
  },
  energyLimit: {
    1: 1000,
    2: 10000,
    3: 100000,
    4: 1000000
  }
};

const registerUser = async (req, res) => {
  try {
    const { username, userId, referral } = req.body;

    const existingUser = await User.findOne({ username });
    if (existingUser) {
      return res.status(400).json({ message: 'Username already exists' });
    }

    let directReferrer = null;
    let indirectReferrer = null;

    if (referral) {
      directReferrer = await User.findOne({ username: referral });
      if (!directReferrer) {
        return res.status(400).json({ message: 'Referral username does not exist' });
      }

      if (directReferrer.referral) {
        indirectReferrer = await User.findOne({ username: directReferrer.referral });
      }
    }

    const initialReferralRewards = referralRewards.map(tier => ({
      referrals: tier.referrals,
      reward: tier.reward,
      claimed: false
    }));

    const newUser = new User({
      username,
      userId,
      referral: referral ? directReferrer.username : null,
      referralRewards: initialReferralRewards,
      directReferrals: [],
      indirectReferrals: [],
      referralPoints: 0
    });

    if (directReferrer) {
      directReferrer.referralPoints += 500;
      directReferrer.directReferrals.push({
        username,
        userId,
        pointsEarned: 500
      });
      await directReferrer.save();

      if (indirectReferrer) {
        indirectReferrer.referralPoints += 100;
        indirectReferrer.indirectReferrals.push({
          username,
          userId,
          referredBy: directReferrer.username,
          pointsEarned: 100
        });
        await indirectReferrer.save();
      }
    }

    await newUser.save();

    res.status(201).json({
      message: 'User registered successfully',
      user: {
        username: newUser.username,
        userId: newUser.userId,
        referral: newUser.referral,
        referralRewards: newUser.referralRewards,
        referralPoints: newUser.referralPoints
      }
    });
  } catch (error) {
    console.error('Error in registerUser:', error);
    res.status(500).json({ message: 'Server error', error: error.message });
  }
};

const upgradeLevel = async (req, res) => {
  const { userId, upgradeType, isStarUpgrade = false } = req.body;

  try {
    const user = await User.findOne({ userId });
    if (!user) {
      return res.status(404).json({ message: 'User not found' });
    }

    const currentLevel = user[`${upgradeType}Level`];
    const nextLevel = currentLevel + 1;

    if (nextLevel > 8) {
      return res.status(400).json({ message: 'Maximum level reached' });
    }

    if (isStarUpgrade) {
      if (nextLevel < 5) {
        return res.status(400).json({ 
          message: 'Star upgrades only available for levels 5-8' 
        });
      }
      user.power += STAR_UPGRADE_REWARDS[upgradeType][nextLevel];
    } else {
      if (nextLevel > 4) {
        return res.status(400).json({ 
          message: 'Point upgrades only available for levels 1-4' 
        });
      }
      
      const cost = POINT_UPGRADE_COSTS[upgradeType][nextLevel];
      if (user.totalPoints < cost) {
        return res.status(400).json({ 
          message: 'Insufficient points',
          required: cost,
          current: user.totalPoints
        });
      }
      user.power -= cost;
    }

    user[`${upgradeType}Level`] = nextLevel;

    if (upgradeType === 'energyLimit') {
      user.maxEnergy = 500 + (500 * (nextLevel - 1));
    }

    await user.save();

    res.status(200).json({
      message: 'Upgrade successful',
      upgradeType,
      newLevel: nextLevel,
      stats: {
        [upgradeType]: nextLevel,
        power: user.power,
        maxEnergy: user.maxEnergy,
        totalPoints: user.totalPoints
      }
    });

  } catch (error) {
    res.status(500).json({ 
      message: 'Upgrade failed', 
      error: error.message 
    });
  }
};

const handleTap = async (req, res) => {
  const { userId } = req.body;

  try {
    const user = await User.findOne({ userId });
    if (!user) {
      return res.status(404).json({ message: 'User not found' });
    }

    const currentTime = Date.now();
    const regenRate = 1000 / user.speedLevel;
    const timeDiff = currentTime - user.lastTapTime;
    const energyToRegenerate = Math.floor(timeDiff / regenRate);
    const newEnergy = Math.min(user.energy + energyToRegenerate, user.maxEnergy);

    user.energy = newEnergy;
    user.lastTapTime = currentTime;

    if (user.energy < 1) {
      return res.status(400).json({ 
        message: 'Not enough energy',
        currentEnergy: user.energy,
        maxEnergy: user.maxEnergy,
        regenRate: user.speedLevel
      });
    }

    user.energy -= 1;
    const powerGain = user.multiTapLevel;
    user.power += powerGain;
    user.statistics.totalTaps += 1;
    user.statistics.totalPowerGenerated += powerGain;

    await user.save();

    res.status(200).json({
      message: 'Tap successful',
      powerGained: powerGain,
      currentStats: {
        energy: user.energy,
        maxEnergy: user.maxEnergy,
        power: user.power,
        totalTaps: user.statistics.totalTaps,
        powerPerTap: user.multiTapLevel
      }
    });
  } catch (error) {
    res.status(500).json({ message: 'Server error', error: error.message });
  }
};

const monitorUserStatus = async (req, res) => {
  const { userId } = req.params;

  try {
    const user = await User.findOne({ userId });
    if (!user) {
      return res.status(404).json({ message: 'User not found' });
    }

    const currentTime = Date.now();
    const regenRate = 1000 / user.speedLevel;
    const timeDiff = currentTime - user.lastTapTime;
    const energyToRegenerate = Math.floor(timeDiff / regenRate);
    const newEnergy = Math.min(user.energy + energyToRegenerate, user.maxEnergy);

    user.energy = newEnergy;
    user.lastTapTime = currentTime;

    if (user.energy !== newEnergy) {
      await user.save();
    }

    const userStatus = {
      username: user.username,
      userId: user.userId,
      energy: user.energy,
      maxEnergy: user.maxEnergy,
      scores: {
        power: user.power,
        checkInPoints: user.checkInPoints,
        referralPoints: user.referralPoints,
        totalPoints: user.power + user.checkInPoints + user.referralPoints
      },
      levels: {
        speedLevel: user.speedLevel,
        multiTapLevel: user.multiTapLevel,
        energyLimitLevel: user.energyLimitLevel
      },
      checkIn: {
        streak: user.checkInStreak,
        lastCheckIn: user.lastCheckIn
      },
      timing: {
        lastTapTime: user.lastTapTime,
        currentTime: Date.now()
      }
    };

    res.status(200).json({
      message: 'User status retrieved successfully',
      userStatus
    });
  } catch (error) {
    res.status(500).json({ message: 'Server error', error: error.message });
  }
};

const getAllUsers = async (req, res) => {
  try {
    const users = await User.find({}, 'username userId');
    res.status(200).json({ message: 'Users retrieved successfully', users });
  } catch (error) {
    res.status(500).json({ message: 'Server error', error: error.message });
  }
};

const performDailyCheckIn = async (req, res) => {
  const { userId } = req.body;

  try {
    const user = await User.findOne({ userId });
    if (!user) {
      return res.status(404).json({ message: 'User not found' });
    }

    const now = new Date();
    const lastCheckIn = user.lastCheckIn ? new Date(user.lastCheckIn) : null;

    if (!lastCheckIn || 
        now.getUTCDate() !== lastCheckIn.getUTCDate() || 
        now.getUTCMonth() !== lastCheckIn.getUTCMonth() || 
        now.getUTCFullYear() !== lastCheckIn.getUTCFullYear()) {
      
      let reward;

      if (!lastCheckIn || now - lastCheckIn > 24 * 60 * 60 * 1000) {
        user.checkInStreak = 0;
        reward = 1000;
      } else {
        user.checkInStreak += 1;

        if (user.checkInStreak % 7 === 0) {
          if (user.checkInStreak === 7) {
            reward = 25000;
          } else {
            const weekNumber = Math.floor(user.checkInStreak / 7);
            reward = weekNumber <= 5 ? 50000 * weekNumber : 250000;
          }
        } else {
          reward = 5000;
        }
      }

      user.lastCheckIn = now;
      user.checkInPoints += reward;

      await user.save();

      res.status(200).json({
        message: 'Daily check-in successful',
        checkInPointsEarned: reward,
        totalCheckInPoints: user.checkInPoints,
        streak: user.checkInStreak,
        currentStats: {
          power: user.power,
          checkInPoints: user.checkInPoints,
          referralPoints: user.referralPoints
        }
      });
    } else {
      res.status(400).json({ message: 'You have already checked in today' });
    }
  } catch (error) {
    res.status(500).json({ message: 'Server error', error: error.message });
  }
};

const getCheckInStatus = async (req, res) => {
  const { userId } = req.params;

  try {
    const user = await User.findOne({ userId });
    if (!user) {
      return res.status(404).json({ message: 'User not found' });
    }

    const now = new Date();
    const lastCheckIn = user.lastCheckIn ? new Date(user.lastCheckIn) : null;
    const canCheckInToday = !lastCheckIn || 
      now.getUTCDate() !== lastCheckIn.getUTCDate() || 
      now.getUTCMonth() !== lastCheckIn.getUTCMonth() || 
      now.getUTCFullYear() !== lastCheckIn.getUTCFullYear();

    let todayCheckInValue;
    if (!canCheckInToday) {
      todayCheckInValue = 0;
    } else if (!lastCheckIn || now - lastCheckIn > 48 * 60 * 60 * 1000) {
      todayCheckInValue = 1000;
    } else {
      const nextStreakDay = user.checkInStreak + 1;
      if (nextStreakDay % 7 === 0) {
        if (nextStreakDay === 7) {
          todayCheckInValue = 25000;
        } else {
          const weekNumber = Math.floor(nextStreakDay / 7);
          todayCheckInValue = weekNumber <= 5 ? 50000 * weekNumber : 250000;
        }
      } else {
        todayCheckInValue = 5000;
      }
    }

    res.status(200).json({
      lastCheckIn: user.lastCheckIn,
      checkInStreak: user.checkInStreak,
      totalCheckInPoints: user.checkInPoints,
      canCheckInToday: canCheckInToday,
      todayCheckInValue: todayCheckInValue,
      currentStats: {
        power: user.power,
        checkInPoints: user.checkInPoints,
        referralPoints: user.referralPoints
      }
    });
  } catch (error) {
    res.status(500).json({ message: 'Server error', error: error.message });
  }
};

const getReferralDetails = async (req, res) => {
  const { userId } = req.params;

  try {
    const user = await User.findOne({ userId });
    if (!user) {
      return res.status(404).json({ message: 'User not found' });
    }

    const referralDetails = {
      directReferrals: {
        count: user.directReferrals.length,
        totalPoints: user.directReferrals.reduce((sum, ref) => sum + ref.pointsEarned, 0),
        referrals: user.directReferrals.map(ref => ({
          username: ref.username,
          joinedAt: ref.joinedAt,
          pointsEpointsEarned: ref.pointsEarned
        }))
      },
      indirectReferrals: {
        count: user.indirectReferrals.length,
        totalPoints: user.indirectReferrals.reduce((sum, ref) => sum + ref.pointsEarned, 0),
        referrals: user.indirectReferrals.map(ref => ({
          username: ref.username,
          referredBy: ref.referredBy,
          joinedAt: ref.joinedAt,
          pointsEarned: ref.pointsEarned
        }))
      },
      totalReferralPoints: user.referralPoints,
      myReferralCode: user.username
    };

    res.status(200).json({
      message: 'Referral details retrieved successfully',
      referralDetails
    });
  } catch (error) {
    res.status(500).json({ message: 'Server error', error: error.message });
  }
};

const getReferralRewardStatus = async (req, res) => {
  const { userId } = req.params;

  try {
    const user = await User.findOne({ userId }).lean();
    if (!user) {
      return res.status(404).json({ message: 'User not found' });
    }

    if (!user.referralRewards || user.referralRewards.length === 0) {
      const defaultRewards = referralRewards.map(tier => ({
        referrals: tier.referrals,
        reward: tier.reward,
        claimed: false
      }));

      await User.findOneAndUpdate(
        { userId: userId },
        { $set: { referralRewards: defaultRewards } },
        { new: true }
      );
      user.referralRewards = defaultRewards;
    }

    const totalReferrals = user.directReferrals ? user.directReferrals.length : 0;

    const claimableRewards = user.referralRewards
      .filter(reward => totalReferrals >= reward.referrals && !reward.claimed)
      .sort((a, b) => a.referrals - b.referrals);

    const nextRewardTier = user.referralRewards
      .filter(reward => totalReferrals < reward.referrals && !reward.claimed)
      .sort((a, b) => a.referrals - b.referrals)[0];

    const allRewards = user.referralRewards
      .sort((a, b) => a.referrals - b.referrals)
      .map(reward => ({
        referrals: reward.referrals,
        reward: reward.reward,
        claimed: reward.claimed,
        qualified: totalReferrals >= reward.referrals
      }));

    res.status(200).json({
      message: 'Referral reward status retrieved successfully',
      totalReferrals,
      claimableRewards: claimableRewards.map(reward => ({
        referrals: reward.referrals,
        reward: reward.reward
      })),
      nextReward: nextRewardTier ? {
        referralsNeeded: nextRewardTier.referrals - totalReferrals,
        referrals: nextRewardTier.referrals,
        reward: nextRewardTier.reward
      } : null,
      allRewards
    });
  } catch (error) {
    console.error('Error in getReferralRewardStatus:', error);
    res.status(500).json({ message: 'Server error', error: error.message });
  }
};

const claimReferralReward = async (req, res) => {
  const { userId } = req.body;

  try {
    const user = await User.findOne({ userId });
    if (!user) {
      return res.status(404).json({ message: 'User not found' });
    }

    if (!user.referralRewards || user.referralRewards.length === 0) {
      user.referralRewards = referralRewards.map(tier => ({
        referrals: tier.referrals,
        reward: tier.reward,
        claimed: false
      }));
    }

    const totalReferrals = user.directReferrals ? user.directReferrals.length : 0;

    const claimableReward = user.referralRewards
      .filter(reward => totalReferrals >= reward.referrals && !reward.claimed)
      .sort((a, b) => a.referrals - b.referrals)[0];

    if (!claimableReward) {
      return res.status(400).json({
        message: 'No claimable rewards available',
        totalReferrals,
        nextRewardInfo: {
          nextTier: user.referralRewards.find(reward => totalReferrals < reward.referrals),
          currentReferrals: totalReferrals
        }
      });
    }

    const rewardIndex = user.referralRewards.findIndex(
      reward => reward.referrals === claimableReward.referrals
    );

    if (rewardIndex === -1) {
      return res.status(400).json({ message: 'Reward tier not found' });
    }

    user.referralRewards[rewardIndex].claimed = true;
    user.referralPoints += claimableReward.reward;

    const remainingClaimableRewards = user.referralRewards
      .filter(reward => 
        totalReferrals >= reward.referrals && 
        !reward.claimed && 
        reward.referrals !== claimableReward.referrals
      )
      .sort((a, b) => a.referrals - b.referrals);

    await user.save();

    res.status(200).json({
      message: 'Referral reward claimed successfully',
      claimedReward: {
        referrals: claimableReward.referrals,
        reward: claimableReward.reward,
        pointsAwarded: claimableReward.reward
      },
      updatedStatus: {
        totalReferralPoints: user.referralPoints,
        totalReferrals,
        remainingClaimableRewards: remainingClaimableRewards.map(reward => ({
          referrals: reward.referrals,
          reward: reward.reward
        }))
      },
      nextReward: remainingClaimableRewards[0] || null
    });

  } catch (error) {
    console.error('Error in claimReferralReward:', error);
    res.status(500).json({ message: 'Server error', error: error.message });
  }
};

const getAutoBotEarnings = async (req, res) => {
  const { userId } = req.params;

  try {
    const user = await User.findOne({ userId });
    if (!user) {
      return res.status(404).json({ message: 'User not found' });
    }

    // Check if autoTapBot is active
    if (!user.autoTapBot || !user.autoTapBot.isActive) {
      return res.status(400).json({ 
        message: 'Auto tap bot is not active',
        isActive: false
      });
    }

    const now = Date.now();
    const lastClaimed = user.autoTapBot.lastClaimed || user.autoTapBot.validUntil;
    const botDuration = user.autoTapBot.duration * 60 * 60 * 1000; // Convert hours to milliseconds
    
    // Calculate time elapsed since last claim
    const timeElapsed = Math.min(
      now - lastClaimed,
      botDuration
    );

    // Calculate earnings based on multiTap power and energy constraints
    const tapsPerSecond = user.speedLevel; // Taps per second based on speed level
    const totalSeconds = timeElapsed / 1000;
    const totalPossibleTaps = Math.floor(totalSeconds * tapsPerSecond);
    
    // Calculate power gained
    const powerPerTap = user.multiTapLevel;
    const totalPowerGained = totalPossibleTaps * powerPerTap;

    // Calculate energy used (1 energy per tap)
    const energyUsed = Math.min(totalPossibleTaps, user.maxEnergy);
    
    // Update user stats
    user.power += totalPowerGained;
    user.energy = Math.max(0, user.maxEnergy - energyUsed);
    user.autoTapBot.lastClaimed = now;
    user.statistics.totalPowerGenerated += totalPowerGained;
    user.statistics.totalTaps += totalPossibleTaps;

    await user.save();

    res.status(200).json({
      message: 'Auto bot earnings retrieved successfully',
      earnings: {
        timeElapsed: timeElapsed / 1000, // in seconds
        totalTaps: totalPossibleTaps,
        powerGained: totalPowerGained,
        energyUsed,
        currentEnergy: user.energy,
        botStatus: {
          duration: user.autoTapBot.duration,
          validUntil: user.autoTapBot.validUntil,
          isActive: user.autoTapBot.isActive
        },
        currentStats: {
          power: user.power,
          totalTaps: user.statistics.totalTaps,
          energyRemaining: user.energy
        }
      }
    });

  } catch (error) {
    console.error('Error in getAutoBotEarnings:', error);
    res.status(500).json({ message: 'Server error', error: error.message });
  }
};


module.exports = {
  registerUser,
  upgradeLevel,
  handleTap,
  monitorUserStatus,
  getAllUsers,
  performDailyCheckIn,
  getCheckInStatus,
  getReferralDetails,
  getReferralRewardStatus,
  claimReferralReward,
  getAutoBotEarnings
};
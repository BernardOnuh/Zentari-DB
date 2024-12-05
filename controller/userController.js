const { User, UPGRADE_SYSTEM, AUTO_TAP_BOT_CONFIG, REFERRAL_REWARD_TIERS } = require('../models/User');
const mongoose = require('mongoose');

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

    const initialReferralRewards = REFERRAL_REWARD_TIERS.map(tier => ({
      referrals: tier.referrals,
      reward: tier.reward,
      claimed: false
    }));

    const newUser = new User({
      username,
      userId,
      referral: referral ? directReferrer.username : null,
      referralRewards: initialReferralRewards
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
        referralRewards: newUser.referralRewards
      }
    });
  } catch (error) {
    res.status(500).json({ message: 'Server error', error: error.message });
  }
};

// Helper function to calculate current energy with regeneration
const calculateCurrentEnergy = (lastTapTime, currentEnergy, maxEnergy, regenTimeInMinutes) => {
  const now = Date.now();
  const timeDiffSeconds = (now - lastTapTime) / 1000;
  const regenTimeInSeconds = regenTimeInMinutes * 60;
  const energyPerSecond = maxEnergy / regenTimeInSeconds;
  const regeneratedEnergy = timeDiffSeconds * energyPerSecond;
  
  return Math.min(maxEnergy, currentEnergy + regeneratedEnergy);
};

const handleTap = async (req, res) => {
  const { userId } = req.body;

  try {
    const user = await User.findOne({ userId });
    if (!user) return res.status(404).json({ message: 'User not found' });

    const now = Date.now();
    const regenTimeInMinutes = UPGRADE_SYSTEM.speed.refillTime[user.speedLevel - 1];
    const regenTimeInSeconds = regenTimeInMinutes * 60;
    const energyPerSecond = user.maxEnergy / regenTimeInSeconds;
    
    // Calculate current energy with regeneration
    const currentEnergy = calculateCurrentEnergy(
      user.lastTapTime,
      user.energy,
      user.maxEnergy,
      regenTimeInMinutes
    );

    // Check if we have enough energy to tap
    if (currentEnergy < 1) {
      const timeToNextEnergy = (1 - currentEnergy) / energyPerSecond;
      return res.status(400).json({
        message: 'Not enough energy',
        currentEnergy: currentEnergy,
        maxEnergy: user.maxEnergy,
        secondsToNextEnergy: Math.ceil(timeToNextEnergy),
        regenRatePerSecond: energyPerSecond
      });
    }

    // Perform the tap
    const tapPower = user.getTapPower();
    
    // Update user state
    user.energy = currentEnergy - 1; // Subtract energy cost for tap
    user.lastTapTime = now;
    user.power += tapPower;
    user.statistics.totalTaps += 1;
    user.statistics.totalPowerGenerated += tapPower;

    await user.save();

    res.status(200).json({
      message: 'Tap successful',
      powerGained: tapPower,
      currentStats: {
        energy: user.energy,
        maxEnergy: user.maxEnergy,
        power: user.power,
        totalTaps: user.statistics.totalTaps,
        powerPerTap: tapPower,
        energyRegenRate: energyPerSecond // Energy recovered per second
      }
    });
  } catch (error) {
    res.status(500).json({ message: 'Server error', error: error.message });
  }
};



const upgradeLevel = async (req, res) => {
  const { userId, upgradeType, useStar = false } = req.body;

  try {
    const user = await User.findOne({ userId });
    if (!user) return res.status(404).json({ message: 'User not found' });

    const currentLevel = user[`${upgradeType}Level`];
    const nextLevel = currentLevel + 1;

    // Check maximum level
    if (nextLevel > 8) {
      return res.status(400).json({ message: 'Maximum level reached' });
    }

    // Get upgrade cost
    const upgradeCost = user.getUpgradeCost(upgradeType);
    if (!upgradeCost) {
      return res.status(400).json({ message: 'Invalid upgrade request' });
    }

    // Handle point-based upgrades (levels 1-5)
    if (nextLevel <= 5) {
      if (useStar) {
        return res.status(400).json({ message: 'Star upgrades only available for levels 6-8' });
      }

      if (user.totalPoints < upgradeCost.points) {
        return res.status(400).json({
          message: 'Insufficient points',
          required: upgradeCost.points,
          current: user.totalPoints
        });
      }

      user.power -= upgradeCost.points;
    } else {
      // Handle star-based upgrades (levels 6-8)
      if (!useStar) {
        return res.status(400).json({ message: 'Point upgrades only available for levels 1-5' });
      }

      if (user.stars < upgradeCost.stars) {
        return res.status(400).json({ 
          message: 'Insufficient stars',
          required: upgradeCost.stars,
          current: user.stars
        });
      }

      user.stars -= upgradeCost.stars;
      user.power += upgradeCost.reward;
    }

    // Perform the upgrade
    user[`${upgradeType}Level`] = nextLevel;
    await user.save();

    // Return updated stats
    res.status(200).json({
      message: 'Upgrade successful',
      upgradeType,
      newLevel: nextLevel,
      stats: {
        power: user.power,
        stars: user.stars,
        tapPower: user.getTapPower(),
        maxEnergy: user.maxEnergy,
        regenTime: UPGRADE_SYSTEM.speed.refillTime[user.speedLevel - 1]
      }
    });
  } catch (error) {
    console.error('Upgrade error:', error);
    res.status(500).json({ message: 'Upgrade failed', error: error.message });
  }
};


const activateAutoTapBot = async (req, res) => {
  const { userId, level = 'free' } = req.body;

  try {
    const user = await User.findOne({ userId });
    if (!user) return res.status(404).json({ message: 'User not found' });

    const botConfig = AUTO_TAP_BOT_CONFIG.levels[level];
    if (!botConfig) return res.status(400).json({ message: 'Invalid bot level' });

    if (level !== 'free') {
      if (user.stars < botConfig.starCost) {
        return res.status(400).json({ 
          message: 'Insufficient stars',
          required: botConfig.starCost,
          current: user.stars
        });
      }
      user.stars -= botConfig.starCost;
    }

    const now = new Date();
    user.autoTapBot = {
      level,
      validUntil: new Date(now.getTime() + (botConfig.validityDays * 24 * 60 * 60 * 1000)),
      lastClaimed: now,
      isActive: true
    };

    await user.save();

    res.status(200).json({
      message: 'Auto tap bot activated successfully',
      botStatus: user.autoTapBot,
      stars: user.stars
    });
  } catch (error) {
    res.status(500).json({ message: 'Activation failed', error: error.message });
  }
};

const getAutoBotEarnings = async (req, res) => {
  const { userId } = req.params;

  try {
    const user = await User.findOne({ userId });
    if (!user) return res.status(404).json({ message: 'User not found' });

    if (!user.autoTapBot?.isActive) {
      return res.status(400).json({ message: 'Auto tap bot is not active' });
    }

    const now = Date.now();
    const lastClaimed = user.autoTapBot.lastClaimed || user.autoTapBot.validUntil;
    const config = AUTO_TAP_BOT_CONFIG.levels[user.autoTapBot.level];
    const timeElapsed = Math.min(
      now - lastClaimed,
      config.duration * 60 * 60 * 1000
    );

    const tapsPerSecond = user.speedLevel;
    const totalTaps = Math.floor((timeElapsed / 1000) * tapsPerSecond);
    const tapPower = user.getTapPower();
    const powerGained = totalTaps * tapPower;
    const energyUsed = Math.min(totalTaps, user.maxEnergy);

    user.power += powerGained;
    user.energy = Math.max(0, user.maxEnergy - energyUsed);
    user.autoTapBot.lastClaimed = now;
    user.statistics.totalTaps += totalTaps;
    user.statistics.totalPowerGenerated += powerGained;

    await user.save();

    res.status(200).json({
      message: 'Auto bot earnings claimed successfully',
      earnings: {
        timeElapsed: timeElapsed / 1000,
        totalTaps,
        powerGained,
        energyUsed,
        currentStats: {
          energy: user.energy,
          power: user.power,
          totalTaps: user.statistics.totalTaps
        },
        botStatus: {
          level: user.autoTapBot.level,
          validUntil: user.autoTapBot.validUntil,
          duration: config.duration
        }
      }
    });
  } catch (error) {
    res.status(500).json({ message: 'Failed to claim earnings', error: error.message });
  }
};

// Update the monitorUserStatus function to use the same calculation
const monitorUserStatus = async (req, res) => {
  const { userId } = req.params;

  try {
    const user = await User.findOne({ userId });
    if (!user) return res.status(404).json({ message: 'User not found' });

    const regenTimeInMinutes = UPGRADE_SYSTEM.speed.refillTime[user.speedLevel - 1];
    const currentEnergy = calculateCurrentEnergy(
      user.lastTapTime,
      user.energy,
      user.maxEnergy,
      regenTimeInMinutes
    );

    if (user.energy !== currentEnergy) {
      user.energy = currentEnergy;
      user.lastTapTime = Date.now();
      await user.save();
    }

    res.status(200).json({
      message: 'Status retrieved successfully',
      status: {
        username: user.username,
        userId: user.userId,
        energy: currentEnergy,
        maxEnergy: user.maxEnergy,
        tapPower: user.getTapPower(),
        levels: {
          multiTap: user.multiTapLevel,
          speed: user.speedLevel,
          energyLimit: user.energyLimitLevel
        },
        scores: {
          power: user.power,
          checkInPoints: user.checkInPoints,
          referralPoints: user.referralPoints,
          totalPoints: user.totalPoints
        },
        botStatus: user.autoTapBot,
        timing: {
          regenTime: regenTimeInMinutes,
          lastTapTime: user.lastTapTime,
          currentTime: Date.now(),
          energyRegenRate: user.maxEnergy / (regenTimeInMinutes * 60)
        }
      }
    });
  } catch (error) {
    res.status(500).json({ message: 'Server error', error: error.message });
  }
};



const performDailyCheckIn = async (req, res) => {
  const { userId } = req.body;

  try {
    const user = await User.findOne({ userId });
    if (!user) return res.status(404).json({ message: 'User not found' });

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
          reward = user.checkInStreak === 7 ? 25000 : 
            Math.min(50000 * Math.floor(user.checkInStreak / 7), 250000);
        } else {
          reward = 5000;
        }
      }

      user.lastCheckIn = now;
      user.checkInPoints += reward;
      user.statistics.totalCheckIns += 1;

      await user.save();

      res.status(200).json({
        message: 'Check-in successful',
        reward,
        stats: {
          streak: user.checkInStreak,
          totalCheckIns: user.statistics.totalCheckIns,
          checkInPoints: user.checkInPoints
        }
      });
    } else {
      res.status(400).json({ message: 'Already checked in today' });
    }
  } catch (error) {
    res.status(500).json({ message: 'Server error', error: error.message });
  }
};

const getCheckInStatus = async (req, res) => {
  const { userId } = req.params;

  try {
    const user = await User.findOne({ userId });
    if (!user) return res.status(404).json({ message: 'User not found' });

    const now = new Date();
    const lastCheckIn = user.lastCheckIn ? new Date(user.lastCheckIn) : null;
    const canCheckIn = !lastCheckIn || 
      now.getUTCDate() !== lastCheckIn.getUTCDate() || 
      now.getUTCMonth() !== lastCheckIn.getUTCMonth() || 
      now.getUTCFullYear() !== lastCheckIn.getUTCFullYear();

    let nextReward = 0;
    if (canCheckIn) {
      if (!lastCheckIn || now - lastCheckIn > 48 * 60 * 60 * 1000) {
        nextReward = 1000;
      } else {
        const nextStreak = user.checkInStreak + 1;
        if (nextStreak % 7 === 0) {
          nextReward = nextStreak === 7 ? 25000 : 
            Math.min(50000 * Math.floor(nextStreak / 7), 250000);
        } else {
          nextReward = 5000;
        }
      }
    }

    res.status(200).json
    res.status(200).json({
      status: {
        lastCheckIn: user.lastCheckIn,
        streak: user.checkInStreak,
        canCheckIn,
        nextReward,
        stats: {
          totalCheckIns: user.statistics.totalCheckIns,
          longestStreak: user.statistics.longestCheckInStreak,
          checkInPoints: user.checkInPoints
        }
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
    if (!user) return res.status(404).json({ message: 'User not found' });

    const details = {
      myReferralCode: user.username,
      directReferrals: {
        count: user.directReferrals.length,
        totalPoints: user.directReferrals.reduce((sum, ref) => sum + ref.pointsEarned, 0),
        referrals: user.directReferrals.map(ref => ({
          username: ref.username,
          joinedAt: ref.joinedAt,
          pointsEarned: ref.pointsEarned
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
      totalReferralPoints: user.referralPoints
    };

    res.status(200).json({ referralDetails: details });
  } catch (error) {
    res.status(500).json({ message: 'Server error', error: error.message });
  }
};

const getReferralRewardStatus = async (req, res) => {
  const { userId } = req.params;

  try {
    const user = await User.findOne({ userId });
    if (!user) return res.status(404).json({ message: 'User not found' });

    const totalReferrals = user.directReferrals.length;
    const claimableRewards = user.referralRewards
      .filter(reward => totalReferrals >= reward.referrals && !reward.claimed)
      .sort((a, b) => a.referrals - b.referrals);

    const nextReward = user.referralRewards
      .filter(reward => totalReferrals < reward.referrals && !reward.claimed)
      .sort((a, b) => a.referrals - b.referrals)[0];

    res.status(200).json({
      totalReferrals,
      claimableRewards: claimableRewards.map(r => ({
        referrals: r.referrals,
        reward: r.reward
      })),
      nextReward: nextReward ? {
        referralsNeeded: nextReward.referrals - totalReferrals,
        referrals: nextReward.referrals,
        reward: nextReward.reward
      } : null,
      allRewards: user.referralRewards.map(r => ({
        referrals: r.referrals,
        reward: r.reward,
        claimed: r.claimed,
        qualified: totalReferrals >= r.referrals
      }))
    });
  } catch (error) {
    res.status(500).json({ message: 'Server error', error: error.message });
  }
};

const claimReferralReward = async (req, res) => {
  const { userId } = req.body;

  try {
    const user = await User.findOne({ userId });
    if (!user) return res.status(404).json({ message: 'User not found' });

    const totalReferrals = user.directReferrals.length;
    const claimableReward = user.getNextClaimableReward();

    if (!claimableReward) {
      return res.status(400).json({
        message: 'No rewards available to claim',
        totalReferrals,
        nextRequired: user.referralRewards.find(r => 
          !r.claimed && r.referrals > totalReferrals
        )?.referrals
      });
    }

    const rewardIndex = user.referralRewards.findIndex(r => 
      r.referrals === claimableReward.referrals
    );
    
    user.referralRewards[rewardIndex].claimed = true;
    user.referralPoints += claimableReward.reward;
    await user.save();

    res.status(200).json({
      message: 'Reward claimed successfully',
      claimed: {
        referrals: claimableReward.referrals,
        reward: claimableReward.reward
      },
      newTotal: user.referralPoints,
      nextReward: user.getNextClaimableReward()
    });
  } catch (error) {
    res.status(500).json({ message: 'Server error', error: error.message });
  }
};

const getAllUsers = async (req, res) => {
  try {
    const users = await User.find({}, 'username userId power');
    res.status(200).json({ users });
  } catch (error) {
    res.status(500).json({ message: 'Server error', error: error.message });
  }
};

const getAutoBotStatus = async (req, res) => {
  const { userId } = req.params;
  try {
    const user = await User.findOne({ userId });
    if (!user) return res.status(404).json({ message: 'User not found' });

    res.status(200).json({
      botStatus: {
        isActive: user.autoTapBot?.isActive || false,
        level: user.autoTapBot?.level || 'free',
        validUntil: user.autoTapBot?.validUntil,
        lastClaimed: user.autoTapBot?.lastClaimed
      }
    });
  } catch (error) {
    res.status(500).json({ message: 'Server error', error: error.message });
  }
};

const getUserStatistics = async (req, res) => {
  const { userId } = req.params;
  try {
    const user = await User.findOne({ userId });
    if (!user) return res.status(404).json({ message: 'User not found' });

    res.status(200).json({
      statistics: user.statistics,
      levels: {
        multiTap: user.multiTapLevel,
        speed: user.speedLevel,
        energyLimit: user.energyLimitLevel
      }
    });
  } catch (error) {
    res.status(500).json({ message: 'Server error', error: error.message });
  }
};

const getUserAchievements = async (req, res) => {
  const { userId } = req.params;
  try {
    const user = await User.findOne({ userId });
    if (!user) return res.status(404).json({ message: 'User not found' });

    res.status(200).json({ achievements: user.achievements });
  } catch (error) {
    res.status(500).json({ message: 'Server error', error: error.message });
  }
};

const getPowerLeaderboard = async (req, res) => {
  try {
    const users = await User.find({}, 'username power')
      .sort({ power: -1 })
      .limit(100);
    
    res.status(200).json({ leaderboard: users });
  } catch (error) {
    res.status(500).json({ message: 'Server error', error: error.message });
  }
};

const getReferralLeaderboard = async (req, res) => {
  try {
    const users = await User.find({}, 'username directReferrals')
      .sort({ 'directReferrals.length': -1 })
      .limit(100);
    
    res.status(200).json({
      leaderboard: users.map(user => ({
        username: user.username,
        referrals: user.directReferrals.length
      }))
    });
  } catch (error) {
    res.status(500).json({ message: 'Server error', error: error.message });
  }
};

const getEnergyStatus = async (req, res) => {
  const { userId } = req.params;
  try {
    const user = await User.findOne({ userId });
    if (!user) return res.status(404).json({ message: 'User not found' });

    const currentEnergy = user.calculateEnergyRegeneration();
    
    res.status(200).json({
      energy: currentEnergy,
      maxEnergy: user.maxEnergy,
      regenTime: UPGRADE_SYSTEM.speed.refillTime[user.speedLevel - 1]
    });
  } catch (error) {
    res.status(500).json({ message: 'Server error', error: error.message });
  }
};

const refillEnergy = async (req, res) => {
  const { userId } = req.params;
  try {
    const user = await User.findOne({ userId });
    if (!user) return res.status(404).json({ message: 'User not found' });

    user.energy = user.maxEnergy;
    user.lastTapTime = new Date();
    await user.save();

    res.status(200).json({
      message: 'Energy refilled successfully',
      energy: user.energy,
      maxEnergy: user.maxEnergy
    });
  } catch (error) {
    res.status(500).json({ message: 'Server error', error: error.message });
  }
};

module.exports = {
  registerUser,
  handleTap,
  upgradeLevel,
  monitorUserStatus,
  activateAutoTapBot,
  getAutoBotEarnings,
  performDailyCheckIn,
  getCheckInStatus,
  getReferralDetails,
  getReferralRewardStatus,
  claimReferralReward,
  getAllUsers,
  getAutoBotStatus,
  getUserStatistics,
  getUserAchievements,
  getPowerLeaderboard,
  getReferralLeaderboard,
  getEnergyStatus,
  refillEnergy
};
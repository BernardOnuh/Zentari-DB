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


// Updated controller functions
const registerUser = async (req, res) => {
  try {
    const { username, userId, referral } = req.body;

    // Check if username already exists
    const existingUser = await User.findOne({ username });
    if (existingUser) {
      return res.status(400).json({ message: 'Username already exists' });
    }

    // Find direct referrer
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

    // Initialize referral rewards
    const initialReferralRewards = referralRewards.map(tier => ({
      referrals: tier.referrals,
      reward: tier.reward,
      claimed: false
    }));

    // Create new user with initialized rewards
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


const getReferralDetails = async (req, res) => {
  const { userId } = req.params;

  try {
    const user = await User.findOne({ userId });

    if (!user) {
      return res.status(404).json({ message: 'User not found' });
    }

    // Get detailed referral information
    const referralDetails = {
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
      totalReferralPoints: user.referralPoints,
      myReferralCode: user.username // username serves as referral code
    };

    res.status(200).json({
      message: 'Referral details retrieved successfully',
      referralDetails
    });
  } catch (error) {
    res.status(500).json({ message: 'Server error', error });
  }
};

// PUT: Upgrade speed, multitap, or energy limit level
const upgradeLevel = async (req, res) => {
  const { userId, upgradeType } = req.body;

  try {
    const user = await User.findOne({ userId });

    if (!user) {
      return res.status(404).json({ message: 'User not found' });
    }

    // Upgrade the appropriate level based on the upgradeType
    switch (upgradeType) {
      case 'speed':
        user.speedLevel += 1;
        break;
      case 'multiTap':
        user.multiTapLevel += 1;
        break;
      case 'energyLimit':
        user.energyLimitLevel += 1;
        user.maxEnergy = 500 * user.energyLimitLevel;
        break;
      default:
        return res.status(400).json({ message: 'Invalid upgrade type' });
    }

    await user.save();
    res.status(200).json({ message: 'Upgrade successful', user });
  } catch (error) {
    res.status(500).json({ message: 'Server error', error });
  }
};

// Utility to calculate regenerated energy
const calculateRegeneratedEnergy = (user) => {
  const currentTime = Date.now();
  const regenRate = 1000 / user.speedLevel;
  const timeDiff = currentTime - user.lastTapTime;
  const energyToRegenerate = Math.floor(timeDiff / regenRate);
  const newEnergy = Math.min(user.energy + energyToRegenerate, user.maxEnergy);

  return {
    newEnergy,
    lastTapTime: currentTime
  };
};

// PUT: Handle tapping
const handleTap = async (req, res) => {
  const { userId } = req.body;

  try {
    const user = await User.findOne({ userId });

    if (!user) {
      return res.status(404).json({ message: 'User not found' });
    }

    const { newEnergy, lastTapTime } = calculateRegeneratedEnergy(user);
    user.energy = newEnergy;
    user.lastTapTime = lastTapTime;

    if (user.energy > 0) {
      user.energy -= 1;
      user.power += user.multiplier; // Only affects power, not other point systems

      await user.save();
      res.status(200).json({ message: 'Tap successful', user });
    } else {
      res.status(400).json({ message: 'Not enough energy' });
    }
  } catch (error) {
    res.status(500).json({ message: 'Server error', error });
  }
};

// GET: Monitor user status
const monitorUserStatus = async (req, res) => {
  const { userId } = req.params;

  try {
    const user = await User.findOne({ userId });

    if (!user) {
      return res.status(404).json({ message: 'User not found' });
    }

    const { newEnergy, lastTapTime } = calculateRegeneratedEnergy(user);
    user.energy = newEnergy;
    user.lastTapTime = lastTapTime;

    if (user.energy !== newEnergy) {
      await user.save();
    }

    const userStatus = {
      username: user.username,
      userId: user.userId,
      
      // Energy stats
      energy: user.energy,
      maxEnergy: user.maxEnergy,
      
      // All three scoring systems
      scores: {
        power: user.power,
        checkInPoints: user.checkInPoints,
        referralPoints: user.referralPoints,
        totalPoints: user.power + user.checkInPoints + user.referralPoints
      },
      
      // Level information
      levels: {
        speedLevel: user.speedLevel,
        multiTapLevel: user.multiTapLevel,
        energyLimitLevel: user.energyLimitLevel
      },
      
      // Check-in information
      checkIn: {
        streak: user.checkInStreak,
        lastCheckIn: user.lastCheckIn
      },
      
      // Time information
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
    res.status(500).json({ message: 'Server error', error });
  }
};

const getAllUsers = async (req, res) => {
  try {
    const users = await User.find({}, 'username userId');
    res.status(200).json({ message: 'Users retrieved successfully', users });
  } catch (error) {
    res.status(500).json({ message: 'Server error', error });
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
    res.status(500).json({ message: 'Server error', error });
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
    res.status(500).json({ message: 'Server error', error });
  }
};


const getReferralRewardStatus = async (req, res) => {
  const { userId } = req.params;

  try {
    const user = await User.findOne({ userId }).lean();

    if (!user) {
      return res.status(404).json({ message: 'User not found' });
    }

    // Initialize default rewards if they don't exist
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

    // Get claimable rewards (unclaimed rewards where user has enough referrals)
    const claimableRewards = user.referralRewards
      .filter(reward => totalReferrals >= reward.referrals && !reward.claimed)
      .sort((a, b) => a.referrals - b.referrals);

    // Find next reward tier that hasn't been claimed yet
    const nextRewardTier = user.referralRewards
      .filter(reward => totalReferrals < reward.referrals && !reward.claimed)
      .sort((a, b) => a.referrals - b.referrals)[0];

    // Map all rewards with their status
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

    // Initialize default rewards if they don't exist
    if (!user.referralRewards || user.referralRewards.length === 0) {
      user.referralRewards = referralRewards.map(tier => ({
        referrals: tier.referrals,
        reward: tier.reward,
        claimed: false
      }));
    }

    const totalReferrals = user.directReferrals ? user.directReferrals.length : 0;

    // Find the lowest unclaimed tier that the user qualifies for
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

    // Find and update the reward in user's referralRewards array
    const rewardIndex = user.referralRewards.findIndex(
      reward => reward.referrals === claimableReward.referrals
    );

    if (rewardIndex === -1) {
      return res.status(400).json({ message: 'Reward tier not found' });
    }

    // Mark the reward as claimed and update points
    user.referralRewards[rewardIndex].claimed = true;
    user.referralPoints += claimableReward.reward;

    // Find remaining claimable rewards
    const remainingClaimableRewards = user.referralRewards
      .filter(reward => 
        totalReferrals >= reward.referrals && 
        !reward.claimed && 
        reward.referrals !== claimableReward.referrals
      )
      .sort((a, b) => a.referrals - b.referrals);

    // Save the updated user
    await user.save();

    // Return detailed response
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
  claimReferralReward
};
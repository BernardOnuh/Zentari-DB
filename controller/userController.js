const User = require('../models/User');
const mongoose = require('mongoose');
const ObjectId = mongoose.Types.ObjectId;

// POST: Register new user with fixed referral handling
const registerUser = async (req, res) => {
  try {
    const { username, userId, referral } = req.body;

    // Check if the username already exists
    const existingUser = await User.findOne({ username });
    if (existingUser) {
      return res.status(400).json({ message: 'Username already exists' });
    }

    let inviter = null;
    if (referral) {
      // Find inviter and explicitly select all fields
      inviter = await User.findOne({ username: referral });
      if (!inviter) {
        return res.status(400).json({ message: 'Referral username does not exist' });
      }
    }

    // Create a new user
    const newUser = new User({
      username,
      userId,
      referral: referral ? inviter.username : null,
      power: 0,
      checkInPoints: 0,
      referralPoints: 0
    });

    await newUser.save();

    // If there's a valid referral, update inviter using findOneAndUpdate
    if (inviter) {
      const updatedInviter = await User.findOneAndUpdate(
        { username: referral },
        {
          $inc: { referralPoints: 2000 },
          $push: {
            directReferrals: {
              username: username,
              joinedAt: new Date()
            }
          }
        },
        { new: true, runValidators: true }
      );

      if (!updatedInviter) {
        console.error('Failed to update inviter');
        return res.status(500).json({ message: 'Failed to update referral information' });
      }
    }

    res.status(201).json({
      message: 'User registered successfully',
      user: newUser,
      referralInfo: referral ? {
        invitedBy: referral,
        pointsAwarded: 2000
      } : null
    });
  } catch (error) {
    console.error('Registration error:', error);
    res.status(500).json({ message: 'Server error', error: error.message });
  }
};

// GET: Get referral details with improved error handling and logging
const getReferralDetails = async (req, res) => {
  const { userId } = req.params;

  try {
    // Find user and explicitly select all needed fields
    const user = await User.findOne({ userId }).select('+directReferrals +referralPoints +power +checkInPoints');

    if (!user) {
      return res.status(404).json({ message: 'User not found' });
    }

    console.log('Found user:', user.username);
    console.log('Direct referrals:', user.directReferrals);

    // Ensure directReferrals is initialized
    const directReferrals = user.directReferrals || [];

    // Get indirect referrals with improved aggregation
    const indirectReferrals = await User.aggregate([
      {
        $match: {
          referral: user.username // Match against the inviter's username
        }
      },
      {
        $lookup: {
          from: 'users',
          localField: 'username',
          foreignField: 'referral',
          as: 'subReferrals'
        }
      },
      {
        $project: {
          username: 1,
          joinedAt: '$createdAt',
          subReferralCount: { $size: '$subReferrals' }
        }
      }
    ]);

    console.log('Indirect referrals found:', indirectReferrals.length);

    // Group referrals by month with error handling
    const referralsByMonth = directReferrals.reduce((acc, ref) => {
      try {
        const month = new Date(ref.joinedAt).toLocaleString('default', { month: 'long', year: 'numeric' });
        acc[month] = (acc[month] || 0) + 1;
      } catch (error) {
        console.error('Error processing referral date:', error);
      }
      return acc;
    }, {});

    // Calculate points
    const directReferralPoints = directReferrals.length * 2000;
    const indirectReferralPoints = indirectReferrals.length * 100;

    const response = {
      message: 'Referral details retrieved successfully',
      yourInviteCode: user.username,
      referralPoints: user.referralPoints,
      referralStats: {
        directReferrals: {
          count: directReferrals.length,
          pointsPerReferral: 2000,
          totalPoints: directReferralPoints,
          list: directReferrals.map(ref => ({
            username: ref.username,
            joinedAt: ref.joinedAt
          }))
        },
        indirectReferrals: {
          count: indirectReferrals.length,
          pointsPerReferral: 100,
          totalPoints: indirectReferralPoints,
          list: indirectReferrals
        }
      },
      referralHistory: {
        byMonth: referralsByMonth
      },
      currentStats: {
        power: user.power,
        checkInPoints: user.checkInPoints,
        referralPoints: user.referralPoints,
        totalPoints: user.power + user.checkInPoints + user.referralPoints
      }
    };

    console.log('Sending referral details response:', response);
    res.status(200).json(response);
  } catch (error) {
    console.error('Error in getReferralDetails:', error);
    res.status(500).json({ message: 'Server error', error: error.message });
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

module.exports = {
  registerUser,
  getReferralDetails,
  upgradeLevel,
  handleTap,
  monitorUserStatus,
  getAllUsers,
  performDailyCheckIn,
  getCheckInStatus,

};
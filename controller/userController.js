const User = require('../models/User');
const mongoose = require('mongoose');
const ObjectId = mongoose.Types.ObjectId;

// POST: Register new user
const registerUser = async (req, res) => {
  try {
    const { username, userId, referral } = req.body;

    // Check if the username already exists
    const existingUser = await User.findOne({ username });
    if (existingUser) {
      return res.status(400).json({ message: 'Username already exists' });
    }

    // Find the inviting user by their username (referral)
    let inviter = null;
    if (referral) {
      inviter = await User.findOne({ username: referral });
      if (!inviter) {
        return res.status(400).json({ message: 'Referral username does not exist' });
      }
    }

    // Create a new user
    const newUser = new User({
      username,
      userId,
      referral: referral ? inviter.username : null // Store inviter's username
    });

    // If there's a valid referral, reward the inviter
    if (inviter) {
      inviter.referralScore += 2000; // Reward inviter with 2000 referral points
      await inviter.save(); // Save the updated inviter details
    }

    await newUser.save();

    res.status(201).json({ message: 'User registered successfully', user: newUser });
  } catch (error) {
    res.status(500).json({ message: 'Server error', error });
  }
};

// GET: Retrieve referral details for the user
const getReferralDetails = async (req, res) => {
  const { userId } = req.params; // Assuming userId is passed as a URL parameter

  try {
    // Find the user by userId
    const user = await User.findOne({ userId });

    if (!user) {
      return res.status(404).json({ message: 'User not found' });
    }

    // Count how many users this person has referred
    const referredUsers = await User.find({ referral: user.username }).countDocuments();

    // Return the referral details, including total referral points and number of referred users
    res.status(200).json({
      message: 'Referral details retrieved successfully',
      totalReferralPoints: user.referralScore, // Assuming referral points are added to checkInPoints
      referredUsersCount: referredUsers
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
        user.maxEnergy = 500 * user.energyLimitLevel; // Increase max energy
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

// Utility to calculate how much energy should regenerate based on time passed and speed level
const calculateRegeneratedEnergy = (user) => {
  const currentTime = Date.now();

  // Energy regeneration is tied to speedLevel (e.g., speedLevel 1 = 1 energy per second)
  const regenRate = 1000 / user.speedLevel; // Regeneration interval in milliseconds

  // Calculate time difference in milliseconds since the last action
  const timeDiff = currentTime - user.lastTapTime;

  // Calculate how much energy should regenerate based on the time difference and speed level
  const energyToRegenerate = Math.floor(timeDiff / regenRate);

  // Update energy but don't exceed maxEnergy
  const newEnergy = Math.min(user.energy + energyToRegenerate, user.maxEnergy);

  return {
    newEnergy,
    lastTapTime: currentTime // Update last tap time to the current time
  };
};

// PUT: Handle tapping (consume energy and increase power)
const handleTap = async (req, res) => {
  const { userId } = req.body;

  try {
    const user = await User.findOne({ userId });

    if (!user) {
      return res.status(404).json({ message: 'User not found' });
    }

    // Regenerate energy based on the time elapsed since the last tap
    const { newEnergy, lastTapTime } = calculateRegeneratedEnergy(user);
    user.energy = newEnergy; // Update energy with the regenerated value
    user.lastTapTime = lastTapTime; // Update last tap time to now

    // Check if the user has enough energy to tap
    if (user.energy > 0) {
      // Decrease energy by 1 and increase power
      user.energy -= 1;
      user.power += user.multiplier;

      // Save the updated user data
      await user.save();
      res.status(200).json({ message: 'Tap successful', user });
    } else {
      res.status(400).json({ message: 'Not enough energy' });
    }
  } catch (error) {
    res.status(500).json({ message: 'Server error', error });
  }
};

// This function can be called periodically, for example every second
const autoRechargeEnergy = async () => {
  const users = await User.find(); // Fetch all users or implement logic to fetch only active users

  users.forEach(async (user) => {
    const { newEnergy, lastTapTime } = calculateRegeneratedEnergy(user);
    user.energy = newEnergy;
    user.lastTapTime = lastTapTime; // Update last tap time to now

    // Save changes if the user's energy was updated
    if (user.energy !== newEnergy) {
      await user.save();
    }
  });
};

// Example usage: Set an interval to call autoRechargeEnergy every second
setInterval(autoRechargeEnergy, 1000);

// GET: Monitor user status
const monitorUserStatus = async (req, res) => {
  const { userId } = req.params; // Assuming userId is passed as a URL parameter

  try {
    const user = await User.findOne({ userId });

    if (!user) {
      return res.status(404).json({ message: 'User not found' });
    }

    // Regenerate energy based on time elapsed since the last tap
    const { newEnergy, lastTapTime } = calculateRegeneratedEnergy(user);
    
    // Update user object with regenerated energy
    user.energy = newEnergy;
    user.lastTapTime = lastTapTime;

    // Save updated energy to database (only if there's a change)
    if (user.energy !== newEnergy) {
      await user.save();
    }

    // Return relevant user status information
    const userStatus = {
      username: user.username,
      userId: user.userId,
      energy: user.energy,
      maxEnergy: user.maxEnergy,
      power: user.power,  // Reflect latest power here
      speedLevel: user.speedLevel,
      multiTapLevel: user.multiTapLevel,
      energyLimitLevel: user.energyLimitLevel,
      lastTapTime: user.lastTapTime,  // Include last tap time if needed
      currentTime: Date.now(),        // Optionally include current server time
    };

    res.status(200).json({ message: 'User status retrieved successfully', userStatus });
  } catch (error) {
    res.status(500).json({ message: 'Server error', error });
  }
};

const getAllUsers = async (req, res) => {
  try {
    const users = await User.find({}, 'username userId'); // Retrieve only username and userId fields
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

    // Check if it's a new day (in UTC)
    if (!lastCheckIn || now.getUTCDate() !== lastCheckIn.getUTCDate() || now.getUTCMonth() !== lastCheckIn.getUTCMonth() || now.getUTCFullYear() !== lastCheckIn.getUTCFullYear()) {
      // It's a new day, proceed with check-in
      let reward;

      if (!lastCheckIn || now - lastCheckIn > 24 * 60 * 60 * 1000) {
        // If it's the first check-in or more than 24 hours have passed, reset streak
        user.checkInStreak = 1;
        reward = 1000; // Day 1 reward
      } else {
        // Increment streak
        user.checkInStreak += 1;

        if (user.checkInStreak % 7 === 0) {
          // Every 7th day
          if (user.checkInStreak === 7) {
            reward = 25000; // Day 7
          } else {
            const weekNumber = Math.floor(user.checkInStreak / 7);
            if (weekNumber <= 5) {
              reward = 50000 * weekNumber; // Day 14, 21, 28, 35
            } else {
              reward = 250000; // Fixed at 250k from day 42 onwards
            }
          }
        } else {
          reward = 5000; // Standard daily reward
        }
      }

      user.lastCheckIn = now;
      user.checkInPoints += reward;

      await user.save();

      res.status(200).json({
        message: 'Daily check-in successful',
        checkInPointsEarned: reward,
        totalCheckInPoints: user.checkInPoints,
        streak: user.checkInStreak
      });
    } else {
      // User has already checked in today
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

    // Calculate the check-in value for today
    let todayCheckInValue;
    if (!canCheckInToday) {
      todayCheckInValue = 0; // Already checked in today
    } else if (!lastCheckIn || now - lastCheckIn > 24 * 60 * 60 * 1000) {
      todayCheckInValue = 1000; // First day or streak broken
    } else {
      const nextStreakDay = user.checkInStreak + 1;
      if (nextStreakDay % 7 === 0) {
        // Every 7th day
        if (nextStreakDay === 7) {
          todayCheckInValue = 25000;
        } else {
          const weekNumber = Math.floor(nextStreakDay / 7);
          if (weekNumber <= 5) {
            todayCheckInValue = 50000 * weekNumber;
          } else {
            todayCheckInValue = 250000;
          }
        }
      } else {
        todayCheckInValue = 5000; // Standard daily reward
      }
    }

    res.status(200).json({
      lastCheckIn: user.lastCheckIn,
      checkInStreak: user.checkInStreak,
      totalCheckInPoints: user.checkInPoints,
      canCheckInToday: canCheckInToday,
      todayCheckInValue: todayCheckInValue
    });
  } catch (error) {
    res.status(500).json({ message: 'Server error', error });
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
  getReferralDetails
};
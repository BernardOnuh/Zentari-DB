const User = require('../models/User');

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

    await newUser.save();

    res.status(201).json({ message: 'User registered successfully', user: newUser });
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


module.exports = {
  registerUser,
  upgradeLevel,
  handleTap,
  monitorUserStatus // Export the new function
};

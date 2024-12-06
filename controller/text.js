const calculatePendingPower = (user, now = Date.now()) => {
    if (!user.autoTapBot?.isActive) {
      return { pendingPower: 0, details: null };
    }
  
    const lastClaimed = user.autoTapBot.lastClaimed;
    const config = AUTO_TAP_BOT_CONFIG.levels[user.autoTapBot.level];
    
    // Calculate the mining start and end times
    const activationTime = new Date(user.autoTapBot.validUntil).getTime() - 
      (config.validityDays * 24 * 60 * 60 * 1000);
    const miningEndTime = activationTime + (config.duration * 60 * 60 * 1000);
  
    // If we're past the mining duration, use mining end time instead of current time
    const effectiveNow = Math.min(now, miningEndTime);
    
    // Only calculate for time within the mining period
    const timeElapsed = Math.max(0, Math.min(
      effectiveNow - lastClaimed,
      miningEndTime - lastClaimed
    ));
  
    const tapsPerSecond = user.speedLevel;
    const totalTaps = Math.floor((timeElapsed / 1000) * tapsPerSecond);
    const tapPower = user.getTapPower();
    
    return {
      pendingPower: totalTaps * tapPower,
      details: {
        timeElapsed: timeElapsed / 1000,
        totalTaps,
        powerPerTap: tapPower,
        energyUsed: Math.min(totalTaps, user.maxEnergy),
        botInfo: {
          level: user.autoTapBot.level,
          validUntil: user.autoTapBot.validUntil,
          lastClaimed: lastClaimed,
          duration: config.duration,
          isMining: now <= miningEndTime && now >= activationTime,
          miningEndTime: new Date(miningEndTime),
          timeRemaining: Math.max(0, (miningEndTime - now) / (1000 * 60)) // remaining minutes
        }
      }
    };
  };
  
  const getAutoBotEarnings = async (req, res) => {
    const { userId } = req.params;
  
    try {
      const user = await User.findOne({ userId });
      if (!user) return res.status(404).json({ message: 'User not found' });
  
      if (!user.autoTapBot?.isActive) {
        return res.status(400).json({ message: 'Auto tap bot is not active' });
      }
  
      const { pendingPower, details } = calculatePendingPower(user);
  
      if (pendingPower <= 0) {
        return res.status(400).json({
          message: 'No earnings to claim',
          details: details?.botInfo
        });
      }
  
      user.power += pendingPower;
      user.energy = Math.max(0, user.maxEnergy - details.energyUsed);
      user.autoTapBot.lastClaimed = new Date();
      user.statistics.totalTaps += details.totalTaps;
      user.statistics.totalPowerGenerated += pendingPower;
  
      await user.save();
  
      res.status(200).json({
        message: 'Auto bot earnings claimed successfully',
        earnings: {
          timeElapsed: details.timeElapsed,
          totalTaps: details.totalTaps,
          powerGained: pendingPower,
          energyUsed: details.energyUsed,
          currentStats: {
            energy: user.energy,
            power: user.power,
            totalTaps: user.statistics.totalTaps
          },
          botStatus: {
            ...details.botInfo,
            miningComplete: !details.botInfo.isMining && 
              new Date() >= details.botInfo.miningEndTime
          }
        }
      });
    } catch (error) {
      res.status(500).json({ message: 'Failed to claim earnings', error: error.message });
    }
  };
  
  const activateAutoTapBot = async (req, res) => {
    const { userId, level = 'free', paymentValidated = false } = req.body;
  
    try {
      const user = await User.findOne({ userId });
      if (!user) return res.status(404).json({ message: 'User not found' });
  
      const now = new Date();
      
      // Check if current bot is still mining
      if (user.autoTapBot?.isActive) {
        const { details } = calculatePendingPower(user, now.getTime());
        if (details?.botInfo.isMining) {
          return res.status(400).json({ 
            message: 'Auto tap bot is currently active and mining',
            currentBot: {
              level: user.autoTapBot.level,
              timeRemaining: details.botInfo.timeRemaining,
              miningEndTime: details.botInfo.miningEndTime
            }
          });
        }
      }
  
      if (level !== 'free' && !paymentValidated) {
        return res.status(400).json({ message: 'Payment not validated' });
      }
  
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
  
      // Claim any pending rewards from previous bot
      if (user.autoTapBot?.isActive) {
        const { pendingPower, details } = calculatePendingPower(user, now.getTime());
        if (pendingPower > 0) {
          user.power += pendingPower;
          user.statistics.totalTaps += details.totalTaps;
          user.statistics.totalPowerGenerated += pendingPower;
        }
      }
  
      // Set up new bot with proper duration tracking
      user.autoTapBot = {
        level,
        validUntil: new Date(now.getTime() + (botConfig.validityDays * 24 * 60 * 60 * 1000)),
        lastClaimed: now,
        isActive: true
      };
  
      await user.save();
  
      // Calculate actual mining end time
      const miningEndTime = new Date(now.getTime() + (botConfig.duration * 60 * 60 * 1000));
  
      res.status(200).json({
        message: 'Auto tap bot activated successfully',
        botStatus: {
          ...user.autoTapBot.toObject(),
          config: botConfig,
          miningDuration: botConfig.duration * 60 * 60 * 1000,
          miningEndTime,
          timeRemaining: botConfig.duration * 60 // in minutes
        },
        stars: user.stars
      });
    } catch (error) {
      res.status(500).json({ message: 'Activation failed', error: error.message });
    }
  };
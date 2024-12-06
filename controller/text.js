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
  
    // Calculate remaining time
    const remainingMillis = Math.max(0, miningEndTime - now);
    const remainingMinutes = Math.floor(remainingMillis / (60 * 1000));
    const remainingSeconds = Math.floor((remainingMillis % (60 * 1000)) / 1000);
  
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
          remainingTime: {
            minutes: remainingMinutes,
            seconds: remainingSeconds,
            total: {
              minutes: Math.floor(remainingMillis / (60 * 1000)),
              seconds: Math.floor(remainingMillis / 1000)
            }
          }
        }
      }
    };
  };
  
  const getAutoBotStatus = async (req, res) => {
    const { userId } = req.params;
    try {
      const user = await User.findOne({ userId });
      if (!user) return res.status(404).json({ message: 'User not found' });
  
      if (!user.autoTapBot?.isActive) {
        return res.status(200).json({
          isActive: false,
          availableLevels: Object.entries(AUTO_TAP_BOT_CONFIG.levels).map(([level, config]) => ({
            level,
            starCost: config.starCost,
            duration: config.duration,
            validityDays: config.validityDays
          }))
        });
      }
  
      const { pendingPower, details } = calculatePendingPower(user);
  
      res.status(200).json({
        botStatus: {
          isActive: true,
          level: user.autoTapBot.level,
          validUntil: user.autoTapBot.validUntil,
          lastClaimed: user.autoTapBot.lastClaimed,
          pendingPower,
          canClaim: pendingPower > 0,
          remainingTime: details.botInfo.remainingTime,
          isMining: details.botInfo.isMining,
          miningEndTime: details.botInfo.miningEndTime,
          ...details
        }
      });
    } catch (error) {
      res.status(500).json({ message: 'Server error', error: error.message });
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
  
      const { pendingPower, details } = calculatePendingPower(user);
  
      if (pendingPower <= 0) {
        return res.status(400).json({
          message: 'No earnings to claim',
          details: {
            ...details?.botInfo,
            remainingTime: details?.botInfo.remainingTime
          }
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
            miningComplete: !details.botInfo.isMining,
            remainingTime: details.botInfo.remainingTime
          }
        }
      });
    } catch (error) {
      res.status(500).json({ message: 'Failed to claim earnings', error: error.message });
    }
  };
const calculatePendingPower = (user, now = Date.now()) => {
    if (!user.autoTapBot?.isActive) {
      return { pendingPower: 0, details: null };
    }
  
    const lastClaimed = user.autoTapBot.lastClaimed;
    const config = AUTO_TAP_BOT_CONFIG.levels[user.autoTapBot.level];
    
    // For free package, use 2-hour window from activation
    let miningEndTime;
    if (user.autoTapBot.level === 'free') {
      miningEndTime = new Date(user.autoTapBot.lastClaimed.getTime() + (2 * 60 * 60 * 1000)); // 2 hours from activation
    } else {
      // For paid packages, use daily window until midnight
      const todayStart = new Date(now);
      todayStart.setHours(0, 0, 0, 0);
      miningEndTime = new Date(todayStart.getTime() + (24 * 60 * 60 * 1000) - 1); // Until 23:59:59
    }
  
    // Calculate remaining time
    const remainingMillis = Math.max(0, miningEndTime - now);
    const remainingMinutes = Math.floor(remainingMillis / (60 * 1000));
    const remainingSeconds = Math.floor((remainingMillis % (60 * 1000)) / 1000);
  
    const effectiveNow = Math.min(now, miningEndTime);
    const miningStart = Math.max(lastClaimed, user.autoTapBot.lastClaimed.getTime());
    
    const timeElapsed = Math.max(0, effectiveNow - miningStart);
    const tapsPerSecond = user.speedLevel;
    const totalTaps = Math.floor((timeElapsed / 1000) * tapsPerSecond);
    const tapPower = user.getTapPower();
    
    const isMiningComplete = now > miningEndTime;
    
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
          isMining: now <= miningEndTime,
          miningComplete: isMiningComplete,
          canClaim: isMiningComplete || now <= miningEndTime,
          miningStartTime: new Date(miningStart),
          miningEndTime,
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
  
  const activateAutoTapBot = async (req, res) => {
    const { userId, level = 'free' } = req.body;
  
    try {
      const user = await User.findOne({ userId });
      if (!user) return res.status(404).json({ message: 'User not found' });
  
      const now = new Date();
  
      // Check if any bot tier is currently active within its validity period
      if (user.autoTapBot?.isActive && now < user.autoTapBot.validUntil) {
        return res.status(400).json({
          message: 'Another bot tier is currently active',
          currentBot: {
            level: user.autoTapBot.level,
            validUntil: user.autoTapBot.validUntil,
            timeRemaining: {
              milliseconds: user.autoTapBot.validUntil - now,
              hours: Math.floor((user.autoTapBot.validUntil - now) / (1000 * 60 * 60)),
              minutes: Math.floor((user.autoTapBot.validUntil - now) / (1000 * 60) % 60),
              seconds: Math.floor((user.autoTapBot.validUntil - now) / 1000 % 60)
            }
          },
          nextActivationTime: user.autoTapBot.validUntil
        });
      }
  
      const botConfig = AUTO_TAP_BOT_CONFIG.levels[level];
      if (!botConfig) {
        return res.status(400).json({ 
          message: 'Invalid bot level',
          availableLevels: Object.keys(AUTO_TAP_BOT_CONFIG.levels)
        });
      }
  
      // Set validity period based on tier
      const validityDays = level === 'free' ? 1 : 7;
      
      // Set up new bot
      user.autoTapBot = {
        level,
        validUntil: new Date(now.getTime() + (validityDays * 24 * 60 * 60 * 1000)),
        lastClaimed: now,
        isActive: true
      };
  
      await user.save();
  
      // Calculate mining end time based on tier
      const miningEndTime = level === 'free' ? 
        new Date(now.getTime() + (2 * 60 * 60 * 1000)) : // 2 hours for free
        new Date(now.setHours(23, 59, 59, 999)); // Until midnight for paid tiers
  
      const remainingMillis = miningEndTime.getTime() - now.getTime();
  
      res.status(200).json({
        message: 'Auto tap bot activated successfully',
        botStatus: {
          level,
          validUntil: user.autoTapBot.validUntil,
          lastClaimed: user.autoTapBot.lastClaimed,
          isActive: true,
          miningEndTime,
          config: {
            dailyHours: botConfig.duration,
            validityDays,
            starCost: botConfig.starCost
          },
          remainingTime: {
            minutes: Math.floor(remainingMillis / (60 * 1000)),
            seconds: Math.floor(remainingMillis / 1000),
            total: {
              minutes: Math.floor(remainingMillis / (60 * 1000)),
              seconds: Math.floor(remainingMillis / 1000)
            }
          }
        }
      });
    } catch (error) {
      res.status(500).json({ message: 'Activation failed', error: error.message });
    }
  };
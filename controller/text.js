const calculatePendingPower = (user, now = Date.now()) => {
    const lastClaimed = user.autoTapBot?.lastClaimed || user.autoTapBot?.validUntil;
    const config = AUTO_TAP_BOT_CONFIG.levels[user.autoTapBot?.level || 'free'];
    const botStartTime = user.autoTapBot?.validUntil - (config.duration * 60 * 60 * 1000);
    
    // Calculate the actual mining end time
    const miningEndTime = Math.min(
      botStartTime + (config.duration * 60 * 60 * 1000),
      now
    );
  
    // Only calculate power for the duration the bot was actually mining
    const timeElapsed = Math.max(0, Math.min(
      miningEndTime - lastClaimed,
      config.duration * 60 * 60 * 1000
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
          level: user.autoTapBot?.level || 'free',
          validUntil: user.autoTapBot?.validUntil,
          lastClaimed: lastClaimed,
          duration: config.duration,
          isMining: now < user.autoTapBot?.validUntil && 
                   now >= botStartTime
        }
      }
    };
  };
  
  const activateAutoTapBot = async (req, res) => {
    const { userId, level = 'free', paymentValidated = false } = req.body;
  
    try {
      const user = await User.findOne({ userId });
      if (!user) return res.status(404).json({ message: 'User not found' });
  
      if (user.autoTapBot?.isActive) {
        const now = Date.now();
        const currentBotConfig = AUTO_TAP_BOT_CONFIG.levels[user.autoTapBot.level];
        const botStartTime = user.autoTapBot.validUntil - (currentBotConfig.duration * 60 * 60 * 1000);
        
        // Check if current bot is still mining
        if (now < user.autoTapBot.validUntil && now >= botStartTime) {
          return res.status(400).json({ 
            message: 'Auto tap bot is currently active and mining',
            currentBot: {
              level: user.autoTapBot.level,
              validUntil: user.autoTapBot.validUntil,
              timeRemaining: (user.autoTapBot.validUntil - now) / (60 * 60 * 1000)
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
  
      // If there's a previous bot with unclaimed rewards, claim them first
      if (user.autoTapBot?.isActive) {
        const { pendingPower, details } = calculatePendingPower(user);
        if (pendingPower > 0) {
          user.power += pendingPower;
          user.statistics.totalTaps += details.totalTaps;
          user.statistics.totalPowerGenerated += pendingPower;
        }
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
        botStatus: {
          ...user.autoTapBot.toObject(),
          config: botConfig,
          miningDuration: botConfig.duration * 60 * 60 * 1000
        },
        stars: user.stars
      });
    } catch (error) {
      res.status(500).json({ message: 'Activation failed', error: error.message });
    }
  };
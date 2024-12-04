const express = require('express');
const router = express.Router();

// Import controllers
const {
  registerUser,
  handleTap,
  upgradeLevel,
  monitorUserStatus,
  activateAutoTapBot,
  getAutoBotEarnings,
  getAutoBotStatus,
  performDailyCheckIn,
  getCheckInStatus,
  getReferralDetails,
  getReferralRewardStatus,
  claimReferralReward,
  getAllUsers,
  getUserStatistics,
  getUserAchievements,
  getPowerLeaderboard,
  getReferralLeaderboard,
  getEnergyStatus,
  refillEnergy
} = require('../controllers/userController');

const {
  getTasksForUser,
  getAllTasks,
  getTaskById,
  createTask,
  updateTask,
  deleteTask,
  createMultipleTasks,
  getCompletedTasks,
  completeTask
} = require('../controllers/taskController');

const taskCompletionController = require('../controllers/taskCompletionController');

// ============ USER ROUTES ============

// Registration and Basic User Management
router.post('/register', registerUser);
router.get('/users', getAllUsers);
router.get('/status/:userId', monitorUserStatus);

// Game Mechanics
router.put('/upgrade', upgradeLevel);
router.put('/tap', handleTap);

// Energy System
router.get('/energy/status/:userId', getEnergyStatus);
router.post('/energy/refill/:userId', refillEnergy);

// Auto Tap Bot Management
router.post('/autobot/activate', activateAutoTapBot);
router.get('/autobot/status/:userId', getAutoBotStatus);
router.get('/autobot/earnings/:userId', getAutoBotEarnings);

// Check-in System
router.post('/check-in', performDailyCheckIn);
router.get('/check-in/:userId', getCheckInStatus);

// Referral System
router.get('/referral-details/:userId', getReferralDetails);
router.get('/referral-reward-status/:userId', getReferralRewardStatus);
router.post('/claim-referral-reward', claimReferralReward);

// Progress and Statistics
router.get('/stats/:userId', getUserStatistics);
router.get('/achievements/:userId', getUserAchievements);

// Leaderboards
router.get('/leaderboard/power', getPowerLeaderboard);
router.get('/leaderboard/referrals', getReferralLeaderboard);

// ============ TASK ROUTES ============

// Task Management
router.get('/tasks', getAllTasks);
router.post('/task', createTask);
router.post('/tasks', createMultipleTasks);
router.get('/task/:taskId', getTaskById);
router.put('/task/:taskId', updateTask);
router.delete('/task/:taskId', deleteTask);

// User-specific Task Routes
router.get('/tasks/:username', getTasksForUser);
router.get('/tasks/completed/:username', getCompletedTasks);

// Task Completion
router.post('/complete/:telegramUserId/:taskId', completeTask);
router.post('/tasks/:taskId/complete/:telegramUserId', taskCompletionController.initiateTaskCompletion);
router.get('/tasks/:taskId/completion-status/:telegramUserId', taskCompletionController.checkTaskCompletion);

module.exports = router;
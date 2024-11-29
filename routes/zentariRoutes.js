const express = require('express');
const router = express.Router();

// Import controllers
const {
  registerUser,
  upgradeLevel,
  handleTap,
  monitorUserStatus,
  getAllUsers,
  performDailyCheckIn,
  getCheckInStatus,
  getReferralDetails,
  getReferralRewardStatus,
  claimReferralReward,
  getAutoBotEarnings
} = require('../controller/userController');

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
} = require('../controller/taskController');

const taskCompletionController = require('../controller/taskCompletionController');

// ============ USER ROUTES ============

// Registration and Basic User Management
router.post('/register', registerUser);
router.get('/users', getAllUsers);
router.get('/status/:userId', monitorUserStatus);
router.get('/autobot/earnings/:userId', getAutoBotEarnings);

// Game Mechanics
router.put('/upgrade', upgradeLevel);
router.put('/tap', handleTap);

// Check-in System
router.post('/check-in', performDailyCheckIn);
router.get('/check-in/:userId', getCheckInStatus);

// Referral System
router.get('/referral-details/:userId', getReferralDetails);
router.get('/referral-reward-status/:userId', getReferralRewardStatus);
router.post('/claim-referral-reward', claimReferralReward);

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
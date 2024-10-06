const express = require('express');
const router = express.Router();
const {
  registerUser,
  upgradeLevel,
  handleTap,
  monitorUserStatus,
  getAllUsers
} = require('../controller/userController');

const {
  getTasksForUser,
  getTaskById,
  createTask,
  updateTask,
  deleteTask,
  createMultipleTasks,
  getCompletedTasks,
  completeTask
} = require('../controller/taskController');

// USER ROUTES

// POST: Register a new user
router.post('/register', registerUser);

// PUT: Upgrade speed, multitap, or energy limit level
router.put('/upgrade', upgradeLevel);

// PUT: Handle tapping (consume energy and increase power)
router.put('/tap', handleTap);

// GET: Monitor user status by userId
router.get('/status/:userId', monitorUserStatus);

// GET: Fetch all users with their userId
router.get('/users', getAllUsers);


// TASK ROUTES

// GET: Get all tasks for a specific user (excluding completed tasks)
router.get('/tasks/:username', getTasksForUser);

// GET: Get a specific task by its ID
router.get('/task/:taskId', getTaskById);

// POST: Create a new task
router.post('/task', createTask);

// PUT: Update a specific task by its ID
router.put('/task/:taskId', updateTask);

// DELETE: Delete a task by its ID
router.delete('/task/:taskId', deleteTask);

// POST: Create multiple tasks
router.post('/tasks', createMultipleTasks);

// GET: Get all completed tasks for a specific user
router.get('/tasks/completed/:username', getCompletedTasks);

router.post('/complete/:telegramUserId/:taskId', completeTask);

module.exports = router;

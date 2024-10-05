const express = require('express');
const router = express.Router();
const {
  registerUser,
  upgradeLevel,
  handleTap,
  monitorUserStatus
} = require('../controller/userController');

const {
  getTasksForUser,
  getTaskById,
  createTask,
  updateTask,
  deleteTask,
  createMultipleTasks,
  getCompletedTasks
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
router.get('/tasks/completed/:userId', getCompletedTasks);

module.exports = router;

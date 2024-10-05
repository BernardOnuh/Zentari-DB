// taskController.js
const Task = require('../models/Task');
const User = require('../models/User');

// Get all tasks for a specific user (excluding completed ones)
exports.getTasksForUser = async (req, res) => {
  try {
    const { username } = req.params;

    // Find the user by username
    const user = await User.findOne({ username });

    if (!user) {
      return res.status(404).json({ message: 'User not found' });
    }

    // Find tasks that are active and not completed by the user
    const tasks = await Task.find({
      isActive: true,
      _id: { $nin: user.tasksCompleted }, // Exclude tasks that are completed by the user
    });

    res.json(tasks);
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
};

// Create a new task
exports.createTask = async (req, res) => {
  try {
    const { topic, description, imageUrl, power, expiresAt, completionDelay, link } = req.body;

    const newTask = new Task({
      topic,
      description,
      imageUrl,
      power,
      expiresAt,
      completionDelay,
      link
    });

    await newTask.save();
    res.status(201).json(newTask);
  } catch (error) {
    res.status(400).json({ message: error.message });
  }
};

exports.getCompletedTasks = async (req, res) => {
  try {
    const { userId } = req.params;
    const user = await User.findById(userId).populate('tasksCompleted');
    
    if (!user) {
      return res.status(404).json({ message: 'User not found' });
    }

    res.json(user.tasksCompleted);
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
};

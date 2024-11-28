// controllers/taskCompletionController.js
const Task = require('../models/Task');
const User = require('../models/User');
const PendingCompletion = require('../models/PendingCompletion');
const mongoose = require('mongoose');

async function processTaskCompletion(telegramUserId, taskId, pendingCompletion) {
  const session = await mongoose.startSession();
  session.startTransaction();

  try {
    const user = await User.findOne({ userId: telegramUserId }).session(session);
    const task = await Task.findById(taskId).session(session);

    if (!user || !task) {
      throw new Error('User or task not found');
    }

    user.tasksCompleted.push(taskId);
    user.power += task.power;
    await user.save({ session });

    pendingCompletion.isProcessed = true;
    await pendingCompletion.save({ session });

    await session.commitTransaction();
  } catch (error) {
    await session.abortTransaction();
    throw error;
  } finally {
    session.endSession();
  }
}

exports.initiateTaskCompletion = async (req, res) => {
  try {
    const { telegramUserId, taskId } = req.params;

    if (!mongoose.Types.ObjectId.isValid(taskId)) {
      return res.status(400).json({ success: false, message: 'Invalid task ID' });
    }

    const user = await User.findOne({ userId: telegramUserId });
    if (!user) {
      return res.status(404).json({ success: false, message: 'User not found' });
    }

    const task = await Task.findById(taskId);
    if (!task) {
      return res.status(404).json({ success: false, message: 'Task not found' });
    }

    if (user.tasksCompleted.includes(taskId)) {
      return res.status(400).json({ success: false, message: 'Task already completed by this user' });
    }

    const existingPending = await PendingCompletion.findOne({
      taskId,
      userId: telegramUserId,
      isProcessed: false
    });

    if (existingPending) {
      return res.status(400).json({ 
        success: false, 
        message: 'Task completion already in progress',
        completionTime: existingPending.completionTime
      });
    }

    const completionTime = new Date(Date.now() + (task.completionDelay * 1000));

    const pendingCompletion = new PendingCompletion({
      taskId,
      userId: telegramUserId,
      completionTime
    });

    await pendingCompletion.save();

    res.json({ 
      success: true, 
      message: 'Task completion initiated',
      completionTime,
      delaySeconds: task.completionDelay
    });

  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
};

exports.checkTaskCompletion = async (req, res) => {
  try {
    const { telegramUserId, taskId } = req.params;

    const pendingCompletion = await PendingCompletion.findOne({
      taskId,
      userId: telegramUserId,
      isProcessed: false
    });

    if (!pendingCompletion) {
      return res.status(404).json({ 
        success: false, 
        message: 'No pending completion found' 
      });
    }

    const now = new Date();
    const isComplete = now >= pendingCompletion.completionTime;

    if (isComplete) {
      await processTaskCompletion(telegramUserId, taskId, pendingCompletion);
      return res.json({ 
        success: true, 
        message: 'Task completed successfully',
        isComplete: true
      });
    }

    return res.json({
      success: true,
      isComplete: false,
      remainingTime: pendingCompletion.completionTime - now,
      completionTime: pendingCompletion.completionTime
    });

  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
};

exports.cleanupPendingCompletions = async () => {
  try {
    const expiredTime = new Date(Date.now() - (24 * 60 * 60 * 1000));
    await PendingCompletion.deleteMany({
      completionTime: { $lt: expiredTime },
      isProcessed: true
    });
  } catch (error) {
    console.error('Error cleaning up pending completions:', error);
  }
};

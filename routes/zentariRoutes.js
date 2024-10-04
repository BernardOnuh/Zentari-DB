const express = require('express');
const router = express.Router();
const {
  registerUser,
  upgradeLevel,
  handleTap,
  monitorUserStatus
} = require('../controller/userController');

// POST: Register a new user
router.post('/register', registerUser);

// PUT: Upgrade speed, multitap, or energy limit level
router.put('/upgrade', upgradeLevel);

// PUT: Handle tapping (consume energy and increase power)
router.put('/tap', handleTap);

router.get('/status/:userId', monitorUserStatus); 


module.exports = router;

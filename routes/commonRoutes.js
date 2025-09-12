const express = require('express');
const router = express.Router();
const validateMiddleware = require('../utils/validate');
const { authenticate } = require('../middleware/authMiddleware');
const { getImageUrl } = require('../controllers/commonController');

router.post('/pre-signed-url',authenticate, getImageUrl);


module.exports = router;

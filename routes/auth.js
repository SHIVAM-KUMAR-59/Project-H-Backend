const express = require('express');
const router = express.Router();

const login = require('../controllers/auth/login');
const resendOTP = require('../utils/auth/resendOTP');
const verifyOtp = require('../utils/auth/verifyOTP');
const google = require('../controllers/auth/google');
const github = require('../controllers/auth/github');
const register = require('../controllers/auth/register');
const { requireAuth } = require('@clerk/clerk-sdk-node'); // Clerk's middleware
const refreshToken = require('../controllers/auth/refreshToken');
const forgetPassword = require('../controllers/auth/forgetPassword');
const changePassword = require('../controllers/auth/changePassword');

router.post('/register', register);
router.post('/verify-otp', verifyOtp);
router.post('/resent-otp', resendOTP);
router.post('/login', login);
router.post('/refresh-token', refreshToken);
router.post('/google', google);
router.post('/github', github);
router.post('/forgot-password', forgetPassword);

// Protect the reset-password route with Clerk's requireAuth middleware
router.post('/reset-password', requireAuth, changePassword);

module.exports = router;

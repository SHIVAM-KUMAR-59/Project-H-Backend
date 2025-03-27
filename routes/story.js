const express = require('express');
const storyRouter = express.Router();
const { verifyClerkToken } = require('../middleware/clerk/verifyToken');

// Import controllers
const createStory = require('../controllers/story/createStory');
const getStories = require('../controllers/story/getStories');
const interactWithStory = require('../controllers/story/interactWithStory');
const deleteStory = require('../controllers/story/deleteStory');

// Protected routes - require authentication
storyRouter.use(verifyClerkToken);

// Story routes - note these are relative to /api/stories
storyRouter.get('/feed', getStories);
storyRouter.post('/create', createStory);
storyRouter.post('/:id/interact', interactWithStory);
storyRouter.delete('/:id', deleteStory);

// Log the available routes on startup
console.log('📋 Story routes mounted:');
console.log('- GET /api/stories/feed');
console.log('- POST /api/stories/create');
console.log('- POST /api/stories/:id/interact');
console.log('- DELETE /api/stories/:id');

module.exports = storyRouter; 
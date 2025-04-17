const express = require('express');
const router = express.Router();
const multer = require('multer');
const path = require('path');
const fs = require('fs');
const { v4: uuidv4 } = require('uuid');
const { requireAuth } = require('../middleware/authMiddleware');

// Ensure uploads directory exists
const uploadDir = path.join(__dirname, '../public/uploads');
if (!fs.existsSync(uploadDir)) {
  fs.mkdirSync(uploadDir, { recursive: true });
}

// Configure storage
const storage = multer.diskStorage({
  destination: function (req, file, cb) {
    cb(null, uploadDir);
  },
  filename: function (req, file, cb) {
    // Create a unique filename with original extension
    const fileExt = path.extname(file.originalname);
    const fileName = `${uuidv4()}${fileExt}`;
    cb(null, fileName);
  }
});

// File filter function
const fileFilter = (req, file, cb) => {
  // Allow common file types
  const allowedTypes = [
    // Images
    'image/jpeg', 'image/png', 'image/gif', 'image/webp',
    // Documents
    'application/pdf', 'application/msword', 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
    'application/vnd.ms-excel', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
    'application/vnd.ms-powerpoint', 'application/vnd.openxmlformats-officedocument.presentationml.presentation',
    'text/plain', 'text/csv',
    // Archives
    'application/zip', 'application/x-rar-compressed', 'application/x-7z-compressed',
    // Audio
    'audio/mpeg', 'audio/wav', 'audio/ogg',
    // Video
    'video/mp4', 'video/quicktime', 'video/x-msvideo'
  ];
  
  if (allowedTypes.includes(file.mimetype)) {
    cb(null, true);
  } else {
    cb(new Error('Invalid file type. Only images, documents, archives, audio, and video files are allowed.'), false);
  }
};

// Configure upload middleware
const upload = multer({ 
  storage: storage,
  fileFilter: fileFilter,
  limits: {
    fileSize: 50 * 1024 * 1024 // Increased to 50MB max file size
  }
});

// Custom error handling middleware for multer
const handleMulterError = (err, req, res, next) => {
  if (err instanceof multer.MulterError) {
    if (err.code === 'LIMIT_FILE_SIZE') {
      return res.status(413).json({
        success: false,
        message: 'File too large (max 50MB)',
        error: 'LIMIT_FILE_SIZE'
      });
    }
    return res.status(400).json({
      success: false,
      message: `Upload error: ${err.message}`,
      error: err.code
    });
  }
  next(err);
};

/**
 * @route POST /api/uploads
 * @desc Upload a file
 * @access Private
 */
router.post('/', requireAuth, upload.single('file'), handleMulterError, (req, res) => {
  try {
    if (!req.file) {
      return res.status(400).json({
        success: false,
        message: 'No file uploaded'
      });
    }
    
    // Get file type from request body or determine from MIME type
    const fileType = req.body.type || getFileTypeFromMime(req.file.mimetype);
    
    // Create file URL
    const baseUrl = process.env.SERVER_URL || 'http://192.168.1.13:5001';
    const fileUrl = `${baseUrl}/uploads/${req.file.filename}`;
    
    return res.status(201).json({
      success: true,
      message: 'File uploaded successfully',
      fileUrl,
      fileName: req.file.originalname,
      fileSize: req.file.size,
      fileType
    });
  } catch (error) {
    console.error('Error uploading file:', error);
    return res.status(500).json({
      success: false,
      message: 'Server error during file upload',
      error: error.message
    });
  }
});

// Helper function to determine file type from MIME type
function getFileTypeFromMime(mimeType) {
  if (mimeType.startsWith('image/')) return 'image';
  if (mimeType.startsWith('video/')) return 'video';
  if (mimeType.startsWith('audio/')) return 'audio';
  return 'file';
}

// Store chunks in memory temporarily (for production, use a more robust solution)
const chunkStore = new Map();

/**
 * @route POST /api/uploads/chunks
 * @desc Upload a file chunk
 * @access Private
 */
router.post('/chunks', requireAuth, (req, res) => {
  try {
    const upload = multer({
      storage: multer.memoryStorage(), // Store in memory
      limits: {
        fileSize: 5 * 1024 * 1024 // 5MB limit per chunk
      }
    }).single('chunk');

    upload(req, res, (err) => {
      if (err) {
        console.error('Error uploading chunk:', err);
        return res.status(400).json({
          success: false,
          message: 'Error uploading chunk',
          error: err.message
        });
      }

      // Make sure we have a file
      if (!req.file) {
        return res.status(400).json({
          success: false,
          message: 'No chunk uploaded'
        });
      }

      // Get chunk metadata
      const uploadId = req.body.uploadId;
      const chunkIndex = parseInt(req.body.chunkIndex);
      const totalChunks = parseInt(req.body.totalChunks);
      const fileName = req.body.fileName;
      
      if (!uploadId || isNaN(chunkIndex) || isNaN(totalChunks)) {
        return res.status(400).json({
          success: false,
          message: 'Invalid chunk metadata'
        });
      }

      // Store the chunk
      if (!chunkStore.has(uploadId)) {
        chunkStore.set(uploadId, new Map());
      }
      
      const fileChunks = chunkStore.get(uploadId);
      fileChunks.set(chunkIndex, {
        data: req.file.buffer,
        originalName: fileName,
        mimeType: req.file.mimetype
      });

      // Return success
      return res.status(200).json({
        success: true,
        message: `Chunk ${chunkIndex + 1}/${totalChunks} uploaded`,
        chunkIndex,
        totalChunks,
        uploadId
      });
    });
  } catch (error) {
    console.error('Error uploading chunk:', error);
    return res.status(500).json({
      success: false,
      message: 'Server error during chunk upload',
      error: error.message
    });
  }
});

/**
 * @route POST /api/uploads/chunks/complete
 * @desc Complete a chunked upload by reassembling the chunks
 * @access Private
 */
router.post('/chunks/complete', requireAuth, async (req, res) => {
  try {
    const { uploadId, fileName, totalChunks, type } = req.body;
    
    if (!uploadId || !fileName || !totalChunks) {
      return res.status(400).json({
        success: false,
        message: 'Invalid completion request'
      });
    }
    
    // Check if we have all chunks
    if (!chunkStore.has(uploadId)) {
      return res.status(404).json({
        success: false,
        message: 'Upload ID not found'
      });
    }
    
    const fileChunks = chunkStore.get(uploadId);
    if (fileChunks.size !== totalChunks) {
      return res.status(400).json({
        success: false,
        message: `Missing chunks. Expected ${totalChunks}, got ${fileChunks.size}`
      });
    }
    
    // Create file from chunks
    const chunkBuffers = [];
    for (let i = 0; i < totalChunks; i++) {
      const chunk = fileChunks.get(i);
      if (!chunk) {
        return res.status(400).json({
          success: false,
          message: `Missing chunk ${i}`
        });
      }
      chunkBuffers.push(chunk.data);
    }
    
    // Concatenate buffers
    const fileBuffer = Buffer.concat(chunkBuffers);
    
    // Create unique filename
    const fileExt = path.extname(fileName);
    const uniqueFileName = `${uuidv4()}${fileExt}`;
    const filePath = path.join(uploadDir, uniqueFileName);
    
    // Write the file
    fs.writeFileSync(filePath, fileBuffer);
    
    // Create file URL
    const baseUrl = process.env.SERVER_URL || 'http://192.168.1.5:5001';
    const fileUrl = `${baseUrl}/uploads/${uniqueFileName}`;
    
    // Clean up chunks
    chunkStore.delete(uploadId);
    
    // Return the file URL
    return res.status(201).json({
      success: true,
      message: 'File upload completed successfully',
      fileUrl,
      fileName,
      fileSize: fileBuffer.length,
      fileType: type || 'file'
    });
  } catch (error) {
    console.error('Error completing chunked upload:', error);
    return res.status(500).json({
      success: false,
      message: 'Server error during chunk completion',
      error: error.message
    });
  }
});

module.exports = router; 
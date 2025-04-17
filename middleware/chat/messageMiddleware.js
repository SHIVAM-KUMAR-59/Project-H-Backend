/**
 * Middleware for handling chat message requests
 */

/**
 * Normalizes attachment URLs to ensure they use the correct IP address
 */
const normalizeAttachmentUrls = (req, res, next) => {
  if (req.body && req.body.attachments && Array.isArray(req.body.attachments)) {
    console.log('CRITICAL DEBUG: Processing attachments in middleware');
    
    // Don't modify the IP addresses since 192.168.1.13 is the correct one
    // Just remove the uri field which shouldn't be stored on the server
    
    req.body.attachments = req.body.attachments.map(attachment => {
      // Log the URL before any modification
      if (attachment.url) {
        console.log(`CRITICAL DEBUG: Original URL before middleware: ${attachment.url}`);
      }
      
      // Create a new object without the 'uri' field
      const { uri, uploading, progress, ...cleanedAttachment } = attachment;
      
      // Log the URL to ensure it hasn't changed
      if (cleanedAttachment.url) {
        console.log(`CRITICAL DEBUG: Final URL after middleware: ${cleanedAttachment.url}`);
      }
      
      // Return the cleaned attachment (without uri, uploading, progress)
      return cleanedAttachment;
    });
    
    console.log('Normalized attachments:', req.body.attachments);
  }
  next();
};

/**
 * Makes text optional when attachments are present
 */
const validateMessageContent = (req, res, next) => {
  // If text is undefined, set it to empty string
  if (req.body.text === undefined) {
    req.body.text = '';
  }
  
  // Ensure there's either text or attachments
  const hasText = req.body.text && req.body.text.trim().length > 0;
  const hasAttachments = req.body.attachments && Array.isArray(req.body.attachments) && req.body.attachments.length > 0;
  
  if (!hasText && !hasAttachments) {
    return res.status(400).json({ 
      error: 'Message must have either text or attachments' 
    });
  }
  
  next();
};

module.exports = {
  normalizeAttachmentUrls,
  validateMessageContent
}; 
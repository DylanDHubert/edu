import DOMPurify from 'dompurify';
import { JSDOM } from 'jsdom';

// CREATE A WINDOW OBJECT FOR DOMPURIFY IN SERVER-SIDE ENVIRONMENT
const window = new JSDOM('').window;
const purify = DOMPurify(window as any);

/**
 * SANITIZE USER INPUT TO PREVENT XSS ATTACKS
 * @param input - The user input to sanitize
 * @returns Sanitized HTML string
 */
export function sanitizeInput(input: string): string {
  if (!input || typeof input !== 'string') {
    return '';
  }
  
  // TRIM WHITESPACE AND SANITIZE HTML
  return purify.sanitize(input.trim(), {
    ALLOWED_TAGS: ['b', 'i', 'em', 'strong', 'p', 'br'],
    ALLOWED_ATTR: []
  });
}

/**
 * SANITIZE PLAIN TEXT INPUT (NO HTML TAGS ALLOWED)
 * @param input - The user input to sanitize
 * @returns Sanitized plain text string
 */
export function sanitizePlainText(input: string): string {
  if (!input || typeof input !== 'string') {
    return '';
  }
  
  // TRIM WHITESPACE AND REMOVE ALL HTML TAGS
  return purify.sanitize(input.trim(), {
    ALLOWED_TAGS: [],
    ALLOWED_ATTR: []
  });
}

/**
 * VALIDATE AND SANITIZE EMAIL ADDRESS
 * @param email - Email address to validate
 * @returns Sanitized email or empty string if invalid
 */
export function sanitizeEmail(email: string): string {
  if (!email || typeof email !== 'string') {
    return '';
  }
  
  const sanitized = email.trim().toLowerCase();
  const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
  
  return emailRegex.test(sanitized) ? sanitized : '';
}

/**
 * VALIDATE REQUIRED ENVIRONMENT VARIABLES
 * @param requiredVars - Array of required environment variable names
 * @throws Error if any required variables are missing
 */
export function validateEnvironmentVariables(requiredVars: string[]): void {
  const missing: string[] = [];
  
  requiredVars.forEach(envVar => {
    if (!process.env[envVar]) {
      missing.push(envVar);
    }
  });
  
  if (missing.length > 0) {
    throw new Error(`Missing required environment variables: ${missing.join(', ')}`);
  }
}

/**
 * VALIDATE FILE CONTENT TYPE
 * @param buffer - File buffer to validate
 * @param expectedMimeType - Expected MIME type
 * @returns Promise<boolean> - True if file type matches expected type
 */
export async function validateFileContent(buffer: Buffer, expectedMimeType: string): Promise<boolean> {
  try {
    const { fileTypeFromBuffer } = await import('file-type');
    const fileType = await fileTypeFromBuffer(buffer);
    
    return fileType?.mime === expectedMimeType;
  } catch (error) {
    console.error('Error validating file content:', error);
    return false;
  }
}

/**
 * VALIDATE MARKDOWN FILE CONTENT
 * @param buffer - File buffer to validate
 * @returns Promise<boolean> - True if content appears to be valid markdown
 */
export async function validateMarkdownContent(buffer: Buffer): Promise<boolean> {
  try {
    const content = buffer.toString('utf-8');
    
    // Basic checks for markdown content
    // Check if it's valid UTF-8 text and contains markdown-like patterns
    if (content.length === 0) return false;
    
    // Look for common markdown patterns
    const markdownPatterns = [
      /^#\s+/m,           // Headers
      /\*\*.*\*\*/,       // Bold text
      /\*.*\*/,           // Italic text
      /^\s*-\s+/m,        // List items
      /^\s*\d+\.\s+/m,    // Numbered lists
      /\[.*\]\(.*\)/,     // Links
      /```/,              // Code blocks
    ];
    
    // If it contains any markdown patterns, consider it valid
    // Or if it's just plain text (which is also valid markdown)
    const hasMarkdownPatterns = markdownPatterns.some(pattern => pattern.test(content));
    const isProbablyText = /^[\x00-\x7F\s]*$/.test(content.substring(0, 1000)); // ASCII check for first 1000 chars
    
    return hasMarkdownPatterns || isProbablyText;
  } catch (error) {
    console.error('Error validating markdown content:', error);
    return false;
  }
}

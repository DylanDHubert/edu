import { validateEnvironmentVariables } from './security';

/**
 * REQUIRED ENVIRONMENT VARIABLES FOR THE APPLICATION
 */
const REQUIRED_ENV_VARS = [
  'NEXT_PUBLIC_SUPABASE_URL',
  'NEXT_PUBLIC_SUPABASE_ANON_KEY',
  'SUPABASE_SERVICE_ROLE_KEY',
  'OPENAI_API_KEY'
];

/**
 * VALIDATE ALL REQUIRED ENVIRONMENT VARIABLES AT STARTUP
 * THIS SHOULD BE CALLED IN YOUR MAIN APPLICATION ENTRY POINT
 */
export function validateAppEnvironment(): void {
  try {
    validateEnvironmentVariables(REQUIRED_ENV_VARS);
    console.log('All required environment variables are present');
  } catch (error) {
    console.error('Environment validation failed:', error);
    throw error;
  }
}

/**
 * GET ENVIRONMENT VARIABLE WITH VALIDATION
 * @param key - Environment variable key
 * @param defaultValue - Default value if not set
 * @returns Environment variable value or default
 */
export function getEnvVar(key: string, defaultValue?: string): string {
  const value = process.env[key];
  
  if (!value && defaultValue === undefined) {
    throw new Error(`Required environment variable ${key} is not set`);
  }
  
  return value || defaultValue || '';
}

/**
 * GET ENVIRONMENT VARIABLE AS BOOLEAN
 * @param key - Environment variable key
 * @param defaultValue - Default boolean value
 * @returns Boolean value
 */
export function getEnvBoolean(key: string, defaultValue: boolean = false): boolean {
  const value = process.env[key];
  
  if (!value) {
    return defaultValue;
  }
  
  return value.toLowerCase() === 'true';
}

/**
 * GET ENVIRONMENT VARIABLE AS NUMBER
 * @param key - Environment variable key
 * @param defaultValue - Default number value
 * @returns Number value
 */
export function getEnvNumber(key: string, defaultValue: number): number {
  const value = process.env[key];
  
  if (!value) {
    return defaultValue;
  }
  
  const parsed = parseInt(value, 10);
  
  if (isNaN(parsed)) {
    console.warn(`Environment variable ${key} is not a valid number, using default: ${defaultValue}`);
    return defaultValue;
  }
  
  return parsed;
}

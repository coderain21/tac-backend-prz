import * as dotenv from 'dotenv';
import * as fs from 'fs';
import * as path from 'path';

/**
 * Load environment variables for a specific service or default to test/.env.
 * 
 * @param servicePath Optional path to the service directory containing .env (e.g., 'services/Admin_Web/agents')
 *                    If not provided, defaults to loading from 'test/.env'.
 */
export function loadEnvironmentVariables(servicePath?: string) {
  const projectRoot = process.cwd();

  const envFilePath = servicePath
    ? path.resolve(projectRoot, `${servicePath}/.env`)
    : path.resolve(projectRoot, 'test/.env');

  if (!fs.existsSync(envFilePath)) {
    console.warn(`No .env file found at ${envFilePath}`);
    return;
  }

  const result = dotenv.config({ path: envFilePath });

  if (result.error) {
    console.warn(`Could not load .env file from ${envFilePath}:`, result.error.message);
  }
}

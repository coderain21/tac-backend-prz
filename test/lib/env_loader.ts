import * as dotenv from 'dotenv';
import * as path from 'path';

export function loadEnvironmentVariables(servicePath: string) {
  const envPath = path.resolve(process.cwd(), `test/.env`);
  const result = dotenv.config({ path: envPath });

  if (result.error) {
    console.warn(`Could not load .env file from ${envPath}:`, result.error.message);
  }
}

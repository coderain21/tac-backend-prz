import { MongoClient, Db } from 'mongodb';
import dotenv from 'dotenv';
import path from 'path';

// Load environment variables from test/.env
dotenv.config({ path: path.resolve(__dirname, '../.env') });

let client: MongoClient;
let db: Db;

export const connectToDatabase = async () => {
  if (db) {
    return;
  }
  if (!process.env.MONGO_CLIENT) {
    throw new Error('MONGO_CLIENT environment variable is not set. Please check test/.env');
  }
  if (!process.env.DATABASE) {
    throw new Error('DATABASE environment variable is not set. Please check test/.env');
  }

  client = new MongoClient(process.env.MONGO_CLIENT);
  await client.connect();
  db = client.db(process.env.DATABASE);
};

export const getDb = () => {
  if (!db) {
    throw new Error('Database not connected. Call connectToDatabase first.');
  }
  return db;
};

export const closeDatabaseConnection = async () => {
  if (client) {
    await client.close();
    client = undefined as any;
    db = undefined as any;
  }
};


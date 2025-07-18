if (!process.env.MONGO_CLIENT) {
      throw new Error('MONGO_CLIENT environment variable is not set. Please check test/.env');
    }
    client = new MongoClient(process.env.MONGO_CLIENT);
    await client.connect();
    db = client.db(process.env.DATABASE!);
  });
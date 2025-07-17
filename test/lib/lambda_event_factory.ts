export class LambdaEventFactory {
  
  /**
   * Creates a mock API Gateway event for a GET request.
   */
  public static createGetEvent(
    claims: object | null,
    pathParameters: object | null,
    queryStringParameters: object | null = null
  ) {
    return {
      requestContext: {
        authorizer: {
          claims: claims,
        },
      },
      pathParameters: pathParameters,
      queryStringParameters: queryStringParameters,
    };
  }

  /**
   * Creates a mock API Gateway event for a POST request.
   */
  public static createPostEvent(
    claims: object | null,
    body: object | null,
    pathParameters: object | null = null,
    headers: object | null = null // Added headers parameter
  ) {
    return {
      requestContext: {
        authorizer: {
          claims: claims,
        },
      },
      body: JSON.stringify(body),
      pathParameters: pathParameters,
      headers: headers, // Added headers to the event
    };
  }
}

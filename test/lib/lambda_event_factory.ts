export class LambdaEventFactory {
  
  /**
   * Creates a mock API Gateway event for a GET request.
   * @param claims - The user claims for authorization.
   * @param pathParameters - The parameters from the URL path.
   * @param queryStringParameters - The query string parameters.
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


  // We can add createPostEvent, etc. here later if needed
  public static createPostEvent(
    claims: object | null,
    pathParameters: object | null,
    queryStringParameters: object | null,
    body: object | null
  ) {
    return {
      requestContext: {
        authorizer: {
          claims: claims,
        },
      },
      pathParameters: pathParameters,
      queryStringParameters: queryStringParameters,
      body: JSON.stringify(body),
    };
  }
}


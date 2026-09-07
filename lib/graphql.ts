/**
 * GraphQL Client Helper for Next.js Frontend
 * Executes GraphQL queries and mutations against /api/graphql endpoint.
 */
export async function fetchGraphQL<T = any>(
  query: string,
  variables: Record<string, any> = {}
): Promise<{ data?: T; errors?: Array<{ message: string }> }> {
  try {
    const res = await fetch('/api/graphql', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Accept': 'application/json',
      },
      body: JSON.stringify({
        query,
        variables,
      }),
      cache: 'no-store',
    });

    const json = await res.json();
    return json;
  } catch (error: any) {
    return {
      errors: [{ message: error?.message || 'Network error executing GraphQL query' }],
    };
  }
}

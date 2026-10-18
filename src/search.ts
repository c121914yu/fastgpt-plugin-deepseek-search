import type z from 'zod';

import { inputSchema, outputSchema, secretSchema } from './schemas';

const SEARCH_URL = 'https://api.deepseek.com/v1/tools/search';
const TIMEOUT_MS = 30_000;

const HTTP_ERRORS: Record<number, string> = {
  400: 'Invalid request. Check the search query and options.',
  401: 'Authentication failed. Check your DeepSeek API Key.',
  402: 'Insufficient balance. Top up your DeepSeek account.',
  408: 'The request timed out. Please try again later.',
  413: 'The request is too large. Shorten the search query and options.',
  429: 'Rate limit exceeded. Please wait before trying again.'
};

function isTimeout(error: unknown): boolean {
  return error instanceof Error && (error.name === 'TimeoutError' || error.name === 'AbortError');
}

function timeoutError(): Error {
  return new Error('DeepSeek Search request timed out after 30 seconds. Please try again later.');
}

export async function search(input: unknown, secrets: unknown): Promise<z.output<typeof outputSchema>> {
  // Validate here as production runtimes may invoke the handler without parsing schemas first.
  const params = inputSchema.parse(input);
  const { apiKey } = secretSchema.parse(secrets ?? {});

  let response: Response;
  try {
    response = await fetch(SEARCH_URL, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${apiKey}`,
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({
        query: params.query,
        count: params.count,
        need_content: params.needContent,
        localization: params.localization,
        ...(params.oriQuestion != null ? { ori_question: params.oriQuestion } : {})
      }),
      signal: AbortSignal.timeout(TIMEOUT_MS),
      redirect: 'error'
    });
  } catch (error) {
    // Never expose transport errors, headers, or upstream bodies that may contain credentials.
    if (isTimeout(error)) throw timeoutError();
    throw new Error('Unable to connect to DeepSeek Search. Please try again later.');
  }

  if (!response.ok) {
    throw new Error(`DeepSeek Search (HTTP ${response.status}): ${
      HTTP_ERRORS[response.status] ?? 'The service could not complete the request. Please try again later.'
    }`);
  }

  let data: unknown;
  try {
    data = await response.json();
  } catch (error) {
    if (isTimeout(error)) throw timeoutError();
    throw new Error('DeepSeek Search returned invalid JSON. Please try again later.');
  }

  const result = outputSchema.safeParse(data);
  if (!result.success) {
    throw new Error('DeepSeek Search returned an unexpected response format. Please try again later.');
  }
  return result.data;
}

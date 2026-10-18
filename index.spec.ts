import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import plugin from './index';

const fetchMock = vi.fn<typeof fetch>();
const apiKey = 'test-key';

const result = {
  title: 'DeepSeek API',
  url: 'https://api-docs.deepseek.com/guides/search/',
  snippet: 'Search and fetch APIs.',
  summary: 'DeepSeek provides web search results for agents and RAG applications.',
  content: '',
  rerank_score: 2.4,
  authority: 3,
  site_name: 'DeepSeek',
  site_icon: 'https://api-docs.deepseek.com/img/favicon.svg',
  date: '2026-10-16T00:00:00+00:00'
};

function run(input: unknown, secrets: unknown = { apiKey }) {
  return plugin.getToolHandler().handler(input, {
    secrets,
    systemVar: {},
    invoke: {} as never,
    streamResponse: vi.fn()
  });
}

function requestBody() {
  return JSON.parse(fetchMock.mock.calls[0]![1]!.body as string);
}

beforeEach(() => {
  fetchMock.mockReset();
  vi.stubGlobal('fetch', fetchMock);
});

afterEach(() => {
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
});

describe('DeepSeek Search', () => {
  it('uses Bearer authentication and API defaults while preserving search operators and results', async () => {
    fetchMock.mockResolvedValue(Response.json({ results: [result] }));
    const query = 'DeepSeek site:github.com OR site:huggingface.co lang:zh after:2025 -广告 "API"';

    await expect(run({ query }, { apiKey: ` ${apiKey} ` })).resolves.toEqual({ results: [result] });
    expect(fetchMock).toHaveBeenCalledTimes(1);
    expect(fetchMock).toHaveBeenCalledWith('https://api.deepseek.com/v1/tools/search', expect.objectContaining({
      method: 'POST',
      headers: { Authorization: `Bearer ${apiKey}`, 'Content-Type': 'application/json' },
      signal: expect.any(AbortSignal),
      redirect: 'error'
    }));
    expect(requestBody()).toEqual({ query, count: 10, localization: '', need_content: false });
    expect(plugin.getSecretSchema().toJSONSchema().properties?.apiKey).toMatchObject({ isSecret: true });
    const inputSchema = plugin.getToolHandler().inputSchema.toJSONSchema();
    expect(inputSchema.required).toEqual(['query']);
    expect(inputSchema.properties?.query).toMatchObject({ maxLength: 128 });
    expect(inputSchema.properties?.oriQuestion).toMatchObject({ maxLength: 128 });
  });

  it.each(['203.0.113.1', '2001:db8::1'])('maps optional parameters, allows 128 Unicode characters, and accepts %s', async (localization) => {
    const text = '🔍'.repeat(128);
    const page = { ...result, content: '# DeepSeek\n\nSearch API documentation.' };
    fetchMock.mockResolvedValue(Response.json({ results: [page] }));

    await expect(run({ query: text, oriQuestion: text, count: 50, needContent: true, localization }))
      .resolves.toEqual({ results: [page] });
    expect(requestBody()).toEqual({
      query: text,
      ori_question: text,
      count: 50,
      need_content: true,
      localization
    });
  });

  it('returns an empty result array and omits a null original question', async () => {
    fetchMock.mockResolvedValue(Response.json({ results: [] }));

    await expect(run({ query: 'x', count: 1, oriQuestion: null })).resolves.toEqual({ results: [] });
    expect(requestBody()).toEqual({ query: 'x', count: 1, localization: '', need_content: false });
  });

  it('preserves nullable site metadata and unknown authority', async () => {
    const page = { ...result, site_name: null, site_icon: null, date: null, authority: -1 };
    fetchMock.mockResolvedValue(Response.json({ results: [page] }));

    await expect(run({ query: 'DeepSeek' })).resolves.toEqual({ results: [page] });
  });

  it.each([
    ['missing query', {}],
    ['empty query', { query: '' }],
    ['blank query', { query: ' \n\t　' }],
    ['long Unicode query', { query: '🔍'.repeat(129) }],
    ['count below minimum', { query: 'x', count: 0 }],
    ['count above maximum', { query: 'x', count: 51 }],
    ['fractional count', { query: 'x', count: 1.5 }],
    ['empty original question', { query: 'x', oriQuestion: '' }],
    ['long original question', { query: 'x', oriQuestion: 'a'.repeat(129) }],
    ['invalid localization', { query: 'x', localization: 'example.com' }],
    ['non-boolean content flag', { query: 'x', needContent: 'false' }]
  ])('rejects %s before sending a request', async (_name, input) => {
    await expect(run(input)).rejects.toThrow();
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it.each([null, {}, { apiKey: ' \n\t' }])('rejects missing or blank credentials (%j) before sending a request', async (secrets) => {
    await expect(run({ query: 'DeepSeek' }, secrets)).rejects.toThrow();
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it.each([
    [400, 'Invalid request'],
    [401, 'Authentication failed'],
    [402, 'Insufficient balance'],
    [408, 'timed out'],
    [413, 'too large'],
    [429, 'Rate limit exceeded'],
    [503, 'service could not complete']
  ])('reports HTTP %i without leaking the upstream body or retrying', async (status, message) => {
    fetchMock.mockResolvedValue(Response.json({ error: { message: apiKey } }, { status }));

    const error = await run({ query: 'DeepSeek' }).catch((error: Error) => error);
    expect(error).toBeInstanceOf(Error);
    expect(error.message).toContain(`HTTP ${status}`);
    expect(error.message).toContain(message);
    expect(error.message).not.toContain(apiKey);
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });

  it('hides transport error details', async () => {
    fetchMock.mockRejectedValue(new Error(`Transport failed: Authorization: Bearer ${apiKey}`));

    await expect(run({ query: 'DeepSeek' })).rejects.toThrow('Unable to connect to DeepSeek Search. Please try again later.');
  });

  it('cancels a hanging request using a 30-second timeout signal', async () => {
    const controller = new AbortController();
    const timeout = vi.spyOn(AbortSignal, 'timeout').mockReturnValue(controller.signal);
    fetchMock.mockImplementation((_url, options) => new Promise((_resolve, reject) => {
      options!.signal!.addEventListener('abort', () => reject(options!.signal!.reason));
    }));

    const pending = expect(run({ query: 'DeepSeek' })).rejects.toThrow('timed out after 30 seconds');
    controller.abort(new DOMException('Request timed out', 'TimeoutError'));
    await pending;
    expect(timeout).toHaveBeenCalledWith(30_000);
  });

  it('reports a timeout while reading the response body', async () => {
    const response = Response.json({ results: [] });
    vi.spyOn(response, 'json').mockRejectedValue(new DOMException('Aborted', 'AbortError'));
    fetchMock.mockResolvedValue(response);

    await expect(run({ query: 'DeepSeek' })).rejects.toThrow('timed out after 30 seconds');
  });

  it('rejects non-JSON responses without leaking their content', async () => {
    fetchMock.mockResolvedValue(new Response(`<html>${apiKey}</html>`));

    await expect(run({ query: 'DeepSeek' })).rejects.toThrow('DeepSeek Search returned invalid JSON. Please try again later.');
  });

  it.each([null, {}, { results: null }, { results: [{ ...result, summary: 123 }] }])(
    'rejects malformed success responses (%j)',
    async (body) => {
      fetchMock.mockResolvedValue(Response.json(body));

      await expect(run({ query: 'DeepSeek' })).rejects.toThrow('unexpected response format');
    }
  );
});

import { initEventStream, _resetEventStream } from '@/lib/eventStream';

const mockEventSource = jest.fn(() => ({
  addEventListener: jest.fn(),
  close: jest.fn(),
  onmessage: null as ((event: MessageEvent) => void) | null,
  onerror: null as (() => void) | null,
}));

beforeEach(() => {
  jest.useFakeTimers();
  mockEventSource.mockClear();
  Object.defineProperty(global, 'EventSource', {
    configurable: true,
    value: mockEventSource,
  });
  Object.defineProperty(global, 'BroadcastChannel', {
    configurable: true,
    value: jest.fn(() => ({
      addEventListener: jest.fn(),
      postMessage: jest.fn(),
      close: jest.fn(),
    })),
  });
});

afterEach(() => {
  _resetEventStream();
  jest.clearAllTimers();
  jest.useRealTimers();
});

it('preserves the wallet filter and resumes from the received event ID on reconnect', () => {
  initEventStream('GTEST');
  expect(mockEventSource).toHaveBeenCalledWith(
    '/api/indexer/stream?wallet=GTEST',
  );

  const source = mockEventSource.mock.results[0].value;
  source.onmessage!(
    new MessageEvent('message', {
      data: JSON.stringify({ id: 42, type: 'player_registered' }),
    }),
  );
  source.onerror!();
  jest.advanceTimersByTime(3000);

  expect(mockEventSource).toHaveBeenLastCalledWith(
    '/api/indexer/stream?wallet=GTEST&lastEventId=42',
  );
  expect(source.close).toHaveBeenCalledTimes(1);
});

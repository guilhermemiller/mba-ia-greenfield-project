import * as amqp from 'amqplib';
import { RabbitmqService } from './rabbitmq.service';

const QUEUE_CFG = {
  rabbitmqUrl: 'amqp://test',
  videoProcessingQueue: 'video_processing',
  videoDeadLetterQueue: 'video_processing_dlq',
  prefetch: 1,
  ffmpegBin: 'ffmpeg',
  ffprobeBin: 'ffprobe',
  thumbnailSize: '1280x720',
  thumbnailSeek: '00:00:01.000',
} as const;

jest.mock('amqplib', () => ({
  connect: jest.fn(),
}));

function makeChannel(overrides: Record<string, jest.Mock> = {}) {
  return {
    assertQueue: jest.fn().mockResolvedValue(undefined),
    prefetch: jest.fn().mockResolvedValue(undefined),
    consume: jest.fn().mockResolvedValue(undefined),
    sendToQueue: jest.fn(),
    ack: jest.fn(),
    nack: jest.fn(),
    close: jest.fn().mockResolvedValue(undefined),
    ...overrides,
  };
}

function makeConnection(channel: any) {
  return {
    createChannel: jest.fn().mockResolvedValue(channel),
    close: jest.fn().mockResolvedValue(undefined),
  };
}

function makeService() {
  return new RabbitmqService(QUEUE_CFG as any);
}

describe('RabbitmqService', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  it('connects and asserts both queues with a dead-letter config', async () => {
    const channel = makeChannel();
    (amqp.connect as jest.Mock).mockResolvedValue(makeConnection(channel));
    const service = makeService();

    await service.ensureConnected();

    expect(amqp.connect).toHaveBeenCalledWith('amqp://test');
    expect(channel.assertQueue).toHaveBeenCalledWith('video_processing_dlq', {
      durable: true,
    });
    expect(channel.assertQueue).toHaveBeenCalledWith('video_processing', {
      durable: true,
      deadLetterExchange: '',
      deadLetterRoutingKey: 'video_processing_dlq',
    });
    expect(channel.prefetch).toHaveBeenCalledWith(1);
  });

  it('publishes a JSON payload persistently', async () => {
    const channel = makeChannel();
    (amqp.connect as jest.Mock).mockResolvedValue(makeConnection(channel));
    const service = makeService();

    await service.publish('video_processing', {
      videoId: 'a',
      storageKey: 'k',
    });

    expect(channel.sendToQueue).toHaveBeenCalledWith(
      'video_processing',
      Buffer.from(JSON.stringify({ videoId: 'a', storageKey: 'k' })),
      { persistent: true },
    );
  });

  it('acks a delivered message when the handler succeeds', async () => {
    const channel = makeChannel();
    (amqp.connect as jest.Mock).mockResolvedValue(makeConnection(channel));
    const service = makeService();

    let onMessage: (msg: any) => void = () => {};
    channel.consume.mockImplementation((_q: string, cb: (m: any) => void) => {
      onMessage = cb;
      return Promise.resolve();
    });
    await service.subscribe('video_processing', (_msg, ack) => ack());

    const msg = { content: Buffer.from('{"videoId":"a"}') };
    onMessage(msg);

    await new Promise((r) => setTimeout(r, 10));
    expect(channel.ack).toHaveBeenCalledWith(msg);
    expect(channel.nack).not.toHaveBeenCalled();
  });

  it('nacks with requeue=false when a message handler throws', async () => {
    const channel = makeChannel();
    (amqp.connect as jest.Mock).mockResolvedValue(makeConnection(channel));
    const service = makeService();

    let onMessage: (msg: any) => void = () => {};
    channel.consume.mockImplementation((_q: string, cb: (m: any) => void) => {
      onMessage = cb;
      return Promise.resolve();
    });
    // Async handler mirrors the real worker; the throw must surface as a rejected
    // promise (not a synchronous throw) so the service's .catch nacks it.
    // eslint-disable-next-line @typescript-eslint/require-await
    await service.subscribe('video_processing', async () => {
      throw new Error('boom');
    });

    const msg = { content: Buffer.from('{}') };
    onMessage(msg);

    await new Promise((r) => setTimeout(r, 10));
    expect(channel.nack).toHaveBeenCalledWith(msg, false, false);
    expect(channel.ack).not.toHaveBeenCalled();
  });
});

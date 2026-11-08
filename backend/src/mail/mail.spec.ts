import { MailService } from './mail.service';

describe('console mail transport', () => {
  const env = { ...process.env };
  afterEach(() => { process.env = { ...env }; jest.restoreAllMocks(); });
  const send = async () => {
    const svc = new MailService();
    const log = jest.spyOn((svc as any).log, 'log').mockImplementation(() => undefined);
    const warn = jest.spyOn((svc as any).log, 'warn').mockImplementation(() => undefined);
    await svc.send({ to: 'a@b.co', subject: 'Reset', text: 'https://x/reset-password?token=SECRET', html: '' });
    return { logged: [...log.mock.calls, ...warn.mock.calls].flat().join('\n') };
  };

  it('never writes working links to the log in production', async () => {
    process.env.MAIL_TRANSPORT = 'console';
    process.env.NODE_ENV = 'production';
    delete process.env.MAIL_CONSOLE_LOG_BODY;
    const { logged } = await send();
    expect(logged).not.toContain('SECRET');
    expect(logged).toContain('a@b.co');
  });
  it('prints the body in development, or when someone opts in on staging', async () => {
    process.env.MAIL_TRANSPORT = 'console';
    process.env.NODE_ENV = 'development';
    expect((await send()).logged).toContain('SECRET');
    process.env.NODE_ENV = 'production';
    process.env.MAIL_CONSOLE_LOG_BODY = 'true';
    expect((await send()).logged).toContain('SECRET');
  });
});

export default () => ({
  port: parseInt(process.env.PORT ?? '3003', 10),
  jwt: {
    accessSecret: process.env.JWT_ACCESS_SECRET ?? 'change-me',
  },
  mux: {
    tokenId: process.env.MUX_TOKEN_ID ?? '',
    tokenSecret: process.env.MUX_TOKEN_SECRET ?? '',
    webhookSecret: process.env.MUX_WEBHOOK_SECRET ?? '',
  },
  corsOrigin: process.env.CORS_ORIGIN ?? 'http://localhost:3000',
  rabbitmq: {
    url: process.env.RABBITMQ_URL ?? 'amqp://guest:guest@localhost:5672',
  },
});

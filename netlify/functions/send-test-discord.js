exports.handler = async () => {
  const webhook = process.env.DISCORD_WEBHOOK_URL;

  const message = {
    content: '@everyone 📦 Test message from Grow-a-Garden bot!',
  };

  const res = await fetch(webhook, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(message)
  });

  const text = await res.text();

  return {
    statusCode: res.status,
    body: text
  };
};

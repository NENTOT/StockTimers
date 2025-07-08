// netlify/functions/discord-stock-update.js

exports.handler = async (event) => {
  try {
    const { changes } = JSON.parse(event.body || '{}');

    if (!changes || !Array.isArray(changes) || changes.length === 0) {
      return {
        statusCode: 400,
        body: JSON.stringify({ success: false, message: 'No valid stock changes provided.' })
      };
    }

    const discordWebhookUrl = process.env.DISCORD_WEBHOOK_URL;

   const content = `📢 @everyone\n📦 **Stock Updated!**\n\n${changes.map(change => {
  const line = `${change.emoji || ''} **${change.category}** → ${change.item}`;
  return change.type === 'changed'
    ? `${line} (${change.oldValue} → ${change.newValue})`
    : `${line} x${change.value ?? ''}`;
}).join('\n')}`;


    await fetch(discordWebhookUrl, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ content })
    });

    return {
      statusCode: 200,
      body: JSON.stringify({ success: true, message: 'Posted to Discord.' })
    };
  } catch (error) {
    console.error('❌ Discord update error:', error);
    return {
      statusCode: 500,
      body: JSON.stringify({ success: false, error: error.message })
    };
  }
};

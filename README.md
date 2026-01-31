# Sup Chat Channel Plugin for OpenClaw

An OpenClaw messaging channel plugin that integrates with the sup.net chat API. This plugin enables clawdbot to monitor chat mentions/DMs and respond to messages.

## Features

- Monitor chat mentions and direct messages
- Send messages to chat channels
- Cookie-based authentication with `auth_session`
- Configurable polling interval for new messages
- Support for both direct and group chats

## Installation

### 1. Install the plugin

Copy this plugin directory to your OpenClaw extensions folder:

```bash
# Option 1: Link for development
openclaw plugins install -l /path/to/this/plugin

# Option 2: Copy to extensions
cp -r plugin ~/.openclaw/extensions/sup-chat
```

### 2. Set up authentication

Extract your `auth_session` cookie from sup.net and save it to a file:

```bash
# Create config directory
mkdir -p ~/.config/sup

# Save your auth_session cookie value to the file
echo "your_auth_session_cookie_value_here" > ~/.config/sup/auth_session

# Secure the file
chmod 600 ~/.config/sup/auth_session
```

**How to get your auth_session cookie:**

1. Log in to sup.net in your browser
2. Open browser DevTools (F12)
3. Go to Application/Storage → Cookies
4. Find the `auth_session` cookie
5. Copy its value and save it to the file above

### 3. Configure OpenClaw

Add the following to your OpenClaw configuration file:

```json
{
  "plugins": {
    "enabled": true,
    "load": {
      "paths": ["~/.openclaw/extensions/sup-chat"]
    },
    "entries": {
      "sup-chat": {
        "enabled": true
      }
    }
  },
  "channels": {
    "sup-chat": {
      "baseUrl": "https://sup.net",
      "authSessionPath": "~/.config/sup/auth_session",
      "clientVersion": "1.0.0",
      "pollInterval": 5000,
      "enabled": true
    }
  }
}
```

See `config.example.json` for a complete example.

### 4. Restart OpenClaw gateway

```bash
# Restart the gateway to load the plugin
openclaw gateway restart
```

## Configuration Options

| Option | Type | Required | Default | Description |
|--------|------|----------|---------|-------------|
| `baseUrl` | string | Yes | - | Base URL for the sup.net API (e.g., `https://sup.net`) |
| `authSessionPath` | string | Yes | - | Path to file containing auth_session cookie value |
| `clientVersion` | string | No | - | Client version header value (x-sup-client-version) |
| `sessionId` | string | No | - | Session ID header value (x-sup-session-id) |
| `pollInterval` | number | No | 5000 | Interval in milliseconds to poll for new messages |
| `enabled` | boolean | No | true | Enable/disable the channel |

## Usage

Once configured, the plugin will:

1. **Monitor for messages**: Poll the chat API at the configured interval
2. **Detect mentions/DMs**: Identify messages that mention the bot or are direct messages
3. **Trigger agent**: Pass messages to the OpenClaw agent for processing
4. **Send responses**: Use the agent's response to reply in the chat

### Sending Messages

The channel supports the standard OpenClaw message format. The agent can respond to messages, and the plugin will handle sending them via the sup.net API.

### Message Format

Messages are sent with the following structure:
- Plain text content
- Support for mentions (via the mentions array)
- Marked as `isGenerated: true` to indicate bot-generated content

## API Endpoints Used

This plugin uses the following sup.net API endpoints:

- `POST /api/trpc/chatMessage.create` - Send chat messages
- `GET /api/trpc/loader.chatPanelData` - Fetch chat data (for polling)
- `GET /api/trpc/userData.searchAll` - Search user data (future use)

## Troubleshooting

### Authentication Issues

If you see authentication errors:

1. Verify your `auth_session` cookie is valid
2. Check the cookie hasn't expired (log in again if needed)
3. Ensure the file path is correct and readable
4. Check file permissions: `chmod 600 ~/.config/sup/auth_session`

### No Messages Received

If the bot isn't receiving messages:

1. Check the gateway is running: `openclaw gateway status`
2. Verify polling is active in the logs
3. Ensure the bot user ID is configured correctly
4. Check the `pollInterval` isn't too long
5. Look for errors in: `openclaw logs`

### Plugin Not Loading

If the plugin doesn't appear:

1. Verify the plugin path in config: `openclaw plugins list`
2. Check the manifest is valid: `cat ~/.openclaw/extensions/sup-chat/openclaw.plugin.json`
3. Ensure `plugins.enabled: true` in config
4. Restart the gateway after config changes

## Development

### Project Structure

```
plugin/
├── openclaw.plugin.json    # Plugin manifest
├── index.ts                # Main plugin implementation
├── config.example.json     # Example configuration
└── README.md              # This file
```

### Extending the Plugin

To add more features:

1. **Webhooks**: Replace polling with webhook support
2. **Rich Messages**: Add support for attachments, embeds, etc.
3. **Typing Indicators**: Use `/api/trpc/userData.typingStart` and `typingStop`
4. **Read Receipts**: Mark messages as read with `userData.markOpenChatRead`
5. **Search**: Implement search functionality using `userData.searchAll`

### API Reference

The full OpenAPI specification is available in `../openapi.json`.

## Security Notes

- The `auth_session` cookie provides full access to your account
- Store it securely and never commit it to version control
- Use restrictive file permissions (600) on the auth file
- Consider using environment variables for sensitive paths
- Rotate cookies periodically

## License

Same as OpenClaw project.

## Support

For issues and questions:
- Check OpenClaw docs: https://openclaw.com/docs
- Review the plugin documentation: https://openclaw.com/docs/plugin
- File issues on the OpenClaw repository

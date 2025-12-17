# ccgh-stats

[![npm version](https://img.shields.io/npm/v/ccgh-stats.svg)](https://www.npmjs.com/package/ccgh-stats)
[![License: MIT](https://img.shields.io/badge/License-MIT-yellow.svg)](https://opensource.org/licenses/MIT)

Track and display your Claude Code usage stats on GitHub with a beautiful heatmap widget.

![Claude Stats Widget](https://ccgh-stats.vercel.app/api/w/pub_demo.svg)

*Yes, this is a real widget generated live from actual backend data! ✨*

## Installation

```bash
npm install -g ccgh-stats
```

## Setup

1. **Register and sync your data:**

```bash
ccgh-stats setup
```

This will:
- Register you with the API
- Sync your Claude Code usage history
- Give you a widget URL

1. **Add the widget to your GitHub README:**

```markdown
![Claude Stats](https://ccgh-stats.vercel.app/api/w/YOUR_PUBLIC_ID.svg)
```

## Auto-sync with Claude Code Hooks

Add this to your `~/.claude/settings.json`:

```json
{
  "hooks": {
    "UserPromptSubmit": [
      {
        "type": "command",
        "command": "ccgh-stats --sync"
      }
    ]
  }
}
```

This will automatically sync your stats every 10 minutes while using Claude Code.

## Commands

| Command | Description |
|---------|-------------|
| `ccgh-stats setup` | Register and do initial sync |
| `ccgh-stats status` | Show registration status |
| `ccgh-stats --sync` | Incremental sync (used by hook) |

## How it works

1. **Parses** your Claude Code session files from `~/.claude/projects/`
2. **Syncs** aggregated stats to the API (only token counts, no conversation content)
3. **Generates** an SVG widget showing your usage heatmap

## Privacy

- Only token counts are sent (input/output tokens per day per model)
- No conversation content is ever transmitted
- Your data is tied to a random public ID, not your identity

## License

MIT

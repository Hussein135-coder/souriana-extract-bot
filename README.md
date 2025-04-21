# Souriana Extract Bot

A Telegram bot for extracting data from images and submitting it to a website.

## Project Structure

```
├── index.ts                 # Entry point
├── tsconfig.json            # TypeScript configuration
├── uploads/                 # Temporary directory for image uploads
├── src/
│   ├── app.ts              # Main application initialization
│   ├── server.ts           # Express server configuration
│   ├── api/
│   │   └── website.ts      # Website API integration
│   ├── bot/
│   │   ├── index.ts        # Bot initialization
│   │   └── handlers.ts     # Bot event handlers
│   ├── config/
│   │   └── index.ts        # Environment configuration
│   ├── services/
│   │   └── imageAnalyzer.ts # Image analysis service
│   ├── types/
│   │   └── index.ts        # TypeScript type definitions
│   └── utils/
│       └── helpers.ts      # Utility functions
```

## Setup

1. Create a `.env` file in the root directory with the following variables:

```
TELEGRAM_BOT_TOKEN=your_telegram_bot_token
GEMINI_API_KEY=your_gemini_api_key
WEBSITE_LOGIN_URL=your_website_login_url
WEBSITE_DATA_URL=your_website_data_url
WEBSITE_USERNAME=your_website_username
WEBSITE_PASSWORD=your_website_password
NAME=default_name_value
PORT=3000
```

2. Install dependencies:

```
npm install
```

3. Build the TypeScript code:

```
npm run build
```

4. Run the application:

```
npm start
```

For development with auto-restart:

```
npm run dev
```

To watch TypeScript files and compile on change:

```
npm run watch
```

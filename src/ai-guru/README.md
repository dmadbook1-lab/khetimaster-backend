# AI Guru

KhetiMaster's AI farming assistant. Same stack as the CropGen farm assistant:
OpenAI Agents SDK (`@openai/agents`), `OPENAI_API_KEY` / `OPENAI_MODEL` (gpt-4o-mini),
plain-text farmer replies with a recovery retry. Unlike CropGen's socket chat it is a
REST API, and every chat is stored per session in MongoDB for the admin panel.

## Layout

```
ai-guru/
├── core/
│   ├── agent.js          # Runner + Agent, reply clean-up, recovery, usage tracking
│   └── systemPrompt.js   # AI Guru persona, app guide, farmer + farm context, language rules
├── tools/
│   ├── index.js          # Tools over live KhetiMaster data (scoped to the logged-in user)
│   └── appScreens.js     # Screens AI Guru can open in the app (keys shared with the app)
└── services/
    ├── aiGuru.service.js      # Send message, history, sessions, feedback, daily limit
    └── aiGuruAdmin.service.js # Admin panel queries: all chats, users, messages, stats
```

Models: `models/AiChatSession.js`, `models/AiChatMessage.js`.
Routes: `routes/aiGuruRoutes.js` → `/api/ai-guru/*` (user) and `/api/admin/ai-guru/*` (admin).

## Tools

| Tool                                                 | Data                                                    |
| ---------------------------------------------------- | ------------------------------------------------------- |
| `get_my_farms`                                       | User's farms + latest advisory summary                  |
| `get_farm_advisory`                                  | Crop health, growth stage, NPK, yield, to-do activities |
| `get_weather`                                        | Current weather + 7-day forecast at a farm              |
| `get_mandi_prices`                                   | data.gov.in mandi prices, nearest markets first         |
| `find_labourers` / `find_machinery` / `find_doctors` | Active providers near the user                          |
| `find_nursery_plants` / `find_market_listings`       | Nursery stock, marketplace listings                     |
| `get_my_bookings_and_orders`                         | User's bookings, consultations, orders, deals           |
| `get_agri_news`                                      | Latest cached agriculture news                          |
| `open_app_screen`                                    | Adds an in-app button (`actions`) to the reply          |

## Chat API

`POST /api/ai-guru/chat` body:

```json
{
  "message": "Should I irrigate?",
  "sessionId": "<optional>",
  "fieldId": "<farm id | general>",
  "language": "hi",
  "source": "aiguru",
  "image": { "base64": "...", "mimeType": "image/jpeg" }
}
```

Response: `{ session, userMessage, reply: { id, text, actions: [{ screen, label, params }] }, remainingToday }`.

## Admin

Admin routes need a user with `role: "admin"`:

```
npm run make-admin -- someone@example.com
```

Chats a user deletes in the app are only hidden from them (`deletedByUser`); admins
still see them (`includeDeleted=true`). `DELETE /api/admin/ai-guru/sessions/:id` removes one permanently.

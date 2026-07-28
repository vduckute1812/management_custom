# Chat (direct messages)

Feature spec for signed-in **1:1 chat** between users, with **emoji** and **sticker** messages.

## Goal

Let members of the same install message each other privately from `/chat`, without requiring Redis or WebSockets. Delivery uses short polling while the chat page is open.

## Scope

**In**

- 1:1 conversations only (no group chats in this phase)
- Message kinds: text (`0`), emoji (`1`), sticker (`2`) — integer enums end-to-end
- Built-in sticker catalog + emoji picker (no custom sticker uploads)
- Unread counts per conversation + install-wide total
- Auth required; participants only

**Out (later)**

- Group / channel chat
- File / image attachments in chat
- Push / email notifications for new DMs
- WebSocket / SSE realtime

## UX

1. Header **Chat** link (signed-in only) and shortcut `g c`
2. Left: conversation list + “New chat” people search (`GET /api/users/directory`)
3. Right: message thread + composer with emoji / sticker panels
4. Poll ~3.5s for new messages while the page is open

## Data

- `chat_conversations` — unique ordered pair `(user_a_id, user_b_id)`
- `chat_messages` — body and/or `sticker_id`
- `chat_conversation_reads` — per-user `last_read_at`

Migration: `0013_chat.sql`.

## API (summary)

| Method | Path                                   | Purpose                             |
| ------ | -------------------------------------- | ----------------------------------- |
| `GET`  | `/api/chat/conversations`              | List + `unreadTotal`                |
| `POST` | `/api/chat/conversations`              | Start/get DM `{ peerUserId }`       |
| `GET`  | `/api/chat/conversations/:id/messages` | History / poll (`before` / `after`) |
| `POST` | `/api/chat/conversations/:id/messages` | Send text / emoji / sticker         |
| `POST` | `/api/chat/conversations/:id/read`     | Mark read                           |
| `GET`  | `/api/chat/catalog`                    | Stickers + emoji list               |

See [`api.md`](./api.md#chat-direct-messages) and [`database.md`](./database.md) for the as-built reference.

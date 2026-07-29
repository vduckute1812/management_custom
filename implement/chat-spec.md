# Chat (direct messages)

Feature spec for signed-in **1:1 chat** between users, with **emoji** and **sticker** messages.

## Goal

Let members of the same install message each other privately from `/chat`, without requiring Redis or WebSockets. Delivery uses short polling while the chat page is open.

## Scope

**In**

- 1:1 conversations only (no group chats in this phase)
- Message kinds: text (`0`), emoji (`1`), sticker (`2`), image (`3`), audio (`4`) — integer enums end-to-end
- Built-in sticker catalog + emoji picker (no custom sticker uploads)
- Image + voice notes via `POST /api/uploads` then chat message `uploadId` (R2)
- Unread counts per conversation + install-wide total
- Read receipts (`peerLastReadAt` / `readByPeer`)
- In-app toast + nav badge for new messages (desktop Notification when permitted)
- Auth required; participants only

**Out (later)**

- Group / channel chat
- File / image attachments in chat
- Email push for new DMs
- WebSocket / SSE realtime

## UX

1. Header **Chat** link (signed-in only) and shortcut `g c`
2. Left: conversation list + “New chat” people search (`GET /api/users/directory`)
3. Right: message thread + composer with emoji / sticker panels
4. Emoji clicks **insert into the draft**; stickers / images / voice notes send immediately
5. Image picker + in-browser voice recorder (max ~2 minutes; needs mic permission + R2)
6. Outbound messages show a **Read** receipt once the peer's `last_read_at` covers them
7. Nav Chat badge + toast (and desktop notification when permitted) for new unread mail
8. Poll ~3.5s for thread updates while `/chat` is open; inbox pulse ~10s globally while signed in

## Data

- `chat_conversations` — unique ordered pair `(user_a_id, user_b_id)`
- `chat_messages` — body and/or `sticker_id` and/or `upload_id` (+ `duration_ms` for voice)
- `chat_conversation_reads` — per-user `last_read_at`
- `uploads.kind` includes `audio` (migration `0014`)

Migration: `0013_chat.sql`, `0014_chat_media.sql`.

## API (summary)

| Method | Path                                   | Purpose                                                  |
| ------ | -------------------------------------- | -------------------------------------------------------- |
| `GET`  | `/api/chat/conversations`              | List + `unreadTotal` + `peerLastReadAt`                  |
| `POST` | `/api/chat/conversations`              | Start/get DM `{ peerUserId }`                            |
| `GET`  | `/api/chat/conversations/:id/messages` | History / poll; includes `peerLastReadAt` / `readByPeer` |
| `POST` | `/api/chat/conversations/:id/messages` | Send text / emoji / sticker / image / audio |
| `POST` | `/api/chat/conversations/:id/read`     | Mark read                                                |
| `GET`  | `/api/chat/unread`                     | Inbox pulse for badge + toast                            |
| `GET`  | `/api/chat/catalog`                    | Stickers + emoji list                                    |
| `POST` | `/api/uploads`                         | Upload image/audio bytes before sending media messages   |

See [`api.md`](./api.md#chat-direct-messages) and [`database.md`](./database.md) for the as-built reference.

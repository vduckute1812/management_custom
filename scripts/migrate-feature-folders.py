#!/usr/bin/env python3
"""Move client/server modules into feature folders and rewrite imports."""
from __future__ import annotations

import os
import re
import shutil
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]

DB_MODULE = {
    "types": "core/types",
    "pool": "core/pool",
    "ids": "core/ids",
    "compute": "core/compute",
    "mappers": "core/mappers",
    "datetime": "core/datetime",
    "timestampCursor": "core/timestampCursor",
    "migrator": "core/migrator",
    "jobs": "core/jobs",
    "epics": "time/epics",
    "tasks": "time/tasks",
    "timer": "time/timer",
    "users": "auth/users",
    "auth-identities": "auth/auth-identities",
    "refresh-tokens": "auth/refresh-tokens",
    "email-verifications": "auth/email-verifications",
    "password-resets": "auth/password-resets",
    "appSettings": "auth/appSettings",
    "admin": "admin/admin",
    "pendingArticles": "admin/pendingArticles",
    "postQueries": "feed/postQueries",
    "posts": "feed/posts",
    "postReactions": "feed/postReactions",
    "postComments": "feed/postComments",
    "categories": "feed/categories",
    "uploads": "feed/uploads",
    "stories": "feed/stories",
    "storiesRead": "feed/storiesRead",
    "chat": "chat/chat",
    "chatShared": "chat/chatShared",
    "chatConversations": "chat/chatConversations",
    "chatMessages": "chat/chatMessages",
    "chatReactions": "chat/chatReactions",
    "chatReads": "chat/chatReads",
    "money": "money/money",
    "moneySavings": "money/moneySavings",
    "moneyBudgets": "money/moneyBudgets",
    "moneyUserCategories": "money/moneyUserCategories",
    "friendships": "friends/friendships",
}

SVC_MODULE = {
    "taskService": "time/taskService",
    "timerService": "time/timerService",
    "epicService": "time/epicService",
    "postService": "feed/postService",
    "chatService": "chat/chatService",
    "moneyService": "money/moneyService",
    "moneyBudgetsService": "money/moneyBudgetsService",
    "moneySavingsService": "money/moneySavingsService",
    "moneyUserCategoriesService": "money/moneyUserCategoriesService",
    "authService": "auth/authService",
    "accountDeletionService": "auth/accountDeletionService",
    "articleService": "admin/articleService",
    "articleFetcher": "admin/articleFetcher",
    "articleRewriter": "admin/articleRewriter",
    "articleFetchHttp": "admin/articleFetchHttp",
}

# old resolved path → new resolved path (files only)
FILE_MOVES: dict[Path, Path] = {}


def classify_component(name: str) -> str:
    if name.startswith(("Feed", "Post", "Story", "Manuscript")):
        return "feed"
    if name.startswith("Chat"):
        return "chat"
    if name.startswith("Money"):
        return "money"
    if name.startswith("Admin"):
        return "admin"
    if name.startswith("Friends"):
        return "friends"
    if (
        name.startswith(
            ("Task", "Epic", "Calendar", "Block", "Status", "Timer", "Analytics", "Rollover")
        )
        or name == "TimeBlockEditor.vue"
    ):
        return "time"
    if name.startswith(("Settings", "Profile", "DeleteAccount")) or name in (
        "LegalDocumentView.vue",
        "GoogleSignInButton.vue",
    ):
        return "account"
    if name.startswith(
        ("App", "Command", "Toast", "Inline", "Empty", "Confirm", "Skeleton", "Shortcut", "Quick")
    ) or name in (
        "ToastStack.vue",
        "ShortcutsHelp.vue",
        "QuickCapture.vue",
        "TimerPill.vue",
        "LanguageSwitcher.vue",
        "UserAvatar.vue",
    ):
        return "app"
    return "shared"


def classify_composable(name: str) -> str:
    stem = name.replace(".ts", "")
    if stem == "useAdminPendingArticleReview":
        return "admin"
    if stem.startswith("useChat") or stem.startswith("chat"):
        return "chat"
    if stem.startswith("useMoney") or "Money" in stem:
        return "money"
    if stem.startswith("useFriends"):
        return "friends"
    if stem in (
        "useTasks",
        "useEpics",
        "useTimer",
        "useRecurrence",
        "useSchedule",
        "useAnalyticsBuckets",
        "useTaskModalForm",
        "useExport",
        "useSampleData",
        "calendarDailyInteractions",
    ):
        return "time"
    if stem in (
        "usePosts",
        "useStories",
        "useUploads",
        "useCategories",
        "useManuscriptFont",
        "useAudiencePicker",
        "useComposerAttachments",
        "postMutations",
    ):
        return "feed"
    if stem in ("useAuth", "useLegalDocument", "useDiscardConfirm"):
        return "account"
    if stem in (
        "useAppSection",
        "useThemeCycle",
        "useCommandPaletteItems",
        "useUiOverlays",
        "useToasts",
        "useShortcuts",
        "useNotifications",
        "useNow",
        "useModal",
        "useSafeI18n",
    ):
        return "app"
    return "shared"


def record_tree_move(src: Path, dest: Path) -> None:
    """Record every file under src → corresponding path under dest, then move."""
    if src.is_file():
        FILE_MOVES[src.resolve()] = dest.resolve()
    elif src.is_dir():
        for f in src.rglob("*"):
            if f.is_file():
                FILE_MOVES[f.resolve()] = (dest / f.relative_to(src)).resolve()
    dest.parent.mkdir(parents=True, exist_ok=True)
    if dest.exists():
        raise SystemExit(f"destination exists: {dest}")
    shutil.move(str(src), str(dest))


def move_tree() -> None:
    for p in sorted((ROOT / "components").glob("*.vue")):
        record_tree_move(p, ROOT / "components" / classify_component(p.name) / p.name)
    for p in sorted((ROOT / "composables").glob("*.ts")):
        record_tree_move(p, ROOT / "composables" / classify_composable(p.name) / p.name)

    for name, dest_rel in DB_MODULE.items():
        src = ROOT / "server/db" / f"{name}.ts"
        if src.exists():
            record_tree_move(src, ROOT / "server/db" / f"{dest_rel}.ts")

    post_query = ROOT / "server/db/postQuery"
    if post_query.is_dir():
        record_tree_move(post_query, ROOT / "server/db/feed/postQuery")
    user_dir = ROOT / "server/db/user"
    if user_dir.is_dir():
        record_tree_move(user_dir, ROOT / "server/db/auth/user")

    for name, dest_rel in SVC_MODULE.items():
        src = ROOT / "server/services" / f"{name}.ts"
        if src.exists():
            record_tree_move(src, ROOT / "server/services" / f"{dest_rel}.ts")


def rewrite_mapped_paths(text: str, mapping: dict[str, str], prefixes: list[str]) -> str:
    """
    Rewrite `prefix+old` → `prefix+new` without re-matching prefixes of already
    rewritten paths (e.g. money after moneySavings → money/moneySavings).
    Uses a two-phase placeholder so short keys cannot nest inside long ones.
    """
    items = sorted(mapping.items(), key=lambda kv: -len(kv[0]))
    placeholders: list[tuple[str, str]] = []
    for i, (old, new) in enumerate(items):
        token = f"__FEATMOVE_{i}__"
        placeholders.append((token, new))
        for prefix in prefixes:
            # Only match a complete module segment (end, quote, or path sep after).
            # Longest keys first so chatMessages wins over chat.
            pattern = re.escape(prefix + old) + r"(?=/|['\"]|$|\.ts|\.js|\s|[)`])"
            text = re.sub(pattern, prefix + token, text)
    for token, new in placeholders:
        for prefix in prefixes:
            text = text.replace(prefix + token, prefix + new)
    return text


def rewrite_absolute_imports(text: str) -> str:
    text = rewrite_mapped_paths(
        text,
        DB_MODULE,
        ["~/server/db/", "server/db/"],
    )
    # Directories (not leaf .ts modules).
    text = text.replace("~/server/db/postQuery", "~/server/db/feed/postQuery")
    text = text.replace("server/db/postQuery", "server/db/feed/postQuery")
    text = text.replace("~/server/db/user/", "~/server/db/auth/user/")
    text = text.replace("server/db/user/", "server/db/auth/user/")
    text = rewrite_mapped_paths(
        text,
        SVC_MODULE,
        ["~/server/services/", "server/services/"],
    )
    return text


REL_SPEC = re.compile(
    r"""(?P<head>(?:from\s+|import\s*\(\s*|export\s*\*\s*from\s+))(?P<q>['"])(?P<spec>\.[^'"]+)(?P=q)"""
)


def resolve_spec(from_file: Path, spec: str) -> Path | None:
    """Resolve a relative import spec against from_file's directory."""
    raw = (from_file.parent / spec).resolve()
    candidates = [
        raw,
        Path(str(raw) + ".ts"),
        Path(str(raw) + ".js"),
        Path(str(raw) + ".mjs"),
        Path(str(raw) + ".vue"),
        raw / "index.ts",
        raw / "index.js",
    ]
    for c in candidates:
        cr = c.resolve()
        if c.is_file() or cr.is_file():
            return cr if cr.is_file() else c
        if cr in FILE_MOVES:
            return cr
    for old in FILE_MOVES:
        if old == raw or old == Path(str(raw) + ".ts") or old.with_suffix("") == raw:
            return old
        if old.parent == raw and old.name.startswith("index."):
            return old
    return None


def to_import_spec(from_file: Path, target: Path) -> str:
    rel = os.path.relpath(target, start=from_file.parent)
    if target.suffix in {".ts", ".js", ".mjs"}:
        rel = rel[: -len(target.suffix)]
        if rel.endswith("/index"):
            rel = rel[: -len("/index")]
    if not rel.startswith("."):
        rel = "./" + rel
    return rel.replace(os.sep, "/")


def rewrite_relative_imports(old_file: Path, new_file: Path, text: str) -> str:
    """Rewrite relative imports as if authored at old_file, now living at new_file."""

    def repl(m: re.Match[str]) -> str:
        head, q, spec = m.group("head"), m.group("q"), m.group("spec")
        resolved = resolve_spec(old_file, spec)
        if resolved is None:
            old_depth = len(old_file.relative_to(ROOT).parts) - 1
            new_depth = len(new_file.relative_to(ROOT).parts) - 1
            extra = new_depth - old_depth
            if extra <= 0 or not spec.startswith("../"):
                return m.group(0)
            parts = spec.split("/")
            i = 0
            while i < len(parts) and parts[i] == "..":
                i += 1
            new_spec = "/".join([".."] * (i + extra) + parts[i:])
            return f"{head}{q}{new_spec}{q}"

        target = FILE_MOVES.get(resolved, resolved)
        new_spec = to_import_spec(new_file, target)
        return f"{head}{q}{new_spec}{q}"

    return REL_SPEC.sub(repl, text)


def rewrite_all_files() -> None:
    for old, new in FILE_MOVES.items():
        if new.suffix not in {".ts", ".vue", ".mjs", ".js"}:
            continue
        if not new.is_file():
            continue
        raw = new.read_text(encoding="utf-8")
        text = rewrite_absolute_imports(raw)
        text = rewrite_relative_imports(old, new, text)
        if text != raw:
            new.write_text(text, encoding="utf-8")
            print("updated", new.relative_to(ROOT))

    for path in ROOT.rglob("*"):
        if not path.is_file():
            continue
        if path.suffix not in {".ts", ".vue", ".mjs", ".md", ".js"}:
            continue
        if any(p in path.parts for p in ("node_modules", ".git", ".nuxt", "dist", ".output")):
            continue
        if path.resolve() in {p.resolve() for p in FILE_MOVES.values()}:
            continue
        raw = path.read_text(encoding="utf-8")
        text = rewrite_absolute_imports(raw)
        if text != raw:
            path.write_text(text, encoding="utf-8")
            print("updated", path.relative_to(ROOT))


def write_db_barrel() -> None:
    barrel = ROOT / "server/utils/db.ts"
    content = '''/**
 * Public surface of the server-side DB layer.
 *
 * Domain SQL lives under feature folders in `server/db/{feature}/`.
 * This barrel keeps callers stable (`~/server/utils/db`).
 *
 * Features: core, auth, time, feed, chat, money, friends, admin.
 */

export * from "../db/core/types";
export * from "../db/core/pool";
export * from "../db/core/ids";
export * from "../db/core/compute";
export { avatarUrlFromUploadId, toAuthUser } from "../db/core/mappers";
export * from "../db/time/epics";
export * from "../db/time/tasks";
export * from "../db/time/timer";
export * from "../db/auth/users";
export * from "../db/auth/auth-identities";
export * from "../db/auth/refresh-tokens";
export * from "../db/auth/email-verifications";
export * from "../db/auth/password-resets";
export * from "../db/admin/admin";
export {
  encodeFeedCursor,
  parseFeedCursor,
  assertPostVisible,
  listFeedPosts,
  getPostById,
} from "../db/feed/postQueries";
export {
  createPost,
  updatePost,
  deletePost,
  deletePostById,
} from "../db/feed/posts";
export * from "../db/feed/postReactions";
export * from "../db/feed/postComments";
export * from "../db/feed/categories";
export * from "../db/feed/uploads";
export * from "../db/feed/stories";
export * from "../db/core/jobs";
export * from "../db/admin/pendingArticles";
export * from "../db/chat/chat";
export * from "../db/money/money";
export * from "../db/money/moneySavings";
export * from "../db/money/moneyBudgets";
export * from "../db/friends/friendships";
// CLI-only migrator symbols stay direct imports from `~/server/db/core/migrator`.
export { migrationStatus, verifyMigrationsApplied } from "../db/core/migrator";
'''
    barrel.write_text(content, encoding="utf-8")
    print("wrote server/utils/db.ts")


def fix_migrator_migrations_path() -> None:
    """migrator.ts moved to core/; migrations/ stay at server/db/migrations/."""
    path = ROOT / "server/db/core/migrator.ts"
    text = path.read_text(encoding="utf-8")
    # Common patterns for the migrations directory constant.
    updated = text
    # Prefer explicit rewrite of join(__dirname, "migrations") style if present.
    updated = updated.replace(
        'join(__dirname, "migrations")',
        'join(__dirname, "..", "migrations")',
    )
    updated = updated.replace(
        "join(__dirname, 'migrations')",
        "join(__dirname, '..', 'migrations')",
    )
    # fileURLToPath / import.meta.url based roots
    updated = re.sub(
        r'(MIGRATIONS_DIR\s*=\s*[^\n]*?)(["\'])migrations\2',
        r'\1\2../migrations\2',
        updated,
        count=1,
    )
    if updated != text:
        path.write_text(updated, encoding="utf-8")
        print("fixed migrator migrations path")


def main() -> None:
    move_tree()
    write_db_barrel()
    rewrite_all_files()
    fix_migrator_migrations_path()
    print(f"moved {len(FILE_MOVES)} files")
    print("OK")


if __name__ == "__main__":
    main()

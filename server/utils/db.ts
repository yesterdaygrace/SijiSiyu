import Database from "better-sqlite3";
import { mkdirSync } from "node:fs";
import path from "node:path";
import type { EncryptedValue } from "./security.js";

const dataDir = path.join(process.cwd(), "data");
try {
  mkdirSync(dataDir, { recursive: true });
} catch {
  // Directory might already exist
}

const dbPath = process.env.DATABASE_PATH || path.join(dataDir, "saved.sqlite");
export const db = new Database(dbPath);
db.pragma("journal_mode = WAL");
db.pragma("foreign_keys = ON");
db.exec(`
  CREATE TABLE IF NOT EXISTS sessions (
    token_hash TEXT PRIMARY KEY,
    expires_at INTEGER NOT NULL,
    created_at INTEGER NOT NULL
  );

  CREATE TABLE IF NOT EXISTS account (
    singleton INTEGER PRIMARY KEY CHECK (singleton = 1),
    user_id TEXT NOT NULL,
    username TEXT NOT NULL,
    profile_json TEXT NOT NULL DEFAULT '{}',
    access_token_ciphertext TEXT NOT NULL,
    access_token_iv TEXT NOT NULL,
    access_token_tag TEXT NOT NULL,
    token_expires_at INTEGER,
    updated_at INTEGER NOT NULL
  );

  CREATE TABLE IF NOT EXISTS saved_posts (
    permalink TEXT PRIMARY KEY,
    thread_id TEXT,
    username TEXT NOT NULL DEFAULT '',
    text TEXT NOT NULL DEFAULT '',
    timestamp TEXT,
    media_type TEXT,
    media_url TEXT,
    thumbnail_url TEXT,
    saved_at TEXT,
    source TEXT NOT NULL DEFAULT 'browser-scan',
    payload_json TEXT NOT NULL DEFAULT '{}',
    updated_at INTEGER NOT NULL
  );

  CREATE INDEX IF NOT EXISTS idx_saved_posts_username ON saved_posts(username);
  CREATE INDEX IF NOT EXISTS idx_saved_posts_timestamp ON saved_posts(timestamp);

  CREATE TABLE IF NOT EXISTS sync_runs (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    started_at INTEGER NOT NULL,
    finished_at INTEGER NOT NULL,
    imported_count INTEGER NOT NULL,
    complete_scan INTEGER NOT NULL,
    source TEXT NOT NULL,
    status TEXT NOT NULL
  );

  CREATE TABLE IF NOT EXISTS collections (
    id TEXT PRIMARY KEY,
    name TEXT NOT NULL,
    icon TEXT NOT NULL DEFAULT 'bookmark',
    color TEXT NOT NULL DEFAULT '#ffffff',
    keywords TEXT NOT NULL DEFAULT '',
    is_default INTEGER NOT NULL DEFAULT 0,
    created_at INTEGER NOT NULL
  );

  CREATE TABLE IF NOT EXISTS post_collections (
    post_permalink TEXT NOT NULL,
    collection_id TEXT NOT NULL,
    created_at INTEGER NOT NULL,
    PRIMARY KEY (post_permalink, collection_id),
    FOREIGN KEY (post_permalink) REFERENCES saved_posts(permalink) ON DELETE CASCADE,
    FOREIGN KEY (collection_id) REFERENCES collections(id) ON DELETE CASCADE
  );

  CREATE INDEX IF NOT EXISTS idx_post_collections_collection ON post_collections(collection_id);
  CREATE INDEX IF NOT EXISTS idx_post_collections_post ON post_collections(post_permalink);
`);

export interface AccountRecord {
  userId: string;
  username: string;
  profile: Record<string, unknown>;
  encryptedToken: EncryptedValue;
  tokenExpiresAt: number | null;
  updatedAt: number;
}

interface AccountRow {
  user_id: string;
  username: string;
  profile_json: string;
  access_token_ciphertext: string;
  access_token_iv: string;
  access_token_tag: string;
  token_expires_at: number | null;
  updated_at: number;
}

export function saveAccount(account: AccountRecord): void {
  db.prepare(`
    INSERT INTO account (
      singleton, user_id, username, profile_json,
      access_token_ciphertext, access_token_iv, access_token_tag,
      token_expires_at, updated_at
    ) VALUES (1, ?, ?, ?, ?, ?, ?, ?, ?)
    ON CONFLICT(singleton) DO UPDATE SET
      user_id=excluded.user_id,
      username=excluded.username,
      profile_json=excluded.profile_json,
      access_token_ciphertext=excluded.access_token_ciphertext,
      access_token_iv=excluded.access_token_iv,
      access_token_tag=excluded.access_token_tag,
      token_expires_at=excluded.token_expires_at,
      updated_at=excluded.updated_at
  `).run(
    account.userId,
    account.username,
    JSON.stringify(account.profile),
    account.encryptedToken.ciphertext,
    account.encryptedToken.iv,
    account.encryptedToken.tag,
    account.tokenExpiresAt,
    account.updatedAt,
  );
}

export function getAccount(): AccountRecord | null {
  const row = db.prepare("SELECT * FROM account WHERE singleton = 1").get() as AccountRow | undefined;
  if (!row) return null;
  return {
    userId: row.user_id,
    username: row.username,
    profile: safeJsonObject(row.profile_json),
    encryptedToken: {
      ciphertext: row.access_token_ciphertext,
      iv: row.access_token_iv,
      tag: row.access_token_tag,
    },
    tokenExpiresAt: row.token_expires_at,
    updatedAt: row.updated_at,
  };
}

export function deleteAccount(): void {
  db.prepare("DELETE FROM account").run();
  db.prepare("DELETE FROM sessions").run();
}

export function createSession(tokenHash: string, expiresAt: number): void {
  db.prepare("INSERT INTO sessions (token_hash, expires_at, created_at) VALUES (?, ?, ?)")
    .run(tokenHash, expiresAt, Date.now());
}

export function hasSession(tokenHash: string): boolean {
  const row = db.prepare("SELECT expires_at FROM sessions WHERE token_hash = ?").get(tokenHash) as { expires_at: number } | undefined;
  if (!row) return false;
  if (row.expires_at <= Date.now()) {
    db.prepare("DELETE FROM sessions WHERE token_hash = ?").run(tokenHash);
    return false;
  }
  return true;
}

export function deleteSession(tokenHash: string): void {
  db.prepare("DELETE FROM sessions WHERE token_hash = ?").run(tokenHash);
}

export function cleanExpiredSessions(): void {
  db.prepare("DELETE FROM sessions WHERE expires_at <= ?").run(Date.now());
}

export interface SavedPostInput {
  permalink: string;
  threadId?: string | null;
  username?: string;
  text?: string;
  timestamp?: string | null;
  mediaType?: string | null;
  mediaUrl?: string | null;
  thumbnailUrl?: string | null;
  savedAt?: string | null;
  payload?: Record<string, unknown>;
}

export interface SavedPostRecord {
  permalink: string;
  threadId: string | null;
  username: string;
  text: string;
  timestamp: string | null;
  mediaType: string | null;
  mediaUrl: string | null;
  thumbnailUrl: string | null;
  savedAt: string | null;
  source: string;
  updatedAt: number;
  collections?: string[];
}

export interface CollectionRecord {
  id: string;
  name: string;
  icon: string;
  color: string;
  keywords: string;
  isDefault: boolean;
  createdAt: number;
  postCount: number;
}

export function initCollections(): void {
  const countRow = db.prepare("SELECT COUNT(*) AS count FROM collections").get() as { count: number };
  if (countRow.count === 0) {
    const insertCol = db.prepare(`
      INSERT OR IGNORE INTO collections (id, name, icon, color, keywords, is_default, created_at)
      VALUES (?, ?, ?, ?, ?, ?, ?)
    `);
    const now = Date.now();
    insertCol.run("dev", "Development", "code", "#ffffff", "code,go,golang,python,rust,sql,db,postgres,api,concurrency,dev,developer,backend,frontend,linux,git,docker,programming,typescript,javascript,vue,nuxt,react", 0, now);
    insertCol.run("design", "Design", "layout", "#ffffff", "design,ui,ux,interface,typography,tokens,css,layout,whitespace,visual,palette,brand,oled,minimal", 0, now + 1);
    insertCol.run("articles", "Articles & Reads", "book-open", "#ffffff", "read,book,programmer,craft,notes,article,essay,queue,study,learn,review,guide", 0, now + 2);
    insertCol.run("ideas", "Ideas & Tools", "lightbulb", "#ffffff", "idea,project,tool,startup,product,feature,workflow,system,automation,club,saas,indie", 0, now + 3);
  }

  // Populate post_collections for existing posts if empty
  const pcCount = db.prepare("SELECT COUNT(*) AS count FROM post_collections").get() as { count: number };
  if (pcCount.count === 0) {
    const cols = db.prepare("SELECT id, keywords FROM collections WHERE keywords != ''").all() as Array<{ id: string; keywords: string }>;
    const posts = db.prepare("SELECT permalink, text, username FROM saved_posts").all() as Array<{ permalink: string; text: string; username: string }>;
    if (posts.length > 0 && cols.length > 0) {
      const insertPC = db.prepare("INSERT OR IGNORE INTO post_collections (post_permalink, collection_id, created_at) VALUES (?, ?, ?)");
      const now = Date.now();
      const batch = db.transaction(() => {
        for (const p of posts) {
          const text = `${p.text} ${p.username}`.toLowerCase();
          for (const col of cols) {
            const kwList = col.keywords.split(",").map((k) => k.trim().toLowerCase()).filter(Boolean);
            if (kwList.some((kw) => text.includes(kw))) {
              insertPC.run(p.permalink, col.id, now);
            }
          }
        }
      });
      batch();
    }
  }
}
initCollections();

export function listCollections(): CollectionRecord[] {
  const rows = db.prepare(`
    SELECT c.id, c.name, c.icon, c.color, c.keywords, c.is_default, c.created_at,
           COUNT(pc.post_permalink) AS post_count
    FROM collections c
    LEFT JOIN post_collections pc ON pc.collection_id = c.id
    GROUP BY c.id
    ORDER BY c.created_at ASC
  `).all() as Array<{
    id: string;
    name: string;
    icon: string;
    color: string;
    keywords: string;
    is_default: number;
    created_at: number;
    post_count: number;
  }>;

  return rows.map((r) => ({
    id: r.id,
    name: r.name,
    icon: r.icon,
    color: r.color,
    keywords: r.keywords,
    isDefault: Boolean(r.is_default),
    createdAt: r.created_at,
    postCount: r.post_count,
  }));
}

export function createCollection(input: {
  id?: string;
  name: string;
  icon?: string;
  color?: string;
  keywords?: string;
}): CollectionRecord {
  const name = input.name.trim();
  if (!name) throw new Error("Collection name cannot be empty");

  let id = input.id ? input.id.trim().toLowerCase() : name.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-+|-+$/g, "");
  if (!id || id === "all" || id === "uncategorized") {
    id = `col_${Date.now().toString(36)}`;
  }

  const existing = db.prepare("SELECT id FROM collections WHERE id = ?").get(id);
  if (existing) {
    id = `${id}-${Date.now().toString(36).slice(-4)}`;
  }

  const icon = input.icon?.trim() || "bookmark";
  const color = input.color?.trim() || "#ffffff";
  const keywords = input.keywords?.trim() || "";
  const now = Date.now();

  db.prepare(`
    INSERT INTO collections (id, name, icon, color, keywords, is_default, created_at)
    VALUES (?, ?, ?, ?, ?, 0, ?)
  `).run(id, name, icon, color, keywords, now);

  if (keywords) {
    const kwList = keywords.split(",").map((k) => k.trim().toLowerCase()).filter(Boolean);
    if (kwList.length > 0) {
      const posts = db.prepare("SELECT permalink, text, username FROM saved_posts").all() as Array<{ permalink: string; text: string; username: string }>;
      const insertPC = db.prepare("INSERT OR IGNORE INTO post_collections (post_permalink, collection_id, created_at) VALUES (?, ?, ?)");
      const batch = db.transaction(() => {
        for (const p of posts) {
          const text = `${p.text} ${p.username}`.toLowerCase();
          if (kwList.some((k) => text.includes(k))) {
            insertPC.run(p.permalink, id, now);
          }
        }
      });
      batch();
    }
  }

  const countRow = db.prepare("SELECT COUNT(*) AS count FROM post_collections WHERE collection_id = ?").get(id) as { count: number };

  return {
    id,
    name,
    icon,
    color,
    keywords,
    isDefault: false,
    createdAt: now,
    postCount: countRow.count,
  };
}

export function updateCollection(
  id: string,
  input: {
    name?: string;
    icon?: string;
    color?: string;
    keywords?: string;
  },
): CollectionRecord {
  if (id === "all" || id === "uncategorized") {
    throw new Error(`Cannot modify '${id}' collection`);
  }

  const existing = db.prepare("SELECT * FROM collections WHERE id = ?").get(id) as
    | {
        id: string;
        name: string;
        icon: string;
        color: string;
        keywords: string;
        is_default: number;
        created_at: number;
      }
    | undefined;

  if (!existing) {
    throw new Error(`Collection not found: ${id}`);
  }

  const name = input.name !== undefined ? input.name.trim() : existing.name;
  if (!name) throw new Error("Collection name cannot be empty");
  const icon = input.icon !== undefined ? input.icon.trim() : existing.icon;
  const color = input.color !== undefined ? input.color.trim() : existing.color;
  const keywords = input.keywords !== undefined ? input.keywords.trim() : existing.keywords;

  db.prepare(`
    UPDATE collections
    SET name = ?, icon = ?, color = ?, keywords = ?
    WHERE id = ?
  `).run(name, icon, color, keywords, id);

  // If keywords changed, re-evaluate keyword assignments for this collection
  if (keywords && keywords !== existing.keywords) {
    const kwList = keywords.split(",").map((k) => k.trim().toLowerCase()).filter(Boolean);
    if (kwList.length > 0) {
      const posts = db.prepare("SELECT permalink, text, username FROM saved_posts").all() as Array<{
        permalink: string;
        text: string;
        username: string;
      }>;
      const insertPC = db.prepare(
        "INSERT OR IGNORE INTO post_collections (post_permalink, collection_id, created_at) VALUES (?, ?, ?)",
      );
      const batch = db.transaction(() => {
        for (const p of posts) {
          const text = `${p.text} ${p.username}`.toLowerCase();
          if (kwList.some((k) => text.includes(k))) {
            insertPC.run(p.permalink, id, Date.now());
          }
        }
      });
      batch();
    }
  }

  const countRow = db.prepare("SELECT COUNT(*) AS count FROM post_collections WHERE collection_id = ?").get(id) as {
    count: number;
  };

  return {
    id,
    name,
    icon,
    color,
    keywords,
    isDefault: Boolean(existing.is_default),
    createdAt: existing.created_at,
    postCount: countRow.count,
  };
}

export function deleteCollection(id: string): boolean {
  if (id === "all") {
    throw new Error("Cannot delete 'all' collection");
  }
  const deletePC = db.prepare("DELETE FROM post_collections WHERE collection_id = ?");
  const deleteCol = db.prepare("DELETE FROM collections WHERE id = ?");

  const run = db.transaction(() => {
    deletePC.run(id);
    const result = deleteCol.run(id);
    return result.changes > 0;
  });

  return run();
}

export function assignPostToCollection(permalink: string, collectionId: string, action: "add" | "remove"): void {
  if (collectionId === "all") return;
  if (action === "add") {
    db.prepare("INSERT OR IGNORE INTO post_collections (post_permalink, collection_id, created_at) VALUES (?, ?, ?)")
      .run(permalink, collectionId, Date.now());
  } else {
    db.prepare("DELETE FROM post_collections WHERE post_permalink = ? AND collection_id = ?")
      .run(permalink, collectionId);
  }
}

export function getPostCollections(permalink: string): string[] {
  const rows = db.prepare("SELECT collection_id FROM post_collections WHERE post_permalink = ?").all(permalink) as Array<{ collection_id: string }>;
  return rows.map((r) => r.collection_id);
}

function safeJsonObject(input: string): Record<string, unknown> {
  try {
    const parsed: unknown = JSON.parse(input);
    return parsed && typeof parsed === "object" && !Array.isArray(parsed)
      ? (parsed as Record<string, unknown>)
      : {};
  } catch {
    return {};
  }
}

export function listSavedPosts(options: {
  limit: number;
  offset: number;
  search?: string;
  sort?: string;
  collection?: string;
  mediaType?: string;
}): { posts: SavedPostRecord[]; total: number } {
  const search = options.search?.trim();
  const collection = options.collection?.trim();
  const filterByCollection = collection && collection !== "all";
  const mediaType = options.mediaType?.trim();

  const conditions: string[] = [];
  const params: Record<string, number | string> = { limit: options.limit, offset: options.offset };
  const countParams: Record<string, number | string> = {};

  if (search) {
    conditions.push("(sp.username LIKE @search OR sp.text LIKE @search OR sp.permalink LIKE @search)");
    params.search = `%${search}%`;
    countParams.search = `%${search}%`;
  }

  if (filterByCollection) {
    if (collection === "uncategorized") {
      conditions.push("sp.permalink NOT IN (SELECT post_permalink FROM post_collections)");
    } else {
      conditions.push("sp.permalink IN (SELECT post_permalink FROM post_collections WHERE collection_id = @collection)");
      params.collection = collection;
      countParams.collection = collection;
    }
  }

  if (mediaType && mediaType !== "all") {
    if (mediaType === "media") {
      conditions.push("(sp.media_url IS NOT NULL OR (sp.media_type IS NOT NULL AND sp.media_type != 'TEXT'))");
    } else if (mediaType === "text") {
      conditions.push("(sp.media_url IS NULL AND (sp.media_type IS NULL OR sp.media_type = 'TEXT'))");
    } else if (mediaType === "links") {
      conditions.push("(sp.text LIKE '%http://%' OR sp.text LIKE '%https://%')");
    }
  }

  const where = conditions.length > 0 ? `WHERE ${conditions.join(" AND ")}` : "";

  let orderBy = "ORDER BY COALESCE(sp.saved_at, sp.timestamp, '') DESC, sp.updated_at DESC";
  switch (options.sort) {
    case "oldest":
    case "oldest_saved":
      orderBy = "ORDER BY COALESCE(sp.saved_at, sp.timestamp, '') ASC, sp.updated_at ASC";
      break;
    case "newest_post":
      orderBy = "ORDER BY COALESCE(sp.timestamp, '') DESC, sp.updated_at DESC";
      break;
    case "oldest_post":
      orderBy = "ORDER BY COALESCE(sp.timestamp, '') ASC, sp.updated_at ASC";
      break;
    case "author":
    case "author_asc":
      orderBy = "ORDER BY sp.username COLLATE NOCASE ASC, COALESCE(sp.saved_at, sp.timestamp, '') DESC";
      break;
    case "author_desc":
      orderBy = "ORDER BY sp.username COLLATE NOCASE DESC, COALESCE(sp.saved_at, sp.timestamp, '') DESC";
      break;
    case "title":
    case "title_asc":
      orderBy = "ORDER BY sp.text COLLATE NOCASE ASC";
      break;
    case "recent":
    case "recent_saved":
    case "newest":
    case "newest_saved":
    default:
      orderBy = "ORDER BY COALESCE(sp.saved_at, sp.timestamp, '') DESC, sp.updated_at DESC";
      break;
  }

  const totalRow = db.prepare(`SELECT COUNT(*) AS total FROM saved_posts sp ${where}`).get(countParams) as { total: number };
  const rows = db.prepare(`SELECT sp.* FROM saved_posts sp ${where} ${orderBy} LIMIT @limit OFFSET @offset`)
    .all(params) as Array<Record<string, unknown>>;

  const permalinks = rows.map((r) => String(r.permalink));
  const collectionsByPost: Record<string, string[]> = {};
  if (permalinks.length > 0) {
    const placeholders = permalinks.map(() => "?").join(",");
    const pcRows = db.prepare(`SELECT post_permalink, collection_id FROM post_collections WHERE post_permalink IN (${placeholders})`).all(permalinks) as Array<{ post_permalink: string; collection_id: string }>;
    for (const pc of pcRows) {
      const arr = collectionsByPost[pc.post_permalink] ?? [];
      arr.push(pc.collection_id);
      collectionsByPost[pc.post_permalink] = arr;
    }
  }

  return {
    posts: rows.map((r) => mapSavedPostRow(r, collectionsByPost[String(r.permalink)] || [])),
    total: totalRow.total,
  };
}

export function getSavedPostsCount(): number {
  return (db.prepare("SELECT COUNT(*) AS count FROM saved_posts").get() as { count: number }).count;
}

function mapSavedPostRow(row: Record<string, unknown>, collections: string[] = []): SavedPostRecord {
  return {
    permalink: String(row.permalink),
    threadId: typeof row.thread_id === "string" ? row.thread_id : null,
    username: String(row.username ?? ""),
    text: String(row.text ?? ""),
    timestamp: typeof row.timestamp === "string" ? row.timestamp : null,
    mediaType: typeof row.media_type === "string" ? row.media_type : null,
    mediaUrl: typeof row.media_url === "string" ? row.media_url : null,
    thumbnailUrl: typeof row.thumbnail_url === "string" ? row.thumbnail_url : null,
    savedAt: typeof row.saved_at === "string" ? row.saved_at : null,
    source: String(row.source ?? "browser-scan"),
    updatedAt: Number(row.updated_at),
    collections,
  };
}

export function upsertSavedPosts(posts: SavedPostInput[], source = "browser-scan"): void {
  const now = Date.now();
  const stmt = db.prepare(`
    INSERT INTO saved_posts (
      permalink, thread_id, username, text, timestamp, media_type,
      media_url, thumbnail_url, saved_at, source, payload_json, updated_at
    ) VALUES (
      @permalink, @threadId, @username, @text, @timestamp, @mediaType,
      @mediaUrl, @thumbnailUrl, @savedAt, @source, @payloadJson, @updatedAt
    )
    ON CONFLICT(permalink) DO UPDATE SET
      thread_id=excluded.thread_id,
      username=excluded.username,
      text=excluded.text,
      timestamp=excluded.timestamp,
      media_type=excluded.media_type,
      media_url=excluded.media_url,
      thumbnail_url=excluded.thumbnail_url,
      saved_at=COALESCE(excluded.saved_at, saved_posts.saved_at),
      source=excluded.source,
      payload_json=excluded.payload_json,
      updated_at=excluded.updated_at
  `);
  const upsert = db.transaction((items: SavedPostInput[]) => {
    for (const post of items) {
      stmt.run({
        permalink: post.permalink,
        threadId: post.threadId ?? null,
        username: post.username ?? "",
        text: post.text ?? "",
        timestamp: post.timestamp ?? null,
        mediaType: post.mediaType ?? null,
        mediaUrl: post.mediaUrl ?? null,
        thumbnailUrl: post.thumbnailUrl ?? null,
        savedAt: post.savedAt ?? null,
        source,
        payloadJson: JSON.stringify(post.payload ?? {}),
        updatedAt: now,
      });
    }

    const cols = db.prepare("SELECT id, keywords FROM collections WHERE keywords != ''").all() as Array<{ id: string; keywords: string }>;
    if (cols.length > 0) {
      const insertPC = db.prepare("INSERT OR IGNORE INTO post_collections (post_permalink, collection_id, created_at) VALUES (?, ?, ?)");
      for (const post of items) {
        const text = `${post.text || ""} ${post.username || ""}`.toLowerCase();
        for (const col of cols) {
          const kwList = col.keywords.split(",").map((k) => k.trim().toLowerCase()).filter(Boolean);
          if (kwList.some((k) => text.includes(k))) {
            insertPC.run(post.permalink, col.id, now);
          }
        }
      }
    }
  });
  upsert(posts);
}

export function reconcileSavedPosts(posts: SavedPostInput[], source = "browser-scan", confirmEmpty = false): void {
  const now = Date.now();
  const upsert = db.transaction((items: SavedPostInput[]) => {
    upsertSavedPosts(items, source);
    if (items.length === 0 && !confirmEmpty) {
      throw new Error("An empty complete scan requires confirmEmpty=true to avoid wiping the library accidentally.");
    }
    if (items.length === 0) {
      db.prepare("DELETE FROM saved_posts").run();
    } else {
      const keep = new Set(items.map((item) => item.permalink));
      const existing = db.prepare("SELECT permalink FROM saved_posts").all() as Array<{ permalink: string }>;
      const remove = db.prepare("DELETE FROM saved_posts WHERE permalink = ?");
      for (const row of existing) if (!keep.has(row.permalink)) remove.run(row.permalink);
    }
  });
  upsert(posts);
  db.prepare(`INSERT INTO sync_runs (started_at, finished_at, imported_count, complete_scan, source, status)
    VALUES (?, ?, ?, 1, ?, 'complete')`).run(now, Date.now(), posts.length, source);
}

export function logPartialSync(count: number, source = "browser-scan"): void {
  const now = Date.now();
  db.prepare(`INSERT INTO sync_runs (started_at, finished_at, imported_count, complete_scan, source, status)
    VALUES (?, ?, ?, 0, ?, 'partial')`).run(now, now, count, source);
}

export function getLatestSyncRun(): Record<string, unknown> | null {
  return (db.prepare("SELECT * FROM sync_runs ORDER BY id DESC LIMIT 1").get() as Record<string, unknown> | undefined) ?? null;
}

export function deleteSavedPost(permalink: string): boolean {
  const result = db.prepare("DELETE FROM saved_posts WHERE permalink = ?").run(permalink);
  return result.changes > 0;
}

export function clearSavedPosts(): void {
  db.prepare("DELETE FROM saved_posts").run();
}

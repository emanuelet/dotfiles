#!/usr/bin/env -S node --experimental-strip-types

/**
 * sync-skills.ts
 *
 * Bi-directional sync between Bifrost skills repository and ~/.agents/skills/
 *
 * Push phase (local → Bifrost):
 *   - Detects locally-added skills (directory exists, not on Bifrost)
 *   - Detects locally-modified skills (file hash differs from manifest)
 *   - Creates or updates them on Bifrost with inline file contents
 *
 * Pull phase (Bifrost → local):
 *   - Downloads the all-skills ZIP from Bifrost
 *   - Extracts changed remote skills into ~/.agents/skills/<name>/
 *   - Tracks versions and file hashes in .bifrost-manifest.json
 *
 * Run: node --experimental-strip-types sync-skills.ts
 *       npx tsx sync-skills.ts
 *       deno run sync-skills.ts
 */

import * as fs from "node:fs/promises";
import * as crypto from "node:crypto";
import * as path from "node:path";
import { execSync } from "node:child_process";

const BIFROST_URL = process.env.BIFROST_URL || "http://localhost:8090";
const SKILLS_BASE = process.env.SKILLS_BASE || `${process.env.HOME}/.agents/skills`;
const MANIFEST_PATH = `${SKILLS_BASE}/.bifrost-manifest.json`;

interface SkillEntry {
  id: string;
  name: string;
  latest_version: string;
  description?: string;
  license?: string | null;
  compatibility?: string | null;
  file_count?: number;
}

interface Manifest {
  updated_at: string;
  skills: Record<string, string>; // name → latest_version (back compat)
  skill_ids: Record<string, string>; // name → bifrost UUID
  file_hashes: Record<string, string>; // name → sha256 of all skill files
}

interface Frontmatter {
  name?: string;
  description?: string;
  license?: string | null;
  compatibility?: string | null;
  [key: string]: unknown;
}

async function readManifest(): Promise<Manifest> {
  try {
    const text = await fs.readFile(MANIFEST_PATH, "utf-8");
    const parsed = JSON.parse(text);
    // Normalise from old flat format
    return {
      skills: parsed.skills || {},
      file_hashes: parsed.file_hashes || {},
      skill_ids: parsed.skill_ids || {},
      updated_at: parsed.updated_at || new Date().toISOString(),
    };
  } catch {
    return { updated_at: "", skills: {}, file_hashes: {}, skill_ids: {} };
  }
}

async function writeManifest(manifest: Manifest): Promise<void> {
  manifest.updated_at = new Date().toISOString();
  await fs.writeFile(MANIFEST_PATH, JSON.stringify(manifest, null, 2));
}

function elapsed(start: number): string {
  const ms = Date.now() - start;
  if (ms < 1000) return `${ms}ms`;
  return `${(ms / 1000).toFixed(1)}s`;
}

// ── Local hash computation ──────────────────────────────────────────

/** Walk a skill directory and return { path → content } for every file. */
async function readSkillFiles(skillDir: string): Promise<Map<string, string>> {
  const files = new Map<string, string>();
  const entries = await fs.readdir(skillDir, { withFileTypes: true });

  for (const entry of entries) {
    const full = path.join(skillDir, entry.name);
    if (entry.isDirectory()) {
      const nested = await readSkillFiles(full);
      for (const [k, v] of nested) files.set(`${entry.name}/${k}`, v);
    } else if (entry.isFile()) {
      const buf = await fs.readFile(full, "utf-8");
      files.set(entry.name, buf);
    }
  }
  return files;
}

/** Compute a deterministic sha256 hex hash of all files in a skill directory. */
async function computeSkillHash(skillDir: string): Promise<string> {
  const files = await readSkillFiles(skillDir);
  const hash = crypto.createHash("sha256");
  const sortedPaths = [...files.keys()].sort();
  for (const p of sortedPaths) {
    hash.update(`${p}\0`);
    hash.update(files.get(p)!);
  }
  return hash.digest("hex");
}

// ── Frontmatter parsing ─────────────────────────────────────────────

/** Minimal YAML frontmatter parser (handles name, description, license, compatibility). */
function parseFrontmatter(markdown: string): Frontmatter {
  const fm: Frontmatter = {};
  const match = markdown.match(/^---\n([\s\S]*?)\n---/);
  if (!match) return fm;

  const body = match[1];
  for (const line of body.split("\n")) {
    const kvMatch = line.match(/^(\w+):\s*(.*)$/);
    if (!kvMatch) continue;
    let [, key, val] = kvMatch;
    val = val.trim();
    if (val === "") fm[key] = null;
    else if (val === "null") fm[key] = null;
    else if (val === "true") fm[key] = true;
    else if (val === "false") fm[key] = false;
    else fm[key] = val;
  }
  return fm;
}

/** Strip YAML frontmatter from markdown, returning only the body content. */
function stripFrontmatter(markdown: string): string {
  return markdown.replace(/^---\n[\s\S]*?\n---\n?/, "");
}

// ── Bi-directional helpers ──────────────────────────────────────────

interface SkillFilePayload {
  path: string;
  source_type: "text";
  mime_type: string;
  content: string;
}

const MIME_MAP: Record<string, string> = {
  ".md": "text/markdown",
  ".ts": "text/typescript",
  ".js": "text/javascript",
  ".json": "application/json",
  ".yaml": "text/yaml",
  ".yml": "text/yaml",
  ".txt": "text/plain",
  ".sh": "text/x-shellscript",
  ".py": "text/x-python",
  ".html": "text/html",
  ".css": "text/css",
  ".svg": "image/svg+xml",
  ".png": "image/png",
  ".jpg": "image/jpeg",
  ".jpeg": "image/jpeg",
  ".gif": "image/gif",
  ".wasm": "application/wasm",
};

function mimeForFile(name: string): string {
  const ext = path.extname(name).toLowerCase();
  return MIME_MAP[ext] || "application/octet-stream";
}

function isTextFile(name: string): boolean {
  const ext = path.extname(name).toLowerCase();
  return ![
    ".png", ".jpg", ".jpeg", ".gif", ".ico",
    ".woff", ".woff2", ".ttf", ".eot",
    ".zip", ".gz", ".tar", ".wasm",
  ].includes(ext);
}

async function buildFilePayloads(skillDir: string): Promise<SkillFilePayload[]> {
  const files = await readSkillFiles(skillDir);
  const payloads: SkillFilePayload[] = [];
  const sortedPaths = [...files.keys()].sort();
  for (const p of sortedPaths) {
    if (p === "SKILL.md") continue; // SKILL.md is skill_md_body, not in files array
    if (!isTextFile(p)) continue; // skip binary files for inline
    payloads.push({
      path: p,
      source_type: "text",
      mime_type: mimeForFile(p),
      content: files.get(p)!,
    });
  }
  return payloads;
}

async function fetchSkillList(): Promise<SkillEntry[]> {
  const all: SkillEntry[] = [];
  let offset = 0;
  const limit = 100;

  while (true) {
    const url = `${BIFROST_URL}/api/skills?limit=${limit}&offset=${offset}`;
    const res = await fetch(url);
    if (!res.ok) {
      throw new Error(`Failed to fetch skills list: ${res.status} ${res.statusText}`);
    }
    const data = await res.json();
    const skills: SkillEntry[] = data.skills || [];
    all.push(...skills);

    if (offset + limit >= data.total) break;
    offset += limit;
  }

  return all;
}

// ── Push phase: local → Bifrost ────────────────────────────────────

async function pushLocalChanges(manifest: Manifest): Promise<number> {
  let pushed = 0;

  // 1. Build name → id map from Bifrost
  const remoteSkills = await fetchSkillList();
  const remoteByName = new Map<string, SkillEntry>();
  for (const s of remoteSkills) remoteByName.set(s.name, s);

  // 2. Scan local skill directories
  const entries = await fs.readdir(SKILLS_BASE, { withFileTypes: true });
  const localSkillDirs = entries
    .filter((e) => e.isDirectory() && !e.name.startsWith("."))
    .map((e) => e.name);

  for (const name of localSkillDirs) {
    const skillDir = `${SKILLS_BASE}/${name}`;
    const skillMdPath = `${skillDir}/SKILL.md`;

    // Only process directories that have a SKILL.md
    try {
      await fs.access(skillMdPath);
    } catch {
      continue;
    }

    const currentHash = await computeSkillHash(skillDir);
    const previousHash = manifest.file_hashes[name] || "";

    // Skip if unchanged locally
    if (currentHash === previousHash) continue;

    const skillMdContent = await fs.readFile(skillMdPath, "utf-8");
    const fm = parseFrontmatter(skillMdContent);
    const description = fm.description || name;
    const license = fm.license || null;
    const compatibility = fm.compatibility || null;

    const filePayloads = await buildFilePayloads(skillDir);

    const remote = remoteByName.get(name);

    if (remote) {
      // ── Update existing skill ──
      const version = bumpVersion(remote.latest_version);
      console.log(`[sync-skills] Pushing update: ${name} → v${version}`);

      const res = await fetch(`${BIFROST_URL}/api/skills/${remote.id}`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          description,
          skill_md_body: stripFrontmatter(skillMdContent),
          version,
          license,
          compatibility,
          files: filePayloads,
        }),
      });
      if (!res.ok) {
        const err = await res.json();
        console.error(`[sync-skills]  FAILED to update ${name}: ${JSON.stringify(err.error || err)}`);
        continue;
      }
      await res.json();
      manifest.skills[name] = version;
      manifest.skill_ids[name] = remote.id;
      pushed++;
    } else {
      // ── Create new skill ──
      const version = "1.0.0";
      console.log(`[sync-skills] Pushing new: ${name} → v${version}`);

      const res = await fetch(`${BIFROST_URL}/api/skills`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          name,
          description,
          skill_md_body: stripFrontmatter(skillMdContent),
          version,
          license,
          compatibility,
          files: filePayloads,
        }),
      });
      if (!res.ok) {
        const err = await res.json();
        console.error(`[sync-skills]  FAILED to create ${name}: ${JSON.stringify(err.error || err)}`);
        continue;
      }
      const data = await res.json();
      const newId = data.skill?.id;
      if (newId) manifest.skill_ids[name] = newId;
      manifest.skills[name] = version;
      pushed++;
    }

    manifest.file_hashes[name] = currentHash;
  }

  return pushed;
}

/** Bump the patch version: 1.0.0 → 1.0.1, 1.2.9 → 1.2.10 */
function bumpVersion(v: string): string {
  const parts = v.replace(/^v/, "").split(".");
  const patch = parseInt(parts[2] || "0", 10);
  return `${parts[0] || "1"}.${parts[1] || "0"}.${patch + 1}`;
}

// ── Pull phase: Bifrost → local ────────────────────────────────────

async function extractZip(zipPath: string, skills: SkillEntry[]): Promise<number> {
  let extracted = 0;
  const tmpDir = `${SKILLS_BASE}/.tmp-${Date.now()}`;
  await fs.mkdir(tmpDir, { recursive: true });

  execSync(`unzip -o "${zipPath}"`, { cwd: tmpDir });

  for (const skill of skills) {
    const src = `${tmpDir}/${skill.name}`;
    const dst = `${SKILLS_BASE}/${skill.name}`;
    try {
      await fs.rm(dst, { recursive: true, force: true });
    } catch {
      // doesn't exist yet
    }
    try {
      await fs.rename(src, dst);
      extracted++;
    } catch {
      // skill dir might not exist in ZIP (empty skills)
    }
  }

  await fs.rm(tmpDir, { recursive: true, force: true });
  return extracted;
}

async function pullRemoteChanges(manifest: Manifest): Promise<void> {
  const remoteSkills = await fetchSkillList();
  const remoteVersions: Record<string, string> = {};
  for (const s of remoteSkills) {
    remoteVersions[s.name] = s.latest_version;
  }

  // Compute which skills changed remotely (version differs from manifest)
  const changed: SkillEntry[] = [];
  for (const s of remoteSkills) {
    if (manifest.skills[s.name] !== s.latest_version) {
      changed.push(s);
    }
  }

  if (changed.length === 0) {
    console.log(`[sync-skills] No remote changes (${remoteSkills.length} skills up to date)`);
    return;
  }

  console.log(`[sync-skills] ${changed.length}/${remoteSkills.length} skills changed remotely, downloading...`);
  const zipUrl = `${BIFROST_URL}/api/skills/serve/all/download.zip`;
  const zipRes = await fetch(zipUrl);
  if (!zipRes.ok) {
    throw new Error(`Failed to download ZIP: ${zipRes.status} ${zipRes.statusText}`);
  }

  const zipBuf = await zipRes.arrayBuffer();
  const zipPath = `${SKILLS_BASE}/.sync-${Date.now()}.zip`;
  await fs.writeFile(zipPath, new Uint8Array(zipBuf));

  const extracted = await extractZip(zipPath, remoteSkills);
  await fs.unlink(zipPath);

  // Update manifest remote versions
  for (const s of remoteSkills) {
    manifest.skills[s.name] = s.latest_version;
    manifest.skill_ids[s.name] = s.id;
    // Compute local hash fresh so future pushes detect edits correctly
    const skillDir = `${SKILLS_BASE}/${s.name}`;
    try {
      await fs.access(`${skillDir}/SKILL.md`);
      manifest.file_hashes[s.name] = await computeSkillHash(skillDir);
    } catch {
      // skill not extracted (empty) — hash stays empty
      manifest.file_hashes[s.name] = "";
    }
  }

  console.log(`[sync-skills] Done: ${extracted} skills extracted`);
}

// ── Main ────────────────────────────────────────────────────────────

async function main(): Promise<void> {
  const start = Date.now();
  console.log(`[sync-skills] Bi-directional sync ${BIFROST_URL} ↔ ${SKILLS_BASE}`);

  await fs.mkdir(SKILLS_BASE, { recursive: true });
  const manifest = await readManifest();

  // Phase 1: Push local changes → Bifrost
  const pushed = await pushLocalChanges(manifest);

  // Phase 2: Pull remote changes → local
  await pullRemoteChanges(manifest);

  // Save manifest
  await writeManifest(manifest);

  const parts: string[] = [];
  if (pushed > 0) parts.push(`${pushed} pushed`);
  const totalSkills = Object.keys(manifest.skills).length;
  parts.push(`${totalSkills} total skills`);
  console.log(`[sync-skills] Complete → ${elapsed(start)} (${parts.join(", ")})`);
}

main().catch((err) => {
  console.error(`[sync-skills] FAILED: ${err.message}`);
  process.exit(1);
});

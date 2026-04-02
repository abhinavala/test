import { describe, it, expect, beforeEach, afterAll } from "vitest";
import { PrismaBetterSqlite3 } from "@prisma/adapter-better-sqlite3";
import { PrismaClient } from "../../../generated/prisma";
import {
  createExport,
  findExport,
  findOrCreateExport,
  getExportHistory,
  isDuplicate,
  generateContentHash,
  disconnect,
} from "../../models/exportHistory";
import { ExportFormat } from "../../types/export";

import path from "path";

function resolveDatabaseUrl(): string {
  const raw = process.env.SQLITE_URL || "file:./prisma/dev.db";
  if (raw.startsWith("file:./") || raw.startsWith("file:../")) {
    const relativePath = raw.replace("file:", "");
    return "file:" + path.resolve(process.cwd(), relativePath);
  }
  return raw;
}

const adapter = new PrismaBetterSqlite3({ url: resolveDatabaseUrl() });
const prisma = new PrismaClient({ adapter }) as InstanceType<typeof PrismaClient>;

beforeEach(async () => {
  await prisma.exportHistory.deleteMany();
});

afterAll(async () => {
  await prisma.exportHistory.deleteMany();
  await prisma.$disconnect();
  await disconnect();
});

describe("exportHistory", () => {
  describe("createExport", () => {
    it("successfully saves a new export record to database", async () => {
      const request = {
        sessionId: "session-1",
        format: ExportFormat.MARKDOWN,
        content: "# Meeting Notes\n\nSome content here.",
      };

      const record = await createExport(request);

      expect(record.id).toBeDefined();
      expect(record.sessionId).toBe("session-1");
      expect(record.format).toBe(ExportFormat.MARKDOWN);
      expect(record.content).toBe(request.content);
      expect(record.contentHash).toBe(generateContentHash(request.content));
      expect(record.createdAt).toBeInstanceOf(Date);

      // Verify record is retrievable via findExport
      const found = await findExport("session-1", ExportFormat.MARKDOWN);
      expect(found).not.toBeNull();
      expect(found!.id).toBe(record.id);
      expect(found!.content).toBe(request.content);
    });

    it("throws error when attempting to save duplicate sessionId+format combination", async () => {
      const request = {
        sessionId: "session-dup",
        format: ExportFormat.PDF,
        content: "First export content",
      };

      await createExport(request);

      // Attempting to create a duplicate should throw
      await expect(
        createExport({
          sessionId: "session-dup",
          format: ExportFormat.PDF,
          content: "Different content, same session+format",
        })
      ).rejects.toThrow();

      // Verify only one record exists
      const history = await getExportHistory("session-dup");
      expect(history).toHaveLength(1);
    });

    it("allows same sessionId with different formats", async () => {
      await createExport({
        sessionId: "session-multi",
        format: ExportFormat.PDF,
        content: "PDF content",
      });

      await createExport({
        sessionId: "session-multi",
        format: ExportFormat.HTML,
        content: "HTML content",
      });

      const history = await getExportHistory("session-multi");
      expect(history).toHaveLength(2);
    });

    it("throws error when content exceeds maximum size", async () => {
      const largeContent = "x".repeat(16 * 1024 * 1024 + 1);

      await expect(
        createExport({
          sessionId: "session-large",
          format: ExportFormat.JSON,
          content: largeContent,
        })
      ).rejects.toThrow("Content exceeds maximum size");
    });
  });

  describe("getExportHistory", () => {
    it("returns all exports for a sessionId ordered by createdAt descending", async () => {
      // Create records with slight time gaps
      const record1 = await createExport({
        sessionId: "session-history",
        format: ExportFormat.PDF,
        content: "PDF content",
      });

      const record2 = await createExport({
        sessionId: "session-history",
        format: ExportFormat.MARKDOWN,
        content: "Markdown content",
      });

      const record3 = await createExport({
        sessionId: "session-history",
        format: ExportFormat.HTML,
        content: "HTML content",
      });

      const history = await getExportHistory("session-history");

      expect(history).toHaveLength(3);
      // Should be ordered newest first
      for (let i = 0; i < history.length - 1; i++) {
        expect(history[i].createdAt.getTime()).toBeGreaterThanOrEqual(
          history[i + 1].createdAt.getTime()
        );
      }
    });

    it("returns empty array for non-existent sessionId", async () => {
      const history = await getExportHistory("non-existent-session");
      expect(history).toEqual([]);
    });
  });

  describe("findOrCreateExport", () => {
    it("creates a new record when none exists", async () => {
      const record = await findOrCreateExport({
        sessionId: "session-upsert",
        format: ExportFormat.JSON,
        content: '{"notes": "test"}',
      });

      expect(record.id).toBeDefined();
      expect(record.sessionId).toBe("session-upsert");
      expect(record.format).toBe(ExportFormat.JSON);
    });

    it("updates existing record when sessionId+format exists", async () => {
      await createExport({
        sessionId: "session-upsert2",
        format: ExportFormat.MARKDOWN,
        content: "Original content",
      });

      const updated = await findOrCreateExport({
        sessionId: "session-upsert2",
        format: ExportFormat.MARKDOWN,
        content: "Updated content",
      });

      expect(updated.content).toBe("Updated content");

      // Should still be only one record
      const history = await getExportHistory("session-upsert2");
      expect(history).toHaveLength(1);
    });
  });

  describe("isDuplicate", () => {
    it("returns true when content hash matches existing record", async () => {
      const content = "Duplicate check content";
      await createExport({
        sessionId: "session-dedup",
        format: ExportFormat.PDF,
        content,
      });

      const result = await isDuplicate("session-dedup", ExportFormat.PDF, content);
      expect(result).toBe(true);
    });

    it("returns false when content differs", async () => {
      await createExport({
        sessionId: "session-dedup2",
        format: ExportFormat.PDF,
        content: "Original content",
      });

      const result = await isDuplicate(
        "session-dedup2",
        ExportFormat.PDF,
        "Different content"
      );
      expect(result).toBe(false);
    });

    it("returns false when no record exists", async () => {
      const result = await isDuplicate(
        "nonexistent",
        ExportFormat.PDF,
        "some content"
      );
      expect(result).toBe(false);
    });
  });

  describe("generateContentHash", () => {
    it("produces consistent hashes for same content", () => {
      const hash1 = generateContentHash("test content");
      const hash2 = generateContentHash("test content");
      expect(hash1).toBe(hash2);
    });

    it("produces different hashes for different content", () => {
      const hash1 = generateContentHash("content A");
      const hash2 = generateContentHash("content B");
      expect(hash1).not.toBe(hash2);
    });
  });
});

import { describe, it, expect } from "vitest";
import fs from "fs";
import path from "path";

describe("Database Migrations Integrity Linter", () => {
  const migrationsDir = path.resolve(
    import.meta.dirname,
    "../../supabase/migrations"
  );

  it("директорія міграцій існує та містить sql-файли", () => {
    expect(fs.existsSync(migrationsDir)).toBe(true);
    const files = fs
      .readdirSync(migrationsDir)
      .filter((f) => f.endsWith(".sql"));
    expect(files.length).toBeGreaterThanOrEqual(1);
  });

  it("перевіряє ідемпотентність та закриття блоків у всіх SQL міграціях", () => {
    const files = fs
      .readdirSync(migrationsDir)
      .filter((f) => f.endsWith(".sql"));

    for (const file of files) {
      const fullPath = path.join(migrationsDir, file);
      const content = fs.readFileSync(fullPath, "utf-8");

      expect(content.trim().length).toBeGreaterThan(0);

      // Якщо є створення таблиці - має бути IF NOT EXISTS
      if (content.includes("CREATE TABLE")) {
        expect(content).toContain("IF NOT EXISTS");
      }

      // Якщо є блок DO $$, він має закриватися END $$;
      const doCount = (content.match(/\bDO\s+\$\$/gi) || []).length;
      const endCount = (content.match(/\bEND\s+\$\$;/gi) || []).length;
      expect(doCount).toBe(endCount);

      // Якщо є нові таблиці в міграції 20260909_financial_expansion, має бути ввімкнено RLS
      if (file.includes("financial_expansion")) {
        expect(content).toContain("ENABLE ROW LEVEL SECURITY");
      }
    }
  });
});

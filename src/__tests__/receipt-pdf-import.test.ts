import { describe, it, expect, vi, beforeEach } from "vitest";
import { POST } from "@/app/api/transactions/parse-receipt/route";
import { createSessionToken } from "@/lib/session";

describe("Receipt PDF Import Route Security & Parsing", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("відхиляє запит без валідної сесії (401 Unauthorized)", async () => {
    const formData = new FormData();
    const fakePdf = new Blob(["%PDF-1.4 fake"], { type: "application/pdf" });
    formData.append("file", fakePdf, "test.pdf");

    const req = new Request(
      "http://localhost:3000/api/transactions/parse-receipt",
      {
        method: "POST",
        body: formData,
      }
    );

    const res = await POST(req);
    expect(res.status).toBe(401);
  });

  it("відхиляє файл, який не має розширення .pdf (400 Bad Request)", async () => {
    const token = await createSessionToken();
    const formData = new FormData();
    const fakeXlsx = new Blob(["dummy content"], {
      type: "application/vnd.ms-excel",
    });
    formData.append("file", fakeXlsx, "statement.xlsx");

    const req = new Request(
      "http://localhost:3000/api/transactions/parse-receipt",
      {
        method: "POST",
        headers: { cookie: `finance_session=${token}` },
        body: formData,
      }
    );

    const res = await POST(req);
    expect(res.status).toBe(400);
    const json = await res.json();
    expect(json.error).toContain(".pdf");
  });

  it("відхиляє підроблений файл з розширенням .pdf, але без дійсних magic bytes %PDF-", async () => {
    const token = await createSessionToken();
    const formData = new FormData();
    // Створюємо бінарний файл без байтів %PDF- (0x25 0x50 0x44 0x46)
    const spoofedContent = new Uint8Array([0x00, 0x01, 0x02, 0x03, 0x04]);
    const spoofedBlob = new Blob([spoofedContent], { type: "application/pdf" });
    formData.append("file", spoofedBlob, "fake.pdf");

    const req = new Request(
      "http://localhost:3000/api/transactions/parse-receipt",
      {
        method: "POST",
        headers: { cookie: `finance_session=${token}` },
        body: formData,
      }
    );

    const res = await POST(req);
    expect(res.status).toBe(400);
    const json = await res.json();
    expect(json.error).toContain("формату PDF");
  });

  it("відхиляє запит без файлу (400 Bad Request)", async () => {
    const token = await createSessionToken();
    const formData = new FormData();

    const req = new Request(
      "http://localhost:3000/api/transactions/parse-receipt",
      {
        method: "POST",
        headers: { cookie: `finance_session=${token}` },
        body: formData,
      }
    );

    const res = await POST(req);
    expect(res.status).toBe(400);
    const json = await res.json();
    expect(json.error).toContain("Файл не надано");
  });

  it("відхиляє PDF файл, якщо його розмір перевищує 5 МБ (400 Bad Request)", async () => {
    const token = await createSessionToken();
    const formData = new FormData();
    // 5.1 MB
    const largeContent = new Uint8Array(5.1 * 1024 * 1024);
    largeContent[0] = 0x25; // %
    largeContent[1] = 0x50; // P
    largeContent[2] = 0x44; // D
    largeContent[3] = 0x46; // F
    const largeBlob = new Blob([largeContent], { type: "application/pdf" });
    formData.append("file", largeBlob, "huge.pdf");

    const req = new Request(
      "http://localhost:3000/api/transactions/parse-receipt",
      {
        method: "POST",
        headers: { cookie: `finance_session=${token}` },
        body: formData,
      }
    );

    const res = await POST(req);
    expect(res.status).toBe(400);
    const json = await res.json();
    expect(json.error).toContain("перевищує ліміт");
  });

  it("відхиляє файл з розширенням .png, якщо magic bytes не відповідають формату PNG", async () => {
    const token = await createSessionToken();
    const formData = new FormData();
    const invalidPng = new Blob([new Uint8Array([0x00, 0x01, 0x02, 0x03])], {
      type: "image/png",
    });
    formData.append("file", invalidPng, "fake.png");

    const req = new Request(
      "http://localhost:3000/api/transactions/parse-receipt",
      {
        method: "POST",
        headers: { cookie: `finance_session=${token}` },
        body: formData,
      }
    );

    const res = await POST(req);
    expect(res.status).toBe(400);
    const json = await res.json();
    expect(json.error).toContain("формату PDF чи зображення");
  });

  it("відхиляє файл з розширенням .jpg, якщо magic bytes не відповідають формату JPEG", async () => {
    const token = await createSessionToken();
    const formData = new FormData();
    const invalidJpg = new Blob([new Uint8Array([0x00, 0x01, 0x02, 0x03])], {
      type: "image/jpeg",
    });
    formData.append("file", invalidJpg, "fake.jpg");

    const req = new Request(
      "http://localhost:3000/api/transactions/parse-receipt",
      {
        method: "POST",
        headers: { cookie: `finance_session=${token}` },
        body: formData,
      }
    );

    const res = await POST(req);
    expect(res.status).toBe(400);
    const json = await res.json();
    expect(json.error).toContain("формату PDF чи зображення");
  });
});

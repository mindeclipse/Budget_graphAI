/**
 * Telegram Bot Domain Facade
 *
 * Re-exports all specialized Telegram bot modules for full backward compatibility:
 * - types: Data contracts and parsing interfaces
 * - formatters: Date formatting (Kyiv timezone), emojis, keyboard generators, progress bars
 * - parsers: NLP expense parsing, multimodal receipts, and intent inquiries
 * - db: Transaction persistence, auto-roundup processing, and threshold alerts
 * - commands: Pacing calculations, cycle summary, charts, emergency fund, and what-if simulation
 * - callbacks: Interactive inline keyboard action handlers
 */

export * from "@/lib/bot/types";
export * from "@/lib/bot/formatters";
export * from "@/lib/bot/parsers";
export * from "@/lib/bot/db";
export * from "@/lib/bot/commands";
export * from "@/lib/bot/callbacks";
export { ROUNDUP_GOAL_NAME } from "@/lib/roundup-utils";

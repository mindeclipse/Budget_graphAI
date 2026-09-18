"use client";

import React, { useState } from "react";
import {
  Settings,
  Wallet,
  Upload,
  Fingerprint,
  LogOut,
  Send,
  FileSpreadsheet,
  Database,
  RotateCcw,
  Trash2,
  SlidersHorizontal,
} from "lucide-react";

interface SettingsDropdownMenuProps {
  isSendingDigest: boolean;
  isSendingBackupTelegram: boolean;
  isRestoring: boolean;
  onOpenNewCycle: () => void;
  onOpenImport: () => void;
  onRegisterDevice: () => void;
  onLogout: () => void;
  onExportExcel?: () => void;
  onOpenTrash?: () => void;
  onOpenMerchantRules?: () => void;
  onSendTestDigest: () => void;
  onSendBackupToTelegram: () => void;
  onDownloadBackup: () => void;
  onTriggerRestoreFile: () => void;
}

export function SettingsDropdownMenu({
  isSendingDigest,
  isSendingBackupTelegram,
  isRestoring,
  onOpenNewCycle,
  onOpenImport,
  onRegisterDevice,
  onLogout,
  onExportExcel,
  onOpenTrash,
  onOpenMerchantRules,
  onSendTestDigest,
  onSendBackupToTelegram,
  onDownloadBackup,
  onTriggerRestoreFile,
}: SettingsDropdownMenuProps) {
  const [isSettingsOpen, setIsSettingsOpen] = useState(false);

  return (
    <div className="relative">
      <button
        type="button"
        onClick={() => setIsSettingsOpen((prev) => !prev)}
        title="Налаштування та керування"
        className={`flex h-8 w-8 items-center justify-center rounded-xl border transition-all active:scale-95 ${
          isSettingsOpen
            ? "border-zinc-700 bg-zinc-800 text-white"
            : "border-zinc-800/90 bg-zinc-900/80 text-zinc-400 hover:border-zinc-700 hover:text-white"
        }`}
      >
        <Settings size={15} />
      </button>

      {isSettingsOpen && (
        <>
          <div
            className="fixed inset-0 z-40"
            onClick={() => setIsSettingsOpen(false)}
          />

          <div className="absolute top-10 right-0 z-50 w-56 rounded-2xl border border-zinc-800/90 bg-zinc-950/95 p-1.5 shadow-2xl backdrop-blur-xl">
            <button
              type="button"
              onClick={() => {
                setIsSettingsOpen(false);
                onOpenNewCycle();
              }}
              className="flex w-full items-center gap-2.5 rounded-xl px-3 py-2 text-xs font-semibold text-sky-400 transition-colors hover:bg-sky-500/10"
            >
              <Wallet size={14} className="text-sky-400" />
              <span>Новий цикл</span>
            </button>

            <div className="my-1 border-t border-zinc-800/60" />

            <button
              type="button"
              onClick={() => {
                setIsSettingsOpen(false);
                onOpenImport();
              }}
              className="flex w-full items-center gap-2.5 rounded-xl px-3 py-2 text-xs font-medium text-zinc-300 transition-colors hover:bg-zinc-900"
            >
              <Upload size={14} className="text-zinc-400" />
              <span>Імпорт виписки</span>
            </button>

            <button
              type="button"
              onClick={() => {
                setIsSettingsOpen(false);
                onRegisterDevice();
              }}
              title="Налаштувати Face ID / Touch ID для цього пристрою"
              className="flex w-full items-center gap-2.5 rounded-xl px-3 py-2 text-xs font-medium text-zinc-300 transition-colors hover:bg-zinc-900"
            >
              <Fingerprint size={14} className="text-zinc-400" />
              <span>Face ID / Touch ID</span>
            </button>

            {onOpenMerchantRules && (
              <button
                type="button"
                onClick={() => {
                  setIsSettingsOpen(false);
                  onOpenMerchantRules();
                }}
                title="Керування правилами автокатегоризації мерчантів"
                className="flex w-full items-center gap-2.5 rounded-xl px-3 py-2 text-xs font-medium text-sky-300 transition-colors hover:bg-sky-500/10"
              >
                <SlidersHorizontal size={14} className="text-sky-400" />
                <span>Правила мерчантів</span>
              </button>
            )}

            {onOpenTrash && (
              <button
                type="button"
                onClick={() => {
                  setIsSettingsOpen(false);
                  onOpenTrash();
                }}
                title="Кошик нещодавно видалених операцій (10 днів)"
                className="flex w-full items-center gap-2.5 rounded-xl px-3 py-2 text-xs font-medium text-rose-300 transition-colors hover:bg-rose-500/10"
              >
                <Trash2 size={14} className="text-rose-400" />
                <span>Кошик (10 днів)</span>
              </button>
            )}

            <button
              type="button"
              onClick={() => {
                setIsSettingsOpen(false);
                onSendTestDigest();
              }}
              disabled={isSendingDigest}
              title="Надіслати щотижневий звіт із порадами Gemini у Telegram"
              className="flex w-full items-center gap-2.5 rounded-xl px-3 py-2 text-xs font-medium text-zinc-300 transition-colors hover:bg-zinc-900 disabled:opacity-50"
            >
              <Send size={14} className="text-zinc-400" />
              <span>
                {isSendingDigest ? "Відправка..." : "Дайджест у Telegram"}
              </span>
            </button>

            <button
              type="button"
              onClick={() => {
                setIsSettingsOpen(false);
                onSendBackupToTelegram();
              }}
              disabled={isSendingBackupTelegram}
              title="Сформувати та надіслати резервну копію бази файлом JSON у Telegram"
              className="flex w-full items-center gap-2.5 rounded-xl px-3 py-2 text-xs font-medium text-zinc-300 transition-colors hover:bg-zinc-900 disabled:opacity-50"
            >
              <Database size={14} className="text-indigo-400" />
              <span>
                {isSendingBackupTelegram
                  ? "Надсилання..."
                  : "Бекап у Telegram (файл)"}
              </span>
            </button>

            <div className="my-1 border-t border-zinc-800/60" />

            {onExportExcel && (
              <button
                type="button"
                onClick={() => {
                  setIsSettingsOpen(false);
                  onExportExcel();
                }}
                title="Завантажити звіт у форматі .xlsx"
                className="flex w-full items-center gap-2.5 rounded-xl px-3 py-2 text-xs font-medium text-emerald-400 transition-colors hover:bg-emerald-500/10"
              >
                <FileSpreadsheet size={14} className="text-emerald-400" />
                <span>Експорт в Excel (.xlsx)</span>
              </button>
            )}

            <button
              type="button"
              onClick={() => {
                setIsSettingsOpen(false);
                onDownloadBackup();
              }}
              title="Завантажити повний зліпок бази даних у JSON"
              className="flex w-full items-center gap-2.5 rounded-xl px-3 py-2 text-xs font-medium text-zinc-300 transition-colors hover:bg-zinc-900"
            >
              <Database size={14} className="text-zinc-400" />
              <span>Резервна копія (JSON)</span>
            </button>

            <button
              type="button"
              onClick={() => {
                setIsSettingsOpen(false);
                onTriggerRestoreFile();
              }}
              disabled={isRestoring}
              title="Відновити базу даних із файлу бекапу"
              className="flex w-full items-center gap-2.5 rounded-xl px-3 py-2 text-xs font-medium text-zinc-300 transition-colors hover:bg-zinc-900 disabled:opacity-50"
            >
              <RotateCcw size={14} className="text-zinc-400" />
              <span>
                {isRestoring ? "Відновлення..." : "Відновити з бекапу"}
              </span>
            </button>

            <div className="my-1 border-t border-zinc-800/60" />

            <button
              type="button"
              onClick={() => {
                setIsSettingsOpen(false);
                onLogout();
              }}
              title="Заблокувати додаток"
              className="flex w-full items-center gap-2.5 rounded-xl px-3 py-2 text-xs font-medium text-rose-400 transition-colors hover:bg-rose-950/30"
            >
              <LogOut size={14} className="text-rose-400" />
              <span>Вийти</span>
            </button>
          </div>
        </>
      )}
    </div>
  );
}

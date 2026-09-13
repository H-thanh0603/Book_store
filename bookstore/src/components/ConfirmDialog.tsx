"use client";
import { useEffect, useId, useRef, useState } from "react";
import { AlertTriangle } from "lucide-react";

export type ConfirmRequest = {
  title: string;
  body: string;
  confirmLabel?: string;
  danger?: boolean;
  input?: {
    label: string;
    defaultValue?: string;
    placeholder?: string;
    required?: boolean;
  };
};

/**
 * Accessible replacement for window.confirm / window.prompt.
 * role=alertdialog + aria-modal, Esc to dismiss, initial focus on the
 * safe action (cancel), heritage styling. Render once per page and drive
 * it with a pending-action state.
 */
export default function ConfirmDialog({
  request,
  onConfirm,
  onCancel,
}: {
  request: ConfirmRequest | null;
  onConfirm: (value?: string) => void;
  onCancel: () => void;
}) {
  const titleId = useId();
  const bodyId = useId();
  const inputId = useId();
  const cancelRef = useRef<HTMLButtonElement>(null);
  const dialogRef = useRef<HTMLDivElement>(null);
  const [value, setValue] = useState(request?.input?.defaultValue ?? "");

  useEffect(() => {
    setValue(request?.input?.defaultValue ?? "");
    if (request) cancelRef.current?.focus();
  }, [request]);

  useEffect(() => {
    if (!request) return;
    function onKey(e: KeyboardEvent) {
      if (e.key === "Escape") {
        onCancel();
        return;
      }
      // Focus trap: keep Tab cycling inside the dialog.
      if (e.key === "Tab") {
        const root = dialogRef.current;
        if (!root) return;
        const focusables = Array.from(
          root.querySelectorAll<HTMLElement>(
            'button:not([disabled]), input:not([disabled]), [href], select, textarea, [tabindex]:not([tabindex="-1"])'
          )
        ).filter((el) => el.offsetParent !== null);
        if (focusables.length === 0) return;
        const first = focusables[0];
        const last = focusables[focusables.length - 1];
        if (e.shiftKey && document.activeElement === first) {
          e.preventDefault();
          last.focus();
        } else if (!e.shiftKey && document.activeElement === last) {
          e.preventDefault();
          first.focus();
        }
      }
    }
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, [request, onCancel]);

  if (!request) return null;

  const inputInvalid = !!request.input?.required && !value.trim();

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
      <div
        aria-hidden="true"
        className="absolute inset-0 bg-[#1c1917]/60"
        onClick={onCancel}
      />
      <div
        ref={dialogRef}
        role="alertdialog"
        aria-modal="true"
        aria-labelledby={titleId}
        aria-describedby={bodyId}
        className="relative w-full max-w-md rounded-2xl bg-white border border-[#ede5d8] shadow-2xl p-6"
      >
        <div className="flex items-start gap-3">
          {request.danger !== false && (
            <div className="w-10 h-10 shrink-0 rounded-xl bg-[#8c2d19]/10 text-[#8c2d19] flex items-center justify-center">
              <AlertTriangle aria-hidden="true" className="w-5 h-5" />
            </div>
          )}
          <div>
            <h2 id={titleId} className="font-serif font-bold text-[#1c1917] text-lg">
              {request.title}
            </h2>
            <p id={bodyId} className="text-sm text-[#574431] mt-1 leading-relaxed">
              {request.body}
            </p>
          </div>
        </div>

        {request.input && (
          <div className="mt-4">
            <label htmlFor={inputId} className="block text-xs font-semibold text-[#1c1917] mb-1.5">
              {request.input.label}
            </label>
            <input
              id={inputId}
              value={value}
              onChange={(e) => setValue(e.target.value)}
              placeholder={request.input.placeholder}
              className="w-full bg-[#faf4ea] border border-[#e8dac5] rounded-xl px-3 py-2 text-sm text-[#1c1917] placeholder:text-[#574431]/50 focus:bg-white focus:outline-none focus:ring-2 focus:ring-[#8c2d19]/20 focus:border-[#8c2d19]"
            />
          </div>
        )}

        <div className="mt-6 flex justify-end gap-2">
          <button
            ref={cancelRef}
            type="button"
            onClick={onCancel}
            className="px-4 py-2 rounded-xl text-sm font-semibold text-[#574431] hover:bg-[#faf4ea] border border-[#ede5d8] focus-visible:outline-2 focus-visible:outline-[#8c2d19]"
          >
            Quay lại
          </button>
          <button
            type="button"
            disabled={inputInvalid}
            onClick={() => onConfirm(request.input ? value.trim() : undefined)}
            className="px-4 py-2 rounded-xl text-sm font-bold text-white bg-[#8c2d19] hover:bg-[#7a2816] disabled:opacity-50 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[#8c2d19]"
          >
            {request.confirmLabel ?? "Xác nhận"}
          </button>
        </div>
      </div>
    </div>
  );
}

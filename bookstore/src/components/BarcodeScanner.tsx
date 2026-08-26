"use client";
import { useEffect, useRef, useState } from "react";
import { Camera, X } from "lucide-react";

type Props = {
  onScan: (barcode: string) => void;
  onClose: () => void;
};

export default function BarcodeScanner({ onScan, onClose }: Props) {
  const videoRef = useRef<HTMLVideoElement>(null);
  const [error, setError] = useState<string | null>(null);
  const [scanning, setScanning] = useState(true);
  const streamRef = useRef<MediaStream | null>(null);
  const rafRef = useRef<number>(0);

  useEffect(() => {
    let mounted = true;

    async function startCamera() {
      try {
        const stream = await navigator.mediaDevices.getUserMedia({
          video: { facingMode: "environment", width: { ideal: 1280 }, height: { ideal: 720 } },
        });
        if (!mounted) {
          stream.getTracks().forEach((t) => t.stop());
          return;
        }
        streamRef.current = stream;
        if (videoRef.current) {
          videoRef.current.srcObject = stream;
          await videoRef.current.play();
        }

        // Dynamically import ZXing to avoid SSR issues
        const { BrowserQRCodeReader } = await import("@zxing/browser");
        const reader = new BrowserQRCodeReader();

        const decodeFromVideo = async () => {
          if (!videoRef.current || !mounted) return;
          try {
            const result = await reader.decodeOnceFromVideoDevice(undefined, videoRef.current);
            if (result && mounted) {
              onScan(result.getText());
              setScanning(false);
              return;
            }
          } catch {
            // No barcode found in this frame, continue scanning
          }
          if (mounted) rafRef.current = requestAnimationFrame(decodeFromVideo);
        };
        decodeFromVideo();
      } catch (err) {
        if (mounted) {
          setError(err instanceof Error ? err.message : "Không thể truy cập camera");
        }
      }
    }

    startCamera();

    return () => {
      mounted = false;
      cancelAnimationFrame(rafRef.current);
      streamRef.current?.getTracks().forEach((t) => t.stop());
    };
  }, [onScan]);

  return (
    <div className="fixed inset-0 z-50 bg-black/80 flex items-center justify-center p-4">
      <div className="bg-white rounded-2xl overflow-hidden max-w-md w-full shadow-2xl">
        {/* Header */}
        <div className="flex items-center justify-between p-4 border-b border-slate-200">
          <div className="flex items-center gap-2">
            <Camera className="w-5 h-5 text-indigo-600" />
            <h3 className="font-bold text-slate-900">Quét Barcode</h3>
          </div>
          <button onClick={onClose} className="text-slate-400 hover:text-slate-600">
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Camera View */}
        <div className="relative aspect-video bg-black">
          <video ref={videoRef} className="w-full h-full object-cover" playsInline muted />
          {/* Scanning overlay */}
          {scanning && !error && (
            <div className="absolute inset-0 flex items-center justify-center">
              <div className="w-3/4 h-1/2 border-2 border-indigo-500 rounded-lg relative">
                <div className="absolute top-0 left-0 w-6 h-6 border-t-4 border-l-4 border-indigo-500 rounded-tl-lg" />
                <div className="absolute top-0 right-0 w-6 h-6 border-t-4 border-r-4 border-indigo-500 rounded-tr-lg" />
                <div className="absolute bottom-0 left-0 w-6 h-6 border-b-4 border-l-4 border-indigo-500 rounded-bl-lg" />
                <div className="absolute bottom-0 right-0 w-6 h-6 border-b-4 border-r-4 border-indigo-500 rounded-br-lg" />
                <div className="absolute top-1/2 left-0 right-0 h-0.5 bg-indigo-500 animate-pulse" />
              </div>
            </div>
          )}
        </div>

        {/* Error or Instructions */}
        <div className="p-4">
          {error ? (
            <div className="text-center">
              <p className="text-sm text-red-600 font-medium">{error}</p>
              <p className="text-xs text-slate-500 mt-1">Vui lòng cho phép truy cập camera trong cài đặt trình duyệt</p>
            </div>
          ) : (
            <p className="text-center text-xs text-slate-500">
              Hướng camera vào mã barcode trên sản phẩm
            </p>
          )}
          <button
            onClick={onClose}
            className="mt-3 w-full py-2 rounded-xl bg-slate-100 hover:bg-slate-200 text-slate-700 text-xs font-semibold transition-colors"
          >
            Đóng
          </button>
        </div>
      </div>
    </div>
  );
}

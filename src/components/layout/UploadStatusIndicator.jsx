
import React from 'react';
import { useUploadStatus } from '@/components/contexts/UploadStatusContext';
import { Loader2, CheckCircle, AlertTriangle } from 'lucide-react';
import { Progress } from "@/components/ui/progress";

export default function UploadStatusIndicator() {
  const { status } = useUploadStatus();

  if (!status.inProgress && !status.error && status.progress === 100) return null;
  if (!status.inProgress && !status.error) return null;


  const bgColor = status.error 
    ? 'bg-red-600' 
    : (status.progress === 100 ? 'bg-green-600' : 'bg-blue-600');

  const Icon = status.error 
    ? AlertTriangle 
    : (status.progress === 100 ? CheckCircle : Loader2);

  return (
    <div className={`fixed bottom-0 right-0 w-full p-3 text-white shadow-lg z-50 transition-all ${bgColor}`} dir="rtl">
      <div className="max-w-7xl mx-auto px-4">
        <div className="flex items-center justify-between gap-4">
          <div className="flex items-center gap-3">
            <Icon className={`w-6 h-6 ${status.inProgress && status.progress < 100 ? 'animate-spin' : ''}`} />
            <div>
              <p className="font-bold">{status.error ? 'שגיאה בעיבוד' : status.message}</p>
              {status.error && <p className="text-sm opacity-90">{status.error}</p>}
            </div>
          </div>
          <div className="w-1/3">
            <Progress value={status.progress} className="bg-white/30" />
            <p className="text-xs text-center mt-1">{status.progress}%</p>
          </div>
        </div>
      </div>
    </div>
  );
}

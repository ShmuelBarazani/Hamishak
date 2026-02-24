import React, { useState, useEffect } from "react";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Upload as UploadIcon, FileSpreadsheet, CheckCircle, AlertTriangle, Trophy, List, Loader2, FileWarning } from "lucide-react";
import { supabase } from "@/api/supabaseClient";
import * as db from "@/api/entities";
import { useToast } from "@/components/ui/use-toast";
import { useUploadStatus } from '@/components/contexts/UploadStatusContext';
import { useGame } from '@/components/contexts/GameContext';

export default function UploadFilesDialog({ open, onOpenChange }) {
  const [files, setFiles] = useState({ questions: null, validation: null, logos: null });
  const [pasteData, setPasteData] = useState('');
  const [uploadMethod, setUploadMethod] = useState('files');
  const [localWarnings, setLocalWarnings] = useState([]);
  const [existingData, setExistingData] = useState({ questions: false, predictions: false });
  const { toast } = useToast();
  const { status, startProcessing } = useUploadStatus();
  const { inProgress, message, error, warnings: globalWarnings } = status;
  const { currentGame } = useGame();

  useEffect(() => { if (open) checkExistingData(); }, [open]);

  const checkExistingData = async () => {
    try {
      const [questions, predictions] = await Promise.all([
        db.Question.filter({}, null, 1),
        db.Prediction.filter({}, null, 1)
      ]);
      setExistingData({ questions: questions.length > 0, predictions: predictions.length > 0 });
    } catch { setExistingData({ questions: false, predictions: false }); }
  };

  const handleFileSelect = (type, file) => {
    setFiles(prev => ({ ...prev, [type]: file }));
    setLocalWarnings([]);
  };

  const processFiles = () => {
    setLocalWarnings([]);
    startProcessing(files, existingData, currentGame);
  };

  const handlePasteUpload = () => {
    if (!pasteData.trim()) { toast({ title: "שגיאה", description: "אין נתונים", variant: "destructive" }); return; }
    setLocalWarnings([]);
    startProcessing({ pasteData: pasteData.trim() }, existingData, currentGame);
  };

  const FileUploadCard = ({ title, type, description, icon: Icon, isRequired = false }) => {
    const hasExisting = type === 'questions' ? existingData.questions : false;
    return (
      <Card style={{ background: 'rgba(15, 23, 42, 0.4)', border: '1px solid rgba(6, 182, 212, 0.3)' }}>
        <CardHeader>
          <CardTitle className="flex items-center gap-2" style={{ color: '#06b6d4' }}>
            <Icon className="w-5 h-5" />{title}
            {isRequired && !hasExisting && <span className="text-red-500 text-xs">*נדרש</span>}
            {hasExisting && <span className="text-green-500 text-xs">✓ יש נתונים</span>}
          </CardTitle>
        </CardHeader>
        <CardContent>
          <p className="text-sm mb-4" style={{ color: '#94a3b8' }}>{description}</p>
          <input type="file" accept=".csv" className="hidden" id={`file-${type}`}
            onChange={(e) => { const f = e.target.files[0]; if (f) handleFileSelect(type, f); }} />
          <label htmlFor={`file-${type}`} className="flex items-center justify-center gap-2 w-full p-3 rounded-lg cursor-pointer"
            style={{ background: 'rgba(30, 41, 59, 0.6)', border: '1px solid rgba(6, 182, 212, 0.3)', color: '#94a3b8' }}>
            <UploadIcon className="w-4 h-4" />
            {files[type] ? files[type].name : "בחר קובץ CSV"}
          </label>
          {files[type] && <p className="text-xs mt-2" style={{ color: '#10b981' }}>✓ {Math.round(files[type].size / 1024)}KB</p>}
        </CardContent>
      </Card>
    );
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-5xl max-h-[90vh] overflow-y-auto"
        style={{ background: 'linear-gradient(135deg, #1e293b 0%, #0f172a 100%)', border: '1px solid rgba(6, 182, 212, 0.3)' }} dir="rtl">
        <DialogHeader>
          <DialogTitle style={{ color: '#06b6d4', fontSize: '24px' }}>העלאת קבצים למערכת</DialogTitle>
        </DialogHeader>
        <div className="space-y-6">
          <div className="flex gap-4">
            {[['files', 'העלאת קבצים'], ['paste', 'הדבקת נתונים']].map(([m, label]) => (
              <Button key={m} onClick={() => setUploadMethod(m)}
                style={uploadMethod === m ? { background: 'linear-gradient(135deg, #06b6d4, #0ea5e9)', color: 'white' }
                  : { background: 'rgba(30,41,59,0.6)', border: '1px solid rgba(6,182,212,0.3)', color: '#94a3b8' }}>
                {label}
              </Button>
            ))}
          </div>

          {uploadMethod === 'paste' ? (
            <Card style={{ background: 'rgba(16, 185, 129, 0.1)', border: '1px solid rgba(16, 185, 129, 0.3)' }}>
              <CardHeader><CardTitle style={{ color: '#10b981' }}>הדבקת נתונים ישירה</CardTitle></CardHeader>
              <CardContent>
                <textarea className="w-full h-64 p-4 rounded-lg font-mono text-sm"
                  placeholder="הדבק כאן את הנתונים מהאקסל..." value={pasteData}
                  onChange={(e) => setPasteData(e.target.value)}
                  style={{ background: 'rgba(15,23,42,0.6)', border: '1px solid rgba(6,182,212,0.2)', color: '#f8fafc' }} />
                <div className="flex justify-center mt-4">
                  <Button onClick={handlePasteUpload} disabled={inProgress || !pasteData.trim()} size="lg"
                    style={{ background: 'linear-gradient(135deg, #06b6d4, #0ea5e9)', color: 'white' }}>
                    {inProgress ? <><Loader2 className="w-5 h-5 animate-spin ml-2" />{message}</> : <><UploadIcon className="w-5 h-5 ml-2" />עבד נתונים</>}
                  </Button>
                </div>
              </CardContent>
            </Card>
          ) : (
            <>
              <div className="grid md:grid-cols-3 gap-4">
                <FileUploadCard title="שאלות וניחושים" type="questions" description="קובץ חובה CSV" icon={FileSpreadsheet} isRequired />
                <FileUploadCard title="רשימות אימות" type="validation" description="קובץ אופציונלי" icon={List} />
                <FileUploadCard title="לוגואי קבוצות" type="logos" description="קובץ אופציונלי" icon={Trophy} />
              </div>
              <div className="flex justify-center">
                <Button onClick={processFiles} disabled={(!files.questions && !existingData.questions) || inProgress} size="lg"
                  style={{ background: 'linear-gradient(135deg, #06b6d4, #0ea5e9)', color: 'white' }}>
                  {inProgress ? <><Loader2 className="w-5 h-5 animate-spin ml-2" />{message}</> : <><UploadIcon className="w-5 h-5 ml-2" />העלה קבצים</>}
                </Button>
              </div>
            </>
          )}

          {error && <Alert variant="destructive"><AlertTriangle className="w-4 h-4" /><AlertTitle>שגיאה</AlertTitle><AlertDescription>{error}</AlertDescription></Alert>}
          {status.progress === 100 && !inProgress && !error && (
            <Alert style={{ background: 'rgba(16,185,129,0.1)', border: '1px solid rgba(16,185,129,0.3)' }}>
              <CheckCircle className="w-4 h-4" style={{ color: '#10b981' }} />
              <AlertTitle style={{ color: '#10b981' }}>הקבצים עובדו בהצלחה!</AlertTitle>
            </Alert>
          )}
        </div>
      </DialogContent>
    </Dialog>
  );
}

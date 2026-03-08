import React, { useState, useEffect } from "react";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import {
  Upload as UploadIcon,
  FileSpreadsheet,
  CheckCircle,
  AlertTriangle,
  Trophy,
  List,
  Loader2,
  FileWarning
} from "lucide-react";
import { Question, Prediction, ValidationList } from "@/entities/all";
import { supabase } from "@/api/supabaseClient";
import * as db from "@/api/entities";
import { useToast } from "@/components/ui/use-toast";
import { useUploadStatus } from '@/components/contexts/UploadStatusContext';
import { useGame } from '@/components/contexts/GameContext';

export default function UploadFilesDialog({ open, onOpenChange }) {
  const [files, setFiles] = useState({
    questions: null,
    validation: null,
    logos: null
  });
  const [pasteData, setPasteData] = useState('');
  const [uploadMethod, setUploadMethod] = useState('files');
  const [localWarnings, setLocalWarnings] = useState([]);
  const [existingData, setExistingData] = useState({ questions: false, predictions: false });
  const { toast } = useToast();

  const { status, startProcessing, setUploadStatus } = useUploadStatus();
  const { inProgress, message, error, warnings: globalWarnings, results } = status;
  const { currentGame } = useGame();

  useEffect(() => {
    if (open) {
      checkExistingData();
    }
  }, [open]);

  useEffect(() => {
    if (status.progress === 100 && !status.inProgress && !status.error) {
      checkExistingData();
    }
  }, [status.progress, status.inProgress, status.error]);

  const checkExistingData = async () => {
    try {
      const [questions, predictions] = await Promise.all([
        Question.list(null, 1),
        Prediction.list(null, 1)
      ]);
      setExistingData({
        questions: questions.length > 0,
        predictions: predictions.length > 0
      });
    } catch (error) {
      console.error("Error checking existing data:", error);
      setExistingData({ questions: false, predictions: false });
    }
  };

  const handleFileSelect = (type, file) => {
    setFiles(prev => ({ ...prev, [type]: file }));
    setLocalWarnings([]);
  };

  const addLocalWarning = (message) => {
    if (!localWarnings.includes(message)) {
      setLocalWarnings(prev => [...prev, message]);
    }
  };

  const processFiles = () => {
    if (files.questions && files.questions.size > 200000) {
      if (!window.confirm("הקובץ שלך גדול יחסית (" + Math.round(files.questions.size / 1024) + "KB). זה עלול לקחת זמן או להיכשל. האם להמשיך?")) {
        return;
      }
    }
    setLocalWarnings([]);
    startProcessing(files, existingData, currentGame);
    };

  const handlePasteUpload = async () => {
    if (!pasteData.trim()) {
      toast({ title: "שגיאה", description: "אין נתונים להדביק", variant: "destructive" });
      return;
    }

    setLocalWarnings([]);
    startProcessing({ pasteData: pasteData.trim() }, existingData, currentGame);
    };

  const handleValidationListsUpload = async (file) => {
    setUploadStatus({ inProgress: true, message: "מעבד קובץ רשימות אימות...", progress: 10, error: null });
    
    try {
      const { data: { publicUrl: file_url } } = supabase.storage.from('uploads').getPublicUrl((await supabase.storage.from('uploads').upload(`${Date.now()}.${file.name.split('.').pop()}`, file)).data?.path || '');
      setUploadStatus({ inProgress: true, message: "מחלץ נתונים מהקובץ...", progress: 30, error: null });

      // ExtractDataFromUploadedFile - requires backend implementation

      if (extractResponse.status !== "success" || !extractResponse.output) {
        throw new Error(extractResponse.details || "Failed to extract data");
      }

      const listsData = extractResponse.output.lists || [];
      setUploadStatus({ inProgress: true, message: "שומר רשימות אימות...", progress: 60, error: null });

      const hebrewLetters = ['א', 'ב', 'ג', 'ד', 'ה', 'ו', 'ז', 'ח'];
      const processedLists = listsData.map(list => {
        const isCycleList = list.list_name?.includes('מחזור') ||
                           list.options?.some(opt => opt?.includes('מחזור'));
        
        if (isCycleList) {
          return {
            ...list,
            options: hebrewLetters.slice(0, list.options?.length || hebrewLetters.length)
          };
        }
        return list;
      });

      for (const list of processedLists) {
        const existing = await ValidationList.filter({ list_name: list.list_name }, null, 1);
        if (existing.length > 0) {
          await ValidationList.update(existing[0].id, { options: list.options });
        } else {
          await ValidationList.create(list);
        }
      }

      setUploadStatus({
        inProgress: false,
        message: `✅ ${processedLists.length} רשימות אימות נטענו בהצלחה!`,
        progress: 100,
        error: null
      });

      toast({
        title: "הועלה בהצלחה!",
        description: `${processedLists.length} רשימות אימות נשמרו במערכת`,
      });

    } catch (error) {
      console.error("Error uploading validation lists:", error);
      setUploadStatus({
        inProgress: false,
        message: "שגיאה בהעלאת רשימות אימות",
        progress: 0,
        error: error.message
      });
      toast({
        title: "שגיאה",
        description: "העלאת רשימות האימות נכשלה",
        variant: "destructive"
      });
    }
  };

  const FileUploadCard = ({ title, type, description, icon: Icon, isRequired = false }) => {
    const hasExistingData = type === 'questions' ? existingData.questions : false;
    const effectivelyRequired = isRequired && !hasExistingData;

    return (
      <Card className={`border-2 border-dashed hover:border-blue-300 transition-colors h-full`} style={{
        background: 'rgba(15, 23, 42, 0.4)',
        border: `1px solid ${effectivelyRequired ? 'rgba(239, 68, 68, 0.3)' : 'rgba(6, 182, 212, 0.3)'}`,
        boxShadow: effectivelyRequired ? '0 0 10px rgba(239, 68, 68, 0.2)' : '0 0 10px rgba(6, 182, 212, 0.2)'
      }}>
        <CardHeader>
          <CardTitle className="flex items-center gap-2" style={{ color: effectivelyRequired ? '#ef4444' : '#06b6d4' }}>
            <Icon className="w-5 h-5" />
            {title}
            {effectivelyRequired && <span className="text-red-500 text-xs">*נדרש</span>}
            {hasExistingData && <span className="text-green-600 text-xs">✓ יש נתונים</span>}
          </CardTitle>
        </CardHeader>
        <CardContent>
          <p className="text-sm mb-4" style={{ color: '#94a3b8' }}>{description}</p>
          {hasExistingData && (
            <div className="mb-3 text-sm p-2 rounded" style={{
              background: 'rgba(16, 185, 129, 0.1)',
              color: '#10b981'
            }}>
              יש כבר נתונים במערכת. העלאה חדשה תוסיף נתונים נוספים.
            </div>
          )}
          <input
            type="file"
            accept=".csv"
            onChange={(e) => {
              const file = e.target.files[0];
              if (file) {
                if (/[\u0590-\u05FF]/.test(file.name)) {
                  addLocalWarning("שם הקובץ מכיל עברית. מומלץ לשנות לשם באנגלית כדי למנוע בעיות.");
                }
                if (file.size > 300000) {
                  addLocalWarning(`הקובץ גדול (${Math.round(file.size / 1024)}KB). קבצים גדולים עלולים להיכשל.`);
                }
                handleFileSelect(type, file);
              }
            }}
            className="hidden"
            id={`file-${type}`}
          />
          <label
            htmlFor={`file-${type}`}
            className="flex items-center justify-center gap-2 w-full p-3 border rounded-lg hover:bg-blue-50 cursor-pointer transition-colors"
            style={{
              background: 'rgba(30, 41, 59, 0.6)',
              border: '1px solid rgba(6, 182, 212, 0.3)',
              color: '#94a3b8'
            }}
          >
            <UploadIcon className="w-4 h-4" />
            {files[type] ? files[type].name : "בחר קובץ CSV"}
          </label>
          {files[type] && (
            <div className="mt-2">
              <div className="flex items-center gap-2" style={{ color: '#10b981' }}>
                <CheckCircle className="w-4 h-4" />
                <span className="text-sm">קובץ נבחר</span>
              </div>
              <div className="text-xs mt-1" style={{ color: '#94a3b8' }}>
                גודל: {Math.round(files[type].size / 1024)}KB
              </div>
            </div>
          )}
        </CardContent>
      </Card>
    );
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-6xl max-h-[90vh] overflow-y-auto" style={{
        background: 'linear-gradient(135deg, #1e293b 0%, #0f172a 100%)',
        border: '1px solid rgba(6, 182, 212, 0.3)'
      }} dir="rtl">
        <DialogHeader>
          <DialogTitle style={{ color: '#06b6d4', fontSize: '24px' }}>
            העלאת קבצים למערכת
          </DialogTitle>
        </DialogHeader>

        <div className="space-y-6">
          {/* Method Selection */}
          <div className="flex gap-4">
            <Button
              onClick={() => setUploadMethod('files')}
              style={uploadMethod === 'files' ? {
                background: 'linear-gradient(135deg, #06b6d4 0%, #0ea5e9 100%)',
                boxShadow: '0 0 20px rgba(6, 182, 212, 0.4)',
                color: 'white'
              } : {
                background: 'rgba(30, 41, 59, 0.6)',
                border: '1px solid rgba(6, 182, 212, 0.3)',
                color: '#94a3b8'
              }}
            >
              העלאת קבצים
            </Button>
            <Button
              onClick={() => setUploadMethod('paste')}
              style={uploadMethod === 'paste' ? {
                background: 'linear-gradient(135deg, #06b6d4 0%, #0ea5e9 100%)',
                boxShadow: '0 0 20px rgba(6, 182, 212, 0.4)',
                color: 'white'
              } : {
                background: 'rgba(30, 41, 59, 0.6)',
                border: '1px solid rgba(6, 182, 212, 0.3)',
                color: '#94a3b8'
              }}
            >
              הדבקת נתונים ישירה
            </Button>
          </div>

          {uploadMethod === 'paste' ? (
            <Card style={{
              background: 'rgba(16, 185, 129, 0.1)',
              border: '1px solid rgba(16, 185, 129, 0.3)'
            }}>
              <CardHeader>
                <CardTitle style={{ color: '#10b981' }}>הדבקת נתונים ישירה (מומלץ!)</CardTitle>
              </CardHeader>
              <CardContent>
                <div className="space-y-4">
                  <Alert style={{
                    background: 'rgba(6, 182, 212, 0.1)',
                    border: '1px solid rgba(6, 182, 212, 0.3)',
                    padding: '12px'
                  }}>
                    <AlertDescription>
                      <p className="font-semibold mb-1 text-sm" style={{ color: '#06b6d4' }}>איך זה עובד:</p>
                      <ol className="list-decimal list-inside space-y-1 text-xs" style={{ color: '#94a3b8' }}>
                        <li>פתח את קובץ האקסל המקורי שלך</li>
                        <li>בחר את כל הנתונים (Ctrl+A)</li>
                        <li>העתק (Ctrl+C)</li>
                        <li>הדבק כאן למטה (Ctrl+V)</li>
                        <li>לחץ "עבד נתונים"</li>
                      </ol>
                    </AlertDescription>
                  </Alert>

                  <textarea
                    className="w-full h-64 p-4 border rounded-lg font-mono text-sm"
                    placeholder="הדבק כאן את הנתונים מהאקסל..."
                    value={pasteData}
                    onChange={(e) => setPasteData(e.target.value)}
                    style={{
                      background: 'rgba(15, 23, 42, 0.6)',
                      border: '1px solid rgba(6, 182, 212, 0.2)',
                      color: '#f8fafc'
                    }}
                  />

                  <div className="flex justify-center">
                    <Button
                      onClick={handlePasteUpload}
                      disabled={inProgress || !pasteData.trim()}
                      size="lg"
                      style={{
                        background: 'linear-gradient(135deg, #06b6d4 0%, #0ea5e9 100%)',
                        boxShadow: '0 0 20px rgba(6, 182, 212, 0.4)',
                        color: 'white'
                      }}
                    >
                      {inProgress ? (
                        <>
                          <Loader2 className="w-6 h-6 animate-spin ml-2" />
                          {message}
                        </>
                      ) : (
                        <>
                          <UploadIcon className="w-5 h-5 ml-2" />
                          עבד נתונים
                        </>
                      )}
                    </Button>
                  </div>
                </div>
              </CardContent>
            </Card>
          ) : (
            <>
              <div className="grid md:grid-cols-3 gap-4">
                <FileUploadCard
                  title="קובץ שאלות וניחושים"
                  type="questions"
                  description="קובץ חובה. יכיל את כל השאלות והניחושים של המשתתפים."
                  icon={FileSpreadsheet}
                  isRequired={true}
                />
                <FileUploadCard
                  title="רשימות אימות"
                  type="validation"
                  description="קובץ אופציונלי. יש ליצור 2 עמודות: list_name ו-option."
                  icon={List}
                />
                <FileUploadCard
                  title="לוגואי קבוצות"
                  type="logos"
                  description="קובץ אופציונלי. מכיל שמות קבוצות וקישורים ללוגואים."
                  icon={Trophy}
                />
              </div>

              <div className="flex justify-center">
                <Button
                  onClick={processFiles}
                  disabled={(!files.questions && !existingData.questions) || inProgress}
                  size="lg"
                  style={{
                    background: 'linear-gradient(135deg, #06b6d4 0%, #0ea5e9 100%)',
                    boxShadow: '0 0 20px rgba(6, 182, 212, 0.4)',
                    color: 'white'
                  }}
                >
                  {inProgress ? (
                    <>
                      <Loader2 className="w-6 h-6 animate-spin ml-2" />
                      {message}
                    </>
                  ) : (
                    <>
                      <UploadIcon className="w-5 h-5 ml-2" />
                      העלה קבצים
                    </>
                  )}
                </Button>
              </div>

              {/* Warnings and Alerts */}
              <Alert style={{
                background: 'rgba(239, 68, 68, 0.1)',
                border: '1px solid rgba(239, 68, 68, 0.3)',
                padding: '12px'
              }}>
                <FileWarning className="w-4 h-4" style={{ color: '#ef4444' }} />
                <AlertTitle className="text-sm font-bold" style={{ color: '#ef4444' }}>⚠️ אזהרות קריטיות</AlertTitle>
                <AlertDescription>
                  <div className="text-xs space-y-2" style={{ color: '#fca5a5' }}>
                    <div style={{ background: 'rgba(239, 68, 68, 0.1)', padding: '8px', borderRadius: '4px' }}>
                      <p className="font-semibold mb-1">⚠️ תאריכים:</p>
                      <p>Google Sheets/Excel משנים תוצאות כמו "2-2" לתאריכים!</p>
                    </div>
                    <div style={{ background: 'rgba(249, 115, 22, 0.1)', padding: '8px', borderRadius: '4px' }}>
                      <p className="font-semibold mb-1">⚠️ קידוד UTF-8:</p>
                      <p>קבצים חייבים להיות בקידוד UTF-8 לטיפול בעברית!</p>
                    </div>
                    <div style={{ background: 'rgba(16, 185, 129, 0.1)', padding: '8px', borderRadius: '4px', border: '1px solid rgba(16, 185, 129, 0.3)' }}>
                      <p className="font-semibold mb-1" style={{ color: '#10b981' }}>✅ הפתרון:</p>
                      <p className="text-xs" style={{ color: '#94a3b8' }}>
                        1. פתח ב-Google Sheets → 2. Format → Number → Plain text → 3. הכנס נתונים → 4. Download → CSV
                      </p>
                    </div>
                  </div>
                </AlertDescription>
              </Alert>
            </>
          )}

          {/* Error/Success Alerts */}
          {error && !inProgress && (
            <Alert variant="destructive">
              <AlertTriangle className="w-4 h-4" />
              <AlertTitle>שגיאה בעיבוד</AlertTitle>
              <AlertDescription>{error}</AlertDescription>
            </Alert>
          )}

          {(localWarnings.length > 0 || globalWarnings.length > 0) && !inProgress && (
            <Alert style={{
              background: 'rgba(249, 115, 22, 0.1)',
              border: '1px solid rgba(249, 115, 22, 0.3)'
            }}>
              <AlertTriangle className="w-4 h-4" style={{ color: '#f97316' }} />
              <AlertDescription>
                <div style={{ color: '#fdba74' }}>
                  <strong>אזהרות:</strong>
                  <ul className="list-disc list-inside mt-2 space-y-1 text-xs">
                    {localWarnings.map((warning, index) => (
                      <li key={`local-warn-${index}`}>{warning}</li>
                    ))}
                    {globalWarnings.map((warning, index) => (
                      <li key={`global-warn-${index}`}>{warning}</li>
                    ))}
                  </ul>
                </div>
              </AlertDescription>
            </Alert>
          )}

          {status.progress === 100 && !inProgress && !error && (
            <Alert style={{
              background: 'rgba(16, 185, 129, 0.1)',
              border: '1px solid rgba(16, 185, 129, 0.3)'
            }}>
              <CheckCircle className="w-4 h-4" style={{ color: '#10b981' }} />
              <AlertTitle className="font-bold" style={{ color: '#10b981' }}>הקבצים עובדו בהצלחה!</AlertTitle>
              <AlertDescription style={{ color: '#94a3b8' }}>
                בדוק את העמודים האחרים כדי לראות את הנתונים.
              </AlertDescription>
            </Alert>
          )}

          {Object.keys(results).length > 0 && !inProgress && (
            <Card style={{
              background: 'rgba(6, 182, 212, 0.1)',
              border: '1px solid rgba(6, 182, 212, 0.3)'
            }}>
              <CardHeader>
                <CardTitle style={{ color: '#06b6d4' }}>סיכום העלאה</CardTitle>
              </CardHeader>
              <CardContent>
                <div className="space-y-2">
                  {Object.entries(results).map(([key, value]) => (
                    <div key={key} className="flex items-center gap-2">
                      <CheckCircle className="w-4 h-4" style={{ color: '#10b981' }} />
                      <span style={{ color: '#94a3b8' }}>{value}</span>
                    </div>
                  ))}
                </div>
              </CardContent>
            </Card>
          )}
        </div>
      </DialogContent>
    </Dialog>
  );
}
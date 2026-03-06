import React, { createContext, useState, useContext, useCallback } from 'react';
import { useToast } from "@/components/ui/use-toast";

const UploadStatusContext = createContext();

export const useUploadStatus = () => useContext(UploadStatusContext);

export const UploadStatusProvider = ({ children }) => {
  const [status, setStatus] = useState({
    inProgress: false,
    message: '',
    progress: 0,
    error: null,
    warnings: [],
    results: {},
  });

  const { toast } = useToast();

  const startProcessing = useCallback(async (files, existingData) => {
    if (status.inProgress) {
      toast({
        title: "עיבוד כבר מתבצע",
        description: "נא להמתין לסיום הפעולה הנוכחית.",
        variant: "destructive"
      });
      return;
    }

    setStatus({
      inProgress: true,
      message: 'מתחיל עיבוד...',
      progress: 0,
      error: null,
      warnings: [],
      results: {},
    });

    try {
      // Upload functionality disabled - entities migrated to Supabase
      toast({
        title: "העלאה לא זמינה",
        description: "פונקציית ההעלאה תוקנה בקרוב",
        variant: "destructive"
      });

      setStatus(prev => ({
        ...prev,
        inProgress: false,
        message: 'הושלם',
        progress: 100,
      }));

    } catch (err) {
      setStatus(prev => ({
        ...prev,
        inProgress: false,
        error: err.message,
        progress: 0
      }));
      toast({ title: "שגיאה בעיבוד", description: err.message, variant: "destructive" });
    }
  }, [toast, status.inProgress]);

  return (
    <UploadStatusContext.Provider value={{ status, startProcessing }}>
      {children}
    </UploadStatusContext.Provider>
  );
};

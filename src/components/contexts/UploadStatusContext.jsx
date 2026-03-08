import { createContext, useContext, useState } from 'react';

const UploadStatusContext = createContext(null);

export function UploadStatusProvider({ children }) {
  const [status, setStatus] = useState({ inProgress: false, message: '', error: null, progress: 0, warnings: [], results: [] });

  const startProcessing = (message = 'מעבד...') => {
    setStatus({ inProgress: true, message, error: null, progress: 0, warnings: [], results: [] });
  };

  const setUploadStatus = (newStatus) => {
    setStatus(newStatus);
  };

  const clearStatus = () => {
    setStatus({ inProgress: false, message: '', error: null, progress: 0, warnings: [], results: [] });
  };

  return (
    <UploadStatusContext.Provider value={{ status, startProcessing, setUploadStatus, clearStatus }}>
      {children}
    </UploadStatusContext.Provider>
  );
}

export function useUploadStatus() {
  const context = useContext(UploadStatusContext);
  if (!context) {
    return { status: null, startProcessing: () => {}, setUploadStatus: () => {}, clearStatus: () => {} };
  }
  return context;
}

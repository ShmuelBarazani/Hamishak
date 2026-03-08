import { createContext, useContext, useState } from 'react';

const UploadStatusContext = createContext(null);

export function UploadStatusProvider({ children }) {
  const [status, setStatus] = useState(null);

  const startProcessing = (message = 'מעבד...') => {
    setStatus({ type: 'processing', message });
  };

  const setUploadStatus = (newStatus) => {
    setStatus(newStatus);
  };

  const clearStatus = () => {
    setStatus(null);
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

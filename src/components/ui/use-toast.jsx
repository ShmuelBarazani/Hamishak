import { useState, useEffect } from "react";

const TOAST_LIMIT = 20;
const DEFAULT_DURATION = 4000;

const actionTypes = {
  ADD_TOAST: "ADD_TOAST",
  UPDATE_TOAST: "UPDATE_TOAST",
  DISMISS_TOAST: "DISMISS_TOAST",
  REMOVE_TOAST: "REMOVE_TOAST",
};

let count = 0;
function genId() {
  count = (count + 1) % Number.MAX_VALUE;
  return count.toString();
}

const toastTimeouts = new Map();

// FIX: uses toast's own duration instead of hardcoded 1000000ms
const addToRemoveQueue = (toastId, duration) => {
  if (toastTimeouts.has(toastId)) {
    const old = toastTimeouts.get(toastId);
    clearTimeout(old.t1);
    clearTimeout(old.t2);
  }
  const t1 = setTimeout(() => {
    dispatch({ type: actionTypes.DISMISS_TOAST, toastId });
  }, duration);
  const t2 = setTimeout(() => {
    toastTimeouts.delete(toastId);
    dispatch({ type: actionTypes.REMOVE_TOAST, toastId });
  }, duration + 500);
  toastTimeouts.set(toastId, { t1, t2 });
};

const clearFromRemoveQueue = (toastId) => {
  const timeouts = toastTimeouts.get(toastId);
  if (timeouts) {
    clearTimeout(timeouts.t1);
    clearTimeout(timeouts.t2);
    toastTimeouts.delete(toastId);
  }
};

export const reducer = (state, action) => {
  switch (action.type) {
    case actionTypes.ADD_TOAST:
      return {
        ...state,
        toasts: [action.toast, ...state.toasts].slice(0, TOAST_LIMIT),
      };
    case actionTypes.UPDATE_TOAST:
      return {
        ...state,
        toasts: state.toasts.map((t) =>
          t.id === action.toast.id ? { ...t, ...action.toast } : t
        ),
      };
    case actionTypes.DISMISS_TOAST: {
      const { toastId } = action;
      return {
        ...state,
        toasts: state.toasts.map((t) =>
          t.id === toastId || toastId === undefined
            ? { ...t, open: false }
            : t
        ),
      };
    }
    case actionTypes.REMOVE_TOAST:
      if (action.toastId === undefined) return { ...state, toasts: [] };
      return {
        ...state,
        toasts: state.toasts.filter((t) => t.id !== action.toastId),
      };
  }
};

const listeners = [];
let memoryState = { toasts: [] };

function dispatch(action) {
  memoryState = reducer(memoryState, action);
  listeners.forEach((listener) => listener(memoryState));
}

function toast({ ...props }) {
  const id = genId();
  const duration = props.duration !== undefined ? props.duration : DEFAULT_DURATION;

  const update = (props) =>
    dispatch({ type: actionTypes.UPDATE_TOAST, toast: { ...props, id } });

  const dismiss = () =>
    dispatch({ type: actionTypes.DISMISS_TOAST, toastId: id });

  dispatch({
    type: actionTypes.ADD_TOAST,
    toast: {
      ...props,
      id,
      open: true,
      onOpenChange: (open) => {
        if (!open) dismiss();
      },
    },
  });

  addToRemoveQueue(id, duration);

  return { id, dismiss, update };
}

function useToast() {
  const [state, setState] = useState(memoryState);

  useEffect(() => {
    listeners.push(setState);
    return () => {
      const index = listeners.indexOf(setState);
      if (index > -1) listeners.splice(index, 1);
    };
  }, [state]);

  return {
    ...state,
    toast,
    dismiss: (toastId) =>
      dispatch({ type: actionTypes.DISMISS_TOAST, toastId }),
  };
}

export { useToast, toast };

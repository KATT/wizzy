import { useRef } from "react";
import { useEffect } from "react";

export function useOnMount(_callback: () => void | (() => void)) {
  const callback = useRef(_callback);
  callback.current = _callback;

  useEffect(() => callback.current(), []);
}

export function useOnUnmount(_callback: () => void) {
  useOnMount(() => _callback);
}

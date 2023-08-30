import { useEffect, useState } from "react";

let mounted = false;

export const useMountedOnClient = () => {
  const [isMounted, setMounted] = useState(mounted);

  useEffect(() => {
    mounted = true;
    setMounted(true);
  }, []);

  return isMounted;
};

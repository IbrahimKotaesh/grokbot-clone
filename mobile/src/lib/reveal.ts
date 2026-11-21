import { useEffect, useRef, useState } from "react";
import { AccessibilityInfo } from "react-native";
const segmenter =
  typeof Intl.Segmenter === "function"
    ? new Intl.Segmenter(undefined, { granularity: "grapheme" })
    : null;
export function useReveal(target: string, streaming: boolean) {
  const [shown, setShown] = useState(streaming ? "" : target),
    current = useRef(shown),
    latest = useRef(target),
    active = useRef(streaming),
    timer = useRef<ReturnType<typeof setInterval> | null>(null),
    reduced = useRef(false);
  useEffect(() => {
    void AccessibilityInfo.isReduceMotionEnabled().then((v) => {
      reduced.current = v;
    });
    const listener = AccessibilityInfo.addEventListener(
      "reduceMotionChanged",
      (v) => {
        reduced.current = v;
      },
    );
    return () => {
      listener.remove();
      if (timer.current) clearInterval(timer.current);
    };
  }, []);
  useEffect(() => {
    latest.current = target;
    if (streaming) active.current = true;
    if (!active.current || reduced.current) {
      current.current = target;
      setShown(target);
      return;
    }
    if (timer.current) return;
    timer.current = setInterval(() => {
      if (!latest.current.startsWith(current.current) || reduced.current)
        current.current = latest.current;
      else {
        const rest = latest.current.slice(current.current.length);
        let chunk = "",
          count = 0;
        for (const { segment } of segmenter
          ? segmenter.segment(rest)
          : Array.from(rest).map((segment) => ({ segment }))) {
          chunk += segment;
          if (++count === 2) break;
        }
        current.current += chunk;
      }
      setShown(current.current);
      if (current.current === latest.current && timer.current) {
        clearInterval(timer.current);
        timer.current = null;
      }
    }, 32);
  }, [target, streaming]);
  return shown;
}

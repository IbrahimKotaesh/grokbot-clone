// Badr's motion language, built on Motion (motion.dev): Apple-style text that arrives word by word out of a soft
// blur, and headlines that fade in as they scroll into view and fade away as they leave. Everything follows the
// system "reduce motion" setting: movement and blur drop out, a plain fade stays.
import { createContext, useContext, useRef, type ElementType, type ReactNode, type RefObject } from 'react';
import { MotionConfig, motion, useReducedMotion, useScroll, useTransform } from 'motion/react';

/** Apple's confident deceleration. */
export const EASE = [0.16, 1, 0.3, 1] as const;
/** A soft spring without bounce, for anything that moves in the app. */
export const SPRING = { type: 'spring', bounce: 0, duration: 0.5 } as const;

export function MotionRoot({ children }: { children: ReactNode }) {
  return <MotionConfig reducedMotion="user" transition={SPRING}>{children}</MotionConfig>;
}

/** The element that scrolls (the landing page scrolls itself, not the window). */
const ScrollRoot = createContext<RefObject<HTMLElement | null> | null>(null);
export const ScrollContainer = ScrollRoot.Provider;

const rtl = (s: string) => /[֐-ࣿ]/.test(s);
// motion.create must run once per tag, never inside render (a new component each render would remount it).
const tags = new Map<ElementType, any>();
const motionTag = (as: ElementType) => { let c = tags.get(as); if (!c) { c = motion.create(as as any); tags.set(as, c); } return c; };

/** Text that appears word by word out of a blur. `when="view"` waits until it scrolls into view. */
export function BlurWords({ text, as = 'span', className, delay = 0, stagger = 0.06, when = 'mount', fadeOut = false }: {
  text: string; as?: ElementType; className?: string; delay?: number; stagger?: number; when?: 'mount' | 'view';
  /** Also fade softly away as it scrolls off the top (Apple's product pages). */
  fadeOut?: boolean;
}) {
  const reduce = useReducedMotion();
  const root = useContext(ScrollRoot);
  const ref = useRef<HTMLElement>(null);
  const { scrollYProgress } = useScroll({ target: ref, container: root ?? undefined, offset: ['start end', 'end start'] });
  const outOpacity = useTransform(scrollYProgress, [0, 0.8, 1], [1, 1, 0]);
  const outBlur = useTransform(scrollYProgress, [0, 0.82, 1], [0, 0, reduce ? 0 : 6]);
  const outFilter = useTransform(outBlur, (b: number) => (b > 0.05 ? `blur(${b}px)` : 'none'));
  const Tag = motionTag(as);
  const words = text.split(/(\s+)/);
  const hidden = reduce ? { opacity: 0 } : { opacity: 0, y: '0.32em', filter: 'blur(10px)' };
  const shown = { opacity: 1, y: 0, filter: 'blur(0px)' };
  let n = 0;
  return (
    <Tag ref={ref} className={className} dir={rtl(text) ? 'rtl' : undefined} aria-label={text} style={fadeOut ? { opacity: outOpacity, filter: outFilter } : undefined}
      initial="hidden" {...(when === 'view' ? { whileInView: 'shown', viewport: { once: true, amount: 0.6, root: root ?? undefined } } : { animate: 'shown' })}>
      {words.map((w, i) => /^\s+$/.test(w) ? w : (
        <motion.span key={i} aria-hidden style={{ display: 'inline-block', willChange: 'transform, filter, opacity' }}
          variants={{ hidden, shown: { ...shown, transition: { duration: reduce ? 0.4 : 0.9, ease: EASE, delay: delay + n++ * stagger } } }}>
          {w}
        </motion.span>
      ))}
    </Tag>
  );
}

/** A block that fades and sharpens in as it scrolls into view, and fades softly as it leaves the top. */
export function ScrollFade({ children, className, as = 'div', fadeIn = true, out = true }: { children: ReactNode; className?: string; as?: ElementType; fadeIn?: boolean; out?: boolean }) {
  const reduce = useReducedMotion();
  const root = useContext(ScrollRoot);
  const ref = useRef<HTMLElement>(null);
  const { scrollYProgress } = useScroll({ target: ref, container: root ?? undefined, offset: ['start end', 'end start'] });
  const opacity = useTransform(scrollYProgress, [0, 0.22, 0.8, 1], [fadeIn ? 0 : 1, 1, 1, out ? 0 : 1]);
  const y = useTransform(scrollYProgress, [0, 0.25], [reduce || !fadeIn ? 0 : 40, 0]);
  const blur = useTransform(scrollYProgress, [0, 0.2, 0.82, 1], [reduce || !fadeIn ? 0 : 8, 0, 0, reduce || !out ? 0 : 6]);
  const filter = useTransform(blur, (b: number) => (b > 0.05 ? `blur(${b}px)` : 'none'));
  const Tag = motionTag(as);
  return <Tag ref={ref} className={className} style={{ opacity, y, filter }}>{children}</Tag>;
}

/** Text that cross-fades through a blur whenever it changes (status lines, counters). */
export function FadeSwap({ value, className }: { value: string; className?: string }) {
  const reduce = useReducedMotion();
  return (
    <motion.span key={value} className={className} initial={reduce ? { opacity: 0 } : { opacity: 0, y: 4, filter: 'blur(4px)' }}
      animate={{ opacity: 1, y: 0, filter: 'blur(0px)' }} transition={{ duration: 0.45, ease: EASE }}>
      {value}
    </motion.span>
  );
}

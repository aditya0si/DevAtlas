/**
 * Minimal framer-motion mock for jest.
 *
 * Renders `motion.*` components as their plain DOM tag (so table markup keeps
 * working) and strips animation-only props so React doesn't warn about unknown
 * DOM attributes.
 */
import * as React from 'react';

const ANIMATION_PROPS = new Set([
  'initial',
  'animate',
  'exit',
  'whileHover',
  'whileTap',
  'whileFocus',
  'whileDrag',
  'whileInView',
  'transition',
  'layout',
  'layoutId',
  'variants',
  'drag',
  'dragConstraints',
  'dragElastic',
  'dragMomentum',
  'custom',
  'onAnimationStart',
  'onAnimationComplete',
  'onDragStart',
  'onDragEnd',
  'onHoverStart',
  'onHoverEnd',
  'onTapStart',
  'onTap',
  'onTapCancel',
]);

const createMockMotionComponent = (tag: string) => {
  const Component = ({ children, ...props }: any) => {
    const domProps: Record<string, unknown> = {};
    for (const [key, value] of Object.entries(props)) {
      if (!ANIMATION_PROPS.has(key)) {
        domProps[key] = value;
      }
    }
    return React.createElement(tag, domProps, children);
  };
  Component.displayName = `motion.${tag}`;
  return Component;
};

const motion = new Proxy(
  {},
  {
    get: (_target: object, prop: string | symbol) => {
      if (typeof prop === 'string') return createMockMotionComponent(prop);
      return undefined;
    },
  }
);

export const AnimatePresence = ({ children }: any) =>
  React.createElement(React.Fragment, null, children);

const mock = { motion, AnimatePresence };

export { motion };
export default mock;

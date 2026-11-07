/**
 * Reanimated 4.7-ийн өөрийн mock нь RN 0.88-ийн jest орчинд JSReanimated-ийг
 * эхлүүлэхдээ унадаг тул тестэд хэрэгтэй хэсгийн энгийн орлуулга.
 * Анимацийн функц эцсийн утгыг шууд буцаана.
 */
const React = require('react');
const { View, Text, Image, ScrollView, FlatList } = require('react-native');

const passthrough = (Component) =>
  React.forwardRef(function AnimatedComponent(props, ref) {
    return React.createElement(Component, { ...props, ref });
  });

const Animated = {
  View: passthrough(View),
  Text: passthrough(Text),
  Image: passthrough(Image),
  ScrollView: passthrough(ScrollView),
  FlatList: passthrough(FlatList),
  createAnimatedComponent: passthrough,
};

const target = (v) => v;
const layoutBuilder = () => {
  const b = new Proxy(function () {}, { get: () => () => b, apply: () => b });
  return b;
};

module.exports = {
  __esModule: true,
  default: Animated,
  ...Animated,
  useSharedValue: (v) => {
    const ref = React.useRef(null);
    if (!ref.current) {
      ref.current = {
        value: v,
        get() {
          return this.value;
        },
        set(next) {
          this.value = typeof next === 'function' ? next(this.value) : next;
        },
      };
    }
    return ref.current;
  },
  useDerivedValue: (fn) => ({ value: fn() }),
  useAnimatedStyle: (fn) => fn(),
  useAnimatedProps: (fn) => fn(),
  useReducedMotion: () => false,
  useAnimatedRef: () => React.useRef(null),
  withTiming: (v, _c, cb) => {
    if (cb) cb(true);
    return v;
  },
  withSpring: (v, _c, cb) => {
    if (cb) cb(true);
    return v;
  },
  withDelay: (_d, v) => v,
  withSequence: (...vs) => vs[vs.length - 1],
  withRepeat: (v) => v,
  cancelAnimation: () => {},
  runOnJS: (fn) => fn,
  runOnUI: (fn) => fn,
  interpolate: (_v, _i, out) => out[0],
  Extrapolation: { CLAMP: 'clamp', EXTEND: 'extend', IDENTITY: 'identity' },
  Easing: new Proxy({}, { get: () => () => target }),
  ReduceMotion: { System: 'system', Always: 'always', Never: 'never' },
  FadeIn: layoutBuilder(),
  FadeOut: layoutBuilder(),
  ZoomIn: layoutBuilder(),
  LinearTransition: layoutBuilder(),
};

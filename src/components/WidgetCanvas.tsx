import React, { useEffect, useMemo, useState } from 'react';
import { Animated, Easing, PanResponder, StyleSheet, Text, TouchableOpacity, View } from 'react-native';
import { EyeOff } from 'lucide-react-native';
import type { Palette } from '../theme/theme';
import { haptics } from '../services/hapticsService';
import { FONT } from '../theme/typography';
import { useReducedMotion } from '../hooks/useReducedMotion';

/** One module on the dashboard deck. */
export interface WidgetSpec {
  id: string;
  title: string;
  desc: string;
  icon: React.ReactNode;
  borderColor: string;
  onPress: () => void;
}

/**
 * S/M/L, like a home-screen widget: how many of the deck's 3 columns a tile
 * spans. Height stays a single row for every size — widening (not growing
 * downward) keeps the free drag-anywhere canvas simple, since every tile's
 * own travel range only ever depends on its own width.
 */
export type WidgetSize = 'S' | 'M' | 'L';

const SIZE_ORDER: WidgetSize[] = ['S', 'M', 'L'];
const SIZE_COLUMN_SPAN: Record<WidgetSize, number> = { S: 1, M: 2, L: 3 };

/** S -> M -> L -> S, the cycle the resize control steps through on each tap. */
export const nextWidgetSize = (size: WidgetSize): WidgetSize =>
  SIZE_ORDER[(SIZE_ORDER.indexOf(size) + 1) % SIZE_ORDER.length];

const SIZE_LABEL: Record<WidgetSize, string> = { S: 'S', M: 'M', L: 'L' };

/**
 * Positions are stored as fractions of the canvas travel range (0–1 on each
 * axis, where 1 means "flush against the far edge"). Fractions survive a
 * rotation, a resize and the web/desktop width differences; pixels would not.
 * `size` is optional so decks saved before resizing existed keep rendering
 * every tile at its original 'S' footprint.
 */
export type WidgetLayout = Record<string, { x: number; y: number; size?: WidgetSize }>;

const TILE_HEIGHT = 76;
const GAP = 8;
const COLUMNS = 3;
/** Four rows fit the Generation 4 module set without stacking several
 * absolute-positioned tiles onto the same final row. */
const ROWS = 4;

export const CANVAS_HEIGHT = TILE_HEIGHT * ROWS + GAP * (ROWS - 1);

const clamp = (value: number, min: number, max: number) =>
  value < min ? min : value > max ? max : value;

/**
 * Default deck: modules fill the three-column grid row by row. The canvas has
 * enough rows for the complete Generation 4 roster, so no two default tiles
 * are clamped onto the same absolute position.
 */
export const defaultWidgetLayout = (ids: string[]): WidgetLayout => {
  const travelY = Math.max(1, CANVAS_HEIGHT - TILE_HEIGHT);
  const layout: WidgetLayout = {};
  ids.forEach((id, index) => {
    const col = index % COLUMNS;
    const row = Math.floor(index / COLUMNS);
    layout[id] = {
      x: col === 0 ? 0 : col === 1 ? 0.5 : 1,
      y: clamp((row * (TILE_HEIGHT + GAP)) / travelY, 0, 1),
    };
  });
  return layout;
};

/** Pixel width for a given size at the current canvas width. Zero before the
    canvas has actually measured its width (matches the pre-resize behavior,
    where the deck simply doesn't render any tile yet). */
export const widthForSize = (size: WidgetSize | undefined, canvasWidth: number): number => {
  if (canvasWidth <= 0) return 0;
  const span = SIZE_COLUMN_SPAN[size ?? 'S'];
  const baseTile = (canvasWidth - GAP * (COLUMNS - 1)) / COLUMNS;
  return baseTile * span + GAP * (span - 1);
};

interface CanvasWidgetProps {
  spec: WidgetSpec;
  index: number;
  position: { x: number; y: number };
  size?: WidgetSize;
  width: number;
  height: number;
  canvasWidth: number;
  editing: boolean;
  palette: Palette;
  onMove: (id: string, position: { x: number; y: number }) => void;
  onHide?: (id: string) => void;
  onResize?: (id: string, size: WidgetSize) => void;
}

/** Exported for reduce-motion testing; not part of the public widget API. */
export const CanvasWidget: React.FC<CanvasWidgetProps> = ({
  spec,
  index,
  position,
  size = 'S',
  width,
  height,
  canvasWidth,
  editing,
  palette,
  onMove,
  onHide,
  onResize,
}) => {
  const pos = useMemo(() => new Animated.ValueXY({ x: 0, y: 0 }), []);
  const entry = useMemo(() => new Animated.Value(0), []);
  const jiggle = useMemo(() => new Animated.Value(0), []);
  const [dragging, setDragging] = useState(false);
  // The settle-to-position spring below carries real information (it shows
  // where the tile actually is) and always runs. The staggered entrance and
  // the ARRANGE-mode wobble are pure flourish, so they are the two dropped
  // under reduce-motion.
  const reduceMotion = useReducedMotion();

  const travelX = Math.max(1, canvasWidth - width);
  const travelY = Math.max(1, CANVAS_HEIGHT - height);

  // Settle on the stored position whenever it (or the canvas) changes. The
  // drag never fights it: a gesture only ever mutates `pos`, and the position
  // we persist on release is what this effect would animate to anyway.
  useEffect(() => {
    Animated.spring(pos, {
      toValue: { x: position.x * travelX, y: position.y * travelY },
      friction: 8,
      tension: 70,
      useNativeDriver: false,
    }).start();
  }, [pos, position.x, position.y, travelX, travelY]);

  // Staggered materialisation: the deck assembles instead of appearing.
  useEffect(() => {
    if (reduceMotion) {
      entry.setValue(1);
      return;
    }
    const timer = setTimeout(() => {
      Animated.timing(entry, {
        toValue: 1,
        duration: 460,
        easing: Easing.out(Easing.cubic),
        useNativeDriver: false,
      }).start();
    }, index * 70);
    return () => clearTimeout(timer);
  }, [entry, index, reduceMotion]);

  // ARRANGE mode: everything wobbles so it is obvious the deck is loose.
  // Under reduce-motion the (non-animated) border/label change on the tile
  // is what communicates edit mode instead — see the `editing` styling below.
  useEffect(() => {
    if (!editing || reduceMotion) {
      jiggle.setValue(0);
      return;
    }
    const loop = Animated.loop(
      Animated.sequence([
        Animated.timing(jiggle, {
          toValue: 1,
          duration: 180,
          easing: Easing.inOut(Easing.quad),
          useNativeDriver: false,
        }),
        Animated.timing(jiggle, {
          toValue: -1,
          duration: 220,
          easing: Easing.inOut(Easing.quad),
          useNativeDriver: false,
        }),
      ])
    );
    // Off-phase start so the deck does not wobble in lockstep.
    const timer = setTimeout(() => loop.start(), index * 55);
    return () => {
      clearTimeout(timer);
      loop.stop();
    };
  }, [editing, jiggle, index, reduceMotion]);

  const responder = useMemo(
    () =>
      PanResponder.create({
        onStartShouldSetPanResponder: () => editing,
        onMoveShouldSetPanResponder: () => editing,
        onPanResponderGrant: () => {
          setDragging(true);
          haptics.light();
          // The gesture's dx/dy are relative to where the tile already sits.
          pos.setOffset({ x: position.x * travelX, y: position.y * travelY });
          pos.setValue({ x: 0, y: 0 });
        },
        onPanResponderMove: Animated.event([null, { dx: pos.x, dy: pos.y }], {
          useNativeDriver: false,
        }),
        onPanResponderRelease: (_event, gesture) => {
          pos.flattenOffset();
          const x = clamp(position.x * travelX + gesture.dx, 0, travelX);
          const y = clamp(position.y * travelY + gesture.dy, 0, travelY);
          Animated.spring(pos, {
            toValue: { x, y },
            friction: 7,
            tension: 90,
            useNativeDriver: false,
          }).start();
          haptics.medium();
          setDragging(false);
          onMove(spec.id, { x: travelX ? x / travelX : 0, y: travelY ? y / travelY : 0 });
        },
        onPanResponderTerminate: () => setDragging(false),
      }),
    [pos, spec.id, travelX, travelY, editing, onMove, position.x, position.y]
  );

  const entryY = entry.interpolate({ inputRange: [0, 1], outputRange: [16, 0] });
  const jiggleRotate = jiggle.interpolate({
    inputRange: [-1, 1],
    outputRange: ['-1.4deg', '1.4deg'],
  });

  const content = (
    <>
      {spec.icon}
      <Text style={[styles.title, { color: palette.text }]} numberOfLines={2}>
        {spec.title}
      </Text>
      <Text style={[styles.desc, { color: palette.textDim }]} numberOfLines={1}>
        {spec.desc}
      </Text>
    </>
  );

  // Each module keeps its own colour, but on a hairline neutral card with a
  // 2 px rule on top: six fully outlined coloured cards read as six equal
  // priorities, which is exactly what a dashboard should not say.
  const cardStyle = [
    styles.card,
    {
      backgroundColor: palette.bgElevated,
      borderColor: palette.border,
      borderTopColor: spec.borderColor,
    },
    editing && styles.cardEditing,
  ];

  return (
    <Animated.View
      {...responder.panHandlers}
      style={[
        styles.tile,
        {
          width,
          height,
          zIndex: dragging ? 30 : 1,
          opacity: entry,
          transform: [
            { translateX: pos.x },
            { translateY: pos.y },
            { translateY: entryY },
            { rotate: jiggleRotate },
            { scale: editing ? 1.03 : 1 },
          ],
        },
      ]}
    >
      {editing ? (
        <TouchableOpacity
          style={cardStyle}
          activeOpacity={0.8}
          accessibilityLabel={`Hide ${spec.title} widget`}
          onPress={() => {
            // In ARRANGE mode a tap means "take this module off the deck".
            // Hiding is a distinct intent from moving, and it is what makes the
            // dashboard the user's rather than a fixed six-slot panel.
            haptics.medium();
            onHide?.(spec.id);
          }}
        >
          {content}
          {/* Grip: the only affordance that says "this moves". */}
          <View style={styles.grip}>
            <View style={[styles.gripDot, { backgroundColor: palette.accent }]} />
            <View style={[styles.gripDot, { backgroundColor: palette.accent }]} />
          </View>
          <View style={styles.hideBadge}>
            <EyeOff size={9} color={palette.error} />
          </View>
        </TouchableOpacity>
      ) : null}
      {editing && onResize && (
        // A sibling absolutely-positioned control, not nested inside the
        // hide-toggling TouchableOpacity above: React Native routes a touch
        // to the single view that actually contains the tap point, so this
        // never also fires the "hide" press underneath it.
        <TouchableOpacity
          style={[styles.resizeBadge, { borderColor: palette.accent, backgroundColor: palette.bgDeep }]}
          activeOpacity={0.7}
          accessibilityLabel={`Resize ${spec.title} widget (currently ${SIZE_LABEL[size]})`}
          accessibilityRole="button"
          onPress={() => {
            haptics.light();
            onResize(spec.id, nextWidgetSize(size));
          }}
        >
          <Text style={[styles.resizeBadgeText, { color: palette.accent }]}>{SIZE_LABEL[size]}</Text>
        </TouchableOpacity>
      )}
      {!editing && (
        <TouchableOpacity
          style={cardStyle}
          activeOpacity={0.85}
          accessibilityLabel={spec.title}
          onPress={spec.onPress}
        >
          {content}
        </TouchableOpacity>
      )}
    </Animated.View>
  );
};

interface WidgetCanvasProps {
  widgets: WidgetSpec[];
  layout: WidgetLayout;
  onMove: (id: string, position: { x: number; y: number }) => void;
  /** Called when a tile is tapped in ARRANGE mode, to remove it from the deck. */
  onHide?: (id: string) => void;
  /** Called when the resize badge is tapped in ARRANGE mode, cycling S -> M -> L. */
  onResize?: (id: string, size: WidgetSize) => void;
  editing: boolean;
  palette: Palette;
}

/**
 * Free-form module deck. In normal mode the tiles are plain buttons; in ARRANGE
 * mode they wobble and can be dragged anywhere on the canvas, and their
 * positions are handed back as fractions for persistence.
 *
 * The parent ScrollView must disable its own scrolling while `editing`, or the
 * drag gestures would scroll the page instead of moving a tile.
 */
export const WidgetCanvas: React.FC<WidgetCanvasProps> = ({
  widgets,
  layout,
  onMove,
  onHide,
  onResize,
  editing,
  palette,
}) => {
  const [canvasWidth, setCanvasWidth] = useState(0);

  return (
    <View
      style={[styles.canvas, { height: CANVAS_HEIGHT }]}
      onLayout={(e) => setCanvasWidth(e.nativeEvent.layout.width)}
    >
      {canvasWidth > 0 &&
        widgets.map((spec, index) => {
          const position = layout[spec.id] ?? { x: 0, y: 0 };
          return (
            <CanvasWidget
              key={spec.id}
              spec={spec}
              index={index}
              position={position}
              size={position.size}
              width={widthForSize(position.size, canvasWidth)}
              height={TILE_HEIGHT}
              canvasWidth={canvasWidth}
              editing={editing}
              palette={palette}
              onMove={onMove}
              onHide={onHide}
              onResize={onResize}
            />
          );
        })}
      {editing && (
        <View style={[styles.gridHint, { borderColor: palette.accentSoft }]} pointerEvents="none" />
      )}
    </View>
  );
};

const styles = StyleSheet.create({
  canvas: {
    position: 'relative',
    marginVertical: 10,
    width: '100%',
  },
  tile: {
    position: 'absolute',
    top: 0,
    left: 0,
  },
  card: {
    flex: 1,
    borderRadius: 6,
    borderWidth: 1,
    borderTopWidth: 2,
    padding: 6,
    alignItems: 'center',
    justifyContent: 'center',
    overflow: 'hidden',
  },
  cardEditing: {
    borderStyle: 'dashed',
    shadowColor: '#00E5FF',
    shadowOpacity: 0.5,
    shadowRadius: 8,
    shadowOffset: { width: 0, height: 0 },
    elevation: 8,
  },
  title: {
    fontFamily: FONT.uiMedium,
    fontSize: 9.5,
    fontWeight: '700',
    marginTop: 3,
    letterSpacing: 1,
    textAlign: 'center',
    textTransform: 'uppercase',
  },
  desc: {
    fontFamily: FONT.ui,
    fontSize: 9.5,
    fontWeight: '500',
    marginTop: 2,
    letterSpacing: 0.3,
    textAlign: 'center',
  },
  grip: {
    position: 'absolute',
    top: 4,
    right: 4,
    flexDirection: 'row',
    gap: 2,
  },
  gripDot: {
    width: 3,
    height: 3,
    borderRadius: 2,
    opacity: 0.8,
  },
  hideBadge: {
    position: 'absolute',
    bottom: 3,
    right: 3,
  },
  resizeBadge: {
    position: 'absolute',
    bottom: 3,
    left: 3,
    width: 18,
    height: 18,
    borderRadius: 4,
    borderWidth: 1,
    alignItems: 'center',
    justifyContent: 'center',
  },
  resizeBadgeText: {
    fontFamily: FONT.uiMedium,
    fontSize: 9,
    fontWeight: '800',
  },
  gridHint: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    bottom: 0,
    borderWidth: 1,
    borderRadius: 8,
    opacity: 0.35,
  },
});

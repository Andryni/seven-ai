import React, { useEffect, useMemo, useState } from 'react';
import { Animated, Easing, PanResponder, StyleSheet, Text, TouchableOpacity, View } from 'react-native';
import { EyeOff } from 'lucide-react-native';
import type { Palette } from '../theme/theme';
import { haptics } from '../services/hapticsService';
import { FONT } from '../theme/typography';

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
 * Positions are stored as fractions of the canvas travel range (0–1 on each
 * axis, where 1 means "flush against the far edge"). Fractions survive a
 * rotation, a resize and the web/desktop width differences; pixels would not.
 */
export type WidgetLayout = Record<string, { x: number; y: number }>;

const TILE_HEIGHT = 76;
const GAP = 8;
const COLUMNS = 3;
/** Three rows of room for two rows of modules — the slack is the point. */
const ROWS = 3;

export const CANVAS_HEIGHT = TILE_HEIGHT * ROWS + GAP * (ROWS - 1);

const clamp = (value: number, min: number, max: number) =>
  value < min ? min : value > max ? max : value;

/**
 * Default deck: the modules sit in a 3 × 2 grid. Because the canvas is three
 * rows tall, the fractions land the tiles exactly on the grid while leaving the
 * bottom row free to drag into.
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

interface CanvasWidgetProps {
  spec: WidgetSpec;
  index: number;
  position: { x: number; y: number };
  width: number;
  height: number;
  canvasWidth: number;
  editing: boolean;
  palette: Palette;
  onMove: (id: string, position: { x: number; y: number }) => void;
  onHide?: (id: string) => void;
}

const CanvasWidget: React.FC<CanvasWidgetProps> = ({
  spec,
  index,
  position,
  width,
  height,
  canvasWidth,
  editing,
  palette,
  onMove,
  onHide,
}) => {
  const pos = useMemo(() => new Animated.ValueXY({ x: 0, y: 0 }), []);
  const entry = useMemo(() => new Animated.Value(0), []);
  const jiggle = useMemo(() => new Animated.Value(0), []);
  const [dragging, setDragging] = useState(false);

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
    const timer = setTimeout(() => {
      Animated.timing(entry, {
        toValue: 1,
        duration: 460,
        easing: Easing.out(Easing.cubic),
        useNativeDriver: false,
      }).start();
    }, index * 70);
    return () => clearTimeout(timer);
  }, [entry, index]);

  // ARRANGE mode: everything wobbles so it is obvious the deck is loose.
  useEffect(() => {
    if (!editing) {
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
  }, [editing, jiggle, index]);

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
      ) : (
        <TouchableOpacity style={cardStyle} activeOpacity={0.85} onPress={spec.onPress}>
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
  editing,
  palette,
}) => {
  const [canvasWidth, setCanvasWidth] = useState(0);

  const tileWidth = canvasWidth > 0 ? (canvasWidth - GAP * (COLUMNS - 1)) / COLUMNS : 0;

  return (
    <View
      style={[styles.canvas, { height: CANVAS_HEIGHT }]}
      onLayout={(e) => setCanvasWidth(e.nativeEvent.layout.width)}
    >
      {canvasWidth > 0 &&
        widgets.map((spec, index) => (
          <CanvasWidget
            key={spec.id}
            spec={spec}
            index={index}
            position={layout[spec.id] ?? { x: 0, y: 0 }}
            width={tileWidth}
            height={TILE_HEIGHT}
            canvasWidth={canvasWidth}
            editing={editing}
            palette={palette}
            onMove={onMove}
            onHide={onHide}
          />
        ))}
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

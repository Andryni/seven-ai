/**
 * Dashboard widgets can now span 1, 2 or 3 of the deck's 3 grid columns
 * (S/M/L), cycling on tap of a resize badge shown only in ARRANGE mode.
 * `widthForSize`/`nextWidgetSize` are pure and drive both the pixel layout
 * and the badge's cycle, so they get direct unit coverage; the component
 * tests check the badge only appears when it should and that tapping it
 * calls back with the right next size — never the "hide" handler underneath.
 */
import React from 'react';
import { render, fireEvent } from '@testing-library/react-native';
import {
  CanvasWidget,
  nextWidgetSize,
  widthForSize,
  defaultWidgetLayout,
  type WidgetSize,
} from '../src/components/WidgetCanvas';
import { useTheme } from '../src/theme/theme';

jest.mock('lucide-react-native', () => ({ EyeOff: 'EyeOff' }));

const getPalette = () => {
  let captured: ReturnType<typeof useTheme> | null = null;
  const Capture = () => {
    captured = useTheme();
    return null;
  };
  render(<Capture />);
  return captured!;
};

describe('nextWidgetSize', () => {
  it('cycles S -> M -> L -> S', () => {
    expect(nextWidgetSize('S')).toBe('M');
    expect(nextWidgetSize('M')).toBe('L');
    expect(nextWidgetSize('L')).toBe('S');
  });
});

describe('widthForSize', () => {
  const canvasWidth = 300; // 3 columns, GAP=8 -> base tile = (300 - 16) / 3 ~ 94.67
  const base = (canvasWidth - 8 * 2) / 3;

  it('gives a single column for S (or undefined)', () => {
    expect(widthForSize('S', canvasWidth)).toBeCloseTo(base);
    expect(widthForSize(undefined, canvasWidth)).toBeCloseTo(base);
  });

  it('spans two columns plus their gap for M', () => {
    expect(widthForSize('M', canvasWidth)).toBeCloseTo(base * 2 + 8);
  });

  it('spans all three columns plus both gaps for L (full width)', () => {
    expect(widthForSize('L', canvasWidth)).toBeCloseTo(canvasWidth);
  });

  it('is zero-safe before the canvas has measured a width', () => {
    expect(widthForSize('L', 0)).toBe(0);
  });
});

describe('CanvasWidget resize control', () => {
  const palette = getPalette();
  const layout = defaultWidgetLayout(['w1']);
  const spec = {
    id: 'w1',
    title: 'Widget',
    desc: 'desc',
    icon: null,
    borderColor: '#fff',
    onPress: jest.fn(),
  };

  it('shows no resize badge outside of ARRANGE mode', () => {
    const onResize = jest.fn();
    const { queryByLabelText } = render(
      <CanvasWidget
        spec={spec}
        index={0}
        position={layout.w1}
        size="S"
        width={100}
        height={76}
        canvasWidth={300}
        editing={false}
        palette={palette}
        onMove={jest.fn()}
        onResize={onResize}
      />
    );
    expect(queryByLabelText(/Resize Widget widget/)).toBeNull();
  });

  it('shows the resize badge in ARRANGE mode, labelled with the current size', () => {
    const { getByLabelText } = render(
      <CanvasWidget
        spec={spec}
        index={0}
        position={layout.w1}
        size="M"
        width={200}
        height={76}
        canvasWidth={300}
        editing
        palette={palette}
        onMove={jest.fn()}
        onResize={jest.fn()}
      />
    );
    expect(getByLabelText(/Resize Widget widget \(currently M\)/)).toBeTruthy();
  });

  it('cycles to the next size and never triggers the hide handler on the same tap', () => {
    const onResize = jest.fn();
    const onHide = jest.fn();
    const { getByLabelText } = render(
      <CanvasWidget
        spec={spec}
        index={0}
        position={layout.w1}
        size="S"
        width={100}
        height={76}
        canvasWidth={300}
        editing
        palette={palette}
        onMove={jest.fn()}
        onHide={onHide}
        onResize={onResize}
      />
    );
    fireEvent.press(getByLabelText(/Resize Widget widget \(currently S\)/));
    expect(onResize).toHaveBeenCalledWith('w1', 'M');
    expect(onHide).not.toHaveBeenCalled();
  });

  it('does not render a resize badge when the caller does not pass onResize', () => {
    const { queryByLabelText } = render(
      <CanvasWidget
        spec={spec}
        index={0}
        position={layout.w1}
        size="S"
        width={100}
        height={76}
        canvasWidth={300}
        editing
        palette={palette}
        onMove={jest.fn()}
      />
    );
    expect(queryByLabelText(/Resize Widget widget/)).toBeNull();
  });

  it('defaults to size S when none is stored (backward compatible with old decks)', () => {
    const { getByLabelText } = render(
      <CanvasWidget
        spec={spec}
        index={0}
        position={layout.w1}
        width={100}
        height={76}
        canvasWidth={300}
        editing
        palette={palette}
        onMove={jest.fn()}
        onResize={jest.fn()}
      />
    );
    expect(getByLabelText(/currently S/)).toBeTruthy();
  });

  it('renders every size without throwing', () => {
    const sizes: WidgetSize[] = ['S', 'M', 'L'];
    sizes.forEach((size) => {
      expect(() =>
        render(
          <CanvasWidget
            spec={spec}
            index={0}
            position={layout.w1}
            size={size}
            width={widthForSize(size, 300)}
            height={76}
            canvasWidth={300}
            editing={false}
            palette={palette}
            onMove={jest.fn()}
          />
        )
      ).not.toThrow();
    });
  });
});

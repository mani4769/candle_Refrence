import React, {
  useCallback,
  useRef,
  useState,
  useEffect,
  useMemo,
  forwardRef,
  useImperativeHandle,
} from 'react';
import { StyleSheet, View, TouchableOpacity, Text, Dimensions, PanResponder, Image } from 'react-native';
import { Ionicons, MaterialCommunityIcons } from '@expo/vector-icons';
import Svg, { Path, Defs, LinearGradient, Stop, Rect } from 'react-native-svg';
import Slider from '@react-native-community/slider';

const { width: SCREEN_WIDTH } = Dimensions.get('window');
const CANVAS_WIDTH = SCREEN_WIDTH - 22;
const CANVAS_HEIGHT = CANVAS_WIDTH;

const MIN_BRUSH_SIZE = 2;
const MAX_BRUSH_SIZE = 40;
const SETTINGS_TRACK_WIDTH = 247;
const CANVAS_BACKGROUND = '#191919';
const ICON_UNDO = require('../../assets/ui-icons/undo.png');
const ICON_REDO = require('../../assets/ui-icons/redo.png');
const ICON_ERASER = require('../../assets/ui-icons/eraser.png');
const ICON_COLOR_PICKER = require('../../assets/ui-icons/colorpicker.png');
const ICON_SETTINGS_SLIDER = require('../../assets/ui-icons/settingsslider.png');
const LEGACY_ERASER_COLORS = new Set(['#0c1020', '#11131b', '#12151d', '#000000']);

function isVeryDarkColor(color) {
  if (typeof color !== 'string') {
    return false;
  }
  const value = color.trim().toLowerCase();

  // #RRGGBB
  const hexMatch = value.match(/^#([0-9a-f]{6})$/i);
  if (hexMatch) {
    const hex = hexMatch[1];
    const r = parseInt(hex.slice(0, 2), 16);
    const g = parseInt(hex.slice(2, 4), 16);
    const b = parseInt(hex.slice(4, 6), 16);
    const luminance = 0.2126 * r + 0.7152 * g + 0.0722 * b;
    return luminance < 24;
  }

  // rgb(...) / rgba(...)
  const rgbMatch = value.match(/^rgba?\((\d+),\s*(\d+),\s*(\d+)/i);
  if (rgbMatch) {
    const r = Number(rgbMatch[1]);
    const g = Number(rgbMatch[2]);
    const b = Number(rgbMatch[3]);
    const luminance = 0.2126 * r + 0.7152 * g + 0.0722 * b;
    return luminance < 24;
  }

  return false;
}

function normalizeStrokeColor(color) {
  if (typeof color !== 'string') {
    return color;
  }
  const normalized = color.trim().toLowerCase();
  if (LEGACY_ERASER_COLORS.has(normalized) || isVeryDarkColor(normalized)) {
    return CANVAS_BACKGROUND;
  }
  return color;
}

function normalizePaths(paths) {
  if (!Array.isArray(paths)) {
    return [];
  }
  return paths.map((p) => ({
    ...p,
    color: normalizeStrokeColor(p?.color),
  }));
}

function parsePathPoints(pathData) {
  if (typeof pathData !== 'string' || !pathData.trim()) {
    return [];
  }

  return pathData
    .trim()
    .split(/\s+/)
    .map((token) => {
      const cmd = token[0];
      if (cmd !== 'M' && cmd !== 'L') {
        return null;
      }
      const coords = token.slice(1).split(',');
      if (coords.length < 2) {
        return null;
      }
      const x = Number(coords[0]);
      const y = Number(coords[1]);
      if (Number.isNaN(x) || Number.isNaN(y)) {
        return null;
      }
      return { x, y };
    })
    .filter(Boolean);
}

function distancePointToSegment(point, segStart, segEnd) {
  const vx = segEnd.x - segStart.x;
  const vy = segEnd.y - segStart.y;
  const wx = point.x - segStart.x;
  const wy = point.y - segStart.y;

  const segmentLenSq = vx * vx + vy * vy;
  if (segmentLenSq === 0) {
    const dx = point.x - segStart.x;
    const dy = point.y - segStart.y;
    return Math.hypot(dx, dy);
  }

  let t = (wx * vx + wy * vy) / segmentLenSq;
  t = Math.max(0, Math.min(1, t));

  const projX = segStart.x + t * vx;
  const projY = segStart.y + t * vy;
  return Math.hypot(point.x - projX, point.y - projY);
}

function minDistanceToPolyline(point, polyline) {
  if (!Array.isArray(polyline) || polyline.length === 0) {
    return Number.POSITIVE_INFINITY;
  }
  if (polyline.length === 1) {
    return Math.hypot(point.x - polyline[0].x, point.y - polyline[0].y);
  }

  let min = Number.POSITIVE_INFINITY;
  for (let i = 0; i < polyline.length - 1; i += 1) {
    const d = distancePointToSegment(point, polyline[i], polyline[i + 1]);
    if (d < min) {
      min = d;
    }
  }
  return min;
}

function pointsToPath(points) {
  if (!Array.isArray(points) || points.length < 2) {
    return '';
  }

  return points
    .map((p, idx) => `${idx === 0 ? 'M' : 'L'}${p.x},${p.y}`)
    .join(' ');
}

function eraseStrokePartially(stroke, eraserPoints, eraserRadius) {
  const strokePoints = parsePathPoints(stroke?.d || '');
  if (strokePoints.length < 2 || eraserPoints.length === 0) {
    return [stroke];
  }

  const strokeRadius = Math.max(0.5, (stroke?.strokeWidth || 1) / 2);
  const hitRadius = eraserRadius + strokeRadius;

  const keepMask = strokePoints.map((point) => minDistanceToPolyline(point, eraserPoints) > hitRadius);

  const segments = [];
  let current = [];
  for (let i = 0; i < strokePoints.length; i += 1) {
    if (keepMask[i]) {
      current.push(strokePoints[i]);
    } else if (current.length > 0) {
      if (current.length >= 2) {
        segments.push(current);
      }
      current = [];
    }
  }
  if (current.length >= 2) {
    segments.push(current);
  }

  if (segments.length === 0) {
    return [];
  }

  return segments
    .map((points) => ({
      ...stroke,
      d: pointsToPath(points),
    }))
    .filter((item) => item.d);
}

function hslToHex(h, s, l) {
  const sat = s / 100;
  const light = l / 100;
  const a = sat * Math.min(light, 1 - light);
  const f = (n) => {
    const k = (n + h / 30) % 12;
    const color = light - a * Math.max(Math.min(k - 3, 9 - k, 1), -1);
    return Math.round(255 * color)
      .toString(16)
      .padStart(2, '0');
  };
  return `#${f(0)}${f(8)}${f(4)}`;
}

const DrawingCanvas = forwardRef(function DrawingCanvas(
  {
    onSave,
    onPressSave,
    onDirty,
    initialPaths = [],
    saveDisabled = false,
  },
  ref,
) {
  const [paths, setPaths] = useState(() => normalizePaths(initialPaths));
  const [currentPath, setCurrentPath] = useState(null);
  const [selectedColor, setSelectedColor] = useState('#65E9EA');
  const [brushSize, setBrushSize] = useState(Math.round((MIN_BRUSH_SIZE + MAX_BRUSH_SIZE) / 2) + 1);
  const [isEraser, setIsEraser] = useState(false);
  const [colorSliderValue, setColorSliderValue] = useState(180);
  const [colorTrackWidth, setColorTrackWidth] = useState(0);
  const [brushTrackWidth, setBrushTrackWidth] = useState(0);
  const [toolPanelMode, setToolPanelMode] = useState('none');
  const [settingsMode, setSettingsMode] = useState(false);
  const [saturationValue, setSaturationValue] = useState(70);
  const [lightnessValue, setLightnessValue] = useState(55);
  const currentPathRef = useRef('');
  const selectedColorRef = useRef(selectedColor);
  const brushSizeRef = useRef(brushSize);
  const isEraserRef = useRef(isEraser);
  const historyRef = useRef([]);
  const historyIndexRef = useRef(-1);
  const [, forceUpdate] = useState(0);

  useEffect(() => {
    selectedColorRef.current = selectedColor;
  }, [selectedColor]);

  useEffect(() => {
    brushSizeRef.current = brushSize;
  }, [brushSize]);

  useEffect(() => {
    isEraserRef.current = isEraser;
  }, [isEraser]);

  useEffect(() => {
    if (onSave) {
      onSave(paths);
    }
  }, [paths, onSave]);

  const resetLocalState = useCallback(() => {
    setPaths([]);
    setCurrentPath(null);
    currentPathRef.current = '';
    historyRef.current = [];
    historyIndexRef.current = -1;
    forceUpdate((n) => n + 1);
  }, []);

  const prevInitialPathsRef = useRef(initialPaths);
  useEffect(() => {
    if (initialPaths.length === 0 && prevInitialPathsRef.current.length > 0) {
      resetLocalState();
    }
    prevInitialPathsRef.current = initialPaths;
  }, [initialPaths, resetLocalState]);

  useImperativeHandle(
    ref,
    () => ({
      getPaths: () => paths,
      hasDrawing: () => paths.length > 0,
      clearCanvas: () => {
        resetLocalState();
      },
      resetHistory: () => {
        historyRef.current = [];
        historyIndexRef.current = -1;
        forceUpdate((n) => n + 1);
      },
      loadPaths: (newPaths) => {
        if (Array.isArray(newPaths)) {
          const normalized = normalizePaths(newPaths);
          setPaths(normalized);
          historyRef.current = [];
          historyIndexRef.current = -1;
          forceUpdate((n) => n + 1);
        }
      },
    }),
    [paths, resetLocalState],
  );

  const saveToHistory = useCallback((newPaths) => {
    historyRef.current = historyRef.current.slice(0, historyIndexRef.current + 1);
    historyRef.current.push([...newPaths]);
    historyIndexRef.current = historyRef.current.length - 1;
    forceUpdate((n) => n + 1);
  }, []);

  const handleUndo = useCallback(() => {
    if (historyIndexRef.current < 0) {
      return;
    }
    historyIndexRef.current -= 1;
    if (historyIndexRef.current >= 0) {
      setPaths([...historyRef.current[historyIndexRef.current]]);
    } else {
      setPaths([]);
    }
    forceUpdate((n) => n + 1);
  }, []);

  const handleRedo = useCallback(() => {
    if (historyIndexRef.current >= historyRef.current.length - 1) {
      return;
    }
    historyIndexRef.current += 1;
    setPaths([...historyRef.current[historyIndexRef.current]]);
    forceUpdate((n) => n + 1);
  }, []);

  const handleBrushSizeChange = useCallback((value) => {
    setBrushSize(Math.round(value));
  }, []);

  const decreaseBrushSize = useCallback(() => {
    setBrushSize((prev) => Math.max(MIN_BRUSH_SIZE, prev - 1));
  }, []);

  const increaseBrushSize = useCallback(() => {
    setBrushSize((prev) => Math.min(MAX_BRUSH_SIZE, prev + 1));
  }, []);

  const handleColorChange = useCallback((value) => {
    setColorSliderValue(value);
    setSelectedColor(hslToHex(value, saturationValue, lightnessValue));
    setIsEraser(false);
  }, [lightnessValue, saturationValue]);

  const handleSaturationChange = useCallback((value) => {
    setSaturationValue(value);
    setSelectedColor(hslToHex(colorSliderValue, value, lightnessValue));
  }, [colorSliderValue, lightnessValue]);

  const handleLightnessChange = useCallback((value) => {
    setLightnessValue(value);
    setSelectedColor(hslToHex(colorSliderValue, saturationValue, value));
  }, [colorSliderValue, saturationValue]);

  const handleEraserPress = useCallback(() => {
    if (isEraser) {
      setIsEraser(false);
      if (toolPanelMode === 'eraser') {
        setToolPanelMode('none');
      }
      return;
    }
    setIsEraser(true);
    setSettingsMode(false);
    setToolPanelMode('eraser');
  }, [isEraser, toolPanelMode]);

  const handleColorPress = useCallback(() => {
    if (toolPanelMode === 'color') {
      setToolPanelMode('none');
      setSettingsMode(false);
      return;
    }
    setToolPanelMode('color');
    setIsEraser(false);
  }, [toolPanelMode]);

  const panResponder = useMemo(
    () =>
      PanResponder.create({
        onStartShouldSetPanResponder: () => true,
        onMoveShouldSetPanResponder: () => true,
        onStartShouldSetPanResponderCapture: () => true,
        onMoveShouldSetPanResponderCapture: () => true,
        onPanResponderGrant: (evt) => {
          const { locationX, locationY } = evt.nativeEvent;
          currentPathRef.current = `M${locationX},${locationY}`;
          const stroke = isEraserRef.current ? CANVAS_BACKGROUND : selectedColorRef.current;
          setCurrentPath({
            d: currentPathRef.current,
            color: stroke,
            strokeWidth: brushSizeRef.current,
          });
        },
        onPanResponderMove: (evt) => {
          const { locationX, locationY } = evt.nativeEvent;
          currentPathRef.current += ` L${locationX},${locationY}`;
          const stroke = isEraserRef.current ? CANVAS_BACKGROUND : selectedColorRef.current;
          setCurrentPath({
            d: currentPathRef.current,
            color: stroke,
            strokeWidth: brushSizeRef.current,
          });
        },
        onPanResponderRelease: () => {
          if (!currentPathRef.current) {
            return;
          }

          if (isEraserRef.current) {
            const eraserPoints = parsePathPoints(currentPathRef.current);
            const eraserRadius = Math.max(1, brushSizeRef.current / 2);
            setPaths((prev) => {
              const next = prev.flatMap((stroke) => eraseStrokePartially(stroke, eraserPoints, eraserRadius));
              saveToHistory(next);
              return next;
            });
            if (onDirty) {
              onDirty();
            }
          } else {
            const newPath = {
              d: currentPathRef.current,
              color: selectedColorRef.current,
              strokeWidth: brushSizeRef.current,
            };
            setPaths((prev) => {
              const next = [...prev, newPath];
              saveToHistory(next);
              return next;
            });
            if (onDirty) {
              onDirty();
            }
          }

          setCurrentPath(null);
          currentPathRef.current = '';
        },
      }),
    [saveToHistory],
  );

  const canUndo = historyIndexRef.current >= 0;
  const canRedo = historyIndexRef.current < historyRef.current.length - 1;
  const showBrushControls = toolPanelMode === 'eraser' || toolPanelMode === 'color';
  const showColorControls = toolPanelMode === 'color';

  return (
    <View style={styles.container}>
      <View style={styles.canvasContainer} {...(panResponder?.panHandlers || {})}>
        <Svg height={CANVAS_HEIGHT} width={CANVAS_WIDTH} style={styles.canvas}>
          <Rect x="0" y="0" width={CANVAS_WIDTH} height={CANVAS_HEIGHT} fill={CANVAS_BACKGROUND} />
          {paths.map((p, index) => (
            <Path
              key={`${index}_${p.d.length}`}
              d={p.d}
              stroke={p.color}
              strokeWidth={p.strokeWidth}
              fill="none"
              strokeLinecap="round"
              strokeLinejoin="round"
            />
          ))}
          {currentPath ? (
            <Path
              d={currentPath.d}
              stroke={currentPath.color}
              strokeWidth={currentPath.strokeWidth}
              fill="none"
              strokeLinecap="round"
              strokeLinejoin="round"
            />
          ) : null}
        </Svg>
      </View>

      {!settingsMode ? (
      <View style={styles.actionBar}>
        <TouchableOpacity
          style={[styles.actionButton, styles.undoActionButton, !canUndo && styles.actionButtonDisabled]}
          onPress={handleUndo}
          disabled={!canUndo}
        >
          <Image
            source={ICON_UNDO}
            style={[styles.actionIconImage, canUndo && styles.actionIconImageEnabled]}
            resizeMode="contain"
          />
        </TouchableOpacity>

        <TouchableOpacity
          style={[
            styles.actionButton,
            styles.redoActionButton,
            !canRedo && styles.actionButtonDisabled,
          ]}
          onPress={handleRedo}
          disabled={!canRedo}
        >
          <Image
            source={ICON_REDO}
            style={[styles.actionIconImage, canRedo && styles.actionIconImageEnabled]}
            resizeMode="contain"
          />
        </TouchableOpacity>

        <TouchableOpacity
          style={[styles.actionButton, styles.eraserActionButton, isEraser && styles.eraserActionButtonActive]}
          onPress={handleEraserPress}
        >
          <Image source={ICON_ERASER} style={styles.eraserIconImage} resizeMode="contain" />
        </TouchableOpacity>

        <TouchableOpacity style={[styles.colorButton, styles.colorButtonShift]} onPress={handleColorPress}>
          <View style={[styles.colorDot, { backgroundColor: isEraser ? '#3B3B3B' : selectedColor }]} />
        </TouchableOpacity>

        <TouchableOpacity
          style={[styles.saveButton, styles.saveButtonShift, saveDisabled && styles.saveButtonDisabled]}
          onPress={onPressSave}
          disabled={saveDisabled}
        >
          <Ionicons name="bookmark-outline" size={20} color={saveDisabled ? '#8E93A5' : '#FFFFFF'} />
          <Text style={[styles.saveButtonText, saveDisabled && styles.saveButtonTextDisabled]}>Save</Text>
        </TouchableOpacity>
      </View>
      ) : null}

      {showBrushControls ? (
        <View style={[styles.toolsPanel, settingsMode && styles.toolsPanelSettingsMode]}>
          {!settingsMode ? (
          <View style={styles.sliderRow}>
            <TouchableOpacity style={styles.stepButton} onPress={decreaseBrushSize}>
              <Text style={styles.stepSymbol}>−</Text>
            </TouchableOpacity>
            <View style={styles.centerTrack}>
              <View style={styles.brushSliderWrapper}>
              <View style={styles.brushGradientBackground}>
                <Svg height={27} width="100%" viewBox="0 0 100 26" preserveAspectRatio="none">
                  <Path
                    d="M0 13 L87 0 A13 13 0 0 1 94 26 L0 13 Z"
                    fill="#D4D2D2"
                  />
                </Svg>
              </View>
                <View style={styles.brushSliderTrack} onLayout={(e) => setBrushTrackWidth(e.nativeEvent.layout.width)}>
                  <Slider
                    style={styles.brushNativeSlider}
                    minimumValue={MIN_BRUSH_SIZE}
                    maximumValue={MAX_BRUSH_SIZE}
                    value={brushSize}
                    onValueChange={handleBrushSizeChange}
                    minimumTrackTintColor="transparent"
                    maximumTrackTintColor="transparent"
                    thumbTintColor="transparent"
                    step={1}
                  />
                <View
                  pointerEvents="none"
                  style={[
                    styles.brushThumb,
                    {
                      width:
                        28 + ((brushSize - MIN_BRUSH_SIZE) / (MAX_BRUSH_SIZE - MIN_BRUSH_SIZE)) * 12,
                      height:
                        28 + ((brushSize - MIN_BRUSH_SIZE) / (MAX_BRUSH_SIZE - MIN_BRUSH_SIZE)) * 12,
                      borderRadius:
                        (28 + ((brushSize - MIN_BRUSH_SIZE) / (MAX_BRUSH_SIZE - MIN_BRUSH_SIZE)) * 12) / 2,
                      top:
                        (30 - (28 + ((brushSize - MIN_BRUSH_SIZE) / (MAX_BRUSH_SIZE - MIN_BRUSH_SIZE)) * 12)) / 2 - 4,
                      left: brushTrackWidth > 0
                        ? ((brushSize - MIN_BRUSH_SIZE) / (MAX_BRUSH_SIZE - MIN_BRUSH_SIZE))
                            * (brushTrackWidth
                              - (28 + ((brushSize - MIN_BRUSH_SIZE) / (MAX_BRUSH_SIZE - MIN_BRUSH_SIZE)) * 12))
                        : 0,
                      backgroundColor: '#0B0B0B',
                      borderColor: '#FFFFFF',
                    },
                  ]}
                />
                </View>
              </View>
            </View>
            <TouchableOpacity style={styles.stepButton} onPress={increaseBrushSize}>
              <Text style={[styles.stepSymbol, styles.plusSymbolShift]}>+</Text>
            </TouchableOpacity>
          </View>
          ) : (
            <>
              <View style={styles.settingsSliderWrap}>
                <View style={styles.settingsTrackWrap}>
                  <View style={styles.settingsTrack}>
                    <Svg height={14} width="100%">
                      <Defs>
                        <LinearGradient id="satGradient" x1="0%" y1="0%" x2="100%" y2="0%">
                          <Stop offset="0%" stopColor="#949494" />
                          <Stop offset="50%" stopColor={selectedColor} />
                          <Stop offset="100%" stopColor={selectedColor} />
                        </LinearGradient>
                      </Defs>
                      <Rect x="0" y="0" width="100%" height="14" rx="10" fill="url(#satGradient)" />
                    </Svg>
                  </View>
                  <Slider
                    style={styles.settingsNativeSlider}
                    minimumValue={0}
                    maximumValue={100}
                    value={saturationValue}
                    onValueChange={handleSaturationChange}
                    minimumTrackTintColor="transparent"
                    maximumTrackTintColor="transparent"
                    thumbTintColor="transparent"
                  />
                  <View
                    pointerEvents="none"
                    style={[
                      styles.settingsThumb,
                      {
                        left: (saturationValue / 100) * (SETTINGS_TRACK_WIDTH - 30),
                        backgroundColor: selectedColor,
                      },
                    ]}
                  />
                </View>
              </View>

              <View style={styles.settingsSliderWrap}>
                <View style={styles.settingsTrackWrap}>
                  <View style={styles.settingsTrack}>
                    <Svg height={14} width="100%">
                      <Defs>
                        <LinearGradient id="lightGradient" x1="0%" y1="0%" x2="100%" y2="0%">
                          <Stop offset="0%" stopColor="#000000" />
                          <Stop offset="50%" stopColor={selectedColor} />
                          <Stop offset="100%" stopColor="#FFFFFF" />
                        </LinearGradient>
                      </Defs>
                      <Rect x="0" y="0" width="100%" height="14" rx="10" fill="url(#lightGradient)" />
                    </Svg>
                  </View>
                  <Slider
                    style={styles.settingsNativeSlider}
                    minimumValue={20}
                    maximumValue={80}
                    value={lightnessValue}
                    onValueChange={handleLightnessChange}
                    minimumTrackTintColor="transparent"
                    maximumTrackTintColor="transparent"
                    thumbTintColor="transparent"
                  />
                  <View
                    pointerEvents="none"
                    style={[
                      styles.settingsThumb,
                      {
                        left: ((lightnessValue - 20) / 60) * (SETTINGS_TRACK_WIDTH - 30),
                        backgroundColor: selectedColor,
                      },
                    ]}
                  />
                </View>
              </View>
            </>
          )}

          {showColorControls ? (
          <View style={[styles.sliderRow, !settingsMode && styles.colorRowSpacing]}>
            <View style={styles.sideControlSlot}>
              <Image source={ICON_COLOR_PICKER} style={styles.sideControlIcon} resizeMode="contain" />
            </View>
            <View style={styles.centerTrack}>
              <View style={styles.colorSliderWrapper}>
                <View style={styles.colorGradientBackground}>
                  <Svg height={14} width="100%">
                    <Defs>
                      <LinearGradient id="colorGradient" x1="0%" y1="0%" x2="100%" y2="0%">
                        <Stop offset="0%" stopColor="#FF0000" />
                        <Stop offset="17%" stopColor="#FFFF00" />
                        <Stop offset="33%" stopColor="#00FF00" />
                        <Stop offset="50%" stopColor="#00FFFF" />
                        <Stop offset="67%" stopColor="#0000FF" />
                        <Stop offset="83%" stopColor="#FF00FF" />
                        <Stop offset="100%" stopColor="#FF0000" />
                      </LinearGradient>
                    </Defs>
                    <Rect x="0" y="0" width="100%" height="14" rx="10" fill="url(#colorGradient)" />
                  </Svg>
                </View>
                <View style={styles.colorSliderTrack} onLayout={(e) => setColorTrackWidth(e.nativeEvent.layout.width)}>
                  <Slider
                    style={styles.colorNativeSlider}
                    minimumValue={0}
                    maximumValue={360}
                    value={colorSliderValue}
                    onValueChange={handleColorChange}
                    minimumTrackTintColor="transparent"
                    maximumTrackTintColor="transparent"
                    thumbTintColor="transparent"
                  />
                  <View
                    style={[
                      styles.colorThumb,
                      {
                        left: colorTrackWidth > 0 ? (colorSliderValue / 360) * (colorTrackWidth - 30) : 0,
                        backgroundColor: selectedColor,
                      },
                    ]}
                    pointerEvents="none"
                  />
                </View>
              </View>
            </View>
            <View style={styles.sideControlSlot}>
              <TouchableOpacity
                style={[styles.moreButton, styles.settingsShift, settingsMode && styles.moreButtonActive]}
                onPress={() => {
                  setSettingsMode((prev) => !prev);
                  setToolPanelMode('color');
                }}
              >
                <Image source={ICON_SETTINGS_SLIDER} style={styles.sideControlIcon} resizeMode="contain" />
              </TouchableOpacity>
            </View>
          </View>
          ) : null}
        </View>
      ) : null}
    </View>
  );
});

const styles = StyleSheet.create({
  container: {
    alignItems: 'center',
    gap: 14,
  },
  canvasContainer: {
    width: CANVAS_WIDTH,
    height: CANVAS_HEIGHT,
    backgroundColor: CANVAS_BACKGROUND,
    borderRadius: 25,
    overflow: 'hidden',
  },
  canvas: {
    flex: 1,
  },
  toolsPanel: {
    width: CANVAS_WIDTH,
    backgroundColor: 'transparent',
    paddingHorizontal: 0,
    paddingVertical: 8,
    marginTop: 2,
    gap: 10,
  },
  toolsPanelSettingsMode: {
    gap: 22,
  },
  sliderRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 0,
    width: '100%',
  },
  colorRowSpacing: {
    marginTop: 10,
  },
  settingsSliderWrap: {
    width: '100%',
    alignItems: 'center',
    justifyContent: 'center',
    height: 30,
  },
  settingsTrackWrap: {
    width: SETTINGS_TRACK_WIDTH,
    height: 30,
    position: 'relative',
    justifyContent: 'center',
  },
  settingsTrack: {
    width: '100%',
    position: 'absolute',
    top: 8,
    left: 0,
    height: 14,
    borderRadius: 10,
    overflow: 'hidden',
  },
  settingsNativeSlider: {
    width: '100%',
    height: 30,
  },
  settingsThumb: {
    position: 'absolute',
    top: 0,
    width: 30,
    height: 30,
    borderRadius: 15,
    borderWidth: 2,
    borderColor: '#FFFFFF',
  },
  sliderIcon: {
    color: '#EFEFEF',
    fontSize: 20,
    width: 20,
    textAlign: 'center',
  },
  nativeSlider: {
    flex: 1,
    height: 36,
  },
  brushSliderWrapper: {
    width: 247,
    height: 30,
    position: 'relative',
    justifyContent: 'center',
  },
  centerTrack: {
    width: 286,
    alignItems: 'center',
    justifyContent: 'center',
  },
  brushGradientBackground: {
    position: 'absolute',
    left: 0,
    right: 0,
    top: 0,
    height: 26,
    borderRadius: 15,
    overflow: 'hidden',
  },
  brushNativeSlider: {
    flex: 1,
  },
  brushSliderTrack: {
    position: 'relative',
    flex: 1,
    justifyContent: 'center',
  },
  brushThumb: {
    position: 'absolute',
    borderWidth: 2,
  },
  stepButton: {
    width: 26,
    height: 30,
    alignItems: 'center',
    justifyContent: 'center',
    marginTop: -9,
  },
  stepSymbol: {
    color: '#FFFFFF',
    fontSize: 30,
    lineHeight: 30,
    fontWeight: '400',
    textAlign: 'center',
  },
  plusSymbolShift: {
    marginLeft: 9,
  },
  sideControlSlot: {
    width: 26,
    height: 30,
    alignItems: 'center',
    justifyContent: 'center',
  },
  colorSliderWrapper: {
    width: 247,
    height: 30,
    position: 'relative',
    justifyContent: 'center',
  },
  colorGradientBackground: {
    position: 'absolute',
    left: 0,
    right: 0,
    top: 8,
    borderRadius: 10,
    overflow: 'hidden',
    height: 14,
  },
  colorSliderTrack: {
    position: 'relative',
    flex: 1,
    justifyContent: 'center',
  },
  colorNativeSlider: {
    flex: 1,
  },
  colorThumb: {
    position: 'absolute',
    width: 30,
    height: 30,
    borderRadius: 15,
    top: 0,
    borderWidth: 2,
    borderColor: '#FFFFFF',
  },
  moreButton: {
    width: 30,
    height: 30,
    borderRadius: 15,
    alignItems: 'center',
    justifyContent: 'center',
  },
  moreButtonActive: {
    backgroundColor: '#2E323A',
  },
  settingsShift: {
    marginLeft: 8,
  },
  sideControlIcon: {
    width: 22,
    height: 22,
  },
  actionBar: {
    width: CANVAS_WIDTH,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'flex-start',
    gap: 4,
    paddingLeft: 15,
  },
  actionButton: {
    width: 36,
    height: 36,
    borderRadius: 18,
    alignItems: 'center',
    justifyContent: 'center',
  },
  eraserActionButton: {
    marginLeft: 0,
    marginRight: 24,
  },
  undoActionButton: {
    marginRight: 8,
  },
  redoActionButton: {
    marginRight: 18,
  },
  actionButtonDisabled: {
    opacity: 0.25,
  },
  actionIconImage: {
    width: 23,
    height: 25,
    tintColor: '#8E93A5',
  },
  actionIconImageEnabled: {
    tintColor: '#FFFFFF',
  },
  eraserIconImage: {
    width: 40,
    height: 40,
  },
  eraserActionButtonActive: {
    width: 44,
    height: 44,
    borderRadius: 22,
    backgroundColor: '#1D212A',
    borderWidth: 1,
    borderColor: '#39404D',
  },
  colorButton: {
    width: 35,
    height: 35,
    borderRadius: 21,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: '#383838',
  },
  colorButtonShift: {
    marginLeft: 0,
  },
  colorDot: {
    width: 14,
    height: 14,
    borderRadius: 7,
  },
  saveButton: {
    minWidth: 82,
    height: 34,
    borderRadius: 17,
    backgroundColor: '#383838',
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 11,
    flexDirection: 'row',
    gap: 5,
    marginRight: 20,
  },
  saveButtonDisabled: {
    backgroundColor: '#2A2A2A',
  },
  saveButtonShift: {
    marginLeft: 'auto',
  },
  saveButtonText: {
    color: '#FFFFFF',
    fontSize: 15,
    lineHeight: 15,
    letterSpacing: -0.4,
    fontWeight: '700',
  },
  saveButtonTextDisabled: {
    color: '#8E93A5',
  },
});

export default DrawingCanvas;

import React, { useCallback, useRef, useState, useEffect, useMemo, forwardRef, useImperativeHandle } from 'react';
import { StyleSheet, View, TouchableOpacity, Text, Dimensions, PanResponder } from 'react-native';
import Svg, { Path, Defs, LinearGradient, Stop, Rect } from 'react-native-svg';
import Slider from '@react-native-community/slider';
import ViewShot from 'react-native-view-shot';

const { width: SCREEN_WIDTH } = Dimensions.get('window');
const CANVAS_WIDTH = SCREEN_WIDTH - 32;
const CANVAS_HEIGHT = CANVAS_WIDTH; // Square canvas — same aspect ratio as widget

const MIN_BRUSH_SIZE = 2;
const MAX_BRUSH_SIZE = 40;

// HSL to RGB conversion for color spectrum
function hslToHex(h, s, l) {
  s /= 100;
  l /= 100;
  const a = s * Math.min(l, 1 - l);
  const f = n => {
    const k = (n + h / 30) % 12;
    const color = l - a * Math.max(Math.min(k - 3, 9 - k, 1), -1);
    return Math.round(255 * color).toString(16).padStart(2, '0');
  };
  return `#${f(0)}${f(8)}${f(4)}`;
}

const DrawingCanvas = forwardRef(function DrawingCanvas({ onSave, onClear, initialPaths = [] }, ref) {
  const [paths, setPaths] = useState(initialPaths);
  const [currentPath, setCurrentPath] = useState(null);
  const [selectedColor, setSelectedColor] = useState('#FF0000'); // Start with red (hue 0)
  const [brushSize, setBrushSize] = useState(12); // Larger default size
  const canvasRef = useRef(null);

  // Expose methods to parent via ref
  useImperativeHandle(ref, () => ({
    // Get current paths as JSON-serializable array
    getPaths: () => paths,
    hasDrawing: () => paths.length > 0,
    clearCanvas: () => {
      setPaths([]);
      setCurrentPath(null);
      currentPathRef.current = '';
      historyRef.current = [];
      historyIndexRef.current = -1;
      forceUpdate(n => n + 1);
    },
    // Load paths from external source (e.g., from DB)
    loadPaths: (newPaths) => {
      if (Array.isArray(newPaths)) {
        setPaths(newPaths);
        historyRef.current = [newPaths];
        historyIndexRef.current = 0;
        forceUpdate(n => n + 1);
      }
    },
  }), [paths]);
  const [isEraser, setIsEraser] = useState(false);
  const [colorSliderValue, setColorSliderValue] = useState(0); // 0-360 hue (0 = red)
  const [colorTrackWidth, setColorTrackWidth] = useState(0); // measured track width for clamped thumb
  const currentPathRef = useRef('');
  
  // Use refs to keep current values for PanResponder
  const selectedColorRef = useRef('#FF0000');
  const brushSizeRef = useRef(12);
  const isEraserRef = useRef(false);
  
  // Update refs when state changes
  useEffect(() => {
    selectedColorRef.current = selectedColor;
  }, [selectedColor]);
  
  useEffect(() => {
    brushSizeRef.current = brushSize;
  }, [brushSize]);
  
  useEffect(() => {
    isEraserRef.current = isEraser;
  }, [isEraser]);
  
  // History management using refs for stability
  const historyRef = useRef([]);
  const historyIndexRef = useRef(-1);
  const [, forceUpdate] = useState(0); // for re-rendering undo/redo buttons

  // Expose paths to parent via onSave
  useEffect(() => {
    if (onSave) {
      onSave(paths);
    }
  }, [paths]);

  // Reset canvas when initialPaths becomes empty (parent cleared)
  const prevInitialPathsRef = useRef(initialPaths);
  useEffect(() => {
    // If initialPaths changed to empty from non-empty, clear the canvas
    if (initialPaths.length === 0 && prevInitialPathsRef.current.length > 0) {
      setPaths([]);
      setCurrentPath(null);
      currentPathRef.current = '';
      historyRef.current = [];
      historyIndexRef.current = -1;
      forceUpdate(n => n + 1);
    }
    prevInitialPathsRef.current = initialPaths;
  }, [initialPaths]);

  // Save to history when paths change
  const saveToHistory = useCallback((newPaths) => {
    // Truncate any redo history
    historyRef.current = historyRef.current.slice(0, historyIndexRef.current + 1);
    // Add new state
    historyRef.current.push([...newPaths]);
    historyIndexRef.current = historyRef.current.length - 1;
    forceUpdate(n => n + 1);
  }, []);

  const handleUndo = useCallback(() => {
    if (historyIndexRef.current >= 0) {
      historyIndexRef.current -= 1;
      if (historyIndexRef.current >= 0) {
        setPaths([...historyRef.current[historyIndexRef.current]]);
      } else {
        setPaths([]);
      }
      forceUpdate(n => n + 1);
    }
  }, []);

  const handleRedo = useCallback(() => {
    if (historyIndexRef.current < historyRef.current.length - 1) {
      historyIndexRef.current += 1;
      setPaths([...historyRef.current[historyIndexRef.current]]);
      forceUpdate(n => n + 1);
    }
  }, []);

  const handleClearAll = useCallback(() => {
    setPaths([]);
    setCurrentPath(null);
    currentPathRef.current = '';
    historyRef.current = [];
    historyIndexRef.current = -1;
    forceUpdate(n => n + 1);
    if (onClear) onClear();
  }, [onClear]);

  const increaseBrushSize = useCallback(() => {
    setBrushSize(prev => Math.min(prev + 2, MAX_BRUSH_SIZE));
  }, []);

  const decreaseBrushSize = useCallback(() => {
    setBrushSize(prev => Math.max(prev - 2, MIN_BRUSH_SIZE));
  }, []);

  const toggleEraser = useCallback(() => {
    setIsEraser(prev => !prev);
  }, []);

  // Handle brush size change from slider
  const handleBrushSizeChange = useCallback((value) => {
    setBrushSize(Math.round(value));
  }, []);

  // Handle color change from slider
  const handleColorChange = useCallback((value) => {
    const hue = value;
    setColorSliderValue(hue);
    setSelectedColor(hslToHex(hue, 100, 50));
    setIsEraser(false);
  }, []);

  // Create panResponder for drawing - use refs to always get current values
  const panResponder = useMemo(() => PanResponder.create({
    onStartShouldSetPanResponder: () => true,
    onMoveShouldSetPanResponder: () => true,
    onPanResponderGrant: (evt) => {
      const { locationX, locationY } = evt.nativeEvent;
      currentPathRef.current = `M${locationX},${locationY}`;
      const color = isEraserRef.current ? '#FFFFFF' : selectedColorRef.current;
      const size = brushSizeRef.current;
      setCurrentPath({
        d: currentPathRef.current,
        color: color,
        strokeWidth: size,
      });
    },
    onPanResponderMove: (evt) => {
      const { locationX, locationY } = evt.nativeEvent;
      currentPathRef.current += ` L${locationX},${locationY}`;
      const color = isEraserRef.current ? '#FFFFFF' : selectedColorRef.current;
      const size = brushSizeRef.current;
      setCurrentPath({
        d: currentPathRef.current,
        color: color,
        strokeWidth: size,
      });
    },
    onPanResponderRelease: () => {
      if (currentPathRef.current) {
        const color = isEraserRef.current ? '#FFFFFF' : selectedColorRef.current;
        const size = brushSizeRef.current;
        const newPath = {
          d: currentPathRef.current,
          color: color,
          strokeWidth: size,
        };
        setPaths((prev) => {
          const newPaths = [...prev, newPath];
          saveToHistory(newPaths);
          return newPaths;
        });
        setCurrentPath(null);
        currentPathRef.current = '';
      }
    },
  }), [saveToHistory]);

  return (
    <View style={styles.container}>
      {/* Canvas Area with ViewShot for capturing */}
      <ViewShot ref={canvasRef} options={{ format: 'png', quality: 0.8, result: 'base64' }}>
        <View
          style={styles.canvasContainer}
          {...panResponder.panHandlers}
        >
          <Svg height={CANVAS_HEIGHT} width={CANVAS_WIDTH} style={styles.canvas}>
          {/* Render saved paths */}
          {paths.map((p, index) => (
            <Path
              key={index}
              d={p.d}
              stroke={p.color}
              strokeWidth={p.strokeWidth}
              fill="none"
              strokeLinecap="round"
              strokeLinejoin="round"
            />
          ))}
          {/* Render current path being drawn */}
          {currentPath && (
            <Path
              d={currentPath.d}
              stroke={currentPath.color}
              strokeWidth={currentPath.strokeWidth}
              fill="none"
              strokeLinecap="round"
              strokeLinejoin="round"
            />
          )}
        </Svg>
        </View>
      </ViewShot>

      {/* Tools Panel */}
      <View style={styles.toolsPanel}>
        {/* Brush Size Slider */}
        <View style={styles.sliderRow}>
          <TouchableOpacity style={styles.sliderButton} onPress={decreaseBrushSize}>
            <Text style={styles.sliderButtonText}>−</Text>
          </TouchableOpacity>
          <View style={styles.sliderContainer}>
            <Slider
              style={styles.nativeSlider}
              minimumValue={MIN_BRUSH_SIZE}
              maximumValue={MAX_BRUSH_SIZE}
              value={brushSize}
              onValueChange={handleBrushSizeChange}
              minimumTrackTintColor="#333"
              maximumTrackTintColor="#CCC"
              thumbTintColor="#333"
              step={1}
            />
          </View>
          {/* Large size preview */}
          <View style={styles.sizePreviewContainer}>
            <View style={[styles.sizePreviewDot, { width: Math.max(brushSize, 20), height: Math.max(brushSize, 20), borderRadius: Math.max(brushSize, 20) / 2 }]} />
          </View>
          <TouchableOpacity style={styles.sliderButton} onPress={increaseBrushSize}>
            <Text style={styles.sliderButtonText}>+</Text>
          </TouchableOpacity>
        </View>

        {/* Color Spectrum Slider */}
        <View style={styles.sliderRow}>
          <Text style={styles.colorLabel}>🎨</Text>
          <View style={styles.colorSliderWrapper}>
            <View style={styles.colorGradientBackground}>
              <Svg height={36} width="100%">
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
                <Rect x="0" y="0" width="100%" height="36" rx="18" fill="url(#colorGradient)" />
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
              {/* Large custom thumb — clamped so it never bleeds outside the bar */}
              <View 
                style={[
                  styles.colorThumbLarge, 
                  { 
                    left: colorTrackWidth > 0
                      ? (colorSliderValue / 360) * (colorTrackWidth - 36)
                      : 0,
                    marginLeft: 0,
                    backgroundColor: selectedColor,
                  }
                ]} 
                pointerEvents="none"
              />
            </View>
          </View>
          {/* Large color preview */}
          <View style={[styles.colorPreviewLarge, { backgroundColor: selectedColor }]} />
        </View>
      </View>

      {/* Bottom Action Bar */}
      <View style={styles.actionBar}>
        <TouchableOpacity 
          style={[styles.actionButton, historyIndexRef.current < 0 && styles.actionButtonDisabled]} 
          onPress={handleUndo}
          disabled={historyIndexRef.current < 0}
        >
          <Text style={styles.actionIcon}>↩️</Text>
        </TouchableOpacity>
        <TouchableOpacity 
          style={[styles.actionButton, historyIndexRef.current >= historyRef.current.length - 1 && styles.actionButtonDisabled]} 
          onPress={handleRedo}
          disabled={historyIndexRef.current >= historyRef.current.length - 1}
        >
          <Text style={styles.actionIcon}>↪️</Text>
        </TouchableOpacity>
        <TouchableOpacity 
          style={[styles.actionButton, isEraser && styles.actionButtonActive]} 
          onPress={toggleEraser}
        >
          <Text style={styles.actionIcon}>🧹</Text>
        </TouchableOpacity>
      </View>
    </View>
  );
});

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#F5F5F5',
    alignItems: 'center',
    paddingTop: 10,
  },
  canvasContainer: {
    width: CANVAS_WIDTH,
    height: CANVAS_HEIGHT,
    backgroundColor: '#FFFFFF',
    borderRadius: 12,
    borderWidth: 1,
    borderColor: '#E0E0E0',
    overflow: 'hidden',
  },
  canvas: {
    flex: 1,
  },
  toolsPanel: {
    width: '100%',
    backgroundColor: '#FFFFFF',
    borderTopLeftRadius: 20,
    borderTopRightRadius: 20,
    paddingVertical: 20,
    paddingHorizontal: 16,
    marginTop: 10,
    borderTopWidth: 1,
    borderTopColor: '#E0E0E0',
  },
  sliderRow: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: 16,
    paddingHorizontal: 8,
  },
  sliderButton: {
    width: 36,
    height: 36,
    borderRadius: 18,
    backgroundColor: '#E8E8E8',
    justifyContent: 'center',
    alignItems: 'center',
    marginHorizontal: 4,
  },
  sliderButtonText: {
    fontSize: 24,
    color: '#333',
    fontWeight: '500',
    textAlign: 'center',
  },
  sliderContainer: {
    flex: 1,
    marginHorizontal: 8,
  },
  nativeSlider: {
    flex: 1,
    height: 40,
  },
  sizePreviewContainer: {
    width: 44,
    height: 44,
    justifyContent: 'center',
    alignItems: 'center',
    marginLeft: 4,
  },
  sizePreviewDot: {
    backgroundColor: '#333',
  },
  colorSliderWrapper: {
    flex: 1,
    height: 50,
    marginHorizontal: 8,
    position: 'relative',
    justifyContent: 'center',
  },
  colorGradientBackground: {
    position: 'absolute',
    left: 0,
    right: 0,
    top: 7,
    height: 36,
    borderRadius: 18,
    overflow: 'hidden',
  },
  colorNativeSlider: {
    flex: 1,
    height: 50,
    zIndex: 2,
  },
  colorSliderTrack: {
    position: 'relative',
    flex: 1,
    height: 50,
    justifyContent: 'center',
  },
  colorThumbLarge: {
    position: 'absolute',
    width: 36,
    height: 36,
    borderRadius: 18,
    marginLeft: 0,
    top: 7,
    borderWidth: 4,
    borderColor: '#fff',
    elevation: 6,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.4,
    shadowRadius: 4,
    zIndex: 1,
  },
  colorLabel: {
    fontSize: 20,
    marginRight: 4,
  },
  colorPreviewLarge: {
    width: 44,
    height: 44,
    borderRadius: 22,
    borderWidth: 4,
    borderColor: '#fff',
    elevation: 5,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.4,
    shadowRadius: 4,
    marginLeft: 8,
  },
  actionBar: {
    flexDirection: 'row',
    justifyContent: 'center',
    alignItems: 'center',
    width: '100%',
    paddingVertical: 12,
    paddingHorizontal: 20,
    backgroundColor: '#FFFFFF',
    gap: 20,
  },
  actionButton: {
    width: 50,
    height: 50,
    borderRadius: 25,
    justifyContent: 'center',
    alignItems: 'center',
    backgroundColor: 'transparent',
  },
  actionButtonDisabled: {
    opacity: 0.3,
  },
  actionButtonActive: {
    backgroundColor: '#E3F2FD',
    borderRadius: 12,
  },
  actionIcon: {
    fontSize: 24,
  },
});

export default DrawingCanvas;

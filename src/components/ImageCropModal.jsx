import React, { useEffect, useMemo, useRef, useState } from 'react';
import { Alert, Modal, StyleSheet, Text, TouchableOpacity, View, Image, PanResponder } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import * as ImageManipulator from 'expo-image-manipulator';
import * as FileSystem from 'expo-file-system';

function clamp(value, min, max) {
  'worklet';
  return Math.max(min, Math.min(max, value));
}

async function getImageSizeAsync(uri) {
  return new Promise((resolve, reject) => {
    Image.getSize(
      uri,
      (width, height) => resolve({ width, height }),
      (error) => reject(error),
    );
  });
}

async function ensureFileUriAsync(inputUri) {
  if (!inputUri) return '';
  if (inputUri.startsWith('file://')) return inputUri;

  const cacheDir = FileSystem.cacheDirectory || FileSystem.documentDirectory;
  if (!cacheDir) return inputUri;

  const filename = `crop_${Date.now()}_${Math.floor(Math.random() * 1e6)}.jpg`;
  const dest = `${cacheDir}${filename}`;
  await FileSystem.copyAsync({ from: inputUri, to: dest });
  return dest;
}

async function normalizeToJpegAsync(fileUri) {
  try {
    const result = await ImageManipulator.manipulateAsync(
      fileUri,
      [],
      { compress: 1, format: ImageManipulator.SaveFormat.JPEG },
    );
    return result ?? null;
  } catch {
    return null;
  }
}

/**
 * A simple WhatsApp-DP-like square cropper:
 * - Square crop window (fixed)
 * - Pan to reposition
 * - Slider to zoom
 * - Outputs a square-cropped image via expo-image-manipulator
 */
const ImageCropModal = ({ visible, uri, aspectRatio = 1, onCancel, onDone }) => {
  const [cropLayout, setCropLayout] = useState({ width: 0, height: 0 });
  const [imageSize, setImageSize] = useState(null);
  const [isProcessing, setIsProcessing] = useState(false);
  const [workingUri, setWorkingUri] = useState('');

  // Pan offsets (in crop-box px)
  const [pan, setPan] = useState({ x: 0, y: 0 });
  const panRef = useRef({ x: 0, y: 0 });
  const panStartRef = useRef({ x: 0, y: 0 });

  // Zoom multiplier on top of the "cover" base scale
  const [zoom, setZoom] = useState(1);
  const zoomRef = useRef(1);

  useEffect(() => {
    zoomRef.current = zoom;
  }, [zoom]);

  useEffect(() => {
    panRef.current = pan;
  }, [pan]);

  useEffect(() => {
    if (!visible || !uri) {
      return;
    }
    setIsProcessing(false);
    setWorkingUri('');
    setCropLayout({ width: 0, height: 0 });
    setPan({ x: 0, y: 0 });
    setZoom(1);
    setImageSize(null);
    ensureFileUriAsync(uri)
      .then(async (fileUri) => {
        const normalized = await normalizeToJpegAsync(fileUri);
        if (normalized?.uri && normalized.width && normalized.height) {
          setWorkingUri(normalized.uri);
          setImageSize({ width: normalized.width, height: normalized.height });
          return;
        }

        // Fallback for any manipulator init issues: still show the image and try to measure via Image.getSize.
        setWorkingUri(fileUri);
        try {
          const size = await getImageSizeAsync(fileUri);
          setImageSize(size);
        } catch {
          setImageSize(null);
        }
      })
      .catch(() => setImageSize(null));
  }, [visible, uri]);

  const baseScale = useMemo(() => {
    if (!imageSize || cropLayout.width <= 0 || cropLayout.height <= 0) {
      return 1;
    }
    return Math.max(cropLayout.width / imageSize.width, cropLayout.height / imageSize.height);
  }, [imageSize, cropLayout.width, cropLayout.height]);

  const totalScale = useMemo(() => baseScale * zoom, [baseScale, zoom]);

  const maxPan = useMemo(() => {
    if (!imageSize || cropLayout.width <= 0 || cropLayout.height <= 0) {
      return { x: 0, y: 0 };
    }
    const scaledW = imageSize.width * totalScale;
    const scaledH = imageSize.height * totalScale;
    // Ensure the image always covers the square crop box.
    return {
      x: Math.max(0, (scaledW - cropLayout.width) / 2),
      y: Math.max(0, (scaledH - cropLayout.height) / 2),
    };
  }, [imageSize, cropLayout.width, cropLayout.height, totalScale]);

  // When zoom changes, clamp pan to new bounds.
  useEffect(() => {
    setPan((p) => ({
      x: clamp(p.x, -maxPan.x, maxPan.x),
      y: clamp(p.y, -maxPan.y, maxPan.y),
    }));
  }, [maxPan.x, maxPan.y]);

  const panResponder = useMemo(() => {
    return PanResponder.create({
      onStartShouldSetPanResponder: () => true,
      onMoveShouldSetPanResponder: () => true,
      onPanResponderGrant: () => {
        panStartRef.current = { ...(panRef.current || { x: 0, y: 0 }) };
      },
      onPanResponderMove: (_, gestureState) => {
        const nextX = panStartRef.current.x + gestureState.dx;
        const nextY = panStartRef.current.y + gestureState.dy;
        setPan({
          x: clamp(nextX, -maxPan.x, maxPan.x),
          y: clamp(nextY, -maxPan.y, maxPan.y),
        });
      },
      onPanResponderRelease: () => {},
      onPanResponderTerminate: () => {},
    });
  }, [maxPan.x, maxPan.y]);

  const handleDone = async () => {
    if (!workingUri || !imageSize || cropLayout.width <= 0 || cropLayout.height <= 0 || isProcessing) {
      return;
    }
    setIsProcessing(true);
    try {
      const scale = baseScale * zoomRef.current;
      const scaledW = imageSize.width * scale;
      const scaledH = imageSize.height * scale;

      const centerX = cropLayout.width / 2;
      const centerY = cropLayout.height / 2;

      const imageTopLeftX = centerX - scaledW / 2 + panRef.current.x;
      const imageTopLeftY = centerY - scaledH / 2 + panRef.current.y;

      const originX = clamp((0 - imageTopLeftX) / scale, 0, imageSize.width);
      const originY = clamp((0 - imageTopLeftY) / scale, 0, imageSize.height);
      const width = clamp(cropLayout.width / scale, 1, imageSize.width - originX);
      const height = clamp(cropLayout.height / scale, 1, imageSize.height - originY);

      const result = await ImageManipulator.manipulateAsync(
        workingUri,
        [{ crop: { originX, originY, width, height } }],
        { compress: 1, format: ImageManipulator.SaveFormat.JPEG },
      );
      onDone?.(result.uri);
    } catch (e) {
      onDone?.(workingUri);
    } finally {
      setIsProcessing(false);
    }
  };

  const handleRotate = async () => {
    if (!workingUri || isProcessing) {
      return;
    }
    setIsProcessing(true);
    try {
      let sourceUri = workingUri;
      // Some gallery formats (e.g. HEIC) fail to rotate; normalize first.
      const normalized = await normalizeToJpegAsync(sourceUri);
      if (normalized?.uri) {
        sourceUri = normalized.uri;
      }
      const result = await ImageManipulator.manipulateAsync(sourceUri, [{ rotate: 90 }], {
        compress: 1,
        format: ImageManipulator.SaveFormat.JPEG,
      });
      setWorkingUri(result.uri);
      setPan({ x: 0, y: 0 });
      setZoom(1);
      if (result?.width && result?.height) {
        setImageSize({ width: result.width, height: result.height });
      } else {
        const nextSize = await getImageSizeAsync(result.uri);
        setImageSize(nextSize);
      }
    } catch (e) {
      console.error('[crop_rotate_failed]', {
        message: e?.message,
        uri: workingUri,
      });
      console.error(e);
      Alert.alert('Rotate failed', e?.message ? `${e.message}` : 'Unable to rotate this image.');
    } finally {
      setIsProcessing(false);
    }
  };

  return (
    <Modal visible={visible} transparent={true} animationType="fade" onRequestClose={onCancel}>
      <SafeAreaView style={styles.fullscreen}>
        <View style={styles.stageWrap}>
          <View
            style={[styles.cropStage, { aspectRatio }]}
            onLayout={(e) => {
              const { width, height } = e.nativeEvent.layout;
              setCropLayout({ width: Math.floor(width), height: Math.floor(height) });
            }}
          >
            <View style={styles.cropBox} {...(panResponder?.panHandlers || {})}>
              {workingUri && imageSize ? (
                <Image
                  source={{ uri: workingUri }}
                  style={[
                    styles.cropImage,
                    {
                      width: imageSize.width * baseScale,
                      height: imageSize.height * baseScale,
                      // Scale first, then translate so pan is in screen pixels (not scaled).
                      transform: [{ scale: zoom }, { translateX: pan.x }, { translateY: pan.y }],
                    },
                  ]}
                  resizeMode="cover"
                />
              ) : (
                <View style={styles.loadingBox}>
                  <Text style={styles.loadingText}>Loading...</Text>
                </View>
              )}

              <View pointerEvents="none" style={styles.gridOverlay}>
                <View style={[styles.gridRow, { top: '33.3333%' }]} />
                <View style={[styles.gridRow, { top: '66.6667%' }]} />
                <View style={[styles.gridCol, { left: '33.3333%' }]} />
                <View style={[styles.gridCol, { left: '66.6667%' }]} />
                <View style={styles.cornerTL} />
                <View style={styles.cornerTR} />
                <View style={styles.cornerBL} />
                <View style={styles.cornerBR} />
              </View>
            </View>
          </View>
        </View>

        <View style={styles.bottomBar}>
          <TouchableOpacity onPress={onCancel} style={styles.bottomButton} disabled={isProcessing}>
            <Text style={styles.bottomText}>Cancel</Text>
          </TouchableOpacity>
          <TouchableOpacity onPress={handleRotate} style={styles.rotateButton} disabled={isProcessing}>
            <Ionicons name="refresh" size={24} color="#FFFFFF" />
          </TouchableOpacity>
          <TouchableOpacity onPress={handleDone} style={styles.bottomButton} disabled={isProcessing}>
            <Text style={[styles.bottomText, isProcessing && styles.bottomTextDisabled]}>Done</Text>
          </TouchableOpacity>
        </View>
      </SafeAreaView>
    </Modal>
  );
};

const styles = StyleSheet.create({
  fullscreen: {
    flex: 1,
    backgroundColor: '#000000',
  },
  stageWrap: {
    flex: 1,
    justifyContent: 'center',
    paddingTop: 18,
    paddingHorizontal: 14,
  },
  cropStage: {
    width: '100%',
    backgroundColor: '#000000',
    transform: [{ translateY: 34 }],
  },
  cropBox: {
    flex: 1,
    overflow: 'hidden',
    backgroundColor: '#000000',
    alignItems: 'center',
    justifyContent: 'center',
  },
  cropImage: {
    // Centered by `cropBox`; panning/zooming happens via transforms.
  },
  gridOverlay: {
    ...StyleSheet.absoluteFillObject,
  },
  gridRow: {
    position: 'absolute',
    left: 0,
    right: 0,
    height: 1,
    backgroundColor: 'rgba(255,255,255,0.18)',
  },
  gridCol: {
    position: 'absolute',
    top: 0,
    bottom: 0,
    width: 1,
    backgroundColor: 'rgba(255,255,255,0.18)',
  },
  cornerTL: {
    position: 'absolute',
    left: 0,
    top: 0,
    width: 22,
    height: 22,
    borderLeftWidth: 3,
    borderTopWidth: 3,
    borderColor: 'rgba(255,255,255,0.95)',
  },
  cornerTR: {
    position: 'absolute',
    right: 0,
    top: 0,
    width: 22,
    height: 22,
    borderRightWidth: 3,
    borderTopWidth: 3,
    borderColor: 'rgba(255,255,255,0.95)',
  },
  cornerBL: {
    position: 'absolute',
    left: 0,
    bottom: 0,
    width: 22,
    height: 22,
    borderLeftWidth: 3,
    borderBottomWidth: 3,
    borderColor: 'rgba(255,255,255,0.95)',
  },
  cornerBR: {
    position: 'absolute',
    right: 0,
    bottom: 0,
    width: 22,
    height: 22,
    borderRightWidth: 3,
    borderBottomWidth: 3,
    borderColor: 'rgba(255,255,255,0.95)',
  },
  loadingBox: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
  },
  loadingText: {
    color: 'rgba(255,255,255,0.75)',
    fontSize: 14,
    fontWeight: '700',
  },
  bottomBar: {
    height: 84,
    paddingHorizontal: 28,
    paddingBottom: 10,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    backgroundColor: '#000000',
  },
  bottomButton: {
    paddingVertical: 10,
    paddingHorizontal: 10,
  },
  bottomText: {
    color: '#FFFFFF',
    fontSize: 18,
    fontWeight: '700',
  },
  bottomTextDisabled: {
    opacity: 0.5,
  },
  rotateButton: {
    width: 56,
    height: 56,
    borderRadius: 28,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: 'rgba(255,255,255,0.12)',
  },
});

export default ImageCropModal;

import React, { useEffect, useMemo, useRef, useState } from 'react';
import {
  AppState,
  Animated,
  Dimensions,
  Keyboard,
  StyleSheet,
  View,
  Text,
  TouchableOpacity,
  Image,
  Modal,
  Alert,
  Pressable,
  TextInput,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { SvgXml } from 'react-native-svg';
import { SafeAreaView, useSafeAreaInsets } from 'react-native-safe-area-context';
import { Camera, useCameraDevice, useCameraDevices, useCameraPermission } from 'react-native-vision-camera';
import * as ImagePicker from 'expo-image-picker';
import { Accelerometer } from 'expo-sensors';
import ImageCropModal from './ImageCropModal';

const ICON_SPARK = require('../../assets/ui-icons/spark.png');
const ICON_GALLERY = require('../../assets/ui-icons/gallery.png');
const ICON_FLIP = require('../../assets/ui-icons/switchcam.png');
const ICON_SEND = require('../../assets/ui-icons/send.png');
const ICON_REFRESH = require('../../assets/ui-icons/refresh.png');
const STATUS_MAX_CHARS = 12;
const ZOOM_LEVELS = [
  { label: '1x', factor: 1 },
  { label: '2x', factor: 2 },
];

const BASE_FOOTER_HEIGHT = 78;

const STATUS_TABS = [
  { key: 'love', label: 'Love ❤️' },
  { key: 'angry', label: 'Angry 😡' },
  { key: 'hot', label: 'Hot 🌶️' },
  { key: 'happy', label: 'Happy 😀' },
];
const SPARK_WORDMARK_SVG = `<svg width="87" height="18" viewBox="0 0 87 18" fill="none" xmlns="http://www.w3.org/2000/svg"><path d="M7.00835 17.472C6.04835 17.472 5.12835 17.392 4.24835 17.232C3.36835 17.088 2.56835 16.88 1.84835 16.608C1.12835 16.32 0.512352 16.008 0.000351548 15.672L1.87235 12.12C2.44835 12.472 3.04035 12.776 3.64835 13.032C4.27235 13.272 4.90435 13.456 5.54435 13.584C6.18435 13.712 6.82435 13.776 7.46435 13.776C8.07235 13.776 8.59235 13.72 9.02435 13.608C9.45635 13.48 9.78435 13.304 10.0084 13.08C10.2324 12.856 10.3444 12.592 10.3444 12.288C10.3444 11.952 10.1924 11.688 9.88835 11.496C9.60035 11.288 9.21635 11.112 8.73635 10.968C8.25635 10.824 7.72035 10.68 7.12835 10.536C6.55235 10.376 5.96835 10.192 5.37635 9.984C4.80035 9.76 4.27235 9.488 3.79235 9.168C3.31235 8.832 2.92035 8.408 2.61635 7.896C2.32835 7.384 2.18435 6.752 2.18435 6C2.18435 4.784 2.51235 3.728 3.16835 2.832C3.82435 1.936 4.75235 1.24 5.95235 0.744001C7.16835 0.248001 8.60035 4.76837e-07 10.2484 4.76837e-07C11.4484 4.76837e-07 12.5684 0.128001 13.6084 0.384001C14.6484 0.624001 15.5444 0.976001 16.2964 1.44L14.5684 4.968C13.9124 4.552 13.1844 4.24 12.3844 4.032C11.6004 3.808 10.7924 3.696 9.96035 3.696C9.32035 3.696 8.76835 3.768 8.30435 3.912C7.85635 4.056 7.51235 4.256 7.27235 4.512C7.04835 4.752 6.93635 5.024 6.93635 5.328C6.93635 5.648 7.08035 5.912 7.36835 6.12C7.65635 6.328 8.04035 6.504 8.52035 6.648C9.01635 6.792 9.55235 6.944 10.1284 7.104C10.7204 7.248 11.3044 7.424 11.8804 7.632C12.4564 7.824 12.9924 8.088 13.4884 8.424C13.9844 8.744 14.3764 9.152 14.6644 9.648C14.9524 10.144 15.0964 10.76 15.0964 11.496C15.0964 12.696 14.7684 13.744 14.1124 14.64C13.4564 15.536 12.5204 16.232 11.3044 16.728C10.0884 17.224 8.65635 17.472 7.00835 17.472ZM15.5634 17.136L18.9234 0.336H26.0274C28.2034 0.336 29.8834 0.808001 31.0674 1.752C32.2514 2.696 32.8434 4.024 32.8434 5.736C32.8434 7.144 32.5074 8.376 31.8354 9.432C31.1634 10.488 30.2034 11.304 28.9554 11.88C27.7074 12.456 26.2354 12.744 24.5394 12.744H19.0914L21.6114 10.632L20.3154 17.136H15.5634ZM21.4914 11.184L19.8354 9H24.7554C25.7954 9 26.6034 8.752 27.1794 8.256C27.7554 7.76 28.0434 7.056 28.0434 6.144C28.0434 5.44 27.8114 4.92 27.3474 4.584C26.8834 4.248 26.2354 4.08 25.4034 4.08H20.8434L23.3634 1.824L21.4914 11.184ZM29.4446 17.136L40.2206 0.336H44.9006L48.9566 17.136H44.2286L41.2286 2.592H43.1006L34.4606 17.136H29.4446ZM34.1486 13.872L36.0686 10.368H44.2766L44.8046 13.872H34.1486ZM49.6078 17.136L52.9678 0.336H60.1438C62.3038 0.336 63.9678 0.808001 65.1358 1.752C66.3198 2.696 66.9118 4.008 66.9118 5.688C66.9118 7.096 66.5678 8.328 65.8798 9.384C65.2078 10.424 64.2478 11.232 62.9998 11.808C61.7518 12.384 60.2798 12.672 58.5838 12.672H53.1358L55.6558 10.632L54.3598 17.136H49.6078ZM60.1438 17.136L56.7118 11.016H61.6318L65.1118 17.136H60.1438ZM55.5358 11.184L53.8798 9H58.7998C59.8558 9 60.6718 8.752 61.2478 8.256C61.8238 7.76 62.1118 7.056 62.1118 6.144C62.1118 5.44 61.8798 4.92 61.4158 4.584C60.9518 4.248 60.3038 4.08 59.4718 4.08H54.8878L57.4318 1.824L55.5358 11.184ZM71.6694 13.488L72.3654 8.064L80.9094 0.336H86.5014L77.7414 8.16L74.5734 10.872L71.6694 13.488ZM66.6534 17.136L70.0134 0.336H74.6934L71.3334 17.136H66.6534ZM78.1974 17.136L73.7574 10.2L77.2134 7.008L83.5014 17.136H78.1974Z" fill="white"/></svg>`;

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function accelToRotation(accel) {
  if (!accel) {
    return 0;
  }
  const { x = 0, y = -1 } = accel;
  if (Math.abs(x) > Math.abs(y)) {
    // Landscape
    if (x > 0) {
      return 90;
    }
    return -90;
  }
  // Portrait / upside-down
  if (y > 0) {
    return 0;
  }
  return 180;
}

const CameraModal = ({ visible, onClose, onCapture, zoomIndex, setZoomIndex, openStatusSheetRequestId }) => {
  const insets = useSafeAreaInsets();
  const { hasPermission, requestPermission } = useCameraPermission();
  const cameraRef = useRef(null);
  const [previewUri, setPreviewUri] = useState('');
  const [previewRotation, setPreviewRotation] = useState(0);
  const [facing, setFacing] = useState('back');
  const [flash, setFlash] = useState('off');
  const [showZoomMenu, setShowZoomMenu] = useState(false);
  const [isCapturing, setIsCapturing] = useState(false);
  const [appIsActive, setAppIsActive] = useState(() => AppState.currentState === 'active');
  const [canStartCamera, setCanStartCamera] = useState(false);
  const retryTimeoutRef = useRef(null);
  const [cropUri, setCropUri] = useState('');
  const [zoomEpoch, setZoomEpoch] = useState(0);
  const [showFrontFlash, setShowFrontFlash] = useState(false);
  const [cameraFrame, setCameraFrame] = useState({ width: 0, height: 0 });
  const [footerHeight, setFooterHeight] = useState(BASE_FOOTER_HEIGHT);

  const [statusSheetVisible, setStatusSheetVisible] = useState(false);
  const [statusTab, setStatusTab] = useState('love');
  const [selectedStatus, setSelectedStatus] = useState('');
  const [statusDraft, setStatusDraft] = useState('');
  const [previewStatusTouched, setPreviewStatusTouched] = useState(false);
  const [previewStatusEditing, setPreviewStatusEditing] = useState(false);
  const [keyboardHeight, setKeyboardHeight] = useState(0);
  const sheetAnim = useRef(new Animated.Value(0)).current; // 0 closed, 1 open
  const sheetHeight = useMemo(() => {
    const windowH = Dimensions.get('window').height;
    // footerHeight already includes bottom insets (we set footer view height = BASE_FOOTER_HEIGHT + insets.bottom).
    const available = Math.max(240, windowH - footerHeight);
    return Math.round(available * 0.82);
  }, [footerHeight]);
  const sheetTotalHeight = useMemo(() => {
    // Extend the sheet background behind the footer to avoid a visible "gap" near the nav bar.
    // Footer stays on top (higher zIndex), while sheet content gets extra bottom padding.
    return Math.max(240, Math.round(sheetHeight + footerHeight));
  }, [sheetHeight, footerHeight]);

  const resolvedZoomIndex = useMemo(() => {
    const numericZoomIndex = typeof zoomIndex === 'number' ? zoomIndex : Number.parseInt(`${zoomIndex}`, 10);
    if (!Number.isFinite(numericZoomIndex)) {
      return 0;
    }
    return Math.max(0, Math.min(ZOOM_LEVELS.length - 1, numericZoomIndex));
  }, [zoomIndex]);

  const activeZoom = ZOOM_LEVELS[resolvedZoomIndex];

  const allDevices = useCameraDevices();
  const frontDevice = useCameraDevice('front');
  // Prefer physical devices for native-like "lens switching" behavior.
  const backWideDevice = useCameraDevice('back', { physicalDevices: ['wide-angle-camera'] });
  const backTeleDevice = useCameraDevice('back', { physicalDevices: ['telephoto-camera'] });
  const backDevice = useCameraDevice('back');

  const hasTelephotoLens = useMemo(() => {
    return !!backTeleDevice?.physicalDevices?.includes('telephoto-camera');
  }, [backTeleDevice]);

  const isPureTelephotoDevice = useMemo(() => {
    // Some devices expose telephoto only via a logical/multi-cam device whose physicalDevices
    // contains multiple lenses (common on Pixels). In that case, we must still set zoom>1 to
    // trigger native lens switching. Only treat it as "pure telephoto" when it's telephoto-only.
    if (!backTeleDevice) {
      return false;
    }
    const physical = backTeleDevice.physicalDevices || [];
    return physical.length === 1 && physical[0] === 'telephoto-camera' && !backTeleDevice.isMultiCam;
  }, [backTeleDevice]);

  const backBestDevice = useMemo(() => {
    const backDevices = allDevices.filter((d) => d.position === 'back');
    if (backDevices.length === 0) {
      return backDevice || backWideDevice || backTeleDevice;
    }

    // Prefer a device that contains the wide camera, and among those pick the one with the highest maxZoom.
    const wideLike = backDevices.filter((d) => d.physicalDevices?.includes('wide-angle-camera') || d.isMultiCam);
    const candidates = wideLike.length > 0 ? wideLike : backDevices;
    return candidates.reduce((best, cur) => (cur.maxZoom > best.maxZoom ? cur : best), candidates[0]);
  }, [allDevices, backDevice, backWideDevice, backTeleDevice]);

  const device = useMemo(() => {
    if (facing === 'front') {
      return frontDevice;
    }

    // Map UI zooms to lenses when possible:
    // - 1x: wide camera (native Camera default)
    // - 2x: telephoto camera if available, otherwise fall back to digital zoom on wide/logical camera
    if (resolvedZoomIndex === 1 && hasTelephotoLens && backTeleDevice) {
      return backTeleDevice;
    }

    // If there's no telephoto lens, pick the best back device for digital zoom (often the logical multi-cam device).
    return backBestDevice;
  }, [facing, resolvedZoomIndex, frontDevice, hasTelephotoLens, backTeleDevice, backBestDevice]);

  const cameraZoom = useMemo(() => {
    if (!device) {
      return 1;
    }

    const usingTeleDevice =
      facing === 'back' && resolvedZoomIndex === 1 && hasTelephotoLens && backTeleDevice && device?.id === backTeleDevice.id;

    // If we are on a dedicated telephoto-only camera, keep it neutral (avoid stacking digital zoom).
    // If telephoto is only reachable via logical/multi-cam, we must still apply factor to trigger switch.
    const factor = usingTeleDevice && isPureTelephotoDevice ? 1 : activeZoom.factor;

    const desiredZoom = device.neutralZoom * factor;
    return Math.max(device.minZoom, Math.min(device.maxZoom, desiredZoom));
  }, [device, facing, resolvedZoomIndex, hasTelephotoLens, backTeleDevice, isPureTelephotoDevice, activeZoom.factor]);

  const cameraZoomForProp = useMemo(() => {
    if (!device) {
      return 1;
    }
    const epsilon = zoomEpoch % 2 === 1 ? 0.0001 : 0;
    return Math.max(device.minZoom, Math.min(device.maxZoom, cameraZoom + epsilon));
  }, [device, cameraZoom, zoomEpoch]);

  useEffect(() => {
    if (!visible || !device) {
      return;
    }
    console.log(
      '[camera_device]',
      JSON.stringify({
        facing,
        name: device.name,
        physicalDevices: device.physicalDevices,
        isMultiCam: device.isMultiCam,
        minZoom: device.minZoom,
        neutralZoom: device.neutralZoom,
        maxZoom: device.maxZoom,
        hasTelephotoLens,
        isPureTelephotoDevice,
      }),
    );
  }, [visible, facing, device, hasTelephotoLens, isPureTelephotoDevice]);

  const torch = useMemo(() => {
    if (!device?.hasTorch) {
      return 'off';
    }
    if (facing !== 'back') {
      return 'off';
    }
    return flash === 'on' && !isCapturing ? 'on' : 'off';
  }, [device?.hasTorch, facing, flash, isCapturing]);

  const accelRef = useRef({ x: 0, y: -1, z: 0 });

  useEffect(() => {
    if (!visible) {
      return;
    }

    // Keep last selected facing/zoom. Only reset transient UI state.
    setPreviewUri('');
    setPreviewRotation(0);
    setShowZoomMenu(false);
    setIsCapturing(false);
    setCropUri('');
    setStatusSheetVisible(false);
    setSelectedStatus('');
    setStatusDraft('');
    setPreviewStatusTouched(false);
    setPreviewStatusEditing(false);
    sheetAnim.setValue(0);

    if (!hasPermission) {
      requestPermission();
    }
    ImagePicker.requestMediaLibraryPermissionsAsync();

    Accelerometer.setUpdateInterval(120);
    const subscription = Accelerometer.addListener((reading) => {
      accelRef.current = reading;
    });

    return () => {
      subscription?.remove?.();
    };
    // Intentionally run only when the modal becomes visible to avoid double-initialization
    // during permission transitions.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [visible]);

  const openStatusSheet = () => {
    setStatusSheetVisible(true);
    Animated.timing(sheetAnim, {
      toValue: 1,
      duration: 220,
      useNativeDriver: true,
    }).start();
  };

  const closeStatusSheet = () => {
    Animated.timing(sheetAnim, {
      toValue: 0,
      duration: 180,
      useNativeDriver: true,
    }).start(({ finished }) => {
      if (finished) {
        setStatusSheetVisible(false);
      }
    });
  };

  useEffect(() => {
    const subscription = AppState.addEventListener('change', (nextAppState) => {
      setAppIsActive(nextAppState === 'active');
    });

    return () => {
      subscription?.remove?.();
    };
  }, []);

  useEffect(() => {
    const handleKeyboardShow = (event) => {
      const nextHeight = event?.endCoordinates?.height || 0;
      setKeyboardHeight(nextHeight);
    };

    const handleKeyboardHide = () => {
      setKeyboardHeight(0);
    };

    const showSub = Keyboard.addListener('keyboardDidShow', handleKeyboardShow);
    const hideSub = Keyboard.addListener('keyboardDidHide', handleKeyboardHide);

    return () => {
      showSub.remove();
      hideSub.remove();
    };
  }, []);

  useEffect(() => {
    if (!visible || !hasPermission || !device) {
      setCanStartCamera(false);
      return;
    }

    // Avoid racing camera open/close during modal transitions or device switches.
    // This reduces "device/camera-already-in-use" errors on some Android devices.
    const timeout = setTimeout(() => setCanStartCamera(true), 200);
    return () => {
      clearTimeout(timeout);
      setCanStartCamera(false);
    };
  }, [visible, hasPermission, device, facing]);

  useEffect(() => {
    return () => {
      if (retryTimeoutRef.current) {
        clearTimeout(retryTimeoutRef.current);
        retryTimeoutRef.current = null;
      }
    };
  }, []);

  const handleGalleryPress = async () => {
    try {
      const result = await ImagePicker.launchImageLibraryAsync({
        mediaTypes: ['images'],
        allowsEditing: false,
        quality: 1,
      });

      if (!result.canceled && result.assets?.[0]?.uri) {
        const uri = result.assets[0].uri;
        setCropUri(uri);
      }
    } catch (error) {
      Alert.alert('Gallery Error', 'Unable to open gallery.');
    }
  };

  const handleFlipCamera = () => {
    setFacing((prev) => {
      const next = prev === 'back' ? 'front' : 'back';
      if (next === 'front') {
        setFlash('off');
      }
      return next;
    });
  };

  const handleFlashToggle = () => {
    setFlash((prev) => (prev === 'off' ? 'on' : 'off'));
  };

  const handleCapture = async () => {
    if (!cameraRef.current || isCapturing) {
      return;
    }
    setIsCapturing(true);
    try {
      if (facing === 'front' && flash === 'on') {
        // Simulate front "flash" using a short white screen overlay.
        setShowFrontFlash(true);
        await sleep(90);
      }
      const photo = await cameraRef.current.takePhoto({
        flash: facing === 'back' && flash === 'on' && device?.hasFlash ? 'on' : 'off',
      });

      if (photo?.path) {
        const uri = photo.path.startsWith('file://') ? photo.path : `file://${photo.path}`;
        setPreviewUri(uri);
        const tiltRotation = accelToRotation(accelRef.current);
        setPreviewRotation(tiltRotation);
        setPreviewStatusTouched(false);
        setPreviewStatusEditing(false);
        setStatusDraft(selectedStatus || '');
      }
    } catch (error) {
      Alert.alert('Camera Error', 'Unable to capture photo.');
    } finally {
      setIsCapturing(false);
      setShowFrontFlash(false);
    }
  };

  const handleClose = () => {
    setCanStartCamera(false);
    setPreviewUri('');
    setPreviewRotation(0);
    setShowZoomMenu(false);
    setCropUri('');
    onClose();
  };

  const permissionDenied = useMemo(() => !hasPermission, [hasPermission]);
  const deviceUnavailable = useMemo(() => !device, [device]);
  const isPreviewMode = useMemo(() => Boolean(previewUri), [previewUri]);
  const cameraIsActive = useMemo(() => {
    return visible && appIsActive && canStartCamera && !previewUri && !cropUri;
  }, [visible, appIsActive, canStartCamera, previewUri, cropUri]);

  const handleBack = () => {
    if (statusSheetVisible) {
      closeStatusSheet();
      return;
    }
    if (cropUri) {
      setCropUri('');
      return;
    }
    if (previewUri) {
      setPreviewUri('');
      setPreviewRotation(0);
      setShowZoomMenu(false);
      return;
    }
    handleClose();
  };

  const handlePreviewRefresh = () => {
    setPreviewUri('');
    setPreviewRotation(0);
    setShowZoomMenu(false);
    setPreviewStatusTouched(false);
    setPreviewStatusEditing(false);
    setStatusDraft(selectedStatus || '');
  };

  const openPreviewStatusEditor = () => {
    setPreviewStatusTouched(true);
    setPreviewStatusEditing(true);
    setStatusDraft(selectedStatus || '');
  };

  const handlePreviewStatusDraftChange = (value) => {
    setStatusDraft((value || '').slice(0, STATUS_MAX_CHARS));
  };

  const applyPreviewStatus = () => {
    const nextStatus = (statusDraft || '').trim().slice(0, STATUS_MAX_CHARS);
    setSelectedStatus(nextStatus);
    setStatusDraft(nextStatus);
    setPreviewStatusTouched(true);
    setPreviewStatusEditing(false);
  };

  const clearPreviewStatus = () => {
    setSelectedStatus('');
    setStatusDraft('');
    setPreviewStatusTouched(true);
    setPreviewStatusEditing(false);
  };

  const handlePreviewSendNoop = () => {
    if (!previewUri) {
      return;
    }

    try {
      onCapture?.({
        imageUri: previewUri,
        statusText: selectedStatus,
      });
    } catch {
      // ignore send errors here; caller can handle
    }
  };

  const lastStatusOpenReqRef = useRef(0);
  useEffect(() => {
    if (!visible) {
      return;
    }
    const req = Number.isFinite(openStatusSheetRequestId) ? openStatusSheetRequestId : 0;
    if (req > 0 && req !== lastStatusOpenReqRef.current) {
      lastStatusOpenReqRef.current = req;
      openStatusSheet();
    }
  }, [visible, openStatusSheetRequestId]);

  useEffect(() => {
    if (!cameraIsActive || !device) {
      return;
    }
    // Nudge zoom when user changes 1x/2x; avoids restarting the camera session.
    const timeout = setTimeout(() => setZoomEpoch((e) => e + 1), 50);
    return () => clearTimeout(timeout);
  }, [cameraIsActive, device, resolvedZoomIndex]);

  useEffect(() => {
    if (!visible || !device) {
      return;
    }
    console.log(
      '[camera_zoom]',
      JSON.stringify({
        facing,
        zoomIndex: resolvedZoomIndex,
        label: activeZoom.label,
        factor: activeZoom.factor,
        zoom: cameraZoom,
      }),
    );
  }, [visible, facing, resolvedZoomIndex, activeZoom.label, activeZoom.factor, cameraZoom, device]);

  if (!visible) return null;

  return (
    <Modal
      visible={visible}
      transparent={false}
      animationType="slide"
      onRequestClose={handleBack}
    >
      <SafeAreaView style={styles.container}>
        <ImageCropModal
          visible={!!cropUri}
          uri={cropUri}
          aspectRatio={cameraFrame.width > 0 && cameraFrame.height > 0 ? cameraFrame.width / cameraFrame.height : 1}
          onCancel={() => setCropUri('')}
          onDone={(cropped) => {
            setCropUri('');
            setPreviewUri(cropped || '');
            setPreviewRotation(0);
          }}
        />
        <View
          style={[
            styles.contentWrap,
            {
              // footerHeight already includes bottom insets.
              paddingBottom: footerHeight + 20,
            },
          ]}
        >
          <View style={styles.header}>
            <View style={styles.brandRow}>
              <Image source={ICON_SPARK} style={styles.sparkIcon} resizeMode="contain" />
              <SvgXml xml={SPARK_WORDMARK_SVG} width={94} height={20} style={styles.brandWordmark} />
            </View>
            <TouchableOpacity onPress={handleClose} style={styles.closeButton}>
              <Ionicons name="close" size={28} color="#FFFFFF" />
            </TouchableOpacity>
          </View>

          <View
            style={styles.cameraContainer}
            onLayout={(e) => {
              const { width, height } = e.nativeEvent.layout;
              if (width > 0 && height > 0) {
                setCameraFrame({ width, height });
              }
            }}
          >
            {!isPreviewMode ? (
              <View style={styles.previewTopOverlay}>
                <TouchableOpacity style={styles.flashControl} onPress={handleFlashToggle}>
                  <Ionicons name={flash === 'on' ? 'flash' : 'flash-off'} size={18} color="#FFFFFF" />
                </TouchableOpacity>
                <TouchableOpacity style={styles.zoomBadge} onPress={() => setShowZoomMenu((v) => !v)}>
                  <Text style={styles.zoomText}>{activeZoom.label}</Text>
                </TouchableOpacity>
              </View>
            ) : null}

            {!isPreviewMode && showZoomMenu ? (
              <View style={styles.zoomMenu}>
                {ZOOM_LEVELS.map((item, index) => (
                  <TouchableOpacity
                    key={item.label}
                    style={[styles.zoomMenuItem, resolvedZoomIndex === index && styles.zoomMenuItemActive]}
                    onPress={() => {
                      setZoomIndex(index);
                      setShowZoomMenu(false);
                    }}
                  >
                    <Text style={[styles.zoomMenuText, resolvedZoomIndex === index && styles.zoomMenuTextActive]}>{item.label}</Text>
                  </TouchableOpacity>
                ))}
              </View>
            ) : null}

            {permissionDenied ? (
              <View style={styles.cameraPreview}>
                <Text style={styles.cameraText}>Camera permission is required</Text>
                <TouchableOpacity onPress={requestPermission} style={styles.permissionButton}>
                  <Text style={styles.permissionText}>Allow Camera</Text>
                </TouchableOpacity>
              </View>
            ) : deviceUnavailable ? (
              <View style={styles.cameraPreview}>
                <Text style={styles.cameraText}>Loading camera...</Text>
              </View>
            ) : !appIsActive ? (
              <View style={styles.cameraPreview}>
                <Text style={styles.cameraText}>Camera paused</Text>
              </View>
            ) : previewUri ? (
              <View style={styles.previewImageWrap}>
                <Image
                  source={{ uri: previewUri }}
                  style={[styles.previewImage, { transform: [{ rotate: `${previewRotation}deg` }] }]}
                  resizeMode="cover"
                />
                {!statusSheetVisible ? (
                <View
                  style={[
                    styles.previewStatusOverlay,
                    previewStatusEditing && keyboardHeight > 0
                      ? { bottom: Math.max(16, keyboardHeight - footerHeight - 28) }
                      : null,
                  ]}
                >
                  {previewStatusEditing ? (
                    <View style={styles.previewStatusComposer}>
                      <TextInput
                        value={statusDraft}
                        onChangeText={handlePreviewStatusDraftChange}
                        style={styles.previewStatusInput}
                        placeholder={`Type status (Max ${STATUS_MAX_CHARS} characters)`}
                        placeholderTextColor="#8C8C8C"
                        maxLength={STATUS_MAX_CHARS}
                        autoFocus
                      />
                      {statusDraft.trim().length > 0 ? (
                        <TouchableOpacity style={styles.previewStatusAddButton} onPress={applyPreviewStatus}>
                          <Text style={styles.previewStatusAddText}>Add</Text>
                        </TouchableOpacity>
                      ) : null}
                    </View>
                  ) : selectedStatus ? (
                    <View style={styles.previewStatusDisplay}>
                      <Text style={styles.previewStatusDisplayText} numberOfLines={1}>{selectedStatus}</Text>
                      <TouchableOpacity style={styles.previewStatusClose} onPress={clearPreviewStatus}>
                        <Ionicons name="close" size={16} color="#FFFFFF" />
                      </TouchableOpacity>
                    </View>
                  ) : (
                    <TouchableOpacity style={styles.previewAddStatusChip} onPress={openPreviewStatusEditor} activeOpacity={0.92}>
                      <Text style={styles.previewAddStatusText}>Add Status</Text>
                    </TouchableOpacity>
                  )}
                </View>
                ) : null}
              </View>
            ) : (
              cameraIsActive ? (
                <Camera
                  ref={cameraRef}
                  style={styles.cameraView}
                  device={device}
                  isActive={true}
                  photo={true}
                  torch={torch}
                  zoom={cameraZoomForProp}
                  onInitialized={() => {
                    // Some Android devices can ignore the initial zoom when the camera session starts.
                    // Bumping a tiny epsilon after initialization makes the native side re-apply zoom.
                    setZoomEpoch((e) => e + 1);
                  }}
                  onError={(error) => {
                    // Throttle retries; VisionCamera can log this error repeatedly while retrying.
                    if (error?.code === 'device/camera-already-in-use') {
                      setCanStartCamera(false);
                      if (!retryTimeoutRef.current) {
                        retryTimeoutRef.current = setTimeout(() => {
                          retryTimeoutRef.current = null;
                          setCanStartCamera(true);
                        }, 600);
                      }
                    }
                  }}
                />
              ) : (
                <View style={styles.cameraPreview}>
                  <Text style={styles.cameraText}>Starting camera...</Text>
                </View>
              )
            )}

            {showFrontFlash ? <View pointerEvents="none" style={styles.frontFlashOverlay} /> : null}
          </View>

          <View style={styles.bottomControls}>
            {isPreviewMode ? (
              <>
                <TouchableOpacity style={[styles.controlButton, styles.controlButtonDisabled]} disabled={true}>
                  <Image source={ICON_GALLERY} style={[styles.controlIcon, styles.controlIconDisabled]} resizeMode="contain" />
                </TouchableOpacity>

                <TouchableOpacity style={styles.sendButton} onPress={handlePreviewSendNoop}>
                  <Image source={ICON_SEND} style={styles.sendIcon} resizeMode="contain" />
                </TouchableOpacity>

                <TouchableOpacity onPress={handlePreviewRefresh} style={styles.controlButton}>
                  <Image source={ICON_REFRESH} style={styles.controlIcon} resizeMode="contain" />
                </TouchableOpacity>
              </>
            ) : (
              <>
                <TouchableOpacity onPress={handleGalleryPress} style={styles.controlButton}>
                  <Image source={ICON_GALLERY} style={styles.controlIcon} resizeMode="contain" />
                </TouchableOpacity>

                <TouchableOpacity style={[styles.captureButton, isCapturing && styles.captureButtonDisabled]} onPress={handleCapture} disabled={isCapturing}>
                  <View style={styles.captureInner} />
                </TouchableOpacity>

                <TouchableOpacity onPress={handleFlipCamera} style={styles.controlButton}>
                  <Image source={ICON_FLIP} style={styles.controlIconSmall} resizeMode="contain" />
                </TouchableOpacity>
              </>
            )}
          </View>

          {previewUri ? (
            !previewStatusTouched ? (
              <View style={styles.statusSection}>
                <TouchableOpacity style={styles.statusTap} onPress={openStatusSheet} activeOpacity={0.9}>
                  <Ionicons name="chevron-up" size={22} color="#FFFFFF" />
                  <Text style={styles.statusText}>Status library</Text>
                </TouchableOpacity>
              </View>
            ) : null
          ) : (
            <View style={styles.statusSection}>
              <TouchableOpacity style={styles.statusTap} onPress={openStatusSheet} activeOpacity={0.9}>
                <Ionicons name="chevron-up" size={22} color="#FFFFFF" />
                <Text style={styles.statusText}>Status library</Text>
              </TouchableOpacity>
            </View>
          )}
        </View>

        {statusSheetVisible ? (
          <View style={styles.statusOverlay}>
            <Pressable style={styles.statusBackdrop} onPress={closeStatusSheet} />
            <Pressable style={[styles.statusClose, { top: insets.top + 12 }]} onPress={closeStatusSheet}>
              <Ionicons name="close" size={28} color="#FFFFFF" />
            </Pressable>

            <Animated.View
              style={[
                styles.statusSheet,
                {
                  // Make the sheet background reach the very bottom, so there is no blank gap.
                  // Keep the same visual top position by increasing height by footerHeight.
                  height: sheetTotalHeight,
                  bottom: 0,
                  // Keep pills/tabs above the footer overlay.
                  paddingBottom: footerHeight + 20,
                  transform: [
                    {
                      translateY: sheetAnim.interpolate({
                        inputRange: [0, 1],
                        outputRange: [sheetTotalHeight + 40, 0],
                      }),
                    },
                  ],
                },
              ]}
            >
              <View style={styles.statusTabs}>
                {STATUS_TABS.map((tab) => {
                  const active = tab.key === statusTab;
                  return (
                    <Pressable
                      key={tab.key}
                      style={[styles.statusTabItem, active && styles.statusTabItemActive]}
                      onPress={() => setStatusTab(tab.key)}
                    >
                      <Text
                        numberOfLines={1}
                        adjustsFontSizeToFit
                        minimumFontScale={0.82}
                        style={[styles.statusTabText, active && styles.statusTabTextActive]}
                      >
                        {tab.label}
                      </Text>
                      {active ? <View style={styles.statusTabUnderline} /> : null}
                    </Pressable>
                  );
                })}
              </View>

              <View style={styles.statusGrid}>
                {Array.from({ length: 8 }).map((_, idx) => {
                  const label = statusTab === 'love' && idx === 0 ? 'I miss you ❤️' : '';
                  const filled = Boolean(label);
                  const selected = filled && selectedStatus === label;
                  return (
                    <Pressable
                      key={`${statusTab}_${idx}`}
                      style={[styles.statusPill, filled && styles.statusPillFilled, selected && styles.statusPillSelected]}
                      disabled={!filled}
                      onPress={() => {
                        setSelectedStatus(label);
                        closeStatusSheet();
                      }}
                    >
                      {filled ? <Text style={styles.statusPillText}>{label}</Text> : null}
                    </Pressable>
                  );
                })}
              </View>
            </Animated.View>
          </View>
        ) : null}

        <View
          style={[
            styles.bottomSparkBar,
            { height: BASE_FOOTER_HEIGHT + insets.bottom, paddingBottom: insets.bottom },
            statusSheetVisible && styles.bottomSparkBarAboveOverlay,
          ]}
          onLayout={(e) => {
            const h = e?.nativeEvent?.layout?.height;
            if (typeof h === 'number' && Number.isFinite(h) && h > 0) {
              setFooterHeight(Math.round(h));
            }
          }}
        >
          <Image source={ICON_SPARK} style={styles.sparkBarIcon} resizeMode="contain" />
        </View>
      </SafeAreaView>
    </Modal>
  );
};

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#000000',
  },
  contentWrap: {
    flex: 1,
    paddingHorizontal: 12,
    paddingTop: 10,
  },
  header: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginTop: 6,
    marginBottom: 12,
  },
  brandRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: -2,
  },
  sparkIcon: {
    width: 32,
    height: 32,
    tintColor: '#F0145A',
  },
  brandWordmark: {
    width: 94,
    height: 20,
    marginTop: 0,
  },
  closeButton: {
    width: 42,
    height: 42,
    alignItems: 'center',
    justifyContent: 'center',
  },
  previewTopOverlay: {
    position: 'absolute',
    top: 14,
    left: 14,
    right: 14,
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    zIndex: 2,
  },
  flashControl: {
    width: 36,
    height: 36,
    borderRadius: 18,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: '#0E0F14',
  },
  zoomBadge: {
    width: 36,
    height: 36,
    borderRadius: 18,
    backgroundColor: '#0E0F14',
    alignItems: 'center',
    justifyContent: 'center',
  },
  zoomText: {
    color: '#FFFFFF',
    fontSize: 16,
    fontWeight: '700',
  },
  cameraContainer: {
    alignSelf: 'stretch',
    aspectRatio: 4 / 5,
    marginTop: 4,
    marginHorizontal: -12,
    overflow: 'hidden',
    borderRadius: 28,
    backgroundColor: '#191919',
  },
  cameraView: {
    flex: 1,
  },
  previewImage: {
    width: '100%',
    height: '100%',
  },
  previewImageWrap: {
    width: '100%',
    height: '100%',
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: '#191919',
  },
  previewStatusOverlay: {
    position: 'absolute',
    left: 16,
    right: 16,
    bottom: 16,
    alignItems: 'center',
  },
  previewAddStatusChip: {
    minWidth: 156,
    minHeight: 46,
    borderRadius: 22,
    backgroundColor: '#000000B2',
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 26,
  },
  previewAddStatusText: {
    color: '#FFFFFF',
    fontSize: 18,
    fontWeight: '700',
    fontFamily: 'Open Sans Hebrew',
  },
  previewStatusComposer: {
    width: '100%',
    minHeight: 42,
    borderRadius: 21,
    backgroundColor: 'rgba(26, 27, 31, 0.9)',
    flexDirection: 'row',
    alignItems: 'center',
    paddingLeft: 14,
    paddingRight: 6,
  },
  previewStatusInput: {
    flex: 1,
    color: '#FFFFFF',
    fontSize: 14,
    fontWeight: '600',
    paddingVertical: 0,
    marginRight: 10,
  },
  previewStatusAddButton: {
    minWidth: 74,
    height: 32,
    borderRadius: 16,
    backgroundColor: '#F50067',
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 12,
  },
  previewStatusAddText: {
    color: '#FFFFFF',
    fontSize: 16,
    fontWeight: '700',
    fontFamily: 'Open Sans Hebrew',
  },
  previewStatusDisplay: {
    minHeight: 42,
    maxWidth: '100%',
    borderRadius: 21,
    backgroundColor: 'rgba(26, 27, 31, 0.86)',
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    paddingLeft: 16,
    paddingRight: 8,
  },
  previewStatusDisplayText: {
    color: '#FFFFFF',
    fontSize: 16,
    fontWeight: '700',
    maxWidth: 220,
  },
  previewStatusClose: {
    width: 24,
    height: 24,
    borderRadius: 12,
    alignItems: 'center',
    justifyContent: 'center',
    marginLeft: 8,
    backgroundColor: '#0F1014',
  },
  frontFlashOverlay: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: '#FFFFFF',
    opacity: 0.9,
    zIndex: 10,
  },
  cameraPreview: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    gap: 12,
  },
  cameraText: {
    color: '#D0D0D0',
    fontSize: 17,
    fontWeight: '700',
  },
  permissionButton: {
    paddingHorizontal: 16,
    paddingVertical: 10,
    borderRadius: 999,
    backgroundColor: '#2B2F3B',
  },
  permissionText: {
    color: '#FFFFFF',
    fontWeight: '700',
    fontSize: 14,
  },
  zoomMenu: {
    position: 'absolute',
    top: 58,
    right: 14,
    backgroundColor: '#0E0F14',
    borderRadius: 12,
    padding: 6,
    zIndex: 3,
    borderWidth: 1,
    borderColor: '#272A33',
  },
  zoomMenuItem: {
    paddingHorizontal: 12,
    paddingVertical: 8,
    borderRadius: 8,
  },
  zoomMenuItemActive: {
    backgroundColor: '#1F2430',
  },
  zoomMenuText: {
    color: '#B4B9C4',
    fontSize: 14,
    fontWeight: '700',
  },
  zoomMenuTextActive: {
    color: '#FFFFFF',
  },
  bottomControls: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingHorizontal: 22,
    paddingTop: 16,
    paddingBottom: 10,
  },
  controlButton: {
    width: 50,
    height: 50,
    justifyContent: 'center',
    alignItems: 'center',
  },
  controlIcon: {
    width: 40,
    height: 40,
  },
  controlIconSmall: {
    width: 34,
    height: 34,
  },
  controlButtonDisabled: {
    opacity: 0.32,
  },
  controlIconDisabled: {
    opacity: 0.9,
  },
  captureButton: {
    width: 84,
    height: 84,
    borderRadius: 42,
    borderWidth: 3,
    borderColor: '#FD0C72',
    justifyContent: 'center',
    alignItems: 'center',
  },
  captureButtonDisabled: {
    opacity: 0.65,
  },
  captureInner: {
    width: 64,
    height: 64,
    borderRadius: 32,
    backgroundColor: '#FFFFFF',
  },
  sendButton: {
    width: 84,
    height: 84,
    borderRadius: 42,
    backgroundColor: '#FFFFFF',
    justifyContent: 'center',
    alignItems: 'center',
  },
  sendIcon: {
    width: 34,
    height: 34,
    tintColor: '#000000',
    marginLeft: -6,
  },
  statusSection: {
    flexDirection: 'column',
    alignItems: 'center',
    paddingVertical: 2,
    gap: 4,
    marginTop: -6,
  },
  statusTap: {
    alignItems: 'center',
    justifyContent: 'center',
    gap: 4,
  },
  statusText: {
    color: '#FFFFFF',
    fontSize: 19,
    fontWeight: '700',
    fontFamily: 'Open Sans Hebrew',
    lineHeight: 19,
    letterSpacing: -0.57,
  },
  statusOverlay: {
    ...StyleSheet.absoluteFillObject,
    zIndex: 50,
  },
  statusBackdrop: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: '#000000',
  },
  statusClose: {
    position: 'absolute',
    top: 50,
    right: 18,
    width: 44,
    height: 44,
    alignItems: 'center',
    justifyContent: 'center',
    zIndex: 55,
  },
  statusSheet: {
    position: 'absolute',
    left: 0,
    right: 0,
    backgroundColor: '#1B1B1B',
    borderTopLeftRadius: 28,
    borderTopRightRadius: 28,
    overflow: 'hidden',
    paddingTop: 18,
    paddingHorizontal: 18,
    paddingBottom: 30,
  },
  statusTabs: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'flex-end',
    paddingHorizontal: 6,
    gap: 8,
  },
  statusTabItem: {
    paddingVertical: 10,
    paddingHorizontal: 4,
    alignItems: 'center',
    justifyContent: 'center',
    flex: 1,
  },
  statusTabItemActive: {},
  statusTabText: {
    color: '#EAEAEA',
    fontSize: 16,
    fontWeight: '700',
    lineHeight: 18,
    textAlign: 'center',
    includeFontPadding: false,
  },
  statusTabTextActive: {
    color: '#FFFFFF',
  },
  statusTabUnderline: {
    marginTop: 10,
    height: 3,
    width: '100%',
    borderRadius: 3,
    backgroundColor: '#FFFFFF',
    opacity: 0.9,
  },
  statusGrid: {
    marginTop: 18,
    flexDirection: 'row',
    flexWrap: 'wrap',
    justifyContent: 'space-between',
    rowGap: 16,
    columnGap: 7,
    marginHorizontal: -4,
    paddingHorizontal: 0,
  },
  statusPill: {
    width: '48.8%',
    height: 54,
    borderRadius: 28,
    backgroundColor: '#282727',
    alignItems: 'center',
    justifyContent: 'center',
  },
  statusPillFilled: {
    backgroundColor: '#282727',
  },
  statusPillSelected: {
    borderWidth: 2,
    borderColor: 'rgba(255,255,255,0.85)',
  },
  statusPillText: {
    color: '#FFFFFF',
    fontSize: 16,
    fontWeight: '700',
    textAlign: 'center',
    width: '100%',
  },
  bottomSparkBar: {
    position: 'absolute',
    left: 0,
    right: 0,
    bottom: 0,
    backgroundColor: '#131313',
    borderTopWidth: 1,
    borderTopColor: '#11141C',
    alignItems: 'flex-start',
    justifyContent: 'center',
    paddingHorizontal: 30,
  },
  bottomSparkBarAboveOverlay: {
    zIndex: 60,
    elevation: 60,
  },
  sparkBarIcon: {
    width: 28,
    height: 40,
  },
});

export default CameraModal;

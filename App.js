import {
  View,
  Text,
  Modal,
  Image,
  ImageBackground,
  ScrollView,
  Button,
  TextInput,
  StyleSheet,
  Pressable,
  StatusBar,
  ActivityIndicator,
  Alert,
  Dimensions,
  Keyboard,
  BackHandler,
  Switch,
  NativeModules,
  DeviceEventEmitter,
  AppState,
  Linking
} from 'react-native';
import * as Notifications from 'expo-notifications';
import { File, Paths } from 'expo-file-system';
import { SafeAreaView, useSafeAreaInsets } from 'react-native-safe-area-context';
import ButtonRound from "./components/ButtonRound"
import GraphCard from './components/GraphCard';
import { useSensorData } from './src/sensors/Sensor';
const mapImg = require("./assets/carte-geographique-du-monde.jpg");
import {
  NavigationContainer,
  createStaticNavigation,
  useNavigation,
  createNavigationContainerRef
} from '@react-navigation/native';
const navigationRef = createNavigationContainerRef();
import { createBottomTabNavigator, useBottomTabBarHeight } from '@react-navigation/bottom-tabs';
import * as Location from 'expo-location';
import { useEffect, useRef, useState, useMemo, createContext, useContext } from 'react';
import Animated, {
  useSharedValue,
  useAnimatedStyle,
  withTiming,
  interpolate,
} from 'react-native-reanimated';
import { createNativeStackNavigator } from '@react-navigation/native-stack';
import {
  createDrawerNavigator,
  DrawerContentScrollView,
  DrawerItem,
} from '@react-navigation/drawer';
import Svg, { Polygon } from 'react-native-svg';
import * as Progress from 'react-native-progress';
import MapView, { PROVIDER_GOOGLE, Marker, Callout } from 'react-native-maps';
import { Accelerometer, Gyroscope } from "expo-sensors";
import {
  Canvas,
  Path,
  Skia,
  Group,
  useDerivedValue,
} from "@shopify/react-native-skia";
import { Gesture, GestureDetector } from "react-native-gesture-handler";
import { SettingsProvider, useSettings } from './src/contexts/SettingsContext';
import * as Battery from 'expo-battery';
import Slider from '@react-native-community/slider';

export const RecordingContext = createContext({
  isPaused: false,
  setIsPaused: () => { },
  elapsedTime: 0,
  setElapsedTime: () => { },
});

//Icons
import Entypo from '@expo/vector-icons/Entypo';
import FontAwesome from '@expo/vector-icons/FontAwesome';
import AntDesign from '@expo/vector-icons/AntDesign';
import MaterialIcons from '@expo/vector-icons/MaterialIcons';
import Feather from '@expo/vector-icons/Feather';
import FontAwesome5 from '@expo/vector-icons/FontAwesome5';
import * as DocumentPicker from 'expo-document-picker';

/* ------------------ Screens ------------------ */

const Stack = createNativeStackNavigator();

function DrawerStack() {
  return (
    <Stack.Navigator screenOptions={{
      animation: 'default', headerShown: true, headerBackButtonMenuEnabled: false
    }}>
      <Stack.Screen name="Home" options={{ headerShown: false, gestureEnabled: false }} component={Tabs} />
      <Stack.Screen name="Settings" component={SettingsScreen} />
      <Stack.Screen name="About Us" component={AboutUsScreen} />
    </Stack.Navigator>
  )
}

function HomeScreen() {
  //0 = fully collapsed, 1 = fully expanded
  const progress = useSharedValue(0);
  const maxSearchWidth = useSharedValue(0);
  const screenWidth = Dimensions.get('window').width;
  const [isSearchBarFocused, setSearchBarFocused] = useState(true);
  const inputRef = useRef(null);

  const onLayout = (event) => {
    maxSearchWidth.value = event.nativeEvent.layout.width;
  };

  const toggleInput = () => {
    //If not read-only, focus the text field.
    if (!isSearchBarFocused) {
      setTimeout(() => {
        inputRef.current?.focus();
      }, 100)
    }
    else {
      inputRef.current?.blur();
    }
  };

  useEffect(() => {
    const keybHidden = Keyboard.addListener('keyboardDidHide', () => toggleSearch());

    return () => {
      keybHidden.remove();
    };
  }, [isSearchBarFocused]);

  //Smoothly animates expansion and collapse from 0 to 1.
  const toggleSearch = () => {
    setSearchBarFocused(!isSearchBarFocused);
    if (isSearchBarFocused) {
      progress.value = withTiming(1, {
        duration: 300,
      });
      setTimeout(() => {
        inputRef.current?.focus();
      }, 100)
    }
    else {
      if (!isSearchBarFocused) {
        inputRef.current?.blur();
        progress.value = withTiming(0, {
          duration: 300,
        });
      }
    }
  };

  //Resizes the input field container.
  const searchBarStyle = useAnimatedStyle(() => {
    return {
      width: interpolate(progress.value, [0, 1], [50, screenWidth - 140]),
    };
  });

  //Fades search bar text in, and search icon out.
  const inputStyle = useAnimatedStyle(() => {
    return {
      opacity: interpolate(progress.value, [0, 0.4, 1], [0, 0, 1]),
    };
  });

  const iconStyle = useAnimatedStyle(() => {
    return {
      opacity: interpolate(progress.value, [0, 0.3], [1, 0]),
      transform: [
        {
          scale: interpolate(progress.value, [0, 1], [1, 0.9]),
        },
      ],
    };
  });

  const [barStyle, setBarStyle] = useState('light-content');
  const { globalPotholes } = useSettings();
  const [zoomLevel, setZoomLevel] = useState(0.01);
  const HIDE_THRESHOLD = 0.5; // If longitudeDelta > 0.5, hide all potholes

  const onRunFunction = (barStyle) => {
    setBarStyle(barStyle);
  };

  // Basic grid-based clustering
  const getClusteredPotholes = () => {
    if (!globalPotholes || globalPotholes.length === 0 || zoomLevel > HIDE_THRESHOLD) return [];

    // Dynamically adjust grid size based on zoom level. 
    // Closer zoom = smaller grid cells = more individual markers
    const gridSize = zoomLevel / 10;

    const clusters = {};

    globalPotholes.forEach((pothole) => {
      // Create a grid key by rounding coordinates
      const gridLat = Math.round(pothole.gps_latitude / gridSize) * gridSize;
      const gridLng = Math.round(pothole.gps_longitude / gridSize) * gridSize;
      const key = `${gridLat.toFixed(5)},${gridLng.toFixed(5)}`;

      if (!clusters[key]) {
        clusters[key] = {
          ...pothole,
          count: 1,
          maxSeverity: pothole.severity
        };
      } else {
        clusters[key].count += 1;
        // Keep the highest severity in the cluster
        if (pothole.severity > clusters[key].maxSeverity) {
          clusters[key].maxSeverity = pothole.severity;
          clusters[key].severity = pothole.severity;
        }
      }
    });

    return Object.values(clusters);
  };

  const clusteredPotholes = useMemo(() => getClusteredPotholes(), [globalPotholes, zoomLevel]);

  //Fullscreen component
  const navigation = useNavigation();
  useEffect(() => {
    const unsubscribe = navigation.addListener('drawerClose', () => {
      onRunFunction('light-content');
    });
    return unsubscribe;
  }, [navigation]);

  return (
    <View style={styles.fullscreen}>
      <MapView
        provider={PROVIDER_GOOGLE}
        style={StyleSheet.absoluteFillObject}
        showsUserLocation={true}
        followsUserLocation={true}
        onRegionChangeComplete={(region) => {
          setZoomLevel(region.longitudeDelta);
        }}
      >
        {clusteredPotholes.map((pothole, index) => (
          <Marker
            key={index}
            coordinate={{ latitude: pothole.gps_latitude, longitude: pothole.gps_longitude }}
          >
            {/* <View style={{ backgroundColor: 'transparent', alignItems: 'center', justifyContent: 'center', width: 38, height: 38 }}>
              <Text style={{ fontSize: 24 }}>🕳️</Text>
              {pothole.count > 1 && (
                <View style={{ backgroundColor: 'red', borderRadius: 10, paddingHorizontal: 4, position: 'absolute', top: -5, right: -10 }}>
                  <Text style={{ color: 'white', fontSize: 10, fontWeight: 'bold' }}>{pothole.count}</Text>
                </View>
              )}
            </View> */}
            {/* <Callout tooltip>
              <View style={{ backgroundColor: 'white', borderRadius: 10, padding: 10, minWidth: 150, elevation: 5 }}>
                <Text style={{ fontWeight: 'bold', fontSize: 16, marginBottom: 5 }}>Pothole Cluster</Text>
                <Text>Count: {pothole.count}</Text>
                <Text>Max Jolt: {pothole.maxSeverity.toFixed(2)} G</Text>
                <Text style={{ fontSize: 10, color: 'gray', marginTop: 5 }}>Lat: {pothole.gps_latitude.toFixed(5)}</Text>
                <Text style={{ fontSize: 10, color: 'gray' }}>Lng: {pothole.gps_longitude.toFixed(5)}</Text>
              </View>
            </Callout> */}
          </Marker>
        ))}
      </MapView>
      <StatusBar translucent backgroundColor="transparent" barStyle={barStyle} />
      {/* <ImageBackground source={mapImg} style={{ flex: 1 }}> */}
      <View style={{ flex: 1 }}>
        <SafeAreaView style={styles.wrapper} onLayout={onLayout}>

          <ButtonRound onPress={() => {
            navigation.openDrawer();
            onRunFunction('dark-content')
          }}>
            <Entypo name="menu" size={24} color="black" />
          </ButtonRound>

          <Pressable onPress={toggleSearch} style={{ flex: 0 }}>
            <Animated.View style={[styles.searchContainer, searchBarStyle]}>
              <Animated.View style={[styles.iconWrapper, iconStyle]}>
                <FontAwesome name="search" size={20} color="black" />
              </Animated.View>
              <Animated.View style={[styles.inputWrapper, inputStyle]}>
                <TextInput placeholder="Search TravelSense..." style={styles.input} ref={inputRef} readOnly={isSearchBarFocused} />
              </Animated.View>
            </Animated.View>
          </Pressable>

          <ButtonRound onPress={() => console.log("hello")}>
            <Entypo name="location-pin" size={24} color="black" />
          </ButtonRound>

        </SafeAreaView>
      </View>
    </View>
  );
}

import SensorUpload from './src/sensors/SensorUpload';

/* ---------- Pothole Editor Modal ---------- */
function PotholeEditorModal({ visible, onClose, potholes, onSave }) {
  const [text, setText] = useState('');
  const [error, setError] = useState('');

  useEffect(() => {
    if (visible) {
      setText(JSON.stringify(potholes, null, 2));
      setError('');
    }
  }, [visible]);

  const handleSave = () => {
    try {
      const parsed = JSON.parse(text);
      onSave(parsed);
      onClose();
    } catch (e) {
      setError('Invalid JSON: ' + e.message);
    }
  };

  return (
    <Modal visible={visible} animationType="slide" onRequestClose={onClose}>
      <View style={{ flex: 1, backgroundColor: '#1a1a2e' }}>
        {/* Header */}
        <View style={{ flexDirection: 'row', alignItems: 'center', padding: 16, paddingTop: 48, borderBottomWidth: 1, borderBottomColor: '#333' }}>
          <Text style={{ flex: 1, color: '#e0e0e0', fontSize: 18, fontWeight: 'bold' }}>📋 Sensor Data Editor</Text>
          <Pressable onPress={onClose} style={{ padding: 8 }}>
            <MaterialIcons name="close" size={24} color="#e0e0e0" />
          </Pressable>
        </View>
        {/* File hint */}
        <Text style={{ color: '#888', fontSize: 11, paddingHorizontal: 16, paddingTop: 8 }}>
          Saved to: sensor_data.json (app documents folder)
        </Text>
        {/* Editor */}
        <ScrollView style={{ flex: 1, padding: 16 }} keyboardShouldPersistTaps="handled">
          <TextInput
            multiline
            value={text}
            onChangeText={setText}
            style={{ fontFamily: 'monospace', color: '#a8ff78', fontSize: 12, lineHeight: 18, backgroundColor: '#0a0a1a', padding: 12, borderRadius: 8, minHeight: 400 }}
            autoCapitalize="none"
            autoCorrect={false}
            spellCheck={false}
          />
        </ScrollView>
        {/* Validation error */}
        {error ? <Text style={{ color: '#ff6b6b', paddingHorizontal: 16, paddingBottom: 4, fontSize: 12 }}>{error}</Text> : null}
        {/* Actions */}
        <View style={{ flexDirection: 'row', gap: 12, padding: 16, paddingBottom: 32 }}>
          <Pressable onPress={onClose} style={{ flex: 1, padding: 14, borderRadius: 12, backgroundColor: '#333', alignItems: 'center' }}>
            <Text style={{ color: '#e0e0e0', fontWeight: 'bold' }}>Cancel</Text>
          </Pressable>
          <Pressable onPress={handleSave} style={{ flex: 1, padding: 14, borderRadius: 12, backgroundColor: '#003CB3', alignItems: 'center' }}>
            <Text style={{ color: 'white', fontWeight: 'bold' }}>Save</Text>
          </Pressable>
        </View>
      </View>
    </Modal>
  );
}

function DataScreen(props) {
  const { isPaused, setIsPaused, elapsedTime } = useContext(RecordingContext);
  const padding = 15;
  const tabBarHeight = useBottomTabBarHeight();
  const sensorState = useSensorData(isPaused);
  const { isDarkMode, colorTheme, globalPotholes, setGlobalPotholes, savePotholes } = useSettings();
  const [isUploading, setIsUploading] = useState(false);
  const [editorVisible, setEditorVisible] = useState(false);

  const formatTime = (seconds) => {
    const hrs = Math.floor(seconds / 3600);
    const mins = Math.floor((seconds % 3600) / 60);
    const secs = seconds % 60;
    return `${hrs.toString().padStart(2, '0')}:${mins.toString().padStart(2, '0')}:${secs.toString().padStart(2, '0')}`;
  };

  const themeColors = {
    background: isDarkMode ? '#121212' : '#f5f5f5',
    card: isDarkMode ? '#1e1e1e' : '#ffffff',
    text: isDarkMode ? '#ffffff' : '#000000',
  };

  const handleFlushData = async () => {
    setIsUploading(true);
    try {
      await SensorUpload.uploadData('traveler-1');
      Alert.alert('Success', 'Last 5 mins of sensor data flushed to database.');
    } catch (error) {
      Alert.alert('Upload Failed', error.message || 'Check your server connection');
    } finally {
      setIsUploading(false);
    }
  };

  const handleTestConnection = async () => {
    try {
      const res = await SensorUpload.testConnection();
      Alert.alert('DB Connected!', `Server time: ${res.time}`);
    } catch (error) {
      Alert.alert('DB Error', error.message || 'Server check failed');
    }
  };

  const handleFetchPotholes = async () => {
    try {
      const data = await SensorUpload.fetchPotholes();
      await savePotholes(data);
      Alert.alert('Sync Complete', `Stored ${data.length} potholes locally.`);
    } catch (error) {
      Alert.alert('Sync Error', error.message);
    }
  };

  const handleTriggerProcessing = async () => {
    try {
      const result = await SensorUpload.triggerProcessing(0.5);
      Alert.alert('Processing Complete', `Found ${result.potholes_found} potholes from ${result.processed} records.`);
    } catch (error) {
      Alert.alert('Processing Error', error.message);
    }
  };

  const currentSpeed = Math.round(sensorState.data.gps.speed || 0);

  return (
    <>
      <View style={[styles.screen, { padding: padding, backgroundColor: themeColors.background }]}>
        <View style={{ backgroundColor: themeColors.card, borderRadius: 25, height: 150, overflow: 'hidden' }}>
          <View style={{ backgroundColor: isPaused ? '#ffae00' : 'lime', flexDirection: 'row' }}>
            <Text style={{ color: 'white', fontWeight: 'bold', left: 12.5, fontSize: 17.5 }}>STATUS: {isPaused ? 'PAUSED' : 'TRAVELLING'}</Text>
            <Svg height="23" width="100%" viewBox="0 0 20 2">
              <Polygon
                points="0,0 15,0 15,15 20,20"
                fill={isPaused ? 'orange' : 'green'}
              />
            </Svg>
            <Text style={{ color: 'white', fontWeight: 'bold', fontSize: 17.5, position: "absolute", right: 25 }}>AUTO: {isPaused ? 'OFF' : 'ON'}</Text>
          </View>

          <View style={{ backgroundColor: themeColors.card, flex: 1, padding: padding }}>
            <View style={{ flexDirection: "row" }}>
              <Text style={{ color: themeColors.text, fontSize: 60, fontWeight: "bold", includeFontPadding: false, lineHeight: 50 }}>{currentSpeed}</Text>
              <Text style={{ color: themeColors.text, textAlignVertical: "bottom", bottom: 0, marginLeft: 3 }}>km/h</Text>
              <View style={{ flex: 1, flexDirection: "row", alignItems: "center", marginLeft: 5 }}>
                <View>
                  <Text style={{ color: themeColors.text }}>RECORDING: </Text>
                  <Text style={{ color: themeColors.text }}>{formatTime(elapsedTime)}</Text>
                </View>
                <View style={{ flex: 1, flexDirection: "row", justifyContent: "space-evenly" }}>
                  <ButtonRound size={30} onPress={() => setIsPaused(!isPaused)}>
                    <FontAwesome5 name={isPaused ? "play" : "pause"} size={15} color={isDarkMode ? 'white' : 'black'} />
                  </ButtonRound>
                  <ButtonRound size={30} onPress={handleTestConnection}>
                    <MaterialIcons name="storage" size={15} color={isDarkMode ? 'white' : 'black'} />
                  </ButtonRound>
                  <ButtonRound size={30} onPress={handleFetchPotholes}>
                    <FontAwesome5 name="map-marker-alt" size={15} color={isDarkMode ? 'white' : 'black'} />
                  </ButtonRound>
                  <ButtonRound size={30} onPress={handleTriggerProcessing}>
                    <MaterialIcons name="analytics" size={15} color={isDarkMode ? 'white' : 'black'} />
                  </ButtonRound>
                  <ButtonRound size={30} onPress={() => setEditorVisible(true)}>
                    <Feather name="eye" size={15} color={isDarkMode ? 'white' : 'black'} />
                  </ButtonRound>
                  <ButtonRound size={30} onPress={handleFlushData} disabled={isUploading}>
                    {isUploading ? (
                      <ActivityIndicator size="small" color={isDarkMode ? 'white' : 'black'} />
                    ) : (
                      <FontAwesome5 name="upload" size={15} color={isDarkMode ? 'white' : 'black'} />
                    )}
                  </ButtonRound>
                </View>
              </View>
            </View>
            <View style={{ flexDirection: "row", alignItems: "center", bottom: padding, left: padding, position: "absolute" }}>
              <Text style={{ color: themeColors.text, position: "relative" }}>CONFIDENCE:</Text>
              <Progress.Bar progress={1} animated={false} width={null} borderRadius={0} borderWidth={0} color={"red"} unfilledColor={"pink"} style={{ alignSelf: "center", flex: 1, marginLeft: 10 }} />
              <Progress.Bar progress={1} animated={false} width={null} borderRadius={0} borderWidth={0} color={"gold"} unfilledColor={"lightgoldenrodyellow"} style={{ alignSelf: "center", flex: 1 }} />
              <Progress.Bar progress={0.5} animated={false} width={null} borderRadius={0} borderWidth={0} color={"green"} unfilledColor={"lightgreen"} style={{ alignSelf: "center", flex: 1 }} />
            </View>
          </View>
        </View>
        <Text style={{ color: themeColors.text, fontWeight: "bold", fontSize: 20, padding: 10 }}>Sensors used: </Text>
        <ScrollView style={{ borderRadius: 25 }}>
          <GraphCard title="GPS: " sensor="gps" sensorState={sensorState} isDarkMode={isDarkMode} />
          <GraphCard title="Accl: " sensor="accelerometer" sensorState={sensorState} isDarkMode={isDarkMode} />
          <GraphCard title="Gyro: " sensor="gyroscope" sensorState={sensorState} isDarkMode={isDarkMode} />
          <GraphCard title="Baro: " sensor="barometer" sensorState={sensorState} isDarkMode={isDarkMode} />
          <GraphCard title="Mag:" sensor="magnetometer" sensorState={sensorState} isDarkMode={isDarkMode} />
        </ScrollView>
      </View>
      <PotholeEditorModal
        visible={editorVisible}
        onClose={() => setEditorVisible(false)}
        potholes={SensorUpload.dataBatch}
        onSave={(parsed) => {
          SensorUpload.dataBatch = parsed;
          SensorUpload.persistToDisk();
        }}
      />
    </>
  );
}

function TravelogueScreen() {
  const { isDarkMode } = useSettings();
  const themeColors = {
    background: isDarkMode ? '#121212' : '#f5f5f5',
    text: isDarkMode ? '#ffffff' : '#000000',
  };
  return (
    <View style={[styles.settingsScreen, { backgroundColor: themeColors.background }]}>
      <Text style={{ color: themeColors.text }}>This is the travelogue screen.</Text>
    </View>
  );
}

function SettingsScreen() {
  const {
    isDarkMode,
    toggleDarkMode,
    notificationsEnabled,
    toggleNotifications,
    engineType,
    setEngineType,
    colorTheme,
    storageIntegrationEnabled,
    toggleStorageIntegration,
    batteryThreshold,
    setBatteryThreshold,
  } = useSettings();

  const insets = useSafeAreaInsets();
  const themeColors = {
    background: isDarkMode ? '#121212' : '#f5f5f5',
    card: isDarkMode ? '#1e1e1e' : '#ffffff',
    text: isDarkMode ? '#ffffff' : '#000000',
    textSecondary: isDarkMode ? '#aaaaaa' : '#666666',
    border: isDarkMode ? '#333333' : '#e0e0e0',
  };

  const renderEngineButton = (type, label) => (
    <Pressable
      style={[
        styles.engineButton,
        engineType === type && { backgroundColor: colorTheme, borderColor: colorTheme },
        { borderColor: themeColors.border }
      ]}
      onPress={() => setEngineType(type)}
    >
      <Text style={[styles.engineText, { color: engineType === type ? '#ffffff' : themeColors.text }]}>{label}</Text>
    </Pressable>
  );

  const colors = ['#003CB3', '#D32F2F', '#388E3C', '#FBC02D', '#7B1FA2'];

  return (
    <ScrollView style={[styles.settingsScreen, { backgroundColor: themeColors.background }]}>
      <View style={{ paddingTop: insets.top, paddingBottom: insets.bottom + 20 }}>
        <Text style={[styles.headerText, { color: themeColors.text }]}>Settings</Text>

        <View style={[styles.settingsCard, { backgroundColor: themeColors.card, borderColor: themeColors.border }]}>
          <View style={styles.settingRow}>
            <View>
              <Text style={[styles.settingTitle, { color: themeColors.text }]}>Dark Mode</Text>
              <Text style={[styles.settingDesc, { color: themeColors.textSecondary }]}>Toggle application theme</Text>
            </View>
            <Switch
              value={isDarkMode}
              onValueChange={toggleDarkMode}
              trackColor={{ false: '#767577', true: colorTheme }}
              thumbColor={'#ffffff'}
            />
          </View>

          <View style={[styles.settingRow, { borderTopWidth: 1, borderTopColor: themeColors.border }]}>
            <View>
              <Text style={[styles.settingTitle, { color: themeColors.text }]}>Notifications</Text>
              <Text style={[styles.settingDesc, { color: themeColors.textSecondary }]}>Enable push notifications</Text>
            </View>
            <Switch
              value={notificationsEnabled}
              onValueChange={toggleNotifications}
              trackColor={{ false: '#767577', true: colorTheme }}
              thumbColor={'#ffffff'}
            />
          </View>

          <View style={[styles.settingRow, { borderTopWidth: 1, borderTopColor: themeColors.border }]}>
            <View>
              <Text style={[styles.settingTitle, { color: themeColors.text }]}>Storage Integration</Text>
              <Text style={[styles.settingDesc, { color: themeColors.textSecondary }]}>Show app files in system Files app</Text>
            </View>
            <Switch
              value={storageIntegrationEnabled}
              onValueChange={toggleStorageIntegration}
              trackColor={{ false: '#767577', true: colorTheme }}
              thumbColor={'#ffffff'}
            />
          </View>
        </View>

        <Text style={[styles.sectionTitle, { color: themeColors.textSecondary }]}>VEHICLE</Text>
        <View style={[styles.settingsCard, { backgroundColor: themeColors.card, borderColor: themeColors.border, paddingVertical: 15 }]}>
          <View style={{ paddingHorizontal: 15, paddingBottom: 15 }}>
            <Text style={[styles.settingTitle, { color: themeColors.text }]}>Battery Threshold</Text>
            <Text style={[styles.settingDesc, { color: themeColors.textSecondary, marginBottom: 10 }]}>Auto-pause recording below {batteryThreshold}%</Text>
            <Slider
              style={{width: '100%', height: 40}}
              minimumValue={15}
              maximumValue={100}
              step={1}
              value={batteryThreshold}
              onValueChange={setBatteryThreshold}
              minimumTrackTintColor={colorTheme}
              maximumTrackTintColor={themeColors.border}
              thumbTintColor={colorTheme}
            />
          </View>
          <Text style={[styles.settingTitle, { color: themeColors.text, marginBottom: 10, paddingHorizontal: 15 }]}>Engine Type</Text>
          <View style={styles.engineContainer}>
            {renderEngineButton('petrol', 'Petrol')}
            {renderEngineButton('diesel', 'Diesel')}
            {renderEngineButton('electric', 'Electric')}
          </View>
        </View>

        <Text style={[styles.sectionTitle, { color: themeColors.textSecondary }]}>APPEARANCE</Text>
        <View style={[styles.settingsCard, { backgroundColor: themeColors.card, borderColor: themeColors.border, padding: 15 }]}>
          <Text style={[styles.settingTitle, { color: themeColors.text, marginBottom: 15 }]}>Theme Color</Text>
          <View style={styles.colorContainer}>
            {colors.map((c) => (
              <Pressable
                key={c}
                style={[
                  styles.colorCircle,
                  { backgroundColor: c },
                  colorTheme === c && styles.colorSelected
                ]}
                onPress={() => setColorTheme(c)}
              />
            ))}
          </View>
        </View>
      </View>
    </ScrollView>
  );
}

function AboutUsScreen() {
  return (
    <View>
      <Text>This is the about us screen.</Text>
    </View>
  )
}

/* ------------------ Tabs ------------------ */

const Tab = createBottomTabNavigator();

//Dummy component for navigator tabs.
const Empty = () => <View />;

function Tabs() {

  const onPressTravelogue = () => {
    console.log('Travelogue button pressed');
  };

  return (
    <Tab.Navigator screenOptions={{ animation: 'shift', headerShown: true }}>
      <Tab.Screen
        name="Home"
        component={HomeScreen}
        options={{
          tabBarIcon: ({ color, size }) => (
            <AntDesign name="home" size={24} color="black" />
          ),
          headerShown: false
        }} />
      <Tab.Screen
        name="My Data"
        component={DataScreen}
        options={{
          tabBarIcon: ({ color, size }) => (
            <AntDesign name="database" size={24} color="black" />
          )
        }} />
      <Tab.Screen
        name="Travelogue"
        component={TravelogueScreen}
        options={{
          tabBarIcon: ({ color, size }) => (
            <AntDesign name="book" size={24} color="black" />
          )
        }} />
    </Tab.Navigator>
  )
}

/* ------------------ Custom Drawer ------------------ */

function CustomDrawerContent(props) {
  const { state, navigation } = props;
  const { isDarkMode, colorTheme } = useSettings();
  const themeColors = {
    background: isDarkMode ? '#1e1e1e' : '#ffffff',
    text: isDarkMode ? '#ffffff' : 'black',
    inactiveText: isDarkMode ? '#aaaaaa' : 'gray',
  };

  const openFileManager = async () => {
    try {
      // Use our custom native module if available (Android)
      if (NativeModules.TravelSensePicker && NativeModules.TravelSensePicker.openFileManager) {
        await NativeModules.TravelSensePicker.openFileManager();
        return;
      }

      // Fallback for iOS or if native module not found
      // Note: On iOS, this will still open the document picker as there's no direct "open folder" intent.
      await DocumentPicker.getDocumentAsync({
        type: '*/*',
        copyToCacheDirectory: false,
      });
    } catch (err) {
      // Ignore cancellations
    }
  };

  return (
    <DrawerContentScrollView {...props} style={{ backgroundColor: themeColors.background }}>
      <View style={styles.logoContainer}>
        <Image
          source={require('./assets/travelsense-banner.png')}
          style={styles.logo}
          resizeMode="contain"
          width={310}
        />
      </View>

      <DrawerItem
        label="Home"
        focused={state.index === 0}
        activeTintColor="white"
        inactiveTintColor={themeColors.inactiveText}
        activeBackgroundColor={colorTheme}
        labelStyle={{ color: state.index === 0 ? 'white' : themeColors.text }}
        icon={({ color, size }) => (<AntDesign name="home" size={24} color={state.index === 0 ? 'white' : themeColors.text} />)}
        onPress={() => props.navigation.navigate('Main', { screen: 'HomeScreen' })}
      />
      <DrawerItem
        label="Settings"
        focused={state.index === 1}
        activeTintColor="white"
        inactiveTintColor={themeColors.inactiveText}
        activeBackgroundColor={colorTheme}
        labelStyle={{ color: state.index === 1 ? 'white' : themeColors.text }}
        icon={({ color, size }) => (<AntDesign name="setting" size={24} color={state.index === 1 ? 'white' : themeColors.text} />)}
        onPress={() => props.navigation.navigate('Main', { screen: 'Settings' })}
      />
      <DrawerItem
        label="About Us"
        focused={state.index === 2}
        activeTintColor="white"
        inactiveTintColor={themeColors.inactiveText}
        activeBackgroundColor={colorTheme}
        labelStyle={{ color: state.index === 2 ? 'white' : themeColors.text }}
        icon={({ color, size }) => (<AntDesign name="question-circle" size={24} color={state.index === 2 ? 'white' : themeColors.text} />)}
        onPress={() => props.navigation.navigate('Main', { screen: 'About Us' })}
      />
      <DrawerItem
        label="Open Files"
        activeTintColor="white"
        inactiveTintColor={themeColors.inactiveText}
        labelStyle={{ color: themeColors.text }}
        icon={({ color, size }) => (<AntDesign name="folder" size={24} color={themeColors.text} />)}
        onPress={openFileManager}
      />
    </DrawerContentScrollView>
  );
}

/* ------------------ Drawer ------------------ */

function BatteryAutoPauseManager() {
  const { batteryThreshold } = useSettings();
  const { isPaused, setIsPaused } = useContext(RecordingContext);
  const [showModal, setShowModal] = useState(false);

  useEffect(() => {
    const sub = DeviceEventEmitter.addListener('onBatteryAutoPause', (event) => {
      console.log("onBatteryAutoPause native event received:", event.value);
      setIsPaused(true);
      setShowModal(true);
    });

    return () => sub.remove();
  }, [setIsPaused]);

  return (
    <Modal visible={showModal} transparent animationType="fade">
      <View style={{flex: 1, backgroundColor: 'rgba(0,0,0,0.5)', justifyContent: 'center', alignItems: 'center'}}>
        <View style={{backgroundColor: '#1a1a2e', padding: 25, borderRadius: 15, width: '80%', elevation: 5}}>
           <Text style={{fontSize: 20, fontWeight: 'bold', marginBottom: 10, color: '#e0e0e0'}}>🔋 Low Battery</Text>
           <Text style={{marginBottom: 20, color: '#a8a8b3', lineHeight: 22}}>Recording has been automatically paused because your battery fell below {batteryThreshold}%.</Text>
           <Pressable onPress={() => setShowModal(false)} style={{backgroundColor: '#003CB3', padding: 12, borderRadius: 8, alignItems: 'center'}}>
              <Text style={{color: 'white', fontWeight: 'bold'}}>I Understand</Text>
           </Pressable>
        </View>
      </View>
    </Modal>
  );
}

/* ------------------ Notification Prompt ------------------ */

const OPT_OUT_FILE = 'notification_opt_out.txt';

async function checkOptOut() {
  try {
    const file = new File(Paths.document, OPT_OUT_FILE);
    if (file.exists) {
      const val = await file.text();
      return val === 'true';
    }
  } catch (e) {
    console.log("checkOptOut: Error reading file", e);
  }
  return false;
}

async function saveOptOut(val) {
  try {
    const file = new File(Paths.document, OPT_OUT_FILE);
    await file.write(val.toString());
  } catch (e) {
    console.log("saveOptOut: Error writing file", e);
  }
}

function NotificationPromptModal({ visible, onClose, onOptOut }) {
  const [checked, setChecked] = useState(false);
  
  const handleEnable = () => {
    if (NativeModules.TravelSenseModule && NativeModules.TravelSenseModule.openNotificationSettings) {
      NativeModules.TravelSenseModule.openNotificationSettings();
    } else {
      Linking.openSettings();
    }
    onClose();
  };

  const handleNotNow = () => {
    if (checked) {
      onOptOut();
    }
    onClose();
  };

  return (
    <Modal visible={visible} transparent animationType="fade">
      <View style={{flex: 1, backgroundColor: 'rgba(0,0,0,0.5)', justifyContent: 'center', alignItems: 'center'}}>
        <View style={{backgroundColor: '#1a1a2e', padding: 25, borderRadius: 15, width: '85%', elevation: 10, borderWidth: 1, borderColor: '#303050'}}>
          <View style={{alignItems: 'center', marginBottom: 20}}>
            <MaterialIcons name="notifications-active" size={50} color="#00C853" />
            <Text style={{color: 'white', fontSize: 22, fontWeight: 'bold', marginTop: 15, textAlign: 'center'}}>Keep Tracking Active</Text>
          </View>
          
          <Text style={{color: '#ccc', fontSize: 16, textAlign: 'center', marginBottom: 25, lineHeight: 22}}>
            Enable notifications to monitor your recording and access controls directly from your notification bar even in the background.
          </Text>

          <Pressable 
             onPress={() => setChecked(!checked)}
             style={{flexDirection: 'row', alignItems: 'center', marginBottom: 25, alignSelf: 'center'}}
          >
            <View style={{
                width: 20, 
                height: 20, 
                borderRadius: 4, 
                borderWidth: 2, 
                borderColor: '#00C853', 
                backgroundColor: checked ? '#00C853' : 'transparent',
                justifyContent: 'center',
                alignItems: 'center',
                marginRight: 10
            }}>
                {checked && <AntDesign name="check" size={14} color="white" />}
            </View>
            <Text style={{color: '#999', fontSize: 14}}>Don't remind me again</Text>
          </Pressable>

          <View style={{flexDirection: 'column', gap: 10}}>
            <Pressable 
              onPress={handleEnable}
              style={{backgroundColor: '#00C853', paddingVertical: 14, borderRadius: 10, alignItems: 'center'}}
            >
              <Text style={{color: 'white', fontWeight: 'bold', fontSize: 16}}>Enable in Settings</Text>
            </Pressable>
            
            <Pressable 
              onPress={handleNotNow}
              style={{paddingVertical: 10, alignItems: 'center'}}
            >
              <Text style={{color: '#666', fontWeight: '600', fontSize: 14}}>Not now</Text>
            </Pressable>
          </View>
        </View>
      </View>
    </Modal>
  );
}

const Drawer = createDrawerNavigator();

export default function App({ navigation }) {
  const { batteryThreshold } = useSettings();
  const [elapsedTime, setElapsedTime] = useState(0);
  const [isPaused, setIsPaused] = useState(false);
  const serviceStarted = useRef(false);
  const hasCheckedNotifications = useRef(false);
  const [showBatteryModal, setShowBatteryModal] = useState(false);
  const [showNotificationModal, setShowNotificationModal] = useState(false);

  const handleExitRequest = () => {
    Alert.alert(
      'Exit TravelSense',
      'Are you sure you want to exit?',
      [
        { text: 'Not really', style: 'cancel' },
        { 
          text: 'Yes', 
          onPress: async () => {
            await SensorUpload.persistToDisk();
            if (NativeModules.TravelSenseModule && NativeModules.TravelSenseModule.exitApp) {
              NativeModules.TravelSenseModule.exitApp();
            } else {
              BackHandler.exitApp();
            }
          } 
        },
      ]
    );
  };

  useEffect(() => {
    SensorUpload.loadFromDisk();
    if (!NativeModules.TravelSenseModule) return;

    const pauseSub = DeviceEventEmitter.addListener('onNotificationPauseToggle', () => {
      console.log("onNotificationPauseToggle event received");
      setIsPaused(prev => !prev);
    });

    const tickSub = DeviceEventEmitter.addListener('onServiceTick', (event) => {
      if (event && event.value !== undefined) {
        // console.log("onServiceTick received:", event.value);
        setElapsedTime(event.value);
      }
    });

    const exitSub = DeviceEventEmitter.addListener('onNotificationExit', async () => {
      console.log("onNotificationExit event received");
      handleExitRequest();
    });

    const batterySub = DeviceEventEmitter.addListener('onBatteryAutoPause', () => {
      setIsPaused(true);
      setShowBatteryModal(true);
    });

    return () => {
      pauseSub.remove();
      tickSub.remove();
      exitSub.remove();
      batterySub.remove();
    };
  }, []);

  const syncServiceState = async () => {
    if (NativeModules.TravelSenseModule && NativeModules.TravelSenseModule.getServiceState) {
      const state = await NativeModules.TravelSenseModule.getServiceState();
      if (state) {
        console.log("Syncing with active service:", state);
        setElapsedTime(state.elapsedTime);
        setIsPaused(state.isPaused);
        if (state.isBatteryPaused) {
          setShowBatteryModal(true);
        }
        serviceStarted.current = true;
        return true;
      }
    }
    return false;
  };

  const startServiceIfPermitted = async () => {
    if (serviceStarted.current || !NativeModules.TravelSenseModule) return;

    const alreadyRunning = await syncServiceState();
    if (alreadyRunning) return;

    const { status } = await Location.getForegroundPermissionsAsync();
    if (status === 'granted') {
      if (AppState.currentState === 'active') {
        console.log("Starting Foreground Service (Permissions Verified and App Active)");
        serviceStarted.current = true;
        NativeModules.TravelSenseModule.startRecordingService(elapsedTime, false, batteryThreshold);
        return true;
      } else {
        console.log("Status is granted, but App is in background. Deferring service start.");
      }
    }
    return false;
  };

  useEffect(() => {
    let checkInterval;

    const handleAppState = async (nextState) => {
      if (nextState === 'active') {
        const running = await syncServiceState();
        if (!running) {
          const started = await startServiceIfPermitted();
          if (started && checkInterval) {
            clearInterval(checkInterval);
            checkInterval = null;
          }
        }
      }
    };

    const sub = AppState.addEventListener('change', handleAppState);

    const init = async () => {
      const running = await syncServiceState();
      if (!running) {
        const started = await startServiceIfPermitted();
        if (!started) {
          checkInterval = setInterval(async () => {
            const nowRunning = await syncServiceState();
            if (nowRunning) {
              clearInterval(checkInterval);
              checkInterval = null;
            } else {
              const nowStarted = await startServiceIfPermitted();
              if (nowStarted && checkInterval) {
                clearInterval(checkInterval);
                checkInterval = null;
              }
            }
          }, 2000);
        }
      }
    };

    init();

    return () => {
      sub.remove();
      if (checkInterval) clearInterval(checkInterval);
    };
  }, []);

  useEffect(() => {
    if (NativeModules.TravelSenseModule && serviceStarted.current) {
      NativeModules.TravelSenseModule.updateServiceState(-1, isPaused, batteryThreshold);
    }
  }, [isPaused, batteryThreshold]);

  useEffect(() => {
    const backAction = () => {
      if (navigationRef.isReady() && navigationRef.canGoBack()) {
        navigationRef.goBack();
        return true;
      }

      handleExitRequest();
      return true; // prevent default behavior
    };

    const backHandler = BackHandler.addEventListener(
      'hardwareBackPress',
      backAction
    );

    return () => backHandler.remove();
  }, []);

  useEffect(() => {
    const checkNotificationStatus = async () => {
      if (hasCheckedNotifications.current) return;
      
      try {
        const { status } = await Notifications.getPermissionsAsync();
        console.log("checkNotificationStatus: Current status:", status);
        if (status !== 'granted') {
          const optedOut = await checkOptOut();
          if (!optedOut) {
            setShowNotificationModal(true);
          }
        }
        hasCheckedNotifications.current = true;
      } catch (e) {
        console.error("checkNotificationStatus error:", e);
      }
    };

    checkNotificationStatus();
    
    // Check when app resumes from background (Only if not already shown this session)
    const sub = AppState.addEventListener('change', (nextState) => {
      if (nextState === 'active' && !hasCheckedNotifications.current) {
        checkNotificationStatus();
      }
    });

    return () => sub.remove();
  }, []);

  return (
    <RecordingContext.Provider value={{ isPaused, setIsPaused, elapsedTime, setElapsedTime }}>
      <Modal visible={showBatteryModal} transparent animationType="fade">
        <View style={{ flex: 1, backgroundColor: 'rgba(0,0,0,0.5)', justifyContent: 'center', alignItems: 'center' }}>
          <View style={{ backgroundColor: '#1a1a2e', padding: 25, borderRadius: 15, width: '80%', elevation: 5 }}>
            <Text style={{ fontSize: 20, fontWeight: 'bold', marginBottom: 10, color: '#e0e0e0' }}>🔋 Low Battery</Text>
            <Text style={{ marginBottom: 20, color: '#a8a8b3', lineHeight: 22 }}>Recording has been automatically paused because your battery fell below {batteryThreshold}%.</Text>
            <Pressable onPress={() => setShowBatteryModal(false)} style={{ backgroundColor: '#003CB3', padding: 12, borderRadius: 8, alignItems: 'center' }}>
              <Text style={{ color: 'white', fontWeight: 'bold' }}>I Understand</Text>
            </Pressable>
          </View>
        </View>
      </Modal>
      <NavigationContainer ref={navigationRef}>
          <Drawer.Navigator
            drawerContent={(props) => <CustomDrawerContent {...props} />}
            screenOptions={{
              headerShown: false, drawerType: "front", detachInactiveScreens: false,
            }}
          >
            <Drawer.Screen name="Main" component={DrawerStack} />
          </Drawer.Navigator>
      </NavigationContainer>
        <NotificationPromptModal 
          visible={showNotificationModal} 
          onClose={() => setShowNotificationModal(false)}
          onOptOut={async () => {
             await saveOptOut(true);
             setShowNotificationModal(false);
          }}
        />
      </RecordingContext.Provider>
  );
}

const styles = StyleSheet.create({
  fullscreen: {
    flex: 1,
    backgroundColor: "black",
  },
  screen: {
    padding: 15,
    flex: 1,
  },
  wrapper: {
    width: "100%",
    padding: 10,
    justifyContent: "left",
    flexDirection: "row",
    gap: 10,
  },
  input: {
    flex: 1,
    backgroundColor: "#ffffff",
    borderRadius: 25,
    height: 50,
    padding: 10,
    marginHorizontal: 0,
    borderWidth: 0,
    elevation: 5,
    textAlignVertical: "center",
  },
  searchContainer: {
    height: 50,
    backgroundColor: "white",
    justifyContent: "center",
    paddingHorizontal: 10,
    borderRadius: 25,
    overflow: "hidden",
    elevation: 5,
  },
  iconWrapper: {
    position: "absolute",
    justifyContent: "center",
    alignItems: "center",
    width: 50,
    height: 50,
  },
  inputWrapper: {
    flex: 0,
  },
  settingsScreen: {
    padding: 15,
    flex: 1,
  },
  engineContainer: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    paddingHorizontal: 15,
  },
  engineButton: {
    flex: 1,
    paddingVertical: 10,
    borderWidth: 1,
    borderRadius: 8,
    alignItems: 'center',
    marginHorizontal: 4,
  },
  engineText: {
    fontWeight: '600',
  },
  colorContainer: {
    flexDirection: 'row',
    justifyContent: 'space-around',
  },
  colorCircle: {
    width: 40,
    height: 40,
    borderRadius: 20,
    borderWidth: 2,
    borderColor: 'transparent',
  },
  colorSelected: {
    borderColor: '#ffffff',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.3,
    shadowRadius: 3,
    elevation: 5,
  },
  settingsCard: {
    borderRadius: 12,
    borderWidth: 1,
    marginBottom: 20,
    overflow: 'hidden',
  },
  settingRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    padding: 15,
  },
  settingTitle: {
    fontSize: 16,
    fontWeight: '600',
  },
  settingDesc: {
    fontSize: 13,
    marginTop: 2,
  },
  sectionTitle: {
    fontSize: 13,
    fontWeight: 'bold',
    marginLeft: 15,
    marginBottom: 8,
    letterSpacing: 1,
  },
  headerText: {
    fontSize: 28,
    fontWeight: 'bold',
    marginBottom: 20,
    marginLeft: 5,
  },
  input: {
    color: "gray",
    fontSize: 16,
  },
});